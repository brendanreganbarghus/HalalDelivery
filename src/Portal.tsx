import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clock3,
  Copy,
  Gift,
  Image,
  LayoutDashboard,
  Mail,
  MapPin,
  LogOut,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  UserPlus,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import './Portal.css'
import {
  defaultModifierTemplateFor,
  itemTypes,
  type ItemType,
  type ModifierConfig,
} from './modifiers.ts'
import {
  describeOrderValuePromotion,
  describeQuantityPromotion,
  toOrderValuePromotionRule,
  toQuantityPromotionRule,
  type OrderValueDiscountType,
  type PromotionNameLookup,
  type PromotionQualifyingScopeType,
  type PromotionRewardScopeType,
} from '../shared/promotionEngine.ts'

const allergenOptions = [
  'Gluten',
  'Crustaceans',
  'Eggs',
  'Fish',
  'Peanuts',
  'Soy',
  'Milk',
  'Nuts',
  'Celery',
  'Mustard',
  'Sesame',
  'Sulphites',
  'Lupin',
  'Molluscs',
]

const itemTypeLabels: Record<ItemType, string> = {
  standard: 'Standard (no configuration)',
  pizza: 'Pizza (size, sauce & toppings)',
  burger: 'Burger (patty & extras)',
  kebab: 'Kebab or wrap (serving & sauces)',
  meal: 'Meal (side & drink)',
  drink: 'Cold drink (size & preference)',
  milkshake: 'Milkshake (size, flavour & extras)',
}

const offerDefaultStart = new Date(Date.now() + 60 * 60 * 1000)
const offerDefaultEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)

type Category = {
  id: string
  name: string
  emoji: string
  published_item_count: number
}

type PortalMenuItem = {
  id: string
  category_id: string
  name: string
  price_cents: number
}

type Revision = {
  id: string
  restaurant_id: string
  restaurant_name?: string
  category_name: string
  name: string
  description: string
  price_cents: number
  image_url: string
  ingredients: string
  allergens: string[]
  vat_rate: number
  availability: string
  status: string
  submitted_at: string
}

type ProfileRevision = {
  id: string
  restaurant_id: string
  current_restaurant_name?: string
  name: string
  description: string
  address: string
  logo_url: string
  landing_image_url: string
  opening_time: string
  closing_time: string
  minimum_order_cents: number
  delivery_fee_cents: number
  free_delivery_threshold_cents: number | null
  service_fee_bps: number
  service_fee_cap_cents: number
  status: string
  submitted_at: string
}

type RestaurantPortalData = {
  restaurant: {
    id: string
    name: string
    description: string
    address: string
    logo_url: string
    image_url: string
    landing_image_url: string
    opening_time: string
    closing_time: string
    minimum_order_cents: number
    delivery_fee_cents: number
    free_delivery_threshold_cents: number | null
    service_fee_bps: number
    service_fee_cap_cents: number
    halal_status: string
  }
  categories: Category[]
  menu_items: PortalMenuItem[]
  revisions: Revision[]
  profile_revisions: ProfileRevision[]
  current_user: {
    id: string
    display_name: string
    email: string
  }
  current_user_role: 'owner' | 'member'
  team_members: Array<{
    id: string
    display_name: string
    email: string
    role: 'owner' | 'member'
    created_at: string
  }>
  team_invitations: Array<{
    id: string
    email: string
    role: 'member'
    expires_at: string
    accepted_at: string | null
  }>
  promotions: Array<{
    id: string
    title: string
    description: string
    promotion_type:
      | 'announcement'
      | 'order_offer'
      | 'order_value_discount'
      | 'quantity_discount'
      | 'buy_x_get_y_free'
    buy_quantity: number | null
    reward_quantity: number | null
    reward_discount_percent: number | null
    qualifying_scope_type: PromotionQualifyingScopeType | null
    qualifying_category_ids: string[] | null
    qualifying_item_ids: string[] | null
    reward_scope_type: PromotionRewardScopeType | null
    reward_category_ids: string[] | null
    reward_item_ids: string[] | null
    order_discount_type: OrderValueDiscountType | null
    order_discount_value: number | null
    minimum_order_cents: number | null
    starts_at: string
    ends_at: string
    enabled: boolean
    status: 'active' | 'upcoming' | 'expired' | 'disabled'
  }>
}

type AdminData = {
  menu_reviews: Revision[]
  profile_reviews: ProfileRevision[]
  invitations: Array<{
    id: string
    restaurant_name: string
    email: string
    expires_at: string
    accepted_at: string | null
  }>
  commercial_terms: Array<{
    id: string
    restaurant_id: string
    restaurant_name: string
    commission_bps: number
    effective_from: string
  }>
}

type MonthlyReportData = {
  month: string
  generated_at: string
  summary: {
    order_count: number
    gross_cents: number
    promotion_discount_cents: number
    delivery_discount_cents: number
    restaurant_payable_cents: number
    platform_fee_cents: number
    payment_fee_cents: number
    donation_total_cents: number
    platform_net_cents: number
  }
  charity_breakdown: Array<{
    id: string
    name: string
    area: string
    amount_cents: number
    contributing_orders: number
    payout_status: string
    reference: string | null
  }>
  restaurant_breakdown: Array<{
    id: string
    name: string
    order_count: number
    gross_cents: number
    promotion_discount_cents: number
    delivery_discount_cents: number
    payable_cents: number
    platform_fee_cents: number
    minimum_commission_bps: number
    maximum_commission_bps: number
  }>
  orders: Array<{
    id: string
    order_number: string
    paid_at: string
    restaurant_name: string
    gross_cents: number
    promotion_discount_cents: number
    delivery_discount_cents: number
    applied_promotion_title: string | null
    applied_promotion_type: string | null
    restaurant_payable_cents: number
    platform_fee_cents: number
    commission_bps: number
    payment_fee_cents: number
    donation_total_cents: number
    donations: Array<{ charity_name: string; amount_cents: number }>
  }>
}

const money = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith('/api/auth/')) {
      window.location.href = '/login'
    }
    throw new Error(body.message ?? 'The request could not be completed.')
  }
  return body
}

function PortalBrand() {
  return (
    <Link className="portal-brand" to="/">
      <span>H</span>
      <div>HALAL DELIVERY<small>PARTNER CENTRE</small></div>
    </Link>
  )
}

function SignOutButton() {
  const signOut = useMutation({
    mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      window.location.href = '/login'
    },
  })
  return <button className="sign-out" type="button" disabled={signOut.isPending} onClick={() => signOut.mutate()}><LogOut /> Sign out</button>
}

function Status({ value }: { value: string }) {
  const label = value.replace('_', ' ')
  return <span className={`status status--${value}`}>{value === 'approved' && <Check size={12} />}{label}</span>
}

export function RestaurantPortal() {
  const queryClient = useQueryClient()
  const [section, setSection] = useState<'overview' | 'menu' | 'profile' | 'offers' | 'team'>('overview')
  const { data, error, isLoading } = useQuery({
    queryKey: ['restaurant-portal'],
    queryFn: () => api<RestaurantPortalData>('/api/portal/me'),
  })
  const pendingCount = data?.revisions.filter((revision) => revision.status === 'pending_review').length ?? 0

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['restaurant-portal'] })

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <PortalBrand />
        <nav>
          <button className={section === 'overview' ? 'active' : ''} onClick={() => setSection('overview')}><LayoutDashboard />Overview</button>
          <button className={section === 'menu' ? 'active' : ''} onClick={() => setSection('menu')}><UtensilsCrossed />Menu manager</button>
          <button className={section === 'profile' ? 'active' : ''} onClick={() => setSection('profile')}><Store />Restaurant profile</button>
          <button className={section === 'offers' ? 'active' : ''} onClick={() => setSection('offers')}><Gift />Offers</button>
          <button className={section === 'team' ? 'active' : ''} onClick={() => setSection('team')}><Users />Team members</button>
        </nav>
        <div className="portal-sidebar__help">
          <ShieldCheck />
          <strong>Approval protected</strong>
          <p>Changes go live only after Halal Delivery review.</p>
        </div>
        <Link className="portal-back" to="/"><ArrowLeft /> Customer website</Link>
      </aside>
      <main className="portal-main">
        <header className="portal-topbar">
          <div>
            <span>Restaurant workspace</span>
            <strong>{data?.restaurant.name ?? 'Loading...'}</strong>
          </div>
          <div className="portal-user"><span>{data?.current_user.display_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() ?? 'HD'}</span><p><strong>{data?.current_user.display_name ?? 'Restaurant user'}</strong><small>{data?.current_user_role === 'owner' ? 'Restaurant owner' : 'Team member'}</small></p><SignOutButton /></div>
        </header>

        <div className="portal-content">
          {isLoading && <div className="portal-state">Loading partner workspace...</div>}
          {error && <div className="portal-state portal-state--error">{error.message} <Link className="portal-login-link" to="/login">Sign in</Link></div>}
          {data && section === 'overview' && (
            <Overview data={data} pendingCount={pendingCount} onNavigate={setSection} />
          )}
          {data && section === 'menu' && <MenuManager data={data} onSubmitted={refresh} />}
          {data && section === 'profile' && <ProfileManager data={data} onSubmitted={refresh} />}
          {data && section === 'offers' && <PromotionsManager data={data} onChanged={refresh} />}
          {data && section === 'team' && <TeamManager data={data} onInvited={refresh} />}
        </div>
      </main>
    </div>
  )
}

