// Generic promotion rule engine shared between the Fastify server (server/index.ts, authoritative
// checkout pricing) and the React client (basket + checkout previews). Keeping a single pure,
// dependency-free implementation guarantees the client preview always matches the server total.
//
// Supported presets are all expressions of ONE generic rule: "buy `buyQuantity` qualifying units,
// get `rewardQuantity` cheapest eligible reward units at `rewardDiscountPercent`% off":
//   - Buy 1, get 1 free               -> buyQuantity=1, rewardQuantity=1, rewardDiscountPercent=100
//   - Buy X, get cheapest Y free      -> buyQuantity=X,  rewardQuantity=Y, rewardDiscountPercent=100
//   - Second item half price          -> buyQuantity=1, rewardQuantity=1, rewardDiscountPercent=50
//   - Custom quantity offer           -> any buyQuantity/rewardQuantity/rewardDiscountPercent

/** Which menu items count towards the "buy" side of the rule. */
export type PromotionQualifyingScopeType = 'all' | 'categories' | 'items'

/** Which menu items are eligible to receive the discount. `same_as_qualifying` reuses the
 * qualifying scope and groups units as classic Buy X Get Y (X+Y taken from one shared pool). */
export type PromotionRewardScopeType = 'same_as_qualifying' | 'all' | 'categories' | 'items'

export type PromotionScope = {
  type: PromotionQualifyingScopeType | PromotionRewardScopeType
  categoryIds: string[]
  itemIds: string[]
}

export type QuantityPromotionRule = {
  buyQuantity: number
  rewardQuantity: number
  rewardDiscountPercent: number
  qualifyingScope: PromotionScope
  rewardScope: PromotionScope
}

export type PromotionOrderLine = {
  itemId: string
  categoryId: string
  unitPriceCents: number
  quantity: number
}

export type QuantityPromotionResult = {
  discountCents: number
  rewardUnitsApplied: number
  groupsApplied: number
}

const emptyResult: QuantityPromotionResult = {
  discountCents: 0,
  rewardUnitsApplied: 0,
  groupsApplied: 0,
}

type PromotionUnit = {
  index: number
  itemId: string
  categoryId: string
  unitPriceCents: number
}

function expandUnits(lines: PromotionOrderLine[]): PromotionUnit[] {
  const units: PromotionUnit[] = []
  let index = 0
  for (const line of lines) {
    for (let copy = 0; copy < line.quantity; copy += 1) {
      units.push({
        index,
        itemId: line.itemId,
        categoryId: line.categoryId,
        unitPriceCents: line.unitPriceCents,
      })
      index += 1
    }
  }
  return units
}

function matchesScope(unit: PromotionUnit, scope: PromotionScope): boolean {
  if (scope.type === 'all') return true
  if (scope.type === 'categories') return scope.categoryIds.includes(unit.categoryId)
  if (scope.type === 'items') return scope.itemIds.includes(unit.itemId)
  return false
}

function ascendingByPrice(a: PromotionUnit, b: PromotionUnit): number {
  return a.unitPriceCents - b.unitPriceCents
}

function descendingByPrice(a: PromotionUnit, b: PromotionUnit): number {
  return b.unitPriceCents - a.unitPriceCents
}

function discountForUnits(units: PromotionUnit[], percent: number): number {
  return units.reduce((total, unit) => total + Math.round((unit.unitPriceCents * percent) / 100), 0)
}

/**
 * Calculates the promotion discount for a basket/order deterministically. Always discounts the
 * cheapest eligible reward units first, and never discounts more reward units than the qualifying
 * units can unlock.
 *
 * - Same scope (`rewardScope.type === 'same_as_qualifying'`): the qualifying pool is grouped into
 *   chunks of `buyQuantity + rewardQuantity`; within each complete chunk the cheapest
 *   `rewardQuantity` units are discounted. This is the classic "Buy X, get Y" grouping where a
 *   single pool of fungible units serves both roles.
 * - Distinct scope: the qualifying pool only "unlocks" reward units — it does not supply them.
 *   `floor(qualifyingUnits / buyQuantity)` unlocks allow `rewardQuantity` reward units each. To
 *   avoid a unit paying for itself when the two scopes overlap, the most expensive qualifying
 *   units are reserved to satisfy the buy requirement first, leaving cheaper overlapping units
 *   free to be selected as (cheaper, more generous) reward units.
 */
export function calculateQuantityPromotionDiscount(
  lines: PromotionOrderLine[],
  rule: QuantityPromotionRule,
): QuantityPromotionResult {
  const buyQuantity = Math.max(1, Math.floor(rule.buyQuantity))
  const rewardQuantity = Math.max(1, Math.floor(rule.rewardQuantity))
  const percent = Math.min(100, Math.max(1, Math.floor(rule.rewardDiscountPercent)))

  const units = expandUnits(lines)
  const qualifyingUnits = units.filter((unit) => matchesScope(unit, rule.qualifyingScope))
  if (qualifyingUnits.length === 0) return emptyResult

  if (rule.rewardScope.type === 'same_as_qualifying') {
    const groupSize = buyQuantity + rewardQuantity
    const groupsApplied = Math.floor(qualifyingUnits.length / groupSize)
    const rewardUnitsApplied = groupsApplied * rewardQuantity
    if (rewardUnitsApplied === 0) return emptyResult
    const rewardUnits = [...qualifyingUnits].sort(ascendingByPrice).slice(0, rewardUnitsApplied)
    return {
      discountCents: discountForUnits(rewardUnits, percent),
      rewardUnitsApplied: rewardUnits.length,
      groupsApplied,
    }
  }

  const groupsApplied = Math.floor(qualifyingUnits.length / buyQuantity)
  const rewardUnitsAllowed = groupsApplied * rewardQuantity
  if (rewardUnitsAllowed === 0) return emptyResult

  const reservedForBuyCount = Math.min(qualifyingUnits.length, groupsApplied * buyQuantity)
  const reservedIndexes = new Set(
    [...qualifyingUnits].sort(descendingByPrice).slice(0, reservedForBuyCount).map((unit) => unit.index),
  )
  const rewardCandidates = units.filter(
    (unit) => !reservedIndexes.has(unit.index) && matchesScope(unit, rule.rewardScope),
  )
  const rewardUnits = rewardCandidates.sort(ascendingByPrice).slice(0, rewardUnitsAllowed)
  if (rewardUnits.length === 0) return emptyResult
  return {
    discountCents: discountForUnits(rewardUnits, percent),
    rewardUnitsApplied: rewardUnits.length,
    groupsApplied,
  }
}

