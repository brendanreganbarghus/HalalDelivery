import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Bike,
  Check,
  ChevronDown,
  Clock3,
  Heart,
  MapPin,
  Package,
  Search,
  ShoppingBag,
  Star,
  Store,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Restaurant } from './App.tsx'
import { useI18n } from './i18n.ts'
import './DiscoveryPage.css'

type DiscoveryResponse = { restaurants: Restaurant[] }
type AuthResponse = {
  user: { display_name: string; is_platform_admin: boolean }
  memberships: Array<{ restaurant_id: string }>
}

const businessTypes = {
  restaurant: {
    label: 'Restaurants',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=320&q=85',
  },
  grocery: {
    label: 'Groceries',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=320&q=85',
  },
} as const

export function DiscoveryPage() {
  const { language } = useI18n()
  const [address, setAddress] = useState(
    () => localStorage.getItem('halal-delivery-address') ?? 'Amsterdam-Noord',
  )
  const [serviceMode, setServiceMode] = useState<'delivery' | 'collection'>('delivery')
  const [businessType, setBusinessType] = useState<'restaurant' | 'grocery'>('restaurant')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'best' | 'delivery' | 'rating'>('best')
  const [freeDelivery, setFreeDelivery] = useState(false)
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [highRating, setHighRating] = useState(false)
  const [openNow, setOpenNow] = useState(true)
  const [offersOnly, setOffersOnly] = useState(false)
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([])
  const [basketOpen, setBasketOpen] = useState(false)
  const [favourites, setFavourites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('halal-delivery-favourites') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const { data, error, isLoading } = useQuery({
    queryKey: ['discovery'],
    queryFn: async () => {
      const response = await fetch('/api/discovery')
      if (!response.ok) throw new Error('Unable to load nearby places.')
      return response.json() as Promise<DiscoveryResponse>
    },
  })
  const { data: auth } = useQuery({
    queryKey: ['customer-auth'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me')
      if (response.status === 401) return null
      if (!response.ok) throw new Error('Unable to load your account.')
      return response.json() as Promise<AuthResponse>
    },
    retry: false,
  })

  useEffect(() => {
    localStorage.setItem('halal-delivery-address', address)
  }, [address])

  useEffect(() => {
    localStorage.setItem('halal-delivery-favourites', JSON.stringify(favourites))
  }, [favourites])

  const cuisines = useMemo(
    () => [...new Set((data?.restaurants ?? [])
      .filter((restaurant) => restaurant.business_type === businessType)
      .flatMap((restaurant) => restaurant.cuisine))].sort(),
    [businessType, data?.restaurants],
  )
  const visibleRestaurants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return (data?.restaurants ?? [])
      .filter((restaurant) => restaurant.business_type === businessType)
      .filter((restaurant) => restaurant.service_modes.includes(serviceMode))
      .filter((restaurant) => !openNow || restaurant.accepting_orders)
      .filter((restaurant) => !freeDelivery || restaurant.delivery_fee_cents === 0)
      .filter((restaurant) => !favouritesOnly || favourites.includes(restaurant.id))
      .filter((restaurant) => !highRating || restaurant.rating >= 4.5)
      .filter((restaurant) => !offersOnly || restaurant.free_delivery_threshold_cents !== null)
      .filter((restaurant) => selectedCuisines.length === 0 ||
        restaurant.cuisine.some((cuisine) => selectedCuisines.includes(cuisine)))
      .filter((restaurant) => !normalizedSearch ||
        `${restaurant.name} ${restaurant.cuisine.join(' ')} ${restaurant.description}`
          .toLowerCase()
          .includes(normalizedSearch))
      .sort((left, right) => {
        if (sort === 'delivery') return left.delivery_minutes - right.delivery_minutes
        if (sort === 'rating') return right.rating - left.rating
        return Number(right.accepting_orders) - Number(left.accepting_orders) ||
          right.rating - left.rating
      })
  }, [
    businessType,
    data?.restaurants,
    favourites,
    favouritesOnly,
    freeDelivery,
    highRating,
    offersOnly,
    openNow,
    search,
    selectedCuisines,
    serviceMode,
    sort,
  ])

  function toggleFavourite(restaurantId: string) {
    setFavourites((current) => current.includes(restaurantId)
      ? current.filter((id) => id !== restaurantId)
      : [...current, restaurantId])
  }

  return (
    <div className="discovery-page">
      <header className="discovery-header">
        <Link className="discovery-brand" to="/">
          <img src="/halal-delivery-logo.jpeg" alt="Halal Delivery" />
        </Link>
        <label className="discovery-address">
          <MapPin />
          <input
            aria-label={language === 'nl' ? 'Bezorgadres' : 'Delivery address'}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
        <div className="service-switch" role="group" aria-label="Order method">
          <button className={serviceMode === 'delivery' ? 'active' : ''} type="button" onClick={() => setServiceMode('delivery')}><Bike />Delivery</button>
          <button className={serviceMode === 'collection' ? 'active' : ''} type="button" onClick={() => setServiceMode('collection')}><Store />Collection</button>
        </div>
        <nav className="discovery-actions">
          {auth ? <Link to="/account"><Package />Orders</Link> : <Link to="/login">Log in</Link>}
          <button type="button" onClick={() => setBasketOpen(true)} aria-label="Open basket"><ShoppingBag /><span>0</span></button>
          {auth && <span className="discovery-avatar">{auth.user.display_name.slice(0, 1)}</span>}
        </nav>
      </header>

      <div className="business-type-rail">
        {(Object.entries(businessTypes) as Array<[keyof typeof businessTypes, typeof businessTypes.restaurant]>).map(([type, option]) => (
          <button className={businessType === type ? 'active' : ''} type="button" key={type} onClick={() => { setBusinessType(type); setSelectedCuisines([]) }}>
            <img src={option.image} alt="" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      <main className="discovery-layout">
        <aside className="discovery-filters">
          <h2>{visibleRestaurants.length} places</h2>
          <FilterSwitch label="Free delivery" checked={freeDelivery} onChange={setFreeDelivery} />
          <FilterSwitch label="Favourites" checked={favouritesOnly} onChange={setFavouritesOnly} icon={<Heart />} />
          <FilterSwitch label="4.5+ stars" checked={highRating} onChange={setHighRating} />
          <FilterSwitch label="Open now" checked={openNow} onChange={setOpenNow} />
          <FilterSwitch label="Offers & savings" checked={offersOnly} onChange={setOffersOnly} />
          <div className="cuisine-filters">
            <h3>{businessType === 'grocery' ? 'Shop categories' : 'Cuisines'}</h3>
            {cuisines.map((cuisine) => (
              <label key={cuisine}>
                <input
                  type="checkbox"
                  checked={selectedCuisines.includes(cuisine)}
                  onChange={() => setSelectedCuisines((current) => current.includes(cuisine)
                    ? current.filter((value) => value !== cuisine)
                    : [...current, cuisine])}
                />
                <span><Check /></span>{cuisine}
              </label>
            ))}
          </div>
        </aside>

        <section className="discovery-results">
          <div className="discovery-toolbar">
            <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={businessType === 'grocery' ? 'Search shops or groceries' : 'Search restaurants or cuisines'} /></label>
            <label className="sort-select"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="best">Best match</option><option value="delivery">Fastest delivery</option><option value="rating">Highest rated</option></select><ChevronDown /></label>
          </div>

          <div className="discovery-category-row">
            {cuisines.map((cuisine, index) => {
              const restaurant = data?.restaurants.find((place) => place.business_type === businessType && place.cuisine.includes(cuisine))
              return <button type="button" key={cuisine} onClick={() => setSelectedCuisines([cuisine])}><img src={restaurant?.image_url} alt="" /><span>{cuisine}</span><small>{['🍕', '🍔', '🥘', '🥗', '🛒'][index % 5]}</small></button>
            })}
          </div>

          {isLoading && <div className="discovery-state">Finding nearby places…</div>}
          {error && <div className="discovery-state discovery-state--error">{error.message}</div>}
          <div className="discovery-grid">
            {visibleRestaurants.map((restaurant) => (
              <article className="discovery-card" key={restaurant.id}>
                <Link to="/restaurant/$slug" params={{ slug: restaurant.slug }}>
                  <div className="discovery-card__image">
                    <img src={restaurant.image_url} alt="" />
                    <span>{restaurant.halal_status}</span>
                    {!restaurant.accepting_orders && <strong>Closed</strong>}
                  </div>
                  <div className="discovery-card__body">
                    <div><h3>{restaurant.name}</h3><span><Star fill="currentColor" /> {restaurant.rating}</span></div>
                    <p>{restaurant.description}</p>
                    <small>{restaurant.business_type === 'grocery' ? 'Grocery shop' : restaurant.cuisine.join(' · ')}</small>
                    <footer>
                      <span><Clock3 /> {restaurant.delivery_minutes} min</span>
                      <span className={restaurant.delivery_fee_cents === 0 ? 'free-delivery' : ''}><Bike /> {restaurant.delivery_fee_cents === 0 ? 'Free delivery' : `€${(restaurant.delivery_fee_cents / 100).toFixed(2)} delivery`}</span>
                    </footer>
                    {restaurant.free_delivery_threshold_cents !== null && <div className="free-delivery-offer">Free delivery from €{(restaurant.free_delivery_threshold_cents / 100).toFixed(2)}</div>}
                  </div>
                </Link>
                <button className={`favourite-button ${favourites.includes(restaurant.id) ? 'active' : ''}`} type="button" onClick={() => toggleFavourite(restaurant.id)} aria-label={`Favourite ${restaurant.name}`}><Heart fill={favourites.includes(restaurant.id) ? 'currentColor' : 'none'} /></button>
              </article>
            ))}
          </div>
          {!isLoading && !error && visibleRestaurants.length === 0 && <div className="discovery-state">No places match these filters. Try switching off one or more filters.</div>}
        </section>
      </main>

      {basketOpen && <div className="discovery-basket-layer"><button className="discovery-basket-backdrop" type="button" onClick={() => setBasketOpen(false)} aria-label="Close basket" /><aside><header><h2>Your basket</h2><button type="button" onClick={() => setBasketOpen(false)}><X /></button></header><div><ShoppingBag /><h3>Fill your basket</h3><p>Choose a place and add something you love.</p></div></aside></div>}
    </div>
  )
}

function FilterSwitch({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (value: boolean) => void; icon?: React.ReactNode }) {
  return <label className="filter-switch"><span>{icon}{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>
}