function Overview({
  data,
  pendingCount,
  onNavigate,
}: {
  data: RestaurantPortalData
  pendingCount: number
  onNavigate: (section: 'overview' | 'menu' | 'profile' | 'offers' | 'team') => void
}) {
  const publishedCount = data.categories.reduce((total, category) => total + category.published_item_count, 0)
  return (
    <>
      <div className="portal-title">
        <div><span className="portal-kicker">Good afternoon</span><h1>Keep your menu fresh.</h1><p>Manage content here; our team safeguards what customers see.</p></div>
        <button className="portal-primary" onClick={() => onNavigate('menu')}><Plus /> Add menu item</button>
      </div>
      <div className="portal-notice"><CircleAlert /><p><strong>POC approval mode</strong>Your updates are saved as submissions and never overwrite the live customer menu directly.</p></div>
      <div className="metric-grid">
        <article><span className="metric-icon"><UtensilsCrossed /></span><p>Published items</p><strong>{publishedCount}</strong><small>Across {data.categories.length} categories</small></article>
        <article><span className="metric-icon metric-icon--gold"><Clock3 /></span><p>Awaiting review</p><strong>{pendingCount}</strong><small>Typical review: within 1 day</small></article>
        <article><span className="metric-icon metric-icon--blue"><BadgeCheck /></span><p>Profile status</p><strong>Verified</strong><small>{data.restaurant.halal_status}</small></article>
      </div>
      <div className="portal-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Recent submissions</h2><p>Latest changes sent to Halal Delivery</p></div><button onClick={() => onNavigate('menu')}>Manage <ChevronRight /></button></div>
          <div className="submission-list">
            {data.revisions.slice(0, 4).map((revision) => (
              <div key={revision.id}>
                <span className="submission-image"><img src={revision.image_url} alt="" /></span>
                <p><strong>{revision.name}</strong><small>{revision.category_name} · {money.format(revision.price_cents / 100)}</small></p>
                <Status value={revision.status} />
              </div>
            ))}
            {data.revisions.length === 0 && <p className="empty-copy">No submissions yet.</p>}
          </div>
        </section>
        <section className="panel profile-card">
          <div className="panel-heading"><div><h2>Restaurant profile</h2><p>Customer-facing identity</p></div><button onClick={() => onNavigate('profile')}>Edit <ChevronRight /></button></div>
          <img src={data.restaurant.logo_url || data.restaurant.image_url} alt="" />
          <h3>{data.restaurant.name}</h3>
          <p>{data.restaurant.description}</p>
          <small><MapPin /> {data.restaurant.address}</small>
        </section>
      </div>
    </>
  )
}