/** Raw, normalized promotion row shape as stored/returned by the API (both legacy and current). */
export type PromotionRuleSource = {
  promotion_type: string
  buy_quantity: number | null
  reward_quantity: number | null
  reward_discount_percent?: number | null
  qualifying_scope_type?: string | null
  qualifying_category_ids?: string[] | null
  qualifying_item_ids?: string[] | null
  reward_scope_type?: string | null
  reward_category_ids?: string[] | null
  reward_item_ids?: string[] | null
}

const quantityPromotionTypes = new Set(['quantity_discount', 'buy_x_get_y_free'])

/** True for both the current `quantity_discount` type and the legacy `buy_x_get_y_free` type. */
export function isQuantityPromotionType(promotionType: string): boolean {
  return quantityPromotionTypes.has(promotionType)
}

/**
 * Normalizes a promotion row into a `QuantityPromotionRule`, or `null` if the row is not a
 * quantity-based promotion (e.g. an `order_offer`) or is missing required quantities. Understands
 * the legacy `buy_x_get_y_free` type (pre-dates configurable scope/discount) and reads it as a
 * 100%-off, all-items, same-scope quantity rule so old data keeps working even before the
 * database migration in `ensureSchema` has renamed it to `quantity_discount`.
 */
export function toQuantityPromotionRule(source: PromotionRuleSource): QuantityPromotionRule | null {
  if (!isQuantityPromotionType(source.promotion_type)) return null
  if (!source.buy_quantity || !source.reward_quantity) return null
  const isLegacy = source.promotion_type === 'buy_x_get_y_free'
  return {
    buyQuantity: source.buy_quantity,
    rewardQuantity: source.reward_quantity,
    rewardDiscountPercent: source.reward_discount_percent ?? 100,
    qualifyingScope: {
      type: isLegacy ? 'all' : ((source.qualifying_scope_type as PromotionQualifyingScopeType) ?? 'all'),
      categoryIds: source.qualifying_category_ids ?? [],
      itemIds: source.qualifying_item_ids ?? [],
    },
    rewardScope: {
      type: isLegacy
        ? 'same_as_qualifying'
        : ((source.reward_scope_type as PromotionRewardScopeType) ?? 'same_as_qualifying'),
      categoryIds: source.reward_category_ids ?? [],
      itemIds: source.reward_item_ids ?? [],
    },
  }
}

/** Name lookups used to render human copy for a scope ("all menu items", "Pizzas, Sides", ...). */
export type PromotionNameLookup = {
  categoryNameById: Record<string, string>
  itemNameById: Record<string, string>
}

function describeScope(scope: PromotionScope, lookup: PromotionNameLookup): string {
  if (scope.type === 'all') return 'all menu items'
  if (scope.type === 'categories') {
    const names = scope.categoryIds.map((id) => lookup.categoryNameById[id] ?? 'a selected category')
    return names.length > 0 ? names.join(', ') : 'selected categories'
  }
  if (scope.type === 'items') {
    const names = scope.itemIds.map((id) => lookup.itemNameById[id] ?? 'a selected item')
    return names.length > 0 ? names.join(', ') : 'selected items'
  }
  return 'the qualifying items'
}

/** Deterministic, jargon-free copy for the storefront/basket/portal, e.g.
 * "Buy 1 from Chicken pizzas, Vegetarian pizzas, get the cheapest 1 free" or
 * "Buy 1, get the 2nd cheapest 50% off". */
export function describeQuantityPromotion(rule: QuantityPromotionRule, lookup: PromotionNameLookup): string {
  const qualifyingLabel = describeScope(rule.qualifyingScope, lookup)
  const rewardLabel =
    rule.rewardScope.type === 'same_as_qualifying' ? qualifyingLabel : describeScope(rule.rewardScope, lookup)
  const discountLabel = rule.rewardDiscountPercent >= 100 ? 'free' : `${rule.rewardDiscountPercent}% off`
  const rewardCountLabel = rule.rewardQuantity === 1 ? 'the cheapest' : `the cheapest ${rule.rewardQuantity}`
  const sameScope = rule.rewardScope.type === 'same_as_qualifying'
  const scopeSuffix = qualifyingLabel === 'all menu items' && sameScope ? '' : ` from ${qualifyingLabel}`
  const rewardSuffix = sameScope ? '' : ` from ${rewardLabel}`
  return `Buy ${rule.buyQuantity}${scopeSuffix}, get ${rewardCountLabel}${rewardSuffix} ${discountLabel}`
}
