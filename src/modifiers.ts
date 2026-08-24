// Frontend mirror of server/modifiers.ts. Kept dependency-free (no zod) so it can be shared by
// the storefront configuration modal and the portal menu editor without pulling in server-only
// packages. Any change to the shape of a modifier group/option here must stay compatible with
// the server-side schema, since selections are validated authoritatively on the server.

export const itemTypes = ['standard', 'pizza', 'burger', 'kebab', 'meal', 'drink', 'milkshake'] as const
export type ItemType = (typeof itemTypes)[number]

export type ModifierOption = {
  id: string
  name: string
  price_delta_cents: number
  default?: boolean
}

export type ModifierGroup = {
  id: string
  name: string
  selection_type: 'single' | 'multiple'
  required: boolean
  min_select: number
  max_select: number
  options: ModifierOption[]
}

export type ModifierConfig = ModifierGroup[]

export type SelectedOptions = Array<{ group_id: string; option_ids: string[] }>

export type ConfiguredLine = {
  lineId: string
  itemId: string
  categoryId: string
  itemName: string
  unitPriceCents: number
  quantity: number
  selectedOptions: SelectedOptions
  selectionSummary: string
  note: string
}

/** Builds the default selection set for a modifier config (every group's marked default option). */
export function defaultSelections(modifierConfig: ModifierConfig): SelectedOptions {
  return modifierConfig
    .map((group) => ({
      group_id: group.id,
      option_ids: group.options.filter((option) => option.default).map((option) => option.id),
    }))
    .filter((entry) => entry.option_ids.length > 0)
}

/** Client-side price preview only — the server always recomputes the authoritative price. */
export function computeUnitPriceCents(
  basePriceCents: number,
  modifierConfig: ModifierConfig,
  selected: SelectedOptions,
): number {
  const selectionByGroup = new Map(selected.map((entry) => [entry.group_id, new Set(entry.option_ids)]))
  let total = basePriceCents
  for (const group of modifierConfig) {
    const chosen = selectionByGroup.get(group.id)
    if (!chosen) continue
    for (const option of group.options) {
      if (chosen.has(option.id)) total += option.price_delta_cents
    }
  }
  return total
}

/** Groups still missing a valid selection, used to gate the "add to basket" action. */
export function missingRequiredGroups(modifierConfig: ModifierConfig, selected: SelectedOptions): ModifierGroup[] {
  const selectionByGroup = new Map(selected.map((entry) => [entry.group_id, entry.option_ids]))
  return modifierConfig.filter((group) => {
    const chosen = selectionByGroup.get(group.id) ?? []
    if (group.required && chosen.length === 0) return true
    if (chosen.length > 0 && chosen.length < group.min_select) return true
    return false
  })
}

export function isSelectionComplete(modifierConfig: ModifierConfig, selected: SelectedOptions): boolean {
  return missingRequiredGroups(modifierConfig, selected).length === 0
}

/** Human-readable "size / sauce / +toppings" labels for basket lines and order history. */
export function selectionLabels(
  modifierConfig: ModifierConfig,
  selected: SelectedOptions,
): Array<{ group_name: string; option_name: string; price_delta_cents: number }> {
  const selectionByGroup = new Map(selected.map((entry) => [entry.group_id, new Set(entry.option_ids)]))
  const labels: Array<{ group_name: string; option_name: string; price_delta_cents: number }> = []
  for (const group of modifierConfig) {
    const chosen = selectionByGroup.get(group.id)
    if (!chosen) continue
    for (const option of group.options) {
      if (chosen.has(option.id)) {
        labels.push({
          group_name: group.name,
          option_name: option.name,
          price_delta_cents: option.price_delta_cents,
        })
      }
    }
  }
  return labels
}

export function selectionSummaryText(modifierConfig: ModifierConfig, selected: SelectedOptions): string {
  return selectionLabels(modifierConfig, selected)
    .map((label) => label.option_name)
    .join(' · ')
}

/**
 * Stable, deterministic line id for a configured basket line: same item + same selections always
 * collapse into the same basket line, while different configurations of the same item id remain
 * distinct lines.
 */
export function buildLineId(itemId: string, selected: SelectedOptions, note = ''): string {
  const normalized = [...selected]
    .map((entry) => `${entry.group_id}:${[...entry.option_ids].sort().join(',')}`)
    .sort()
    .join('|')
  return `${itemId}::${normalized}::${note.trim().toLowerCase()}`
}

/**
 * The reusable Forno-style pizza template: one required size, one required sauce/base and an
 * optional set of extra sauces & toppings. Must mirror server/modifiers.ts exactly.
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
        id: 'serving',
        name: 'Choose how it is served',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'serving-pita', name: 'Pita bread', price_delta_cents: 0, default: true },
          { id: 'serving-wrap', name: 'Wrap', price_delta_cents: 100 },
          { id: 'serving-box', name: 'Kebab box with fries', price_delta_cents: 300 },
        ],
      },
      {
        id: 'kebab-sauces',
        name: 'Choose your sauces',
        selection_type: 'multiple',
        required: false,
        min_select: 0,
        max_select: 3,
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
        id: 'drink-size',
        name: 'Choose your size',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'size-330ml', name: '330ml', price_delta_cents: 0, default: true },
          { id: 'size-500ml', name: '500ml', price_delta_cents: 100 },
          { id: 'size-1l', name: '1 litre', price_delta_cents: 250 },
        ],
      },
      {
        id: 'drink-preference',
        name: 'Preference',
        selection_type: 'single',
        required: false,
        min_select: 0,
        max_select: 1,
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
        id: 'shake-size',
        name: 'Choose your size',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'size-regular', name: 'Regular', price_delta_cents: 0, default: true },
          { id: 'size-large', name: 'Large', price_delta_cents: 150 },
        ],
      },
      {
        id: 'shake-flavour',
        name: 'Choose your flavour',
        selection_type: 'single',
        required: true,
        min_select: 1,
        max_select: 1,
        options: [
          { id: 'flavour-vanilla', name: 'Vanilla', price_delta_cents: 0, default: true },
          { id: 'flavour-chocolate', name: 'Chocolate', price_delta_cents: 0 },
          { id: 'flavour-strawberry', name: 'Strawberry', price_delta_cents: 0 },
          { id: 'flavour-banana', name: 'Banana', price_delta_cents: 0 },
        ],
      },
      {
        id: 'shake-extras',
        name: 'Add extras',
        selection_type: 'multiple',
        required: false,
        min_select: 0,
        max_select: 3,
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
