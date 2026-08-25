import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Filter,
  Info,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Tag,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  CheckoutDrawer,
  type Charity,
  type MenuItem,
  type Offer,
  type Restaurant,
} from './App.tsx'
import { ModifierModal } from './ModifierModal.tsx'
import {
  buildLineId,
  computeUnitPriceCents,
  selectionSummaryText,
  type ConfiguredLine,
  type SelectedOptions,
} from './modifiers.ts'
import {
  describeOrderValuePromotion,
  describeQuantityPromotion,
  isQuantityPromotionType,
  selectBestAutomaticPromotion,
  toOrderValuePromotionRule,
  toQuantityPromotionRule,
  type PromotionNameLookup,
  type PromotionOrderLine,
  type QuantityPromotionRule,
} from '../shared/promotionEngine.ts'
import { type Language, useI18n } from './i18n.ts'
import './RestaurantPage.css'

type Review = {
  id: string
  rating: number
  comment: string
  created_at: string
  display_name: string
  order_number: string
}

type StorefrontRestaurant = Restaurant & {
  offers: Offer[]
  reviews: Review[]
  accepting_orders: boolean
}

type StorefrontData = {
  restaurant: StorefrontRestaurant
  charities: Charity[]
}

const text = {
  en: {
    back: 'All restaurants',
    search: 'Search this menu',
    categories: 'Menu categories',
    reviews: 'Reviews',
    info: 'Info',
    offers: 'Offers',
    minimum: 'Minimum order',
    delivery: 'Delivery',
    service: 'Service fee',
    free: 'Free',
    open: 'Open',
    closed: 'Closed',
    unavailable: 'Unavailable',
    from: 'from',
    emptyTitle: 'Fill your basket',
    empty: 'Your basket is empty',
    subtotal: 'Subtotal',
    promotionDiscount: 'Promotion discount',
    total: 'Total',
    checkout: 'Checkout',
    forgot: 'Did you forget?',
    feeTitle: 'How fees work',
    feeBody: 'The service fee supports a safe ordering experience. It is calculated on the food subtotal and never exceeds the displayed cap.',
    verified: 'Verified order',
    noOffers: 'There are no offers right now.',
    noResults: 'No dishes match your search.',
    available: 'Availability',
    allergens: 'Allergens',
    ingredients: 'Ingredients',
    close: 'Close',
    menuFilter: 'Filter categories',
    promoTitle: 'Add another, get the cheapest free!',
    promoBody: 'We will apply the discount at checkout.',
    noThanks: 'No, thanks',
    addAnother: 'Add to order',
  },
  nl: {
    back: 'Alle restaurants',
    search: 'Zoek in dit menu',
    categories: 'Menucategorieën',
    reviews: 'Beoordelingen',
    info: 'Info',
    offers: 'Aanbiedingen',
    minimum: 'Minimale bestelling',
    delivery: 'Bezorgkosten',
    service: 'Servicekosten',
    free: 'Gratis',
    open: 'Open',
    closed: 'Gesloten',
    unavailable: 'Niet beschikbaar',
    from: 'vanaf',
    emptyTitle: 'Vul je mandje',
    empty: 'Je mandje is leeg',
    subtotal: 'Subtotaal',
    promotionDiscount: 'Promotiekorting',
    total: 'Totaal',
    checkout: 'Afrekenen',
    forgot: 'Niets vergeten?',
    feeTitle: 'Zo werken de kosten',
    feeBody: 'De servicekosten ondersteunen een veilige bestelervaring. Ze worden berekend over het subtotaal van het eten en zijn nooit hoger dan het getoonde maximum.',
    verified: 'Geverifieerde bestelling',
    noOffers: 'Er zijn nu geen aanbiedingen.',
    noResults: 'Geen gerechten gevonden.',
    available: 'Beschikbaarheid',
    allergens: 'Allergenen',
    ingredients: 'Ingrediënten',
    close: 'Sluiten',
    menuFilter: 'Categorieën filteren',
    promoTitle: 'Voeg er nog een toe, de goedkoopste is gratis!',
    promoBody: 'We verrekenen de korting bij het afrekenen.',
    noThanks: 'Nee, bedankt',
    addAnother: 'Toevoegen',
  },
} satisfies Record<Language, Record<string, string>>

