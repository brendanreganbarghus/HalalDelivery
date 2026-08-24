import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  Heart,
  Landmark,
  LocateFixed,
  LogOut,
  MapPin,
  MessageSquareText,
  Menu,
  Minus,
  Plus,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { localizeServerMessage, type Language, useI18n } from './i18n.ts'
import {
  type ConfiguredLine,
  type ItemType,
  type ModifierConfig,
} from './modifiers.ts'
import {
  calculateQuantityPromotionDiscount,
  describeQuantityPromotion,
  isQuantityPromotionType,
  toQuantityPromotionRule,
  type PromotionNameLookup,
  type PromotionOrderLine,
  type PromotionQualifyingScopeType,
  type PromotionRewardScopeType,
} from '../shared/promotionEngine.ts'

export type MenuItem = {
  id: string
  category_id: string
  name: string
  description: string
  price_cents: number
  popular: boolean
  image_url?: string
  ingredients?: string
  allergens?: string[]
  vat_rate?: number
  availability?: string
  is_available?: boolean
  item_type?: ItemType
  modifier_config?: ModifierConfig
}

export type MenuCategory = {
  id: string
  name: string
  emoji: string
  items: MenuItem[]
}

export type Offer = {
  id: string
  title: string
  description: string
  promotion_type: 'order_offer' | 'quantity_discount' | 'buy_x_get_y_free'
  buy_quantity: number | null
  reward_quantity: number | null
  reward_discount_percent: number | null
  qualifying_scope_type: PromotionQualifyingScopeType | null
  qualifying_category_ids: string[] | null
  qualifying_item_ids: string[] | null
  reward_scope_type: PromotionRewardScopeType | null
  reward_category_ids: string[] | null
  reward_item_ids: string[] | null
  minimum_order_cents: number | null
  starts_at: string
  ends_at: string
  enabled: boolean
  status: 'active' | 'upcoming' | 'expired' | 'disabled'
}

export type Restaurant = {
  id: string
  slug: string
  name: string
  description: string
  address: string
  area: string
  cuisine: string[]
  business_type: 'restaurant' | 'grocery'
  service_modes: Array<'delivery' | 'collection'>
  rating: number
  review_count: number
  delivery_minutes: number
  delivery_fee_cents: number
  minimum_order_cents: number
  free_delivery_threshold_cents: number | null
  service_fee_bps: number
  service_fee_cap_cents: number
  opening_time: string
  closing_time: string
  image_url: string
  landing_image_url: string
  latitude: number
  longitude: number
  delivery_radius_km: number
  halal_status: string
  is_open: boolean
  accepting_orders?: boolean
  charity_id: string
  menu: MenuCategory[]
  offers?: Offer[]
}

export type Charity = {
  id: string
  name: string
  summary: string
  area: string
  focus: string
  image_url: string
}

type Discovery = {
  restaurants: Restaurant[]
  charities: Charity[]
}

type CustomerLocation = {
  latitude: number
  longitude: number
  label: string
}

type AuthMe = {
  user: {
    display_name: string
    is_platform_admin: boolean
  }
  memberships: Array<{ restaurant_id: string }>
}

type GoogleCredentialResponse = {
  credential: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: GoogleCredentialResponse) => void
          }) => void
          renderButton: (
            element: HTMLElement,
            options: {
              theme: string
              size: string
              shape: string
              text: string
              width: number
            },
          ) => void
        }
      }
    }
  }
}

const moneyFormatters: Record<Language, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
  }),
  nl: new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }),
}

const CURRENT_LOCATION_LABEL = '__current_location__'

const distanceFormatters: Record<Language, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
  nl: new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
}

async function getDiscovery(): Promise<Discovery> {
  const response = await fetch('/api/discovery')
  if (!response.ok) {
    throw new Error('DISCOVERY_UNAVAILABLE')
  }
  return response.json() as Promise<Discovery>
}

async function geocodeAddress(query: string): Promise<CustomerLocation> {
  const response = await fetch(`/api/location/geocode?query=${encodeURIComponent(query)}`)
  const body = (await response.json()) as CustomerLocation & { message?: string }
  if (!response.ok) {
    throw new Error(body.message ?? 'ADDRESS_NOT_FOUND')
  }
  return body
}

function formatMoney(language: Language, value: number) {
  return moneyFormatters[language].format(value)
}

function formatDistance(language: Language, value: number) {
  return distanceFormatters[language].format(value)
}

function distanceInKm(origin: CustomerLocation, restaurant: Restaurant) {
  const earthRadiusKm = 6371
  const toRadians = (value: number) => (value * Math.PI) / 180
  const latitudeDelta = toRadians(restaurant.latitude - origin.latitude)
  const longitudeDelta = toRadians(restaurant.longitude - origin.longitude)
  const originLatitude = toRadians(origin.latitude)
  const restaurantLatitude = toRadians(restaurant.latitude)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(restaurantLatitude) *
      Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <img
        className="brand__logo"
        src="/halal-delivery-logo.jpeg"
        alt="Halal Delivery"
      />
    </div>
  )
}