function MenuManager({ data, onSubmitted }: { data: RestaurantPortalData; onSubmitted: () => void }) {
  const [message, setMessage] = useState('')
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '🍽️' })
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, { name: string; emoji: string }>>(
    Object.fromEntries(data.categories.map((category) => [
      category.id,
      { name: category.name, emoji: category.emoji },
    ])),
  )
  const [form, setForm] = useState({
    category_id: data.categories[0]?.id ?? '',
    name: '',
    description: '',
    price: '',
    image_url: '',
    ingredients: '',
    allergens: [] as string[],
    vat_rate: 9 as 9 | 21,
    availability: 'all_day',
    item_type: 'standard' as ItemType,
    modifier_config: [] as ModifierConfig,
  })
  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/portal/restaurants/${data.restaurant.id}/menu-items`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          price_cents: Math.round(Number(form.price) * 100),
          price: undefined,
        }),
      }),
    onSuccess: () => {
      setMessage('Submitted for admin review. It is not live yet.')
      setForm((current) => ({
        ...current,
        name: '',
        description: '',
        price: '',
        image_url: '',
        ingredients: '',
        allergens: [],
        item_type: 'standard',
        modifier_config: [],
      }))
      onSubmitted()
    },
  })
  const createCategory = useMutation({
    mutationFn: () => api(`/api/portal/restaurants/${data.restaurant.id}/categories`, {
      method: 'POST',
      body: JSON.stringify(newCategory),
    }),
    onSuccess: () => {
      setNewCategory({ name: '', emoji: '🍽️' })
      onSubmitted()
    },
  })
  const updateCategory = useMutation({
    mutationFn: (categoryId: string) => api(`/api/portal/restaurants/${data.restaurant.id}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(categoryDrafts[categoryId]),
    }),
    onSuccess: onSubmitted,
  })

  const toggleAllergen = (allergen: string) => {
    setForm((current) => ({
      ...current,
      allergens: current.allergens.includes(allergen)
        ? current.allergens.filter((value) => value !== allergen)
        : [...current.allergens, allergen],
    }))
  }

  function setItemType(itemType: ItemType) {
    setForm((current) => ({
      ...current,
      item_type: itemType,
      modifier_config: defaultModifierTemplateFor(itemType),
    }))
  }

  function updateModifierGroup(groupIndex: number, patch: Partial<ModifierConfig[number]>) {
    setForm((current) => ({
      ...current,
      modifier_config: current.modifier_config.map((group, index) =>
        index === groupIndex ? { ...group, ...patch } : group),
    }))
  }

  function updateModifierOption(
    groupIndex: number,
    optionIndex: number,
    patch: Partial<ModifierConfig[number]['options'][number]>,
  ) {
    setForm((current) => ({
      ...current,
      modifier_config: current.modifier_config.map((group, index) => index === groupIndex
        ? {
            ...group,
            options: group.options.map((option, currentOptionIndex) =>
              currentOptionIndex === optionIndex ? { ...option, ...patch } : option),
          }
        : group),
    }))
  }

  function setDefaultModifierOption(groupIndex: number, optionIndex: number, selected: boolean) {
    setForm((current) => ({
      ...current,
      modifier_config: current.modifier_config.map((group, index) => index === groupIndex
        ? {
            ...group,
            options: group.options.map((option, currentOptionIndex) => ({
              ...option,
              default: group.selection_type === 'single'
                ? currentOptionIndex === optionIndex && selected
                : currentOptionIndex === optionIndex
                  ? selected
                  : option.default,
            })),
          }
        : group),
    }))
  }

  function addModifierOption(groupIndex: number) {
    const id = `option-${crypto.randomUUID().slice(0, 8)}`
    setForm((current) => ({
      ...current,
      modifier_config: current.modifier_config.map((group, index) => index === groupIndex
        ? {
            ...group,
            options: [
              ...group.options,
              { id, name: 'New option', price_delta_cents: 0 },
            ],
          }
        : group),
    }))
  }

  function removeModifierOption(groupIndex: number, optionIndex: number) {
    setForm((current) => ({
      ...current,
      modifier_config: current.modifier_config.map((group, index) => index === groupIndex
        ? { ...group, options: group.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) }
        : group),
    }))
  }

  function addModifierGroup() {
    const id = `group-${crypto.randomUUID().slice(0, 8)}`
    setForm((current) => ({
      ...current,
      modifier_config: [
        ...current.modifier_config,
        {
          id,
          name: 'New choice',
          selection_type: 'single',
          required: false,
          min_select: 0,
          max_select: 1,
          options: [{ id: `option-${crypto.randomUUID().slice(0, 8)}`, name: 'New option', price_delta_cents: 0 }],
        },
      ],
    }))
  }

  return (
    <>
      <div className="portal-title"><div><span className="portal-kicker">Catalogue governance</span><h1>Add a menu item</h1><p>All starred fields are mandatory before an item can enter review.</p></div></div>
      <section className="panel category-manager">
        <div className="panel-heading"><div><h2>Menu categories</h2><p>Create and rename sections. Changes are available to menu management immediately.</p></div></div>
        <form className="category-create" onSubmit={(event) => { event.preventDefault(); createCategory.mutate() }}>
          <label>Emoji<input required maxLength={16} value={newCategory.emoji} onChange={(event) => setNewCategory({ ...newCategory, emoji: event.target.value })} aria-label="Category emoji" /></label>
          <label>Category name<input required minLength={2} maxLength={80} value={newCategory.name} onChange={(event) => setNewCategory({ ...newCategory, name: event.target.value })} placeholder="e.g. Desserts" /></label>
          <button className="portal-primary" disabled={createCategory.isPending} type="submit"><Plus /> Add category</button>
        </form>
        <div className="category-list">
          {data.categories.map((category) => {
            const draft = categoryDrafts[category.id] ?? { name: category.name, emoji: category.emoji }
            return (
              <form key={category.id} onSubmit={(event) => { event.preventDefault(); updateCategory.mutate(category.id) }}>
                <input required maxLength={16} value={draft.emoji} onChange={(event) => setCategoryDrafts({ ...categoryDrafts, [category.id]: { ...draft, emoji: event.target.value } })} aria-label={`${category.name} emoji`} />
                <input required minLength={2} maxLength={80} value={draft.name} onChange={(event) => setCategoryDrafts({ ...categoryDrafts, [category.id]: { ...draft, name: event.target.value } })} aria-label={`${category.name} name`} />
                <span>{category.published_item_count} items</span>
                <button disabled={updateCategory.isPending} type="submit">Save</button>
              </form>
            )
          })}
        </div>
        {(createCategory.error || updateCategory.error) && <p className="form-error">{(createCategory.error ?? updateCategory.error)?.message}</p>}
      </section>
      <div className="editor-grid">
        <form className="panel item-form" onSubmit={(event) => { event.preventDefault(); setMessage(''); mutation.mutate() }}>
          <div className="form-section"><h2>Core details</h2><p>Clear names and descriptions improve customer confidence.</p></div>
          <div className="field-grid">
            <label>Item name *<input required minLength={3} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Sumac chicken bowl" /></label>
            <label>Category *<select required value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.emoji} {category.name}</option>)}</select></label>
            <label>Item type *<select required value={form.item_type} onChange={(event) => setItemType(event.target.value as ItemType)}>{itemTypes.map((type) => <option key={type} value={type}>{itemTypeLabels[type]}</option>)}</select></label>
            <label className="field-span">Description *<textarea required minLength={20} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the dish, flavour and what is included." /></label>
            <label>Price including VAT *<div className="price-input"><span>€</span><input required type="number" min=".50" max="1000" step=".05" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div></label>
            <label>VAT rate *<select value={form.vat_rate} onChange={(event) => setForm({ ...form, vat_rate: Number(event.target.value) as 9 | 21 })}><option value="9">9% food / non-alcoholic</option><option value="21">21% alcoholic beverage</option></select></label>
          </div>
          {form.item_type !== 'standard' && (
            <div className="form-section modifier-preview">
              <h2>{itemTypeLabels[form.item_type]} modifiers</h2>
              <p>The template is prefilled for you. Change names and prices, or add and remove choices for this item.</p>
              <div className="modifier-preview__groups">
                {form.modifier_config.map((group, groupIndex) => (
                  <div className="modifier-preview__group" key={group.id}>
                    <div className="modifier-editor__group-header">
                      <label>Choice name<input required maxLength={80} value={group.name} onChange={(event) => updateModifierGroup(groupIndex, { name: event.target.value })} /></label>
                      <label>Selection<select value={group.selection_type} onChange={(event) => {
                        const selectionType = event.target.value as 'single' | 'multiple'
                        updateModifierGroup(groupIndex, {
                          selection_type: selectionType,
                          max_select: selectionType === 'single' ? 1 : Math.max(2, group.max_select),
                        })
                      }}><option value="single">Choose one</option><option value="multiple">Choose multiple</option></select></label>
                      <label className="modifier-editor__required"><input type="checkbox" checked={group.required} onChange={(event) => updateModifierGroup(groupIndex, { required: event.target.checked, min_select: event.target.checked ? 1 : 0 })} /><span>Required</span></label>
                      {group.selection_type === 'multiple' && <label>Maximum<input type="number" min="1" max={Math.min(20, group.options.length)} value={group.max_select} onChange={(event) => updateModifierGroup(groupIndex, { max_select: Number(event.target.value) })} /></label>}
                      <button type="button" className="modifier-editor__remove" aria-label={`Remove ${group.name}`} onClick={() => setForm((current) => ({ ...current, modifier_config: current.modifier_config.filter((_, index) => index !== groupIndex) }))}><Trash2 /></button>
                    </div>
                    <div className="modifier-editor__options">
                      <div className="modifier-editor__labels"><span>Option shown to customer</span><span>Extra price</span><span>Default</span></div>
                      {group.options.map((option, optionIndex) => (
                        <div className="modifier-editor__option" key={option.id}>
                          <input required maxLength={80} aria-label={`${group.name} option name`} value={option.name} onChange={(event) => updateModifierOption(groupIndex, optionIndex, { name: event.target.value })} />
                          <div className="modifier-editor__price"><span>€</span><input required type="number" min="0" max="50" step=".05" aria-label={`${option.name} extra price`} value={(option.price_delta_cents / 100).toFixed(2)} onChange={(event) => updateModifierOption(groupIndex, optionIndex, { price_delta_cents: Math.round(Number(event.target.value) * 100) })} /></div>
                          <input type={group.selection_type === 'single' ? 'radio' : 'checkbox'} name={`default-${group.id}`} aria-label={`${option.name} selected by default`} checked={Boolean(option.default)} onChange={(event) => setDefaultModifierOption(groupIndex, optionIndex, event.target.checked)} />
                          <button type="button" disabled={group.options.length === 1} aria-label={`Remove ${option.name}`} onClick={() => removeModifierOption(groupIndex, optionIndex)}><Trash2 /></button>
                        </div>
                      ))}
                      <button type="button" className="modifier-editor__add-option" disabled={group.options.length >= 20} onClick={() => addModifierOption(groupIndex)}><Plus /> Add option</button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="modifier-editor__add-group" disabled={form.modifier_config.length >= 10} onClick={addModifierGroup}><Plus /> Add another choice</button>
            </div>
          )}
          <div className="form-section"><h2>Food safety & availability</h2><p>Ingredients and the EU 14 allergens are mandatory review information.</p></div>
          <label>Ingredients *<textarea required minLength={3} value={form.ingredients} onChange={(event) => setForm({ ...form, ingredients: event.target.value })} placeholder="List ingredients in descending order." /></label>
          <fieldset><legend>Allergens * <small>Select all that apply, or leave empty only if none apply.</small></legend><div className="allergen-grid">{allergenOptions.map((allergen) => <label key={allergen}><input type="checkbox" checked={form.allergens.includes(allergen)} onChange={() => toggleAllergen(allergen)} /><span>{allergen}</span></label>)}</div></fieldset>
          <label>Availability *<select value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })}><option value="all_day">All day</option><option value="lunch">Lunch only</option><option value="dinner">Dinner only</option><option value="weekends">Weekends only</option></select></label>
          <div className="form-section"><h2>Customer image</h2><p>Use a well-lit landscape image. Managed media upload is planned after the POC.</p></div>
          <label>Image URL *<input required type="url" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="https://..." /></label>
          {mutation.error && <p className="form-error">{mutation.error.message}</p>}
          {message && <p className="form-success"><Check /> {message}</p>}
          <button className="portal-primary" disabled={mutation.isPending} type="submit"><Send /> {mutation.isPending ? 'Submitting...' : 'Submit for approval'}</button>
        </form>
        <aside className="preview-column">
          <div className="panel item-preview">
            <span>Customer preview</span>
            <div className="item-preview__image">{form.image_url ? <img src={form.image_url} alt="" /> : <Image />}</div>
            <small>{data.categories.find((category) => category.id === form.category_id)?.name}</small>
            <h3>{form.name || 'Your menu item'}</h3>
            <p>{form.description || 'A helpful description will appear here.'}</p>
            <strong>{form.price ? money.format(Number(form.price)) : '€0.00'}</strong>
          </div>
          <div className="panel checklist"><h3>Publish checklist</h3>{['Name and category', 'Useful description', 'Valid price and VAT', 'Ingredients and allergens', 'Landscape image', 'Availability'].map((item) => <p key={item}><Check /> {item}</p>)}</div>
        </aside>
      </div>
    </>
  )
}

