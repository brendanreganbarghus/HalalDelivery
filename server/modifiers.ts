import { z } from 'zod'

// A reusable modifier engine shared by every configurable menu item (pizza, burger, meal, ...).
// One item_type template (e.g. "pizza") is defined once and applied to many menu items instead
// of hand-authoring size/sauce/topping groups per dish.

export const itemTypes = ['standard', 'pizza', 'burger', 'kebab', 'meal', 'drink', 'milkshake'] as const
export type ItemType = (typeof itemTypes)[number]

const idPattern = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/

export const modifierOptionSchema = z.object({
  id: z.string().trim().regex(idPattern).max(60),
  name: z.string().trim().min(1).max(80),
  price_delta_cents: z.number().int().min(0).max(5_000),
  default: z.boolean().optional(),
})

export const modifierGroupSchema = z
  .object({
    id: z.string().trim().regex(idPattern).max(60),
    name: z.string().trim().min(1).max(80),
    selection_type: z.enum(['single', 'multiple']),
    required: z.boolean(),
    min_select: z.number().int().min(0).max(20),
    max_select: z.number().int().min(1).max(20),
    options: z.array(modifierOptionSchema).min(1).max(20),
  })
  .refine((group) => group.min_select <= group.max_select, {
    message: 'min_select cannot exceed max_select.',
    path: ['min_select'],
  })
  .refine((group) => group.selection_type !== 'single' || group.max_select === 1, {
    message: 'Single-select groups must have max_select equal to 1.',
    path: ['max_select'],
  })
  .refine((group) => !group.required || group.min_select >= 1, {
    message: 'Required groups must require at least one selection.',
    path: ['min_select'],
  })
  .refine(
    (group) => new Set(group.options.map((option) => option.id)).size === group.options.length,
    { message: 'Option ids must be unique within a group.', path: ['options'] },
  )
  .refine(
    (group) => group.selection_type !== 'single' || group.options.filter((option) => option.default).length <= 1,
    { message: 'Single-select groups may only mark one option as default.', path: ['options'] },
  )

export const modifierConfigSchema = z
  .array(modifierGroupSchema)
  .max(10)
  .refine((groups) => new Set(groups.map((group) => group.id)).size === groups.length, {
    message: 'Modifier group ids must be unique within an item.',
  })

export type ModifierOption = z.infer<typeof modifierOptionSchema>
export type ModifierGroup = z.infer<typeof modifierGroupSchema>
export type ModifierConfig = z.infer<typeof modifierConfigSchema>

export const selectedOptionsSchema = z
  .array(
    z.object({
      group_id: z.string().trim().min(1).max(60),
      option_ids: z.array(z.string().trim().min(1).max(60)).max(20),
    }),
  )
  .max(10)

export type SelectedOptions = z.infer<typeof selectedOptionsSchema>

export type ResolvedSelection = {
  group_id: string
  group_name: string
  option_id: string
  option_name: string
  price_delta_cents: number
}

export type ModifierResolution =
  | { ok: true; unit_price_cents: number; selections: ResolvedSelection[] }
  | { ok: false; message: string }

/**
 * Validates a customer's chosen options against the authoritative modifier config for a menu
 * item and returns the server-computed unit price. Client-submitted price deltas are never
 * trusted; only option ids are read, and their prices come from `modifierConfig`.
 */
export function resolveModifierSelections(
  basePriceCents: number,
  modifierConfig: ModifierConfig,
  selectedOptions: SelectedOptions,
): ModifierResolution {
  const knownGroupIds = new Set(modifierConfig.map((group) => group.id))
  for (const entry of selectedOptions) {
    if (!knownGroupIds.has(entry.group_id)) {
      return { ok: false, message: 'Unknown modifier group in selection.' }
    }
  }

  const selectionByGroup = new Map(selectedOptions.map((entry) => [entry.group_id, entry.option_ids]))
  const resolved: ResolvedSelection[] = []
  let priceDeltaCents = 0

  for (const group of modifierConfig) {
    const chosenOptionIds = [...new Set(selectionByGroup.get(group.id) ?? [])]

    if (group.required && chosenOptionIds.length === 0) {
      return { ok: false, message: `"${group.name}" requires a selection.` }
    }
    if (chosenOptionIds.length > 0 && chosenOptionIds.length < group.min_select) {
      return { ok: false, message: `Choose at least ${group.min_select} option(s) for "${group.name}".` }
    }
    if (chosenOptionIds.length > group.max_select) {
      return { ok: false, message: `Choose at most ${group.max_select} option(s) for "${group.name}".` }
    }
    if (group.selection_type === 'single' && chosenOptionIds.length > 1) {
      return { ok: false, message: `"${group.name}" allows only one selection.` }
    }

    const optionById = new Map(group.options.map((option) => [option.id, option]))
    for (const optionId of chosenOptionIds) {
      const option = optionById.get(optionId)
      if (!option) {
        return { ok: false, message: `Invalid option selected for "${group.name}".` }
      }
      resolved.push({
        group_id: group.id,
        group_name: group.name,
        option_id: option.id,
        option_name: option.name,
        price_delta_cents: option.price_delta_cents,
      })
      priceDeltaCents += option.price_delta_cents
    }
  }

  return {
    ok: true,
    unit_price_cents: basePriceCents + priceDeltaCents,
    selections: resolved,
  }
}