function LanguageSwitcher() {
  const { language, setLanguage, copy } = useI18n()

  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={copy.header.languageSwitcher}
    >
      {(['en', 'nl'] as Language[]).map((option) => (
        <button
          key={option}
          className={
            option === language
              ? 'language-switcher__button language-switcher__button--active'
              : 'language-switcher__button'
          }
          type="button"
          aria-pressed={option === language}
          title={copy.common.languages[option]}
          onClick={() => setLanguage(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function Header({
  bagCount,
  onCheckout,
}: {
  bagCount: number
  onCheckout: () => void
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { copy } = useI18n()
  const { data: auth } = useQuery({
    queryKey: ['customer-auth'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me')
      if (response.status === 401) return null
      if (!response.ok) throw new Error('AUTH_UNAVAILABLE')
      return response.json() as Promise<AuthMe>
    },
    retry: false,
  })
  const signOut = useMutation({
    mutationFn: () => fetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      window.location.href = '/'
    },
  })
  const accountDestination = auth?.user.is_platform_admin
    ? '/admin'
    : auth?.memberships.length
      ? '/restaurant-portal'
      : '/account'

  return (
    <header className="site-header">
      <div className="container nav">
        <a className="brand-link" href="#top" aria-label={copy.header.homeAria}>
          <Brand compact />
        </a>
        <nav className={mobileOpen ? 'nav__links nav__links--open' : 'nav__links'}>
          <Link to="/restaurants" onClick={() => setMobileOpen(false)}>
            {copy.header.nav.findFood}
          </Link>
          <a href="#impact" onClick={() => setMobileOpen(false)}>
            {copy.header.nav.impact}
          </a>
          <a href="#how-it-works" onClick={() => setMobileOpen(false)}>
            {copy.header.nav.howItWorks}
          </a>
        </nav>
        <div className="nav__actions">
          <LanguageSwitcher />
          <button
            className="bag-button"
            type="button"
            onClick={onCheckout}
            aria-label={copy.header.bagAria(bagCount)}
          >
            <ShoppingBag size={19} />
            {bagCount > 0 && <span>{bagCount}</span>}
          </button>
          {auth ? (
            <div className="customer-session">
              <a className="customer-session__name" href={accountDestination}>
                {auth.user.display_name.split(/\s+/)[0]}
              </a>
              <button
                type="button"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
                aria-label={copy.login.signOut}
                title={copy.login.signOut}
              >
                <LogOut />
              </button>
            </div>
          ) : (
            <Link className="button button--ghost login-link" to="/login">
              {copy.header.login}
            </Link>
          )}
          <button
            className="mobile-toggle"
            type="button"
            aria-label={copy.header.mobileToggle}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  )
}

function App() {
  const { language, copy } = useI18n()
  const { data, error, isLoading } = useQuery({
    queryKey: ['discovery'],
    queryFn: getDiscovery,
  })
  const [address, setAddress] = useState('')
  const [searchedArea, setSearchedArea] = useState('Amsterdam-Noord')
  const [customerLocation, setCustomerLocation] = useState<CustomerLocation | null>(null)
  const [locationError, setLocationError] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [restaurantSearch, setRestaurantSearch] = useState('')
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null)
  const [bag, setBag] = useState<Record<string, number>>({})
  const [bagRestaurantId, setBagRestaurantId] = useState<string | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const restaurantSection = useRef<HTMLElement>(null)

  const bagCount = Object.values(bag).reduce((total, quantity) => total + quantity, 0)

  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (!address.trim()) {
      setLocationError(copy.hero.errors.emptyAddress)
      return
    }

    setLocationError('')
    setIsLocating(true)

    try {
      const location = await geocodeAddress(address.trim())
      setCustomerLocation(location)
      setSearchedArea(location.label)
      localStorage.setItem('halal-delivery-address', location.label)
      window.location.href = '/restaurants'
    } catch (searchError) {
      setLocationError(
        localizeServerMessage(
          searchError instanceof Error ? searchError.message : 'ADDRESS_NOT_FOUND',
          language,
        ),
      )
    } finally {
      setIsLocating(false)
    }
  }

  function useCurrentLocation() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError(localizeServerMessage('GEOLOCATION_UNSUPPORTED', language))
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: CURRENT_LOCATION_LABEL,
        }
        setCustomerLocation(location)
        setSearchedArea(location.label)
        setIsLocating(false)
        localStorage.setItem('halal-delivery-address', copy.hero.currentLocation)
        window.location.href = '/restaurants'
      },
      () => {
        setLocationError(localizeServerMessage('GEOLOCATION_DENIED', language))
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function changeQuantity(itemId: string, amount: number) {
    const restaurantId = selectedRestaurant?.id ?? bagRestaurantId
    if (amount > 0 && restaurantId && bagRestaurantId && restaurantId !== bagRestaurantId) {
      setBag({})
    }
    if (amount > 0 && restaurantId) {
      setBagRestaurantId(restaurantId)
    }
    setBag((current) => {
      const nextQuantity = Math.max(0, (current[itemId] ?? 0) + amount)
      const next = { ...current }
      if (nextQuantity === 0) {
        delete next[itemId]
      } else {
        next[itemId] = nextQuantity
      }
      return next
    })
  }

  const checkoutRestaurant = data?.restaurants.find(
    (restaurant) => restaurant.id === bagRestaurantId,
  )
  const displayedArea =
    searchedArea === CURRENT_LOCATION_LABEL ? copy.hero.currentLocation : searchedArea
  const visibleRestaurants = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase()
    return (data?.restaurants ?? [])
      .map((restaurant) => ({
        restaurant,
        distanceKm: customerLocation ? distanceInKm(customerLocation, restaurant) : null,
      }))
      .filter(
        ({ restaurant }) =>
          !query ||
          restaurant.name.toLowerCase().includes(query) ||
          restaurant.cuisine.some((cuisine) => cuisine.toLowerCase().includes(query)) ||
          restaurant.area.toLowerCase().includes(query),
      )
      .sort((left, right) => {
        if (query) {
          const leftStarts = left.restaurant.name.toLowerCase().startsWith(query)
          const rightStarts = right.restaurant.name.toLowerCase().startsWith(query)
          if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
        }
        if (left.distanceKm !== null && right.distanceKm !== null) {
          return left.distanceKm - right.distanceKm
        }
        return right.restaurant.rating - left.restaurant.rating
      })
  }, [customerLocation, data?.restaurants, restaurantSearch])

  return (
    <div id="top">
      <Header bagCount={bagCount} onCheckout={() => setCheckoutOpen(true)} />
      <main>
        <section className="hero-section">
          <div className="hero-orbit hero-orbit--one" />
          <div className="hero-orbit hero-orbit--two" />
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <Sparkles size={16} />
                {copy.hero.eyebrow}
              </div>
              <h1>
                {copy.hero.title}
                <span> {copy.hero.titleAccent}</span>
              </h1>
              <p className="hero-lead">{copy.hero.lead}</p>
              <form className="address-search" onSubmit={search}>
                <MapPin className="address-search__pin" size={22} />
                <label className="sr-only" htmlFor="address">
                  {copy.hero.addressLabel}
                </label>
                <input
                  id="address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder={copy.hero.addressPlaceholder}
                />
                <button
                  className="locate-button"
                  type="button"
                  onClick={useCurrentLocation}
                  aria-label={copy.hero.useLocation}
                >
                  <LocateFixed size={19} />
                </button>
                <button className="button button--primary" type="submit" disabled={isLocating}>
                  {isLocating ? copy.hero.searching : copy.hero.findFood}{' '}
                  <ArrowRight size={18} />
                </button>
              </form>
              {locationError && <p className="address-error">{locationError}</p>}
              <div className="trust-row">
                <span>
                  <BadgeCheck size={17} /> {copy.hero.trust.verified}
                </span>
                <span>
                  <Heart size={17} /> {copy.hero.trust.charity}
                </span>
                <span>
                  <Bike size={18} /> {copy.hero.trust.delivery}
                </span>
              </div>
            </div>
            <div className="hero-visual" aria-label={copy.hero.visualAria}>
              <div className="hero-photo">
                <img
                  src="https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=90"
                  alt={copy.hero.imageAlt}
                />
              </div>
              <div className="floating-card floating-card--rating">
                <span className="floating-icon">
                  <Star size={18} fill="currentColor" />
                </span>
                <div>
                  <strong>{copy.hero.rating.title}</strong>
                  <small>{copy.hero.rating.subtitle}</small>
                </div>
              </div>
              <div className="floating-card floating-card--impact">
                <span className="floating-icon floating-icon--heart">
                  <Heart size={18} fill="currentColor" />
                </span>
                <div>
                  <strong>{copy.hero.orderImpact.title}</strong>
                  <small>{copy.hero.orderImpact.subtitle}</small>
                </div>
              </div>
              <div className="halal-seal">
                <ShieldCheck size={22} />
                {copy.hero.seal}
              </div>
            </div>
          </div>
          <div className="hero-curve" />
        </section>

        <section className="proof-strip">
          <div className="container proof-strip__inner">
            <div>
              <strong>{copy.proof.partners.value}</strong>
              <span>{copy.proof.partners.label}</span>
            </div>
            <i />
            <div>
              <strong>{copy.proof.causes.value}</strong>
              <span>{copy.proof.causes.label}</span>
            </div>
            <i />
            <div>
              <strong>{copy.proof.orders.value}</strong>
              <span>{copy.proof.orders.label}</span>
            </div>
          </div>
        </section>

        <section className="section restaurant-section" id="restaurants" ref={restaurantSection}>
          <div className="container">
            <div className="section-heading section-heading--split">
              <div>
                <span className="kicker">{copy.restaurants.kicker}</span>
                <h2>{copy.restaurants.title(displayedArea)}</h2>
                <p>
                  {customerLocation
                    ? copy.restaurants.sortedByDistance
                    : copy.restaurants.curated}
                </p>
              </div>
              <label className="restaurant-search">
                <Search size={18} />
                <span className="sr-only">{copy.restaurants.searchLabel}</span>
                <input
                  value={restaurantSearch}
                  onChange={(event) => setRestaurantSearch(event.target.value)}
                  placeholder={copy.restaurants.searchPlaceholder}
                />
                {restaurantSearch && (
                  <button
                    type="button"
                    onClick={() => setRestaurantSearch('')}
                    aria-label={copy.restaurants.clearSearch}
                  >
                    <X size={16} />
                  </button>
                )}
              </label>
            </div>

            {isLoading && <div className="state-card">{copy.restaurants.loading}</div>}
            {error && (
              <div className="state-card state-card--error">
                <strong>{copy.restaurants.errorTitle}</strong>
                <span>{copy.restaurants.errorHelp}</span>
              </div>
            )}
            <div className="restaurant-grid">
              {visibleRestaurants.map(({ restaurant, distanceKm }) => {
                const deliversToCustomer =
                  distanceKm === null || distanceKm <= restaurant.delivery_radius_km

                return (
                  <Link
                    className={`restaurant-card ${
                      !deliversToCustomer ? 'restaurant-card--outside' : ''
                    }`}
                    key={restaurant.id}
                    to="/restaurant/$slug"
                    params={{ slug: restaurant.slug }}
                  >
                    <div className="restaurant-card__image">
                      <img src={restaurant.image_url} alt="" />
                      <span className="verified-pill">
                        <BadgeCheck size={15} /> {restaurant.halal_status}
                      </span>
                      <span className="delivery-time">
                        {restaurant.delivery_minutes} {copy.common.minutesShort}
                      </span>
                      {distanceKm !== null && (
                        <span className="distance-pill">
                          {copy.restaurants.distance(formatDistance(language, distanceKm))}
                        </span>
                      )}
                    </div>
                    <div className="restaurant-card__body">
                      <div className="restaurant-card__title">
                        <h3>{restaurant.name}</h3>
                        <span>
                          <Star size={15} fill="currentColor" /> {restaurant.rating}
                        </span>
                      </div>
                      <p>{restaurant.description}</p>
                      <div className="restaurant-card__meta">
                        <span>{restaurant.cuisine.join(' · ')}</span>
                        <span>
                          {copy.restaurants.minimumOrder}{' '}
                          {formatMoney(language, restaurant.minimum_order_cents / 100)}
                        </span>
                      </div>
                      <div className="restaurant-card__footer">
                        <span>
                          <Bike size={16} />
                          {restaurant.delivery_fee_cents === 0
                            ? copy.restaurants.freeDelivery
                            : copy.restaurants.deliveryFee(
                                formatMoney(language, restaurant.delivery_fee_cents / 100),
                              )}
                        </span>
                        {distanceKm === null ? (
                          <span className="gives-back">
                            <Heart size={15} /> {copy.restaurants.givesBack}
                          </span>
                        ) : (
                          <span
                            className={
                              deliversToCustomer
                                ? 'delivery-status'
                                : 'delivery-status delivery-status--outside'
                            }
                          >
                            {deliversToCustomer ? (
                              <>
                                <Check size={15} /> {copy.restaurants.deliversToYou}
                              </>
                            ) : (
                              <>
                                <MapPin size={15} /> {copy.restaurants.viewOnly}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
            {!isLoading && !error && visibleRestaurants.length === 0 && (
              <div className="state-card">{copy.restaurants.noResults(restaurantSearch)}</div>
            )}
          </div>
        </section>

        <section className="impact-section" id="impact">
          <div className="container impact-grid">
            <div className="impact-copy">
              <span className="kicker kicker--light">{copy.impact.kicker}</span>
              <h2>{copy.impact.title}</h2>
              <p>{copy.impact.lead}</p>
              <div className="impact-points">
                {copy.impact.points.map((point, index) => (
                  <div key={point.title}>
                    <span>
                      {index === 0 ? (
                        <MapPin size={20} />
                      ) : index === 1 ? (
                        <Check size={20} />
                      ) : (
                        <ShieldCheck size={20} />
                      )}
                    </span>
                    <p>
                      <strong>{point.title}</strong>
                      {point.description}
                    </p>
                  </div>
                ))}
              </div>
              <a className="button button--cream" href="#causes">
                {copy.impact.cta} <ArrowRight size={18} />
              </a>
            </div>
            <div className="impact-visual">
              <img
                src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?auto=format&fit=crop&w=1200&q=85"
                alt={copy.impact.imageAlt}
              />
              <div className="impact-counter">
                <small>{copy.impact.counter.intro}</small>
                <strong>{copy.impact.counter.amount}</strong>
                <span>
                  <Users size={16} /> {copy.impact.counter.caption}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="section causes-section" id="causes">
          <div className="container">
            <div className="section-heading section-heading--center">
              <span className="kicker">{copy.causes.kicker}</span>
              <h2>{copy.causes.title}</h2>
              <p>{copy.causes.lead}</p>
            </div>
            <div className="cause-grid">
              {data?.charities.map((charity) => (
                <article className="cause-card" key={charity.id}>
                  <img src={charity.image_url} alt="" />
                  <div className="cause-card__body">
                    <span>{charity.focus}</span>
                    <h3>{charity.name}</h3>
                    <p>{charity.summary}</p>
                    <small>
                      <MapPin size={14} /> {charity.area}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="container">
            <div className="section-heading section-heading--center">
              <span className="kicker">{copy.howItWorks.kicker}</span>
              <h2>{copy.howItWorks.title}</h2>
            </div>
            <div className="steps">
              {copy.howItWorks.steps.map((step, index) => (
                <div key={step.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {index === 0 ? <MapPin /> : index === 1 ? <ShoppingBag /> : <Heart />}
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-main">
          <div>
            <Brand compact />
            <p>{copy.footer.tagline}</p>
          </div>
          <div>
            <strong>{copy.footer.discover.title}</strong>
            <a href="#restaurants">{copy.footer.discover.restaurants}</a>
            <a href="#impact">{copy.footer.discover.impact}</a>
          </div>
          <div>
            <strong>{copy.footer.partners.title}</strong>
            <a href="#causes">{copy.footer.partners.charities}</a>
            <Link to="/restaurant-portal">{copy.footer.partners.portal}</Link>
          </div>
          <div>
            <strong>{copy.footer.support.title}</strong>
            <a href="#top">{copy.footer.support.help}</a>
            <a href="#top">{copy.footer.support.contact}</a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>{copy.footer.copyright}</span>
          <span>{copy.footer.builtIn}</span>
        </div>
      </footer>

      {selectedRestaurant && (
        <MenuDrawer
          restaurant={selectedRestaurant}
          bag={bag}
          onChangeQuantity={changeQuantity}
          onClose={() => setSelectedRestaurant(null)}
        />
      )}
      {checkoutOpen && (
        <CheckoutDrawer
          restaurant={checkoutRestaurant}
          charities={data?.charities ?? []}
          bag={bag}
          onChangeQuantity={changeQuantity}
          onClose={() => setCheckoutOpen(false)}
          onPaid={() => {
            setBag({})
            setBagRestaurantId(null)
          }}
        />
      )}
    </div>
  )
}

function MenuDrawer({
  restaurant,
  bag,
  onClose,
  onChangeQuantity,
}: {
  restaurant: Restaurant
  bag: Record<string, number>
  onClose: () => void
  onChangeQuantity: (itemId: string, amount: number) => void
}) {
  const { language, copy } = useI18n()

  useEffect(() => {
    document.body.classList.add('drawer-open')
    return () => document.body.classList.remove('drawer-open')
  }, [])

  return (
    <div
      className="drawer-layer"
      role="dialog"
      aria-modal="true"
      aria-label={copy.menu.dialogAria(restaurant.name)}
    >
      <button
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label={copy.menu.close}
      />
      <aside className="menu-drawer">
        <div className="menu-drawer__hero">
          <img src={restaurant.image_url} alt="" />
          <button type="button" onClick={onClose} aria-label={copy.menu.close}>
            <X />
          </button>
        </div>
        <div className="menu-drawer__heading">
          <span className="verified-pill verified-pill--static">
            <BadgeCheck size={15} /> {restaurant.halal_status}
          </span>
          <h2>{restaurant.name}</h2>
          <p>{restaurant.description}</p>
          <div>
            <span>
              <Star size={15} fill="currentColor" /> {restaurant.rating} ({restaurant.review_count})
            </span>
            <span>
              <Clock3 size={15} /> {restaurant.delivery_minutes} {copy.common.minutesShort}
            </span>
            <span>
              <Bike size={16} />
              {restaurant.delivery_fee_cents === 0
                ? copy.menu.freeDelivery
                : formatMoney(language, restaurant.delivery_fee_cents / 100)}
            </span>
          </div>
        </div>
        <div className="menu-drawer__content">
          {restaurant.menu.map((category) => (
            <section key={category.id}>
              <h3>{category.name}</h3>
              {category.items.map((item) => {
                const quantity = bag[item.id] ?? 0
                return (
                  <article className="menu-item" key={item.id}>
                    <div>
                      {item.popular && <span className="popular-label">{copy.menu.popular}</span>}
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      <strong>{formatMoney(language, item.price_cents / 100)}</strong>
                    </div>
                    {quantity === 0 ? (
                      <button
                        type="button"
                        onClick={() => onChangeQuantity(item.id, 1)}
                        aria-label={copy.menu.add(item.name)}
                      >
                        <Plus />
                      </button>
                    ) : (
                      <div className="quantity">
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(item.id, -1)}
                          aria-label={copy.menu.removeOne(item.name)}
                        >
                          <Minus />
                        </button>
                        <span>{quantity}</span>
                        <button
                          type="button"
                          onClick={() => onChangeQuantity(item.id, 1)}
                          aria-label={copy.menu.addOne(item.name)}
                        >
                          <Plus />
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}

type CheckoutResult = {
  order_id: string
  order_number: string
  gross_cents: number
  subtotal_cents: number
  promotion_discount_cents: number
  delivery_fee_cents: number
  service_fee_cents: number
  restaurant_payable_cents: number
  platform_fee_cents: number
  payment_fee_cents: number
  donation_total_cents: number
  confirmation_email_status: 'not_requested' | 'pending' | 'sent' | 'simulated'
  review_path: string | null
}

export function CheckoutDrawer({
  restaurant,
  charities,
  bag,
  configuredLines,
  onClose,
  onPaid,
  onChangeQuantity,
  onChangeConfiguredLineQuantity,
}: {
  restaurant?: Restaurant
  charities: Charity[]
  bag: Record<string, number>
  configuredLines?: ConfiguredLine[]
  onClose: () => void
  onPaid: () => void
  onChangeQuantity?: (itemId: string, amount: number) => void
  onChangeConfiguredLineQuantity?: (lineId: string, amount: number) => void
}) {
  const { language, copy } = useI18n()
  const [donate, setDonate] = useState(false)
  const [selectedCharities, setSelectedCharities] = useState<string[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'fake_card' | 'ideal_wero'>('fake_card')
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null)

  useEffect(() => {
    document.body.classList.add('drawer-open')
    return () => document.body.classList.remove('drawer-open')
  }, [])

  const items = restaurant?.menu.flatMap((category) => category.items) ?? []
  const simpleLines = items
    .filter((item) => (bag[item.id] ?? 0) > 0)
    .map((item) => ({ item, quantity: bag[item.id] }))
  const priceLines = configuredLines ?? []
  const lines = simpleLines
  const menuSubtotalCents =
    simpleLines.reduce((total, line) => total + line.item.price_cents * line.quantity, 0) +
    priceLines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0)
  const activePromotion = restaurant?.offers?.find(
    (offer) => offer.status === 'active' && isQuantityPromotionType(offer.promotion_type),
  )
  const promotionRule = activePromotion ? toQuantityPromotionRule(activePromotion) : null
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
  const promotionResult = promotionRule
    ? calculateQuantityPromotionDiscount(promotionLines, promotionRule)
    : null
  const promotionDiscountCents = promotionResult?.discountCents ?? 0
  const promotionNameLookup: PromotionNameLookup = useMemo(() => ({
    categoryNameById: Object.fromEntries((restaurant?.menu ?? []).map((category) => [category.id, category.name])),
    itemNameById: Object.fromEntries(
      (restaurant?.menu ?? []).flatMap((category) => category.items).map((item) => [item.id, item.name]),
    ),
  }), [restaurant])
  const subtotalCents = menuSubtotalCents - promotionDiscountCents
  const deliveryFeeCents =
    restaurant?.free_delivery_threshold_cents !== null &&
    restaurant?.free_delivery_threshold_cents !== undefined &&
    subtotalCents >= restaurant.free_delivery_threshold_cents
      ? 0
      : (restaurant?.delivery_fee_cents ?? 0)
  const serviceFeeCents = restaurant
    ? Math.min(
        Math.round(subtotalCents * restaurant.service_fee_bps / 10_000),
        restaurant.service_fee_cap_cents,
      )
    : 0
  const totalCents = subtotalCents + deliveryFeeCents + serviceFeeCents
  const contributionCents = donate ? Math.round(subtotalCents * 0.025) : 0
  const hasLines = simpleLines.length > 0 || priceLines.length > 0

  const payment = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/poc/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurant?.id,
          items: [
            ...simpleLines.map((line) => ({ item_id: line.item.id, quantity: line.quantity })),
            ...priceLines.map((line) => ({
              item_id: line.itemId,
              quantity: line.quantity,
              selected_options: line.selectedOptions,
              note: line.note,
            })),
          ],
          charity_ids: donate ? selectedCharities : [],
          payment_method: paymentMethod,
        }),
      })
      const result = (await response.json()) as CheckoutResult & { message?: string }
      if (!response.ok) {
        throw new Error(result.message ?? 'CHECKOUT_FAILED')
      }
      return result
    },
    onSuccess: (result) => {
      setReceipt(result)
      onPaid()
    },
  })

  function toggleCharity(id: string) {
    setSelectedCharities((current) =>
      current.includes(id)
        ? current.filter((charityId) => charityId !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    )
  }

  const canPay =
    hasLines &&
    menuSubtotalCents >= (restaurant?.minimum_order_cents ?? 0) &&
    (!donate || selectedCharities.length > 0)
  const paymentError = payment.error
    ? localizeServerMessage(payment.error.message, language)
    : null

  return (
    <div
      className="drawer-layer checkout-layer"
      role="dialog"
      aria-modal="true"
      aria-label={copy.checkout.dialogAria}
    >
      <button
        className="drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label={copy.checkout.close}
      />
      <aside className="checkout-drawer">
        <header className="checkout-header">
          <div>
            <small>{copy.checkout.kicker}</small>
            <h2>{receipt ? copy.checkout.completeTitle : copy.checkout.reviewTitle}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.checkout.close}>
            <X />
          </button>
        </header>

        {receipt ? (
          <div className="receipt">
            <span className="receipt__check">
              <Check />
            </span>
            <span className="kicker">{copy.checkout.receipt.kicker}</span>
            <h2>{copy.checkout.receipt.title}</h2>
            <p>{copy.checkout.receipt.lead}</p>
            <div className="receipt__number">
              <small>{copy.checkout.receipt.reference}</small>
              <strong>{receipt.order_number}</strong>
            </div>
            <div className="receipt__split">
              <p>
                <span>{copy.checkout.receipt.paidToPlatform}</span>
                <strong>{formatMoney(language, receipt.gross_cents / 100)}</strong>
              </p>
              <p>
                <span>{copy.checkout.receipt.restaurantPayout}</span>
                <strong>{formatMoney(language, receipt.restaurant_payable_cents / 100)}</strong>
              </p>
              <p>
                <span>{copy.checkout.receipt.platformCommission}</span>
                <strong>{formatMoney(language, receipt.platform_fee_cents / 100)}</strong>
              </p>
              {receipt.donation_total_cents > 0 && (
                <p className="receipt__donation">
                  <span>{copy.checkout.receipt.charityDonation}</span>
                  <strong>{formatMoney(language, receipt.donation_total_cents / 100)}</strong>
                </p>
              )}
            </div>
            {receipt.confirmation_email_status === 'simulated' && (
              <p className="receipt__email"><MessageSquareText /> {copy.checkout.receipt.emailSimulated}</p>
            )}
            {receipt.review_path ? (
              <a className="button button--primary receipt__account" href={receipt.review_path}>
                {copy.checkout.receipt.accountCta}
              </a>
            ) : (
              <p className="receipt__review-note">{copy.checkout.receipt.signInToReview}</p>
            )}
            <button className="button button--primary" type="button" onClick={onClose}>
              {copy.checkout.done}
            </button>
          </div>
        ) : (
          <div className="checkout-content">
            {restaurant && hasLines ? (
              <>
                <section className="checkout-section order-summary">
                  <div className="checkout-section__heading">
                    <span>1</span>
                    <div>
                      <h3>{copy.checkout.order.title}</h3>
                      <p>{restaurant.name}</p>
                    </div>
                  </div>
                  {lines.map(({ item, quantity }) => (
                    <div className="checkout-line" key={item.id}>
                      {onChangeQuantity ? (
                        <div className="checkout-line__quantity">
                          <button type="button" onClick={() => onChangeQuantity(item.id, -1)}><Minus /></button>
                          <span>{quantity}</span>
                          <button type="button" onClick={() => onChangeQuantity(item.id, 1)}><Plus /></button>
                        </div>
                      ) : <span>{quantity}×</span>}
                      <p>
                        <strong>{item.name}</strong>
                        <small>
                          {formatMoney(language, item.price_cents / 100)} {copy.checkout.order.each}
                        </small>
                      </p>
                      <strong>{formatMoney(language, (item.price_cents * quantity) / 100)}</strong>
                    </div>
                  ))}
                  {priceLines.map((line) => (
                    <div className="checkout-line checkout-line--configured" key={line.lineId}>
                      {onChangeConfiguredLineQuantity ? (
                        <div className="checkout-line__quantity">
                          <button type="button" onClick={() => onChangeConfiguredLineQuantity(line.lineId, -1)}><Minus /></button>
                          <span>{line.quantity}</span>
                          <button type="button" onClick={() => onChangeConfiguredLineQuantity(line.lineId, 1)}><Plus /></button>
                        </div>
                      ) : <span>{line.quantity}×</span>}
                      <p>
                        <strong>{line.itemName}</strong>
                        <small>
                          {line.selectionSummary} · {formatMoney(language, line.unitPriceCents / 100)} {copy.checkout.order.each}
                        </small>
                        {line.note && <small>“{line.note}”</small>}
                      </p>
                      <strong>{formatMoney(language, (line.unitPriceCents * line.quantity) / 100)}</strong>
                    </div>
                  ))}
                  <div className="checkout-total">
                    <span>Subtotal</span>
                    <strong>{formatMoney(language, menuSubtotalCents / 100)}</strong>
                  </div>
                  {promotionDiscountCents > 0 && (
                    <div className="checkout-fee-line checkout-promotion">
                      <span>
                        {language === 'nl' ? 'Promotiekorting' : 'Promotion discount'}
                        {promotionRule && (
                          <small className="checkout-promotion__detail">
                            {describeQuantityPromotion(promotionRule, promotionNameLookup)}
                          </small>
                        )}
                      </span>
                      <strong>− {formatMoney(language, promotionDiscountCents / 100)}</strong>
                    </div>
                  )}
                  <div className="checkout-fee-line"><span>{language === 'nl' ? 'Bezorgkosten' : 'Delivery fee'}</span><strong>{formatMoney(language, deliveryFeeCents / 100)}</strong></div>
                  <div className="checkout-fee-line"><span>{language === 'nl' ? 'Servicekosten' : 'Service fee'}</span><strong>{formatMoney(language, serviceFeeCents / 100)}</strong></div>
                  <div className="checkout-total"><span>{copy.checkout.order.total}</span><strong>{formatMoney(language, totalCents / 100)}</strong></div>
                  {restaurant && menuSubtotalCents < restaurant.minimum_order_cents && <p className="checkout-error">{language === 'nl' ? `Minimale bestelling: ${formatMoney(language, restaurant.minimum_order_cents / 100)}.` : `Minimum food order: ${formatMoney(language, restaurant.minimum_order_cents / 100)}.`}</p>}
                </section>

                <section className="checkout-section donation-choice">
                  <div className="checkout-section__heading">
                    <span>2</span>
                    <div>
                      <h3>{copy.checkout.impact.title}</h3>
                      <p>{copy.checkout.impact.lead}</p>
                    </div>
                  </div>
                  <div className="donation-toggle">
                    <button
                      className={!donate ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setDonate(false)
                        setSelectedCharities([])
                      }}
                    >
                      {copy.checkout.impact.skip}
                    </button>
                    <button
                      className={donate ? 'active' : ''}
                      type="button"
                      onClick={() => setDonate(true)}
                    >
                      <Heart /> {copy.checkout.impact.direct}
                    </button>
                  </div>
                  {donate && (
                    <>
                      <p className="donation-explainer">
                        {copy.checkout.impact.explainer(
                          formatMoney(language, contributionCents / 100),
                        )}
                      </p>
                      <div className="checkout-charities">
                        {charities.map((charity) => (
                          <button
                            className={selectedCharities.includes(charity.id) ? 'selected' : ''}
                            type="button"
                            key={charity.id}
                            onClick={() => toggleCharity(charity.id)}
                          >
                            <span>
                              {selectedCharities.includes(charity.id) ? <Check /> : <Heart />}
                            </span>
                            <p>
                              <strong>{charity.name}</strong>
                              <small>
                                {charity.area} · {charity.focus}
                              </small>
                            </p>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>

                <section className="checkout-section payment-choice">
                  <div className="checkout-section__heading">
                    <span>3</span>
                    <div>
                      <h3>{copy.checkout.payment.title}</h3>
                      <p>{copy.checkout.payment.lead}</p>
                    </div>
                  </div>
                  <div className="payment-methods">
                    <button
                      className={paymentMethod === 'fake_card' ? 'selected' : ''}
                      type="button"
                      onClick={() => setPaymentMethod('fake_card')}
                    >
                      <CreditCard />
                      <span>
                        <strong>{copy.checkout.payment.card}</strong>
                        <small>{copy.checkout.payment.simulation}</small>
                      </span>
                      <i />
                    </button>
                    <button
                      className={paymentMethod === 'ideal_wero' ? 'selected' : ''}
                      type="button"
                      onClick={() => setPaymentMethod('ideal_wero')}
                    >
                      <Landmark />
                      <span>
                        <strong>iDEAL | Wero</strong>
                        <small>{copy.checkout.payment.simulation}</small>
                      </span>
                      <i />
                    </button>
                  </div>
                  {paymentMethod === 'fake_card' && (
                    <div className="fake-card-form">
                      <label>
                        {copy.checkout.payment.cardNumber}
                        <input value="4242 4242 4242 4242" readOnly />
                      </label>
                      <label>
                        {copy.checkout.payment.expiry}
                        <input value="12 / 30" readOnly />
                      </label>
                      <label>
                        {copy.checkout.payment.cvc}
                        <input value="123" readOnly />
                      </label>
                    </div>
                  )}
                </section>
                {paymentError && <p className="checkout-error">{paymentError}</p>}
                <button
                  className="checkout-pay"
                  disabled={!canPay || payment.isPending}
                  type="button"
                  onClick={() => payment.mutate()}
                >
                  <span>
                    {payment.isPending
                      ? copy.checkout.payment.processing
                      : copy.checkout.payment.pay(formatMoney(language, totalCents / 100))}
                  </span>
                  <small>{copy.checkout.payment.disclaimer}</small>
                </button>
              </>
            ) : (
              <div className="empty-checkout">
                <ShoppingBag />
                <h3>{copy.checkout.empty.title}</h3>
                <p>{copy.checkout.empty.lead}</p>
                <button className="button button--primary" type="button" onClick={onClose}>
                  {copy.checkout.empty.cta}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

type CustomerOrder = {
  id: string
  order_number: string
  status: string
  paid_at: string
  confirmed_at: string | null
  confirmation_email_status: 'not_requested' | 'pending' | 'sent' | 'simulated' | 'failed'
  confirmation_email_sent_at: string | null
  gross_cents: number
  donation_total_cents: number
  payment_method: string
  restaurant_id: string
  restaurant_name: string
  restaurant_image_url: string
  items: Array<{ name: string; unit_price_cents: number; quantity: number }>
  review: {
    rating: number
    comment: string
    created_at: string
    updated_at: string
  } | null
  eligible_for_review: boolean
}

type CustomerOrdersResponse = {
  customer: {
    display_name: string
    email: string
  }
  orders: CustomerOrder[]
}

function OrderReview({
  order,
}: {
  order: CustomerOrder
}) {
  const { copy } = useI18n()
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(order.review?.rating ?? 0)
  const [comment, setComment] = useState(order.review?.comment ?? '')
  const [saved, setSaved] = useState(false)
  const review = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/customer/orders/${order.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      const result = (await response.json()) as { message?: string }
      if (!response.ok) throw new Error(result.message ?? copy.account.error)
      return result
    },
    onSuccess: () => {
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      queryClient.invalidateQueries({ queryKey: ['discovery'] })
    },
  })

  if (!order.eligible_for_review) {
    return <p className="review-locked">{copy.account.notEligible}</p>
  }

  return (
    <form className="order-review" onSubmit={(event) => { event.preventDefault(); setSaved(false); review.mutate() }}>
      <div className="order-review__heading">
        <div><h3>{copy.account.reviewTitle}</h3><p>{copy.account.reviewLead}</p></div>
        <MessageSquareText />
      </div>
      <div className="star-rating" role="radiogroup" aria-label={copy.account.reviewTitle}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            className={value <= rating ? 'selected' : ''}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={copy.account.ratingAria(value)}
            onClick={() => setRating(value)}
          >
            <Star fill="currentColor" />
          </button>
        ))}
      </div>
      <label>
        {copy.account.commentLabel}
        <textarea
          required
          minLength={10}
          maxLength={1000}
          value={comment}
          placeholder={copy.account.commentPlaceholder}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {review.error && <p className="login-error">{review.error.message}</p>}
      {saved && <p className="review-saved"><Check /> {copy.account.saved}</p>}
      <button className="button button--primary" type="submit" disabled={rating === 0 || comment.trim().length < 10 || review.isPending}>
        {review.isPending
          ? copy.account.saving
          : order.review
            ? copy.account.updateReview
            : copy.account.submitReview}
      </button>
    </form>
  )
}

export function AccountPage() {
  const { language, copy } = useI18n()
  const { data, error, isLoading } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: async () => {
      const response = await fetch('/api/customer/orders')
      if (response.status === 401) {
        window.location.href = '/login'
        throw new Error(copy.account.error)
      }
      const result = (await response.json()) as CustomerOrdersResponse & { message?: string }
      if (!response.ok) throw new Error(result.message ?? copy.account.error)
      return result
    },
    retry: false,
  })
  const signOut = useMutation({
    mutationFn: () => fetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      window.location.href = '/'
    },
  })

  useEffect(() => {
    if (!data) return
    const orderId = new URLSearchParams(window.location.search).get('order')
    if (orderId) document.getElementById(`order-${orderId}`)?.scrollIntoView({ behavior: 'smooth' })
  }, [data])

  const dateFormatter = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <main className="account-page">
      <header className="account-header">
        <Link className="brand-link" to="/"><Brand compact /></Link>
        <div>
          <LanguageSwitcher />
          <button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            <LogOut /> {copy.login.signOut}
          </button>
        </div>
      </header>
      <section className="account-hero">
        <div>
          <span className="kicker">{data?.customer.email ?? 'Halal Delivery'}</span>
          <h1>{copy.account.title}</h1>
          <p>{copy.account.lead}</p>
        </div>
        <Link className="button button--ghost" to="/">{copy.account.backToDiscovery}</Link>
      </section>
      <section className="account-orders">
        {isLoading && <div className="account-state">{copy.account.loading}</div>}
        {error && <div className="account-state account-state--error">{error.message}</div>}
        {data?.orders.length === 0 && (
          <div className="account-state">
            <PackageCheck />
            <h2>{copy.account.emptyTitle}</h2>
            <p>{copy.account.emptyLead}</p>
          </div>
        )}
        {data?.orders.map((order) => (
          <article className="account-order" id={`order-${order.id}`} key={order.id}>
            <div className="account-order__summary">
              <img src={order.restaurant_image_url} alt="" />
              <div>
                <span>{copy.account.orderReference} {order.order_number}</span>
                <h2>{order.restaurant_name}</h2>
                <p><CalendarDays /> {dateFormatter.format(new Date(order.paid_at))}</p>
              </div>
              <strong><Check /> {copy.account.confirmed}</strong>
            </div>
            <div className="account-order__body">
              <div className="order-details">
                <h3>{copy.account.items}</h3>
                {order.items.map((item) => (
                  <p key={item.name}>
                    <span>{item.quantity}× {item.name}</span>
                    <strong>{formatMoney(language, item.unit_price_cents * item.quantity / 100)}</strong>
                  </p>
                ))}
                <p className="order-details__total"><span>{copy.account.total}</span><strong>{formatMoney(language, order.gross_cents / 100)}</strong></p>
                {order.donation_total_cents > 0 && <p><span>{copy.account.donation}</span><strong>{formatMoney(language, order.donation_total_cents / 100)}</strong></p>}
                <small className={`email-status email-status--${order.confirmation_email_status}`}>
                  <MessageSquareText />
                  {order.confirmation_email_status === 'simulated'
                    ? copy.account.emailSimulated
                    : order.confirmation_email_status === 'sent'
                      ? copy.account.emailSent
                      : copy.account.emailPending}
                </small>
              </div>
              <OrderReview order={order} />
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

export function LoginPage() {
  const { copy } = useI18n()
  const testingAccounts = {
    '127.0.0.1': {
      role: 'Customer',
      email: 'customer@halaldelivery.demo',
      password: 'CustomerDemo!2026',
    },
    '127.0.0.2': {
      role: 'Administrator',
      email: 'admin@halaldelivery.demo',
      password: 'AdminDemo!2026',
    },
    '127.0.0.3': {
      role: 'Restaurant owner',
      email: 'owner@emberandolive.demo',
      password: 'RestaurantDemo!2026',
    },
  } as const
  const testingAccount = testingAccounts[
    window.location.hostname as keyof typeof testingAccounts
  ]
  const showTestingTabs =
    import.meta.env.DEV &&
    (window.location.hostname === 'localhost' || window.location.hostname.startsWith('127.'))
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState<string>(testingAccount?.email ?? '')
  const [password, setPassword] = useState<string>(testingAccount?.password ?? '')
  const [confirmPassword, setConfirmPassword] = useState('')
  const googleContainer = useRef<HTMLDivElement>(null)
  const { data: authConfig } = useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => {
      const response = await fetch('/api/auth/config')
      if (!response.ok) throw new Error(copy.login.error)
      return response.json() as Promise<{
        google: { enabled: boolean; client_id: string | null }
      }>
    },
  })
  const login = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = (await response.json()) as { redirect_to?: string; message?: string }
      if (!response.ok || !result.redirect_to) {
        throw new Error(result.message ?? copy.login.error)
      }
      return result
    },
    onSuccess: (result) => {
      window.location.href = result.redirect_to!
    },
  })
  const register = useMutation({
    mutationFn: async () => {
      if (password !== confirmPassword) throw new Error(copy.login.passwordMismatch)
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, email, password }),
      })
      const result = (await response.json()) as { redirect_to?: string; message?: string }
      if (!response.ok || !result.redirect_to) {
        throw new Error(result.message ?? copy.login.error)
      }
      return result
    },
    onSuccess: (result) => {
      window.location.href = result.redirect_to!
    },
  })
  const googleLogin = useMutation({
    mutationFn: async (credential: string) => {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      const result = (await response.json()) as { redirect_to?: string; message?: string }
      if (!response.ok || !result.redirect_to) {
        throw new Error(result.message ?? copy.login.error)
      }
      return result
    },
    onSuccess: (result) => {
      window.location.href = result.redirect_to!
    },
  })

  useEffect(() => {
    const clientId = authConfig?.google.client_id
    if (!authConfig?.google.enabled || !clientId || !googleContainer.current) return

    const renderGoogleButton = () => {
      if (!window.google || !googleContainer.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => googleLogin.mutate(response.credential),
      })
      googleContainer.current.replaceChildren()
      window.google.accounts.id.renderButton(googleContainer.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: Math.min(360, googleContainer.current.clientWidth),
      })
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity]')
    if (existingScript) {
      if (window.google) renderGoogleButton()
      else existingScript.addEventListener('load', renderGoogleButton, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.dataset.googleIdentity = 'true'
    script.addEventListener('load', renderGoogleButton, { once: true })
    document.head.append(script)
  }, [authConfig, googleLogin])

  const activeMutation = mode === 'login' ? login : register

  return (
    <main className="login-page">
      <div className="login-page__toolbar">
        <Link className="brand-link" to="/">
          <Brand compact />
        </Link>
        <LanguageSwitcher />
      </div>
      <div className="login-card">
        <span className="floating-icon floating-icon--heart">
          <Heart size={22} fill="currentColor" />
        </span>
        <h1>{copy.login.title}</h1>
        <p>{copy.login.lead}</p>
        {showTestingTabs && <div className="testing-tabs"><strong>POC testing tabs</strong><p>Each link opens an isolated login session. No incognito windows needed.</p><div><a href="http://127.0.0.1:5173/login" target="_blank" rel="noreferrer">Customer</a><a href="http://127.0.0.2:5173/login" target="_blank" rel="noreferrer">Admin</a><a href="http://127.0.0.3:5173/login" target="_blank" rel="noreferrer">Restaurant</a></div>{testingAccount && <small>{testingAccount.role} credentials are prefilled for this tab.</small>}</div>}
        <div className="auth-tabs" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>{copy.login.signInTab}</button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => setMode('register')}>{copy.login.registerTab}</button>
        </div>
        {authConfig?.google.enabled ? (
          <div className="google-auth">
            <div ref={googleContainer} />
            {googleLogin.error && <p className="login-error">{googleLogin.error.message}</p>}
          </div>
        ) : (
          <div className="google-auth google-auth--unavailable">
            <button type="button" disabled><strong>G</strong>{copy.login.google}</button>
            <small>{copy.login.googleUnavailable}</small>
          </div>
        )}
        <div className="auth-divider"><span>{copy.login.or}</span></div>
        <form className="login-form" onSubmit={(event) => { event.preventDefault(); activeMutation.mutate() }}>
          {mode === 'register' && <label>{copy.login.name}<input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>}
          <label>{copy.login.email}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>{copy.login.password}<input required type="password" minLength={mode === 'register' ? 12 : 1} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></label>
          {mode === 'register' && <label>{copy.login.confirmPassword}<input required type="password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>}
          {mode === 'register' && <small className="password-hint">{copy.login.passwordHint}</small>}
          {activeMutation.error && <p className="login-error">{activeMutation.error.message}</p>}
          <button className="button button--primary" disabled={activeMutation.isPending} type="submit">
            {mode === 'login'
              ? (login.isPending ? copy.login.signingIn : copy.login.submit)
              : (register.isPending ? copy.login.registering : copy.login.registerSubmit)}
          </button>
        </form>
        {mode === 'register' && <small className="registration-note">{copy.login.unverifiedNote}</small>}
        <small className="login-secure"><ShieldCheck /> {copy.login.secureNote}</small>
        <Link className="portal-link" to="/">{copy.login.backToDiscovery}</Link>
      </div>
    </main>
  )
}

export default App