function ProfileManager({ data, onSubmitted }: { data: RestaurantPortalData; onSubmitted: () => void }) {
  const [form, setForm] = useState({
    name: data.restaurant.name,
    description: data.restaurant.description,
    address: data.restaurant.address,
    logo_url: data.restaurant.logo_url || data.restaurant.image_url,
    landing_image_url: data.restaurant.landing_image_url,
    opening_time: data.restaurant.opening_time.slice(0, 5),
    closing_time: data.restaurant.closing_time.slice(0, 5),
    minimum_order: (data.restaurant.minimum_order_cents / 100).toFixed(2),
    delivery_fee: (data.restaurant.delivery_fee_cents / 100).toFixed(2),
    free_delivery_threshold: data.restaurant.free_delivery_threshold_cents === null
      ? ''
      : (data.restaurant.free_delivery_threshold_cents / 100).toFixed(2),
    service_fee_percent: (data.restaurant.service_fee_bps / 100).toFixed(2),
    service_fee_cap: (data.restaurant.service_fee_cap_cents / 100).toFixed(2),
  })
  const mutation = useMutation({
    mutationFn: () => api(`/api/portal/restaurants/${data.restaurant.id}/profile`, {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        address: form.address,
        logo_url: form.logo_url,
        landing_image_url: form.landing_image_url,
        opening_time: form.opening_time,
        closing_time: form.closing_time,
        minimum_order_cents: Math.round(Number(form.minimum_order) * 100),
        delivery_fee_cents: Math.round(Number(form.delivery_fee) * 100),
        free_delivery_threshold_cents: form.free_delivery_threshold
          ? Math.round(Number(form.free_delivery_threshold) * 100)
          : null,
        service_fee_bps: Math.round(Number(form.service_fee_percent) * 100),
        service_fee_cap_cents: Math.round(Number(form.service_fee_cap) * 100),
      }),
    }),
    onSuccess: onSubmitted,
  })
  return (
    <>
      <div className="portal-title"><div><span className="portal-kicker">Storefront settings</span><h1>Restaurant profile</h1><p>Brand, opening hours and checkout fees follow the same approval trail.</p></div></div>
      <div className="editor-grid">
        <form className="panel item-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate() }}>
          <label>Trading name *<input required minLength={3} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Description *<textarea required minLength={30} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Restaurant address *<input required minLength={8} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label>Logo URL *<input required type="url" value={form.logo_url} onChange={(event) => setForm({ ...form, logo_url: event.target.value })} /></label>
          <label>Storefront landing image URL *<input required type="url" value={form.landing_image_url} onChange={(event) => setForm({ ...form, landing_image_url: event.target.value })} /></label>
          <div className="form-section"><h2>Delivery and opening</h2><p>These values are shown to customers and snapshotted at checkout.</p></div>
          <div className="field-grid">
            <label>Opening time *<input required type="time" value={form.opening_time} onChange={(event) => setForm({ ...form, opening_time: event.target.value })} /></label>
            <label>Closing time *<input required type="time" value={form.closing_time} onChange={(event) => setForm({ ...form, closing_time: event.target.value })} /></label>
            <label>Minimum order (€) *<input required type="number" min="0" step=".01" value={form.minimum_order} onChange={(event) => setForm({ ...form, minimum_order: event.target.value })} /></label>
            <label>Delivery fee (€) *<input required type="number" min="0" step=".01" value={form.delivery_fee} onChange={(event) => setForm({ ...form, delivery_fee: event.target.value })} /></label>
            <label>Free delivery from (€)<input type="number" min="0" step=".01" value={form.free_delivery_threshold} onChange={(event) => setForm({ ...form, free_delivery_threshold: event.target.value })} placeholder="Optional" /></label>
            <label>Service fee (%) *<input required type="number" min="0" max="20" step=".01" value={form.service_fee_percent} onChange={(event) => setForm({ ...form, service_fee_percent: event.target.value })} /></label>
            <label>Service fee cap (€) *<input required type="number" min="0" step=".01" value={form.service_fee_cap} onChange={(event) => setForm({ ...form, service_fee_cap: event.target.value })} /></label>
          </div>
          {mutation.isSuccess && <p className="form-success"><Check /> Profile submitted for review.</p>}
          {mutation.error && <p className="form-error">{mutation.error.message}</p>}
          <button className="portal-primary" disabled={mutation.isPending} type="submit"><Send /> Submit profile changes</button>
        </form>
        <aside className="panel item-preview profile-preview"><span>Storefront preview</span><img className="profile-hero-preview" src={form.landing_image_url} alt="" /><div className="profile-logo"><img src={form.logo_url} alt="" /></div><h3>{form.name}</h3><p>{form.description}</p><small><MapPin /> {form.address}</small><small><Clock3 /> {form.opening_time}–{form.closing_time}</small></aside>
      </div>
    </>
  )
}

type PromotionPresetKey = 'buy_1_get_1' | 'buy_x_get_cheapest_y' | 'second_half_price' | 'custom'

const promotionPresets: Record<PromotionPresetKey, {
  label: string
  hint: string
  buyQuantity: number
  rewardQuantity: number
  rewardDiscountPercent: number
}> = {
  buy_1_get_1: {
    label: 'Buy 1, get 1 free',
    hint: 'Every second qualifying item is free.',
    buyQuantity: 1,
    rewardQuantity: 1,
    rewardDiscountPercent: 100,
  },
  buy_x_get_cheapest_y: {
    label: 'Buy X, get cheapest Y free',
    hint: 'Choose how many a customer must buy and how many cheapest items are free.',
    buyQuantity: 2,
    rewardQuantity: 1,
    rewardDiscountPercent: 100,
  },
  second_half_price: {
    label: 'Second item half price',
    hint: 'The second qualifying item is 50% off.',
    buyQuantity: 1,
    rewardQuantity: 1,
    rewardDiscountPercent: 50,
  },
  custom: {
    label: 'Custom quantity offer',
    hint: 'Set any buy quantity, reward quantity and reward discount.',
    buyQuantity: 1,
    rewardQuantity: 1,
    rewardDiscountPercent: 100,
  },
}

type PromotionScopeFormValue = {
  type: 'all' | 'categories' | 'items'
  category_ids: string[]
  item_ids: string[]
}

type PromotionRewardScopeFormValue = {
  type: 'same_as_qualifying' | 'all' | 'categories' | 'items'
  category_ids: string[]
  item_ids: string[]
}

function PromotionScopePicker({
  legend,
  hint,
  categories,
  items,
  value,
  onChange,
  allowSameAsQualifying,
}: {
  legend: string
  hint: string
  categories: Category[]
  items: PortalMenuItem[]
  value: PromotionScopeFormValue | PromotionRewardScopeFormValue
  onChange: (next: PromotionScopeFormValue | PromotionRewardScopeFormValue) => void
  allowSameAsQualifying: boolean
}) {
  return (
    <fieldset className="promotion-scope">
      <legend>{legend} <small>{hint}</small></legend>
      <select
        value={value.type}
        onChange={(event) => onChange({ ...value, type: event.target.value as typeof value.type, category_ids: [], item_ids: [] })}
      >
        {allowSameAsQualifying && <option value="same_as_qualifying">Same items customer bought</option>}
        <option value="all">All menu items</option>
        <option value="categories">Selected categories</option>
        <option value="items">Selected menu items</option>
      </select>
      {value.type === 'categories' && (
        <div className="allergen-grid promotion-scope__grid">
          {categories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                checked={value.category_ids.includes(category.id)}
                onChange={() => onChange({
                  ...value,
                  category_ids: value.category_ids.includes(category.id)
                    ? value.category_ids.filter((id) => id !== category.id)
                    : [...value.category_ids, category.id],
                })}
              />
              <span>{category.emoji} {category.name}</span>
            </label>
          ))}
          {categories.length === 0 && <p className="empty-copy">Add a menu category first.</p>}
        </div>
      )}
      {value.type === 'items' && (
        <div className="allergen-grid promotion-scope__grid">
          {items.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={value.item_ids.includes(item.id)}
                onChange={() => onChange({
                  ...value,
                  item_ids: value.item_ids.includes(item.id)
                    ? value.item_ids.filter((id) => id !== item.id)
                    : [...value.item_ids, item.id],
                })}
              />
              <span>{item.name}</span>
            </label>
          ))}
          {items.length === 0 && <p className="empty-copy">Publish a menu item first.</p>}
        </div>
      )}
    </fieldset>
  )
}