/**
 * The reusable Forno-style pizza template: one required size, one required sauce/base and an
 * optional set of extra sauces & toppings. Applying this single template to every pizza menu
 * item keeps the modifier config consistent without hand-building it per dish.
 */
export function pizzaModifierTemplate(): ModifierConfig {
  return [
    {
      id: 'size',
      name: 'Choose your size',
      selection_type: 'single',
      required: true,
      min_select: 1,
      max_select: 1,
      options: [
        { id: 'size-25-medium', name: '25cm Medium', price_delta_cents: 0, default: true },
        { id: 'size-30-thin-crispy', name: '30cm Thin & Crispy', price_delta_cents: 150 },
        { id: 'size-29-italian', name: '29cm Italian', price_delta_cents: 100 },
        { id: 'size-35-large', name: '35cm Large', price_delta_cents: 350 },
        { id: 'size-40-family-xxl', name: '40cm Family XXL', price_delta_cents: 600 },
      ],
    },
    {
      id: 'sauce-base',
      name: 'Choose your sauce base',
      selection_type: 'single',
      required: true,
      min_select: 1,
      max_select: 1,
      options: [
        { id: 'sauce-tomato', name: 'Classic tomato sauce', price_delta_cents: 0, default: true },
        { id: 'sauce-bbq', name: 'Smoky BBQ base', price_delta_cents: 0 },
        { id: 'sauce-garlic-oil', name: 'Garlic & herb oil', price_delta_cents: 0 },
        { id: 'sauce-creamy-white', name: 'Creamy white sauce', price_delta_cents: 50 },
      ],
    },
    {
      id: 'extra-toppings',
      name: 'Extra sauces & toppings',
      selection_type: 'multiple',
      required: false,
      min_select: 0,
      max_select: 6,
      options: [
        { id: 'topping-extra-cheese', name: 'Extra mozzarella', price_delta_cents: 150 },
        { id: 'topping-extra-chicken', name: 'Extra halal chicken', price_delta_cents: 200 },
        { id: 'topping-jalapeno', name: 'Jalapeño', price_delta_cents: 100 },
        { id: 'topping-olives', name: 'Olives', price_delta_cents: 100 },
        { id: 'topping-mushrooms', name: 'Mushrooms', price_delta_cents: 100 },
        { id: 'sauce-garlic-dip', name: 'Garlic dip', price_delta_cents: 75 },
        { id: 'sauce-bbq-dip', name: 'BBQ dip', price_delta_cents: 75 },
        { id: 'sauce-chilli-oil', name: 'Chilli oil drizzle', price_delta_cents: 75 },
      ],
    },
  ]
}