const money = {
  en: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }),
  nl: new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }),
}

function formatMoney(language: Language, value: number) {
  return money[language].format(value)
}

function isQualifyingItem(item: MenuItem, rule: QuantityPromotionRule): boolean {
  if (rule.qualifyingScope.type === 'all') return true
  if (rule.qualifyingScope.type === 'categories') {
    return rule.qualifyingScope.categoryIds.includes(item.category_id)
  }
  return rule.qualifyingScope.itemIds.includes(item.id)
}

export function RestaurantPage() {
  const { slug } = useParams({ from: '/restaurant/$slug' })
  const { language, setLanguage } = useI18n()
  const t = text[language]
  const [bag, setBag] = useState<Record<string, number>>({})
  const [configuredLines, setConfiguredLines] = useState<Record<string, ConfiguredLine>>({})
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<'reviews' | 'info' | 'offers' | null>(null)
  const [feeOpen, setFeeOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [promotionItem, setPromotionItem] = useState<MenuItem | null>(null)
  const categoryRail = useRef<HTMLDivElement>(null)
  const { data, error, isLoading } = useQuery({
    queryKey: ['storefront', slug],
    queryFn: async () => {
      const response = await fetch(`/api/restaurants/${encodeURIComponent(slug)}/storefront`)
      const body = (await response.json()) as StorefrontData & { message?: string }
      if (!response.ok) throw new Error(body.message ?? 'Unable to load restaurant.')
      return body
    },
  })
  const restaurant = data?.restaurant
  const allItems = useMemo(
    () => restaurant?.menu.flatMap((category) => category.items) ?? [],
    [restaurant],
  )
  const simpleLines = allItems
    .filter((item) => (bag[item.id] ?? 0) > 0)
    .map((item) => ({ item, quantity: bag[item.id] }))
  const priceLines = Object.values(configuredLines)
  const lines = simpleLines
  const activeOffer = restaurant?.offers.find((offer) => offer.status === 'active')
  const activeQuantityOffer = restaurant?.offers.find(
    (offer) => offer.status === 'active' && isQuantityPromotionType(offer.promotion_type),
  )
  const promotionRule = activeQuantityOffer ? toQuantityPromotionRule(activeQuantityOffer) : null
  const menuSubtotal =
    simpleLines.reduce((sum, line) => sum + line.item.price_cents * line.quantity, 0) +
    priceLines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0)
  const promotionLines: PromotionOrderLine[] = [
    ...simpleLines.map((line) => ({
      itemId: line.item.id,
      categoryId: line.item.category_id,
      unitPriceCents: line.item.price_cents,
      quantity: line.quantity,
    })),
    ...priceLines.map((line) => ({
      itemId: line.itemId,
      categoryId: line.categoryId,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
    })),
  ]
  const baseDelivery =
    restaurant?.free_delivery_threshold_cents !== null &&
    restaurant?.free_delivery_threshold_cents !== undefined &&
    menuSubtotal >= restaurant.free_delivery_threshold_cents
      ? 0
      : (restaurant?.delivery_fee_cents ?? 0)
  const appliedPromotion = selectBestAutomaticPromotion(
    restaurant?.offers.filter((offer) => offer.status === 'active') ?? [],
    promotionLines,
    menuSubtotal,
    baseDelivery,
  )
  const promotionDiscount = appliedPromotion?.foodDiscountCents ?? 0
  const promotionNameLookup: PromotionNameLookup = useMemo(() => ({
    categoryNameById: Object.fromEntries((restaurant?.menu ?? []).map((category) => [category.id, category.name])),
    itemNameById: Object.fromEntries(allItems.map((item) => [item.id, item.name])),
  }), [restaurant, allItems])
  const subtotal = menuSubtotal - promotionDiscount
  const delivery = baseDelivery - (appliedPromotion?.deliveryDiscountCents ?? 0)
  const service = restaurant
    ? Math.min(Math.round(subtotal * restaurant.service_fee_bps / 10_000), restaurant.service_fee_cap_cents)
    : 0
  const total = subtotal + delivery + service
  const isInBasket = (itemId: string) =>
    Boolean(bag[itemId]) || priceLines.some((line) => line.itemId === itemId)
  const recommendation = allItems.find((item) => !isInBasket(item.id))
  const basketCount =
    simpleLines.reduce((sum, line) => sum + line.quantity, 0) +
    priceLines.reduce((sum, line) => sum + line.quantity, 0)

  function changeQuantity(itemId: string, amount: number) {
    if (amount > 0 && !restaurant?.accepting_orders) return
    setBag((current) => {
      const quantity = Math.max(0, (current[itemId] ?? 0) + amount)
      const next = { ...current }
      if (quantity === 0) delete next[itemId]
      else next[itemId] = quantity
      return next
    })
  }

  function changeConfiguredLineQuantity(lineId: string, amount: number) {
    if (amount > 0 && !restaurant?.accepting_orders) return
    setConfiguredLines((current) => {
      const existing = current[lineId]
      if (!existing) return current
      const quantity = Math.max(0, existing.quantity + amount)
      const next = { ...current }
      if (quantity === 0) delete next[lineId]
      else next[lineId] = { ...existing, quantity }
      return next
    })
  }

  function addItem(item: MenuItem) {
    setConfiguringItem(item)
  }

  function addConfiguredLine(item: MenuItem, selectedOptions: SelectedOptions, quantity: number, note: string) {
    const modifierConfig = item.modifier_config ?? []
    const lineId = buildLineId(item.id, selectedOptions, note)
    const unitPriceCents = computeUnitPriceCents(item.price_cents, modifierConfig, selectedOptions)
    const selectionSummary = selectionSummaryText(modifierConfig, selectedOptions)
    const wasAlreadyInBasket = isInBasket(item.id)
    setConfiguredLines((current) => {
      const existing = current[lineId]
      return {
        ...current,
        [lineId]: {
          lineId,
          itemId: item.id,
          categoryId: item.category_id,
          itemName: item.name,
          unitPriceCents,
          quantity: (existing?.quantity ?? 0) + quantity,
          selectedOptions,
          selectionSummary,
          note,
        },
      }
    })
    setConfiguringItem(null)
    if (promotionRule && !wasAlreadyInBasket && isQualifyingItem(item, promotionRule)) {
      setPromotionItem(item)
    }
  }

  if (isLoading) return <div className="storefront-state">Loading restaurant…</div>
  if (error || !restaurant) return <div className="storefront-state storefront-state--error">{error?.message ?? 'Restaurant not found.'}</div>

  return (
    <div className="storefront-page">
      <header className="storefront-topbar">
        <Link to="/" aria-label={t.back}><ArrowLeft /> <strong>Halal Delivery</strong></Link>
        <div className="storefront-language" role="group" aria-label="Language">
          {(['en', 'nl'] as Language[]).map((option) => (
            <button className={language === option ? 'active' : ''} type="button" key={option} onClick={() => setLanguage(option)}>{option.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <main>
        <section className="storefront-hero">
          <img src={restaurant.landing_image_url} alt="" />
          <div className="storefront-hero__shade" />
          <div className="storefront-hero__content">
            <span><BadgeCheck /> {restaurant.halal_status}</span>
            <h1>{restaurant.name}</h1>
            <p>{restaurant.description}</p>
            <div className="storefront-meta">
              <button type="button" onClick={() => setPanel('reviews')}><Star fill="currentColor" /> {restaurant.rating} ({restaurant.review_count})</button>
              <span><Clock3 /> {restaurant.delivery_minutes} min</span>
              <span>{restaurant.accepting_orders ? t.open : t.closed} {restaurant.opening_time.slice(0, 5)}–{restaurant.closing_time.slice(0, 5)}</span>
            </div>
          </div>
          {activeOffer && <button className="offer-ribbon" type="button" onClick={() => setPanel('offers')}><Tag /> {activeOffer.title}</button>}
        </section>

        <section className="storefront-summary">
          <div className="storefront-tabs">
            <button type="button" onClick={() => setPanel('reviews')}>{t.reviews}</button>
            <button type="button" onClick={() => setPanel('info')}>{t.info}</button>
            <button type="button" onClick={() => setPanel('offers')}>{t.offers}{activeOffer ? ' · 1' : ''}</button>
          </div>
          <button className="fee-summary" type="button" onClick={() => setFeeOpen(true)}>
            <span><small>{t.minimum}</small><strong>{formatMoney(language, restaurant.minimum_order_cents / 100)}</strong></span>
            <span><small>{t.delivery}</small><strong>{restaurant.delivery_fee_cents ? formatMoney(language, restaurant.delivery_fee_cents / 100) : t.free}</strong></span>
            <span><small>{t.service}</small><strong>{restaurant.service_fee_bps / 100}% · max {formatMoney(language, restaurant.service_fee_cap_cents / 100)}</strong></span>
            <CircleHelp />
          </button>
        </section>

        <div className="storefront-layout">
          <div className="storefront-menu">
            <label className="storefront-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} />{search && <button type="button" onClick={() => setSearch('')} aria-label={t.close}><X /></button>}</label>
            <div className="category-nav">
              <button type="button" aria-label="Previous categories" onClick={() => categoryRail.current?.scrollBy({ left: -260, behavior: 'smooth' })}><ChevronLeft /></button>
              <div ref={categoryRail}>
                {restaurant.menu.map((category) => <a key={category.id} href={`#category-${category.id}`}><span>{category.emoji}</span>{category.name}</a>)}
              </div>
              <button type="button" aria-label="Next categories" onClick={() => categoryRail.current?.scrollBy({ left: 260, behavior: 'smooth' })}><ChevronRight /></button>
              <button className="category-filter" type="button" title={t.menuFilter} aria-label={t.menuFilter}><Filter /></button>
            </div>

            {restaurant.menu.map((category) => {
              const items = category.items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()))
              if (items.length === 0) return null
              return (
                <section className="menu-category" id={`category-${category.id}`} key={category.id}>
                  <h2><span>{category.emoji}</span>{category.name}</h2>
                  <div className="dish-grid">
                    {items.map((item, index) => (
                      <article className="dish-card" key={item.id}>
                        <button className="dish-card__info" type="button" onClick={() => setSelectedItem(item)} aria-label={`${t.info}: ${item.name}`}><Info /></button>
                        {item.image_url && <img src={item.image_url} alt="" />}
                        <div>
                          <div className="dish-card__labels">{item.popular && <span>Popular</span>}{activeOffer && index === 0 && <span className="dish-card__offer">{activeOffer.title}</span>}{item.is_available === false && <span>{t.unavailable}</span>}</div>
                          <h3>{item.name}</h3>
                          <p>{item.description}</p>
                          <strong>{t.from} {formatMoney(language, item.price_cents / 100)}</strong>
                        </div>
                        <button className="dish-card__add" disabled={!restaurant.accepting_orders || item.is_available === false} type="button" onClick={() => addItem(item)} aria-label={`Add ${item.name}`}><Plus /></button>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
            {restaurant.menu.every((category) => category.items.every((item) => !`${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()))) && <p className="menu-no-results">{t.noResults}</p>}
          </div>

          <aside className="basket">
            <div className="basket__title"><ShoppingBag /><div><h2>{t.emptyTitle}</h2><p>{basketCount ? `${basketCount} items` : t.empty}</p></div></div>
            {basketCount === 0 ? <div className="basket__empty"><span>🛍️</span><p>{t.empty}</p></div> : (
              <>
                <div className="basket__lines">
                  {lines.map(({ item, quantity }) => <div key={item.id}><p><strong>{item.name}</strong><small>{formatMoney(language, item.price_cents / 100)}</small></p><div><button type="button" onClick={() => changeQuantity(item.id, -1)}><Minus /></button><span>{quantity}</span><button type="button" onClick={() => changeQuantity(item.id, 1)}><Plus /></button></div></div>)}
                  {priceLines.map((line) => <div key={line.lineId}><p><strong>{line.itemName}</strong>{line.selectionSummary && <small>{line.selectionSummary}</small>}{line.note && <small className="basket__line-note">“{line.note}”</small>}<small className="basket__line-options">{formatMoney(language, line.unitPriceCents / 100)}</small></p><div><button type="button" onClick={() => changeConfiguredLineQuantity(line.lineId, -1)}><Minus /></button><span>{line.quantity}</span><button type="button" onClick={() => changeConfiguredLineQuantity(line.lineId, 1)}><Plus /></button></div></div>)}
                </div>
                <div className="basket__totals"><p><span>{t.subtotal}</span><strong>{formatMoney(language, menuSubtotal / 100)}</strong></p>{appliedPromotion && promotionDiscount > 0 && <p className="basket__discount"><span>{appliedPromotion.title}<small>{language === 'nl' ? 'Beste automatische aanbieding toegepast' : 'Best automatic offer applied'}</small></span><strong>− {formatMoney(language, promotionDiscount / 100)}</strong></p>}<p><span>{t.delivery}{appliedPromotion?.deliveryDiscountCents ? <small>{appliedPromotion.title} · {language === 'nl' ? 'gratis bezorging' : 'free delivery'}</small> : null}</span><strong>{appliedPromotion?.deliveryDiscountCents ? <><s>{formatMoney(language, baseDelivery / 100)}</s>{' '}</> : null}{formatMoney(language, delivery / 100)}</strong></p><p><span>{t.service} {restaurant.service_fee_bps / 100}%</span><strong>{formatMoney(language, service / 100)}</strong></p><p className="basket__total"><span>{t.total}</span><strong>{formatMoney(language, total / 100)}</strong></p></div>
                {recommendation && <div className="basket__recommendation"><strong>{t.forgot}</strong><button type="button" onClick={() => addItem(recommendation)}><span>{recommendation.name}<small>{formatMoney(language, recommendation.price_cents / 100)}</small></span><Plus /></button></div>}
                <button className="basket__checkout" disabled={!restaurant.accepting_orders || menuSubtotal < restaurant.minimum_order_cents} type="button" onClick={() => setCheckoutOpen(true)}><span>{restaurant.accepting_orders ? t.checkout : t.closed}</span><strong>{formatMoney(language, total / 100)}</strong></button>
                {menuSubtotal < restaurant.minimum_order_cents && <small className="basket__minimum">{t.minimum}: {formatMoney(language, restaurant.minimum_order_cents / 100)}</small>}
              </>
            )}
          </aside>
        </div>
      </main>

      <button className="mobile-basket" disabled={!restaurant.accepting_orders} type="button" onClick={() => basketCount ? setCheckoutOpen(true) : document.querySelector('.storefront-menu')?.scrollIntoView()}><ShoppingBag /><span>{restaurant.accepting_orders ? (basketCount ? `${basketCount} · ${formatMoney(language, total / 100)}` : t.emptyTitle) : t.closed}</span></button>

      {panel && <StorefrontPanel restaurant={restaurant} panel={panel} onClose={() => setPanel(null)} language={language} />}
      {feeOpen && <Modal title={t.feeTitle} onClose={() => setFeeOpen(false)}><p>{t.feeBody}</p><dl><div><dt>{t.delivery}</dt><dd>{restaurant.free_delivery_threshold_cents ? `${t.free} ${t.from} ${formatMoney(language, restaurant.free_delivery_threshold_cents / 100)}` : formatMoney(language, restaurant.delivery_fee_cents / 100)}</dd></div><div><dt>{t.service}</dt><dd>{restaurant.service_fee_bps / 100}% · max {formatMoney(language, restaurant.service_fee_cap_cents / 100)}</dd></div></dl></Modal>}
      {selectedItem && <Modal title={selectedItem.name} onClose={() => setSelectedItem(null)}><p>{selectedItem.description}</p><dl><div><dt>{t.ingredients}</dt><dd>{selectedItem.ingredients || '—'}</dd></div><div><dt>{t.allergens}</dt><dd>{selectedItem.allergens?.join(', ') || '—'}</dd></div><div><dt>VAT</dt><dd>{selectedItem.vat_rate ?? 9}%</dd></div><div><dt>{t.available}</dt><dd>{selectedItem.availability?.replace('_', ' ') ?? 'all day'}</dd></div></dl></Modal>}
      {promotionItem && (
        <Modal
          title={promotionRule ? describeQuantityPromotion(promotionRule, promotionNameLookup) : t.promoTitle}
          onClose={() => setPromotionItem(null)}
        >
          <div className="promotion-prompt">
            <span aria-hidden="true">🎁</span>
            <p>{t.promoBody}</p>
            <article>{promotionItem.image_url && <img src={promotionItem.image_url} alt="" />}<div><h3>{promotionItem.name}</h3><p>{promotionItem.description}</p></div></article>
            <footer><button type="button" onClick={() => setPromotionItem(null)}>{t.noThanks}</button><button className="promotion-prompt__add" type="button" onClick={() => { setConfiguringItem(promotionItem); setPromotionItem(null) }}>{t.addAnother}</button></footer>
          </div>
        </Modal>
      )}
      {configuringItem && (
        <ModifierModal
          item={configuringItem}
          language={language}
          onClose={() => setConfiguringItem(null)}
          onAdd={(selectedOptions, quantity, note) => addConfiguredLine(configuringItem, selectedOptions, quantity, note)}
        />
      )}
      {checkoutOpen && (
        <CheckoutDrawer
          restaurant={restaurant}
          charities={data.charities}
          bag={bag}
          configuredLines={priceLines}
          onChangeQuantity={changeQuantity}
          onChangeConfiguredLineQuantity={changeConfiguredLineQuantity}
          onClose={() => setCheckoutOpen(false)}
          onPaid={() => { setBag({}); setConfiguredLines({}) }}
        />
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="storefront-modal-layer" role="dialog" aria-modal="true" aria-label={title}><button className="storefront-modal-backdrop" type="button" onClick={onClose} aria-label="Close" /><section className="storefront-modal"><header><h2>{title}</h2><button type="button" onClick={onClose}><X /></button></header>{children}</section></div>
}

function StorefrontPanel({ restaurant, panel, onClose, language }: { restaurant: StorefrontRestaurant; panel: 'reviews' | 'info' | 'offers'; onClose: () => void; language: Language }) {
  const t = text[language]
  const title = panel === 'reviews' ? t.reviews : panel === 'offers' ? t.offers : t.info
  const nameLookup: PromotionNameLookup = {
    categoryNameById: Object.fromEntries(restaurant.menu.map((category) => [category.id, category.name])),
    itemNameById: Object.fromEntries(restaurant.menu.flatMap((category) => category.items).map((item) => [item.id, item.name])),
  }
  return <Modal title={title} onClose={onClose}>
    {panel === 'reviews' && <div className="review-list">{restaurant.reviews.map((review) => <article key={review.id}><div><strong>{review.display_name}</strong><span><Star fill="currentColor" /> {review.rating}</span></div><p>{review.comment}</p><small><BadgeCheck /> {t.verified} · {new Date(review.created_at).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB')}</small></article>)}{restaurant.reviews.length === 0 && <p>—</p>}</div>}
    {panel === 'info' && <dl><div><dt>{t.open}</dt><dd>{restaurant.opening_time.slice(0, 5)}–{restaurant.closing_time.slice(0, 5)}</dd></div><div><dt>Address</dt><dd>{restaurant.address}</dd></div><div><dt>{t.minimum}</dt><dd>{formatMoney(language, restaurant.minimum_order_cents / 100)}</dd></div><div><dt>{t.delivery}</dt><dd>{formatMoney(language, restaurant.delivery_fee_cents / 100)}</dd></div></dl>}
    {panel === 'offers' && <div className="offer-list">{restaurant.offers.map((offer) => {
      const quantityRule = toQuantityPromotionRule(offer)
      const orderValueRule = toOrderValuePromotionRule(offer)
      return (
        <article className={`offer-list__${offer.status}`} key={offer.id}>
          <Tag />
          <div>
            <span>{offer.status}</span>
            <h3>{offer.title}</h3>
            <p>{offer.description}</p>
            {quantityRule && <p className="offer-list__rule">{describeQuantityPromotion(quantityRule, nameLookup)}</p>}
            {orderValueRule && <p className="offer-list__rule">{describeOrderValuePromotion(orderValueRule)}</p>}
            {!quantityRule && !orderValueRule && <p className="offer-list__rule">Promotional announcement · no checkout discount</p>}
            {(quantityRule || orderValueRule) && offer.minimum_order_cents !== null && <small>{t.minimum}: {formatMoney(language, offer.minimum_order_cents / 100)}</small>}
          </div>
        </article>
      )
    })}{restaurant.offers.length === 0 && <p>{t.noOffers}</p>}</div>}
  </Modal>
}