function PromotionsManager({ data, onChanged }: { data: RestaurantPortalData; onChanged: () => void }) {
  const toLocalInput = (value: Date) => {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }
  const [form, setForm] = useState({
    title: '',
    description: '',
    promotion_type: 'announcement' as 'announcement' | 'order_value_discount' | 'quantity_discount',
    order_discount_type: 'percentage' as OrderValueDiscountType,
    order_discount_value: '15',
    preset: 'buy_1_get_1' as PromotionPresetKey,
    buy_quantity: '1',
    reward_quantity: '1',
    reward_discount_percent: '100',
    minimum_order: '',
    starts_at: toLocalInput(offerDefaultStart),
    ends_at: toLocalInput(offerDefaultEnd),
  })
  const [qualifyingScope, setQualifyingScope] = useState<PromotionScopeFormValue>({
    type: 'all',
    category_ids: [],
    item_ids: [],
  })
  const [rewardScope, setRewardScope] = useState<PromotionRewardScopeFormValue>({
    type: 'same_as_qualifying',
    category_ids: [],
    item_ids: [],
  })
  const [helpOpen, setHelpOpen] = useState(false)

  function applyPreset(preset: PromotionPresetKey) {
    const config = promotionPresets[preset]
    setForm((current) => ({
      ...current,
      preset,
      promotion_type: 'quantity_discount',
      buy_quantity: String(config.buyQuantity),
      reward_quantity: String(config.rewardQuantity),
      reward_discount_percent: String(config.rewardDiscountPercent),
    }))
  }

  const nameLookup: PromotionNameLookup = {
    categoryNameById: Object.fromEntries(data.categories.map((category) => [category.id, category.name])),
    itemNameById: Object.fromEntries(data.menu_items.map((item) => [item.id, item.name])),
  }
  const previewRule = form.promotion_type === 'quantity_discount'
    ? toQuantityPromotionRule({
        promotion_type: 'quantity_discount',
        buy_quantity: Number(form.buy_quantity) || null,
        reward_quantity: Number(form.reward_quantity) || null,
        reward_discount_percent: Number(form.reward_discount_percent) || null,
        qualifying_scope_type: qualifyingScope.type,
        qualifying_category_ids: qualifyingScope.category_ids,
        qualifying_item_ids: qualifyingScope.item_ids,
        reward_scope_type: rewardScope.type,
        reward_category_ids: rewardScope.category_ids,
        reward_item_ids: rewardScope.item_ids,
      })
    : null
  const previewOrderValueRule = form.promotion_type === 'order_value_discount'
    ? toOrderValuePromotionRule({
        promotion_type: form.promotion_type,
        buy_quantity: null,
        reward_quantity: null,
        order_discount_type: form.order_discount_type,
        order_discount_value: form.order_discount_type === 'free_delivery'
          ? null
          : form.order_discount_type === 'fixed'
            ? Math.round(Number(form.order_discount_value) * 100)
            : Number(form.order_discount_value),
        minimum_order_cents: form.minimum_order
          ? Math.round(Number(form.minimum_order) * 100)
          : null,
      })
    : null

  const create = useMutation({
    mutationFn: () => api(`/api/portal/restaurants/${data.restaurant.id}/promotions`, {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        promotion_type: form.promotion_type,
        buy_quantity: form.promotion_type === 'quantity_discount' ? Number(form.buy_quantity) : null,
        reward_quantity: form.promotion_type === 'quantity_discount' ? Number(form.reward_quantity) : null,
        reward_discount_percent: form.promotion_type === 'quantity_discount' ? Number(form.reward_discount_percent) : null,
        order_discount_type: form.promotion_type === 'order_value_discount'
          ? form.order_discount_type
          : null,
        order_discount_value: form.promotion_type === 'order_value_discount'
          ? form.order_discount_type === 'free_delivery'
            ? null
            : form.order_discount_type === 'fixed'
              ? Math.round(Number(form.order_discount_value) * 100)
              : Number(form.order_discount_value)
          : null,
        qualifying_scope: form.promotion_type === 'quantity_discount'
          ? qualifyingScope
          : { type: 'all', category_ids: [], item_ids: [] },
        reward_scope: form.promotion_type === 'quantity_discount'
          ? rewardScope
          : { type: 'same_as_qualifying', category_ids: [], item_ids: [] },
        minimum_order_cents: form.promotion_type !== 'announcement' && form.minimum_order
          ? Math.round(Number(form.minimum_order) * 100)
          : null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        enabled: true,
      }),
    }),
    onSuccess: () => {
      setForm((current) => ({ ...current, title: '', description: '', minimum_order: '' }))
      setQualifyingScope({ type: 'all', category_ids: [], item_ids: [] })
      setRewardScope({ type: 'same_as_qualifying', category_ids: [], item_ids: [] })
      onChanged()
    },
  })
  const toggle = useMutation({
    mutationFn: (offer: RestaurantPortalData['promotions'][number]) =>
      api(`/api/portal/restaurants/${data.restaurant.id}/promotions/${offer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !offer.enabled }),
      }),
    onSuccess: onChanged,
  })
  return (
    <>
      <div className="portal-title promotion-title">
        <div><span className="portal-kicker">Time-based campaigns</span><h1>Offers</h1><p>Publish promotions directly for this POC. Start and end times control storefront visibility.</p></div>
        <button type="button" aria-expanded={helpOpen} aria-controls="promotion-help" onClick={() => setHelpOpen((current) => !current)}><CircleHelp /> {helpOpen ? 'Hide guide' : 'How offers work'}</button>
      </div>
      {helpOpen && (
        <section className="panel promotion-help" id="promotion-help">
          <header><CircleHelp /><div><h2>Create an automatic offer</h2><p>Follow these steps from left to right. The preview confirms the rule before you publish it.</p></div></header>
          <ol>
            <li><strong>Choose a promotion type</strong><span>Announcements show a scheduled message only. Order-value and quantity offers calculate one automatic checkout discount.</span></li>
            <li><strong>Configure an order-value offer</strong><span>Choose percentage, fixed euros or free delivery. Enter the value where shown and optionally set the minimum pre-discount food subtotal.</span></li>
            <li><strong>Configure a quantity offer</strong><span>Start with buy-one-get-one, cheapest free, second item half price or a custom quantity offer.</span></li>
            <li><strong>Enter the quantities</strong><span>“Buy quantity” unlocks the offer. “Reward quantity” controls how many items receive the discount. Enter 100% for free or 50% for half price.</span></li>
            <li><strong>Select qualifying items</strong><span>Choose all items, particular categories or individual menu items that count toward the required purchase.</span></li>
            <li><strong>Select reward items</strong><span>Choose what may receive the discount. “Same items customer bought” is ideal for buy-one-get-one offers.</span></li>
            <li><strong>Add customer-facing details</strong><span>Enter a clear title, description and campaign dates, then publish. Checkout tests all active automatic offers and applies only the one with the greatest savings.</span></li>
          </ol>
          <div className="promotion-help__examples">
            <article><strong>Pizza BOGO</strong><span>Buy 1 · Reward 1 · 100% · Pizza categories for both scopes.</span></article>
            <article><strong>Second burger half price</strong><span>Buy 1 · Reward 1 · 50% · Burger category · Same items bought.</span></article>
            <article><strong>Buy 2 mains, get a drink free</strong><span>Buy 2 · Reward 1 · 100% · Main category qualifies · Drinks category rewarded.</span></article>
            <article><strong>15% off over €25</strong><span>Order-value · Percentage · 15 · Minimum order €25.</span></article>
            <article><strong>€5 off over €30</strong><span>Order-value · Fixed euro discount · €5 · Minimum order €30.</span></article>
            <article><strong>Free delivery over €20</strong><span>Order-value · Free delivery · Minimum order €20.</span></article>
            <article><strong>Weekend announcement</strong><span>Announcement · Add title, message and schedule · Totals never change.</span></article>
          </div>
        </section>
      )}
      <div className="editor-grid">
        <form className="panel item-form" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
          <div className="form-section"><h2>Create an offer</h2><p>Use a concrete title such as “Buy 1, get 1 free” and explain the qualifying order.</p></div>
          <label>Promotion type *
            <select
              value={form.promotion_type}
              onChange={(event) => setForm({
                ...form,
                promotion_type: event.target.value as typeof form.promotion_type,
              })}
            >
              <option value="announcement">Promotional announcement (message only)</option>
              <option value="order_value_discount">Order-value offer (automatic discount)</option>
              <option value="quantity_discount">Quantity offer (automatic item discount)</option>
            </select>
          </label>

          {form.promotion_type === 'announcement' && (
            <p className="promotion-preview">
              <Gift /> Storefront message only. This announcement never changes basket or checkout totals.
            </p>
          )}

          {form.promotion_type === 'order_value_discount' && (
            <>
              <label>Order-value rule *
                <select
                  value={form.order_discount_type}
                  onChange={(event) => setForm({
                    ...form,
                    order_discount_type: event.target.value as OrderValueDiscountType,
                    order_discount_value: event.target.value === 'percentage' ? '15' : '5',
                  })}
                >
                  <option value="percentage">Percentage off food subtotal</option>
                  <option value="fixed">Fixed euro discount</option>
                  <option value="free_delivery">Free delivery</option>
                </select>
              </label>
              {form.order_discount_type === 'percentage' && (
                <label>Discount percentage *
                  <input required type="number" min="1" max="100" step="1" value={form.order_discount_value} onChange={(event) => setForm({ ...form, order_discount_value: event.target.value })} />
                </label>
              )}
              {form.order_discount_type === 'fixed' && (
                <label>Fixed discount (€) *
                  <input required type="number" min=".01" max="1000" step=".01" value={form.order_discount_value} onChange={(event) => setForm({ ...form, order_discount_value: event.target.value })} />
                </label>
              )}
              {previewOrderValueRule && (
                <p className="promotion-preview">
                  <Gift /> {describeOrderValuePromotion(previewOrderValueRule)}
                </p>
              )}
            </>
          )}

          {form.promotion_type === 'quantity_discount' && (
            <>
              <fieldset className="promotion-presets">
                <legend>Start from a template <small>Pick a preset, then fine-tune the numbers below.</small></legend>
                <div className="promotion-presets__grid">
                  {(Object.keys(promotionPresets) as PromotionPresetKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={form.preset === key ? 'active' : ''}
                      onClick={() => applyPreset(key)}
                    >
                      <strong>{promotionPresets[key].label}</strong>
                      <span>{promotionPresets[key].hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="field-grid">
                <label>Buy quantity *<input required type="number" min="1" max="20" value={form.buy_quantity} onChange={(event) => setForm({ ...form, buy_quantity: event.target.value })} /></label>
                <label>Reward quantity *<input required type="number" min="1" max="20" value={form.reward_quantity} onChange={(event) => setForm({ ...form, reward_quantity: event.target.value })} /></label>
                <label>Reward discount % *<input required type="number" min="1" max="100" value={form.reward_discount_percent} onChange={(event) => setForm({ ...form, reward_discount_percent: event.target.value })} /></label>
              </div>

              <PromotionScopePicker
                legend="Qualifying items"
                hint="Which items count towards the buy quantity."
                categories={data.categories}
                items={data.menu_items}
                value={qualifyingScope}
                onChange={(next) => setQualifyingScope(next as PromotionScopeFormValue)}
                allowSameAsQualifying={false}
              />
              <PromotionScopePicker
                legend="Reward items"
                hint="Which items are eligible to receive the discount."
                categories={data.categories}
                items={data.menu_items}
                value={rewardScope}
                onChange={(next) => setRewardScope(next as PromotionRewardScopeFormValue)}
                allowSameAsQualifying
              />

              {previewRule && (
                <p className="promotion-preview">
                  <Gift /> {describeQuantityPromotion(previewRule, nameLookup)}
                </p>
              )}
            </>
          )}

          <label>Offer title *<input required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Buy 1, get 1 free" /></label>
          <label>Description *<textarea required minLength={10} maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          {form.promotion_type !== 'announcement' && (
            <label>Minimum pre-discount food order (€)<input type="number" min="0" max="1000" step=".01" value={form.minimum_order} onChange={(event) => setForm({ ...form, minimum_order: event.target.value })} placeholder="Optional" /></label>
          )}
          <div className="field-grid">
            <label>Starts *<input required type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></label>
            <label>Ends *<input required type="datetime-local" min={form.starts_at} value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></label>
          </div>
          {create.error && <p className="form-error">{create.error.message}</p>}
          {create.isSuccess && <p className="form-success"><Check /> Offer published.</p>}
          <button className="portal-primary" disabled={create.isPending} type="submit"><Gift /> Publish offer</button>
        </form>
        <aside className="panel offers-list">
          <div className="panel-heading"><div><h2>Campaign calendar</h2><p>Announcements are message-only · checkout applies the eligible automatic offer with the greatest savings</p></div></div>
          {data.promotions.map((offer) => {
            const quantityRule = toQuantityPromotionRule(offer)
            const orderValueRule = toOrderValuePromotionRule(offer)
            return (
              <article key={offer.id}>
                <div>
                  <Status value={offer.status} /><h3>{offer.title}</h3><p>{offer.description}</p>
                  {quantityRule && <p className="promotion-preview promotion-preview--compact"><Gift /> {describeQuantityPromotion(quantityRule, nameLookup)}</p>}
                  {orderValueRule && <p className="promotion-preview promotion-preview--compact"><Gift /> {describeOrderValuePromotion(orderValueRule)}</p>}
                  {!quantityRule && !orderValueRule && <p className="promotion-preview promotion-preview--compact"><Gift /> Promotional announcement · message only</p>}
                  <small>{new Date(offer.starts_at).toLocaleString()} – {new Date(offer.ends_at).toLocaleString()}</small>
                </div>
                <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(offer)}>{offer.enabled ? 'Disable' : 'Enable'}</button>
              </article>
            )
          })}
          {data.promotions.length === 0 && <p className="empty-copy">No offers yet.</p>}
        </aside>
      </div>
    </>
  )
}

function TeamManager({
  data,
  onInvited,
}: {
  data: RestaurantPortalData
  onInvited: () => void
}) {
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const invitation = useMutation({
    mutationFn: () => api<{ invite_path: string }>('/api/portal/team/invitations', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
    onSuccess: (result) => {
      setInviteUrl(new URL(result.invite_path, window.location.origin).toString())
      setEmail('')
      setCopied(false)
      onInvited()
    },
  })

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  return (
    <>
      <div className="portal-title"><div><span className="portal-kicker">Restaurant access</span><h1>Team members</h1><p>Every user has an individual account linked to {data.restaurant.name}.</p></div></div>
      <div className="team-layout">
        <section className="panel team-members">
          <div className="panel-heading"><div><h2>Registered users</h2><p>{data.team_members.length} active team member{data.team_members.length === 1 ? '' : 's'}</p></div><Users /></div>
          {data.team_members.map((member) => (
            <article key={member.id}>
              <span>{member.display_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
              <p><strong>{member.display_name}</strong><small>{member.email}</small></p>
              <Status value={member.role} />
            </article>
          ))}
        </section>
        <aside className="panel team-invite">
          <div className="panel-heading"><div><h2>Invite a colleague</h2><p>The secure link expires after 7 days.</p></div><UserPlus /></div>
          {data.current_user_role === 'owner' ? (
            <form onSubmit={(event) => { event.preventDefault(); setInviteUrl(''); invitation.mutate() }}>
              <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@example.com" /></label>
              <button className="portal-primary" disabled={invitation.isPending}><Send /> Create invitation</button>
              {invitation.error && <p className="form-error">{invitation.error.message}</p>}
            </form>
          ) : <p className="empty-copy">Only the restaurant owner can invite team members.</p>}
          {inviteUrl && (
            <div className="team-invite__link">
              <label>Shareable registration link<input value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
              <button type="button" onClick={copyLink}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy link'}</button>
            </div>
          )}
          {data.team_invitations.some((item) => !item.accepted_at) && (
            <div className="pending-invites"><strong>Pending invitations</strong>{data.team_invitations.filter((item) => !item.accepted_at).map((item) => <p key={item.id}><span>{item.email}</span><small>Expires {new Date(item.expires_at).toLocaleDateString('en-GB')}</small></p>)}</div>
          )}
        </aside>
      </div>
    </>
  )
}

export function AdminPortal() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const { data, error } = useQuery({ queryKey: ['admin-reviews'], queryFn: () => api<AdminData>('/api/admin/reviews') })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] })
  const approveMenu = useMutation({ mutationFn: (id: string) => api(`/api/admin/menu-reviews/${id}/approve`, { method: 'POST' }), onSuccess: refresh })
  const approveProfile = useMutation({ mutationFn: (id: string) => api(`/api/admin/profile-reviews/${id}/approve`, { method: 'POST' }), onSuccess: refresh })
  const invite = useMutation({
    mutationFn: () => api<{ invite_path: string }>('/api/admin/invitations', { method: 'POST', body: JSON.stringify({ restaurant_name: restaurantName, email }) }),
    onSuccess: (result) => {
      setInviteUrl(new URL(result.invite_path, window.location.origin).toString())
      setCopyStatus('idle')
      setRestaurantName('')
      setEmail('')
      refresh()
    },
  })
  const resetPoc = useMutation({
    mutationFn: () => api('/api/admin/poc/reset', {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'RESET POC' }),
    }),
    onSuccess: () => {
      setInviteUrl('')
      queryClient.invalidateQueries()
    },
  })
  const pendingMenus = useMemo(() => data?.menu_reviews.filter((review) => review.status === 'pending_review' && review.name.toLowerCase().includes(query.toLowerCase())) ?? [], [data, query])
  const pendingProfiles = data?.profile_reviews.filter((review) => review.status === 'pending_review') ?? []

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  function confirmReset() {
    const confirmed = window.confirm(
      'Reset all POC restaurants, menus, submissions, invitations, orders and reports to the original demo baseline?',
    )
    if (confirmed) resetPoc.mutate()
  }

  return (
    <div className="admin-page">
      <header className="admin-header"><PortalBrand /><div><Link to="/restaurant-portal">Restaurant view</Link><SignOutButton /><span>HA</span></div></header>
      <main className="admin-content">
        <div className="portal-title">
          <div><span className="portal-kicker">Halal Delivery operations · Netherlands</span><h1>Catalogue approval centre</h1><p>Review partner changes before they reach customers.</p></div>
          <div className="portal-title__actions">
            <button className="portal-danger" disabled={resetPoc.isPending} onClick={confirmReset}><RotateCcw /> {resetPoc.isPending ? 'Resetting...' : 'Reset POC data'}</button>
            <button className="portal-secondary" onClick={() => refresh()}><RefreshCw /> Refresh</button>
          </div>
        </div>
        {resetPoc.isSuccess && <p className="form-success admin-feedback"><Check /> POC data restored to the original baseline.</p>}
        {resetPoc.error && <p className="form-error admin-feedback">{resetPoc.error.message}</p>}
        {error && <div className="portal-state portal-state--error">{error.message} <Link className="portal-login-link" to="/login">Sign in</Link></div>}
        <div className="admin-metrics">
          <article><Clock3 /><p><strong>{pendingMenus.length + pendingProfiles.length}</strong><span>Awaiting review</span></p></article>
          <article><Building2 /><p><strong>{data?.invitations.length ?? 0}</strong><span>Invitations sent</span></p></article>
          <article><ShieldCheck /><p><strong>100%</strong><span>Approval gated</span></p></article>
        </div>
        <div className="admin-layout">
          <section className="panel review-panel">
            <div className="panel-heading"><div><h2>Menu submissions</h2><p>Mandatory fields passed automated validation</p></div><label className="review-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" /></label></div>
            <div className="review-list">
              {pendingMenus.map((review) => (
                <article key={review.id}>
                  <img src={review.image_url} alt="" />
                  <div className="review-copy"><span>{review.restaurant_name} · {review.category_name}</span><h3>{review.name}</h3><p>{review.description}</p><small>{money.format(review.price_cents / 100)} · VAT {review.vat_rate}% · {review.allergens.length ? review.allergens.join(', ') : 'No declared allergens'}</small></div>
                  <button className="approve-button" disabled={approveMenu.isPending} onClick={() => approveMenu.mutate(review.id)}><Check /> Approve & publish</button>
                </article>
              ))}
              {pendingMenus.length === 0 && <p className="empty-copy">No menu items are waiting for review.</p>}
            </div>
          </section>
          <aside>
            {data && <CommercialTerms terms={data.commercial_terms} onSaved={refresh} />}
            <section className="panel invite-panel">
              <div className="panel-heading"><div><h2>Invite restaurant</h2><p>Secure links expire after 7 days.</p></div><Mail /></div>
              <form onSubmit={(event) => { event.preventDefault(); setInviteUrl(''); invite.mutate() }}>
                <label>Restaurant name<input required minLength={3} value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} /></label>
                <label>Owner email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                <button className="portal-primary" disabled={invite.isPending}><Send /> Send invitation</button>
              </form>
              {invite.error && <p className="form-error">{invite.error.message}</p>}
              {inviteUrl && (
                <div className="invite-result">
                  <div><Check /><strong>Invitation created</strong></div>
                  <label>
                    Shareable invitation link
                    <span>
                      <input value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                      <button type="button" onClick={copyInviteLink}>
                        {copyStatus === 'copied' ? <Check /> : <Copy />}
                        {copyStatus === 'copied' ? 'Copied' : 'Copy'}
                      </button>
                    </span>
                  </label>
                  {copyStatus === 'failed' && <p>Copying was blocked by the browser. Select the URL and copy it manually.</p>}
                </div>
              )}
            </section>
            <section className="panel profile-reviews">
              <div className="panel-heading"><div><h2>Profile changes</h2><p>Logos, identity and addresses</p></div></div>
              {pendingProfiles.map((review) => <article key={review.id}><div className="profile-review-logo"><img src={review.logo_url} alt="" /></div><p><strong>{review.name}</strong><small>{review.address}</small></p><button onClick={() => approveProfile.mutate(review.id)}><Check /></button></article>)}
              {pendingProfiles.length === 0 && <p className="empty-copy">No profile changes pending.</p>}
            </section>
          </aside>
        </div>
        <MonthlyReport />
      </main>
    </div>
  )
}

function CommercialTerms({
  terms,
  onSaved,
}: {
  terms: AdminData['commercial_terms']
  onSaved: () => void
}) {
  return (
    <section className="panel commercial-panel">
      <div className="panel-heading"><div><h2>Restaurant agreements</h2><p>Commission for future paid orders</p></div><Building2 /></div>
      <div className="commercial-list">
        {terms.map((term) => <CommercialTermRow key={term.id} term={term} onSaved={onSaved} />)}
      </div>
      <p className="commercial-note"><ShieldCheck /> Donations and payment fees are recorded separately from these percentages.</p>
    </section>
  )
}

function CommercialTermRow({
  term,
  onSaved,
}: {
  term: AdminData['commercial_terms'][number]
  onSaved: () => void
}) {
  const [percentage, setPercentage] = useState(String(term.commission_bps / 100))
  const mutation = useMutation({
    mutationFn: () => api(`/api/admin/restaurants/${term.restaurant_id}/commercial-terms`, {
      method: 'POST',
      body: JSON.stringify({ commission_percent: Number(percentage) }),
    }),
    onSuccess: onSaved,
  })
  return (
    <div>
      <p><strong>{term.restaurant_name}</strong><small>Effective {new Date(term.effective_from).toLocaleDateString('en-GB')}</small></p>
      <label><input type="number" min="0" max="50" step=".25" value={percentage} onChange={(event) => setPercentage(event.target.value)} /><span>%</span></label>
      <button type="button" disabled={mutation.isPending || Number(percentage) === term.commission_bps / 100} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Saving' : 'Save'}</button>
      {mutation.error && <small className="commercial-error">{mutation.error.message}</small>}
    </div>
  )
}

function MonthlyReport() {
  const [month, setMonth] = useState('2026-08')
  const { data, error, isLoading } = useQuery({
    queryKey: ['monthly-report', month],
    queryFn: () => api<MonthlyReportData>(`/api/admin/reports/monthly?month=${month}`),
  })

  return (
    <section className="report-section" id="monthly-report">
      <div className="report-toolbar">
        <div><span className="portal-kicker">Finance and impact</span><h2>Monthly settlement report</h2><p>Cash received, partner liabilities and customer-selected charity allocations.</p></div>
        <div>
          <label>Report month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <button className="portal-secondary" type="button" onClick={() => window.print()}><Printer /> Print report</button>
        </div>
      </div>
      {isLoading && <div className="portal-state">Preparing monthly ledger...</div>}
      {error && <div className="portal-state portal-state--error">{error.message}</div>}
      {data && (
        <article className="print-report">
          <header className="print-report__header">
            <PortalBrand />
            <div><strong>Monthly sales & donation settlement</strong><span>Period: {new Date(`${data.month}-02`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span><small>Generated {new Date(data.generated_at).toLocaleString('en-GB')}</small></div>
          </header>
          <div className="report-note"><ShieldCheck /><p><strong>Ledger basis</strong>Halal Delivery received the full customer payment. Restaurant and charity amounts below are liabilities awaiting controlled settlement, not platform revenue.</p></div>
          <div className="report-summary">
            <div><span>Paid orders</span><strong>{data.summary.order_count}</strong></div>
            <div><span>Gross sales received</span><strong>{money.format(data.summary.gross_cents / 100)}</strong></div>
            <div><span>Promotion savings</span><strong>{money.format((data.summary.promotion_discount_cents + data.summary.delivery_discount_cents) / 100)}</strong></div>
            <div><span>Owed to restaurants</span><strong>{money.format(data.summary.restaurant_payable_cents / 100)}</strong></div>
            <div><span>Charity payable</span><strong>{money.format(data.summary.donation_total_cents / 100)}</strong></div>
            <div><span>Contracted commission</span><strong>{money.format(data.summary.platform_fee_cents / 100)}</strong></div>
            <div><span>Payment fees</span><strong>{money.format(data.summary.payment_fee_cents / 100)}</strong></div>
            <div className="report-summary__net"><span>Net retained after donation & fees</span><strong>{money.format(data.summary.platform_net_cents / 100)}</strong></div>
          </div>

          <ReportTable title="Charity settlement schedule" subtitle="Customer choices aggregated for month-end payment">
            <table>
              <thead><tr><th>Organisation</th><th>Area</th><th>Orders</th><th>Amount due</th><th>Status</th></tr></thead>
              <tbody>{data.charity_breakdown.map((charity) => <tr key={charity.id}><td><strong>{charity.name}</strong></td><td>{charity.area}</td><td>{charity.contributing_orders}</td><td>{money.format(charity.amount_cents / 100)}</td><td><Status value={charity.payout_status} /></td></tr>)}</tbody>
              <tfoot><tr><td colSpan={3}>Total charity liability</td><td>{money.format(data.summary.donation_total_cents / 100)}</td><td /></tr></tfoot>
            </table>
          </ReportTable>

          <ReportTable title="Restaurant sales split" subtitle="Gross order value, commission and resulting restaurant payable">
            <table>
              <thead><tr><th>Restaurant</th><th>Orders</th><th>Agreed rate</th><th>Gross sales</th><th>Commission</th><th>Restaurant owed</th></tr></thead>
              <tbody>{data.restaurant_breakdown.map((restaurant) => <tr key={restaurant.id}><td><strong>{restaurant.name}</strong></td><td>{restaurant.order_count}</td><td>{restaurant.minimum_commission_bps === restaurant.maximum_commission_bps ? `${restaurant.minimum_commission_bps / 100}%` : `${restaurant.minimum_commission_bps / 100}–${restaurant.maximum_commission_bps / 100}%`}</td><td>{money.format(restaurant.gross_cents / 100)}</td><td>{money.format(restaurant.platform_fee_cents / 100)}</td><td>{money.format(restaurant.payable_cents / 100)}</td></tr>)}</tbody>
            </table>
          </ReportTable>

          <ReportTable title="Order audit trail" subtitle="Every charity split remains traceable to its originating paid order">
            <table className="order-ledger">
              <thead><tr><th>Date / order</th><th>Restaurant</th><th>Promotion</th><th>Gross</th><th>Rate</th><th>Restaurant owed</th><th>Commission</th><th>Donation allocation</th></tr></thead>
              <tbody>{data.orders.map((order) => <tr key={order.id}><td>{new Date(order.paid_at).toLocaleDateString('en-GB')}<small>{order.order_number}</small></td><td>{order.restaurant_name}</td><td>{order.applied_promotion_title ? <><strong>{order.applied_promotion_title}</strong><small>− {money.format((order.promotion_discount_cents + order.delivery_discount_cents) / 100)}</small></> : <small>None</small>}</td><td>{money.format(order.gross_cents / 100)}</td><td>{order.commission_bps / 100}%</td><td>{money.format(order.restaurant_payable_cents / 100)}</td><td>{money.format(order.platform_fee_cents / 100)}</td><td>{order.donations.length ? order.donations.map((donation) => <small key={donation.charity_name}>{donation.charity_name}: {money.format(donation.amount_cents / 100)}</small>) : <small>No donation selected</small>}</td></tr>)}</tbody>
            </table>
          </ReportTable>

          <footer className="report-signoff"><div><span>Prepared by</span><i /></div><div><span>Approved for payout by</span><i /></div><div><span>Payment references</span><i /></div></footer>
        </article>
      )}
    </section>
  )
}

function ReportTable({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return <section className="report-table"><div><h3>{title}</h3><p>{subtitle}</p></div><div className="report-table__scroll">{children}</div></section>
}

export function InvitationPage() {
  const { token } = useParams({ strict: false }) as { token: string }
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const invitation = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<{
      email: string
      role: 'owner' | 'member'
      restaurant_name: string
      expires_at: string
    }>(`/api/auth/invitations/${token}`),
    retry: false,
  })
  const registration = useMutation({
    mutationFn: () => api<{ redirect_to: string }>(`/api/auth/invitations/${token}/register`, {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName, password }),
    }),
    onSuccess: (result) => {
      window.location.href = result.redirect_to
    },
  })
  const passwordsMatch = password === confirmPassword

  return (
    <main className="invite-page">
      <PortalBrand />
      <section>
        <span className="metric-icon"><Store /></span>
        {invitation.isLoading && <p>Checking your secure invitation...</p>}
        {invitation.error && <div className="form-error">{invitation.error.message}</div>}
        {invitation.data && (
          <>
            <span className="portal-kicker">{invitation.data.role === 'owner' ? 'Restaurant onboarding' : 'Team invitation'}</span>
            <h1>Join {invitation.data.restaurant_name}</h1>
            <p>Create your individual Halal Delivery account. Your access will be registered against this restaurant.</p>
            <form className="registration-form" onSubmit={(event) => { event.preventDefault(); if (passwordsMatch) registration.mutate() }}>
              <label>Email address<input value={invitation.data.email} readOnly /></label>
              <label>Your full name<input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>
              <label>Choose a password<input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label>
              <label>Confirm password<input required minLength={12} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
              <small>At least 12 characters including upper-case, lower-case, a number and a symbol.</small>
              {!passwordsMatch && confirmPassword && <p className="form-error">The passwords do not match.</p>}
              {registration.error && <p className="form-error">{registration.error.message}</p>}
              <button className="portal-primary" disabled={registration.isPending || !passwordsMatch}>Create account & continue <ChevronRight /></button>
            </form>
            <small>Invitation expires {new Date(invitation.data.expires_at).toLocaleDateString('en-GB')}.</small>
          </>
        )}
      </section>
    </main>
  )
}