/** Sensible starting templates offered by the portal item-type picker, keyed by item type. */
export function defaultModifierTemplateFor(itemType: ItemType): ModifierConfig {
  if (itemType === 'pizza') return pizzaModifierTemplate()
  if (itemType === 'burger') {
    return [
      {
        id: 'patty',
        name: 'Choose your patty',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'patty-single', name: 'Single halal beef patty', price_delta_cents: 0, default: true },
          { id: 'patty-double', name: 'Double halal beef patty', price_delta_cents: 300 },
          { id: 'patty-chicken', name: 'Grilled chicken fillet', price_delta_cents: 100 },
        ],
      },
      {
        id: 'sauce',
        name: 'Choose your sauce',
        selection_type: 'multiple',
        required: false,
        min_select: 0,
        max_select: 3,
        options: [
          { id: 'sauce-burger', name: 'Burger sauce', price_delta_cents: 0, default: true },
          { id: 'sauce-garlic', name: 'Garlic sauce', price_delta_cents: 0 },
          { id: 'sauce-spicy', name: 'Spicy sauce', price_delta_cents: 0 },
          { id: 'sauce-bbq', name: 'BBQ sauce', price_delta_cents: 0 },
        ],
      },
      {
        id: 'extras',
        name: 'Extra toppings',
        selection_type: 'multiple',
        required: false,
        min_select: 0,
        max_select: 6,
        options: [
          { id: 'extra-cheese', name: 'Extra cheese', price_delta_cents: 100 },
          { id: 'extra-bacon-beef', name: 'Beef bacon', price_delta_cents: 150 },
          { id: 'extra-onion-rings', name: 'Onion rings', price_delta_cents: 125 },
        ],
      },
    ]
  }
  if (itemType === 'kebab') {
    return [
      {
        id: 'serving', name: 'Choose how it is served', selection_type: 'single',
        required: true, min_select: 1, max_select: 1,
        options: [
          { id: 'serving-pita', name: 'Pita bread', price_delta_cents: 0, default: true },
          { id: 'serving-wrap', name: 'Wrap', price_delta_cents: 100 },
          { id: 'serving-box', name: 'Kebab box with fries', price_delta_cents: 300 },
        ],
      },
      {
        id: 'kebab-sauces', name: 'Choose your sauces', selection_type: 'multiple',
        required: false, min_select: 0, max_select: 3,
        options: [
          { id: 'sauce-garlic', name: 'Garlic sauce', price_delta_cents: 0, default: true },
          { id: 'sauce-sambal', name: 'Sambal', price_delta_cents: 0 },
          { id: 'sauce-yoghurt', name: 'Yoghurt sauce', price_delta_cents: 0 },
          { id: 'sauce-bbq', name: 'BBQ sauce', price_delta_cents: 50 },
        ],
      },
    ]
  }
  if (itemType === 'meal') {
    return [
      {
        id: 'side',
        name: 'Choose your side',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'side-fries', name: 'Fries', price_delta_cents: 0, default: true },
          { id: 'side-rice', name: 'Rice', price_delta_cents: 0 },
          { id: 'side-salad', name: 'Salad', price_delta_cents: 0 },
        ],
      },
      {
        id: 'drink',
        name: 'Choose your drink',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'drink-cola', name: 'Cola 330ml', price_delta_cents: 0, default: true },
          { id: 'drink-water', name: 'Sparkling water', price_delta_cents: 0 },
          { id: 'drink-fanta', name: 'Fanta 330ml', price_delta_cents: 0 },
        ],
      },
    ]
  }
  if (itemType === 'drink') {
    return [
      {
        id: 'drink-size', name: 'Choose your size', selection_type: 'single',
        required: true, min_select: 1, max_select: 1,
        options: [
          { id: 'size-330ml', name: '330ml', price_delta_cents: 0, default: true },
          { id: 'size-500ml', name: '500ml', price_delta_cents: 100 },
          { id: 'size-1l', name: '1 litre', price_delta_cents: 250 },
        ],
      },
      {
        id: 'drink-preference', name: 'Preference', selection_type: 'single',
        required: false, min_select: 0, max_select: 1,
        options: [
          { id: 'regular', name: 'Regular', price_delta_cents: 0, default: true },
          { id: 'zero-sugar', name: 'Zero sugar', price_delta_cents: 0 },
        ],
      },
    ]
  }
  if (itemType === 'milkshake') {
    return [
      {
        id: 'shake-size', name: 'Choose your size', selection_type: 'single',
        required: true, min_select: 1, max_select: 1,
        options: [
          { id: 'size-regular', name: 'Regular', price_delta_cents: 0, default: true },
          { id: 'size-large', name: 'Large', price_delta_cents: 150 },
        ],
      },
      {
        id: 'shake-flavour', name: 'Choose your flavour', selection_type: 'single',
        required: true, min_select: 1, max_select: 1,
        options: [
          { id: 'flavour-vanilla', name: 'Vanilla', price_delta_cents: 0, default: true },
          { id: 'flavour-chocolate', name: 'Chocolate', price_delta_cents: 0 },
          { id: 'flavour-strawberry', name: 'Strawberry', price_delta_cents: 0 },
          { id: 'flavour-banana', name: 'Banana', price_delta_cents: 0 },
        ],
      },
      {
        id: 'shake-extras', name: 'Add extras', selection_type: 'multiple',
        required: false, min_select: 0, max_select: 3,
        options: [
          { id: 'extra-whipped-cream', name: 'Whipped cream', price_delta_cents: 75 },
          { id: 'extra-cookie', name: 'Cookie crumble', price_delta_cents: 100 },
          { id: 'extra-chocolate', name: 'Chocolate drizzle', price_delta_cents: 75 },
        ],
      },
    ]
  }
  return []
}
