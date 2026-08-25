import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { hash, verify } from '@node-rs/argon2'
import { OAuth2Client } from 'google-auth-library'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ensureSchema, sql } from './db.js'
import { resetPocData } from './reset-poc.js'
import {
  itemTypes,
  modifierConfigSchema,
  resolveModifierSelections,
  selectedOptionsSchema,
  type ModifierConfig,
  type ResolvedSelection,
} from './modifiers.js'
import {
  selectBestAutomaticPromotion,
  type PromotionOrderLine,
} from '../shared/promotionEngine.js'

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })
await app.register(cookie)
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })
const activeMarket = 'NL'
const sessionCookie = 'halal_delivery_session'
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || null
const googleClient = new OAuth2Client()

const allergens = [
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
] as const

const menuSubmissionSchema = z.object({
  category_id: z.string().uuid(),
  target_item_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(20).max(500),
  price_cents: z.number().int().min(50).max(100_000),
  image_url: z.url(),
  ingredients: z.string().trim().min(3).max(1000),
  allergens: z.array(z.enum(allergens)).max(allergens.length),
  vat_rate: z.union([z.literal(9), z.literal(21)]),
  availability: z.enum(['all_day', 'lunch', 'dinner', 'weekends']),
  item_type: z.enum(itemTypes).default('standard'),
  modifier_config: modifierConfigSchema.default([]),
})

const profileSubmissionSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(30).max(500),
  address: z.string().trim().min(8).max(200),
  logo_url: z.url(),
  landing_image_url: z.url(),
  opening_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closing_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  minimum_order_cents: z.number().int().min(0).max(100_000),
  delivery_fee_cents: z.number().int().min(0).max(10_000),
  free_delivery_threshold_cents: z.number().int().min(0).max(100_000).nullable(),
  service_fee_bps: z.number().int().min(0).max(2_000),
  service_fee_cap_cents: z.number().int().min(0).max(10_000),
})

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  emoji: z.string().trim().min(1).max(16),
})

const promotionScopeSchema = z.object({
  type: z.enum(['all', 'categories', 'items']),
  category_ids: z.array(z.string().uuid()).max(50).default([]),
  item_ids: z.array(z.string().uuid()).max(200).default([]),
})

const promotionRewardScopeSchema = z.object({
  type: z.enum(['same_as_qualifying', 'all', 'categories', 'items']),
  category_ids: z.array(z.string().uuid()).max(50).default([]),
  item_ids: z.array(z.string().uuid()).max(200).default([]),
})

const promotionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(500),
  promotion_type: z.enum([
    'announcement',
    'order_offer',
    'order_value_discount',
    'quantity_discount',
  ]).default('announcement'),
  buy_quantity: z.number().int().min(1).max(20).nullable().default(null),
  reward_quantity: z.number().int().min(1).max(20).nullable().default(null),
  reward_discount_percent: z.number().int().min(1).max(100).nullable().default(null),
  order_discount_type: z.enum(['percentage', 'fixed', 'free_delivery']).nullable().default(null),
  order_discount_value: z.number().int().min(1).max(100_000).nullable().default(null),
  qualifying_scope: promotionScopeSchema.default({ type: 'all', category_ids: [], item_ids: [] }),
  reward_scope: promotionRewardScopeSchema.default({ type: 'same_as_qualifying', category_ids: [], item_ids: [] }),
  minimum_order_cents: z.number().int().min(0).max(100_000).nullable(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  enabled: z.boolean().default(true),
}).refine((value) => new Date(value.ends_at) > new Date(value.starts_at), {
  message: 'End time must be after start time.',
  path: ['ends_at'],
}).refine((value) => (
  value.promotion_type !== 'quantity_discount' ||
  (value.buy_quantity !== null && value.reward_quantity !== null && value.reward_discount_percent !== null)
), {
  message: 'Buy quantity, reward quantity and reward discount are required for a quantity promotion.',
  path: ['buy_quantity'],
}).refine((value) => (
  value.promotion_type !== 'quantity_discount' ||
  (value.order_discount_type === null && value.order_discount_value === null)
), {
  message: 'Quantity offers cannot include an order-value discount.',
  path: ['order_discount_type'],
}).refine((value) => (
  value.promotion_type !== 'order_value_discount' ||
  (
    value.buy_quantity === null &&
    value.reward_quantity === null &&
    value.reward_discount_percent === null &&
    value.order_discount_type !== null
  )
), {
  message: 'Choose one valid order-value discount rule.',
  path: ['order_discount_type'],
}).refine((value) => (
  value.promotion_type !== 'order_value_discount' ||
  (
    (value.order_discount_type === 'percentage' &&
      value.order_discount_value !== null &&
      value.order_discount_value <= 100) ||
    (value.order_discount_type === 'fixed' && value.order_discount_value !== null) ||
    (value.order_discount_type === 'free_delivery' && value.order_discount_value === null)
  )
), {
  message: 'Percentage must be 1-100, fixed discount must be positive, and free delivery has no value.',
  path: ['order_discount_value'],
}).refine((value) => (
  !['announcement', 'order_offer'].includes(value.promotion_type) ||
  (
    value.buy_quantity === null &&
    value.reward_quantity === null &&
    value.reward_discount_percent === null &&
    value.order_discount_type === null &&
    value.order_discount_value === null &&
    value.minimum_order_cents === null
  )
), {
  message: 'Promotional announcements cannot include automatic discount rules or thresholds.',
  path: ['promotion_type'],
}).refine((value) => (
  value.promotion_type !== 'quantity_discount' ||
  value.qualifying_scope.type !== 'categories' ||
  value.qualifying_scope.category_ids.length > 0
), {
  message: 'Choose at least one qualifying category.',
  path: ['qualifying_scope', 'category_ids'],
}).refine((value) => (
  value.promotion_type !== 'quantity_discount' ||
  value.qualifying_scope.type !== 'items' ||
  value.qualifying_scope.item_ids.length > 0
), {
  message: 'Choose at least one qualifying menu item.',
  path: ['qualifying_scope', 'item_ids'],
}).refine((value) => (
  value.promotion_type !== 'quantity_discount' ||
  value.reward_scope.type !== 'categories' ||
  value.reward_scope.category_ids.length > 0
), {
  message: 'Choose at least one reward category.',
  path: ['reward_scope', 'category_ids'],
}).refine((value) => (
  value.promotion_type !== 'quantity_discount' ||
  value.reward_scope.type !== 'items' ||
  value.reward_scope.item_ids.length > 0
), {
  message: 'Choose at least one reward menu item.',
  path: ['reward_scope', 'item_ids'],
})

const invitationSchema = z.object({
  restaurant_name: z.string().trim().min(3).max(120),
  email: z.email(),
})

const passwordSchema = z.string()
  .min(12)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/)

type AuthenticatedUser = {
  id: string
  email: string
  display_name: string
  is_platform_admin: boolean
  email_verified_at: string | null
}

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function getAuthenticatedUser(request: { cookies: Record<string, string | undefined> }) {
  const token = request.cookies[sessionCookie]
  if (!token) return null
  const users = await sql<AuthenticatedUser[]>`
    select users.id, users.email, users.display_name, users.is_platform_admin,
      users.email_verified_at
    from auth_session session
    join app_user users on users.id = session.user_id
    where session.token_hash = ${tokenDigest(token)}
      and session.expires_at > now()
  `
  return users[0] ?? null
}

async function redirectForUser(userId: string, isPlatformAdmin: boolean) {
  if (isPlatformAdmin) return '/admin'
  const memberships = await sql`
    select 1 from restaurant_membership where user_id = ${userId} limit 1
  `
  return memberships.length > 0 ? '/restaurant-portal' : '/restaurants'
}

async function createSession(
  userId: string,
  request: { headers: Record<string, string | string[] | undefined> },
  reply: { setCookie: (name: string, value: string, options: object) => unknown },
) {
  const token = randomBytes(32).toString('base64url')
  await sql`
    insert into auth_session (id, user_id, token_hash, expires_at)
    values (${randomUUID()}, ${userId}, ${tokenDigest(token)}, now() + interval '7 days')
  `
  const secure =
    request.headers.origin?.toString().startsWith('https://') === true ||
    request.headers['x-forwarded-proto'] === 'https'
  reply.setCookie(sessionCookie, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

app.addHook('preHandler', async (request, reply) => {
  const path = request.url.split('?')[0]
  const adminPath = path.startsWith('/api/admin/')
  const portalPath = path.startsWith('/api/portal/')
  const customerPath = path.startsWith('/api/customer/')
  if (!adminPath && !portalPath && !customerPath) return

  const user = await getAuthenticatedUser(request)
  if (!user) {
    return reply.code(401).send({ message: 'Sign in to continue.' })
  }
  if (adminPath && !user.is_platform_admin) {
    return reply.code(403).send({ message: 'Platform administrator access is required.' })
  }
  if (portalPath) {
    const memberships = await sql`
      select restaurant_id from restaurant_membership
      where user_id = ${user.id}
    `
    if (memberships.length === 0) {
      return reply.code(403).send({ message: 'Restaurant membership is required.' })
    }
    const restaurantId = (request.params as { restaurantId?: unknown }).restaurantId
    if (
      typeof restaurantId === 'string' &&
      z.uuid().safeParse(restaurantId).success &&
      !memberships.some((membership) => membership.restaurant_id === restaurantId)
    ) {
      return reply.code(403).send({ message: 'You do not have access to this restaurant.' })
    }
  }
})

app.get('/api/health', async () => ({ status: 'healthy' }))

app.get('/api/auth/me', async (request, reply) => {
  const user = await getAuthenticatedUser(request)
  if (!user) return reply.code(401).send({ message: 'Not signed in.' })
  const memberships = await sql`
    select membership.restaurant_id, membership.role, restaurant.name as restaurant_name
    from restaurant_membership membership
    join restaurant on restaurant.id = membership.restaurant_id
    where membership.user_id = ${user.id}
      and restaurant.market_code = ${activeMarket}
    order by restaurant.name
  `
  return { user, memberships }
})

app.get('/api/auth/config', async () => ({
  google: {
    enabled: googleClientId !== null,
    client_id: googleClientId,
  },
}))

app.post('/api/auth/register', {
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const parsed = z.object({
    display_name: z.string().trim().min(2).max(100),
    email: z.email(),
    password: passwordSchema,
  }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({
      message: 'Use a valid name and email, plus a 12-character password with upper-case, lower-case, number and symbol.',
      issues: parsed.error.issues,
    })
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase()
  const existingUsers = await sql`select id from app_user where lower(email) = ${normalizedEmail}`
  if (existingUsers.length > 0) {
    return reply.code(409).send({ message: 'An account already exists for this email address.' })
  }

  const userId = randomUUID()
  await sql`
    insert into app_user (id, email, display_name, password_hash, is_demo)
    values (
      ${userId}, ${normalizedEmail}, ${parsed.data.display_name},
      ${await hash(parsed.data.password)}, ${process.env.NODE_ENV !== 'production'}
    )
  `
  await createSession(userId, request, reply)
  return {
    status: 'registered',
    redirect_to: '/restaurants',
    email_verified: false,
  }
})

app.post('/api/auth/google', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => {
  if (!googleClientId) {
    return reply.code(503).send({ message: 'Google sign-in has not been configured yet.' })
  }
  const parsed = z.object({ credential: z.string().min(100).max(10_000) }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'The Google sign-in response is invalid.' })
  }

  let payload
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: googleClientId,
    })
    payload = ticket.getPayload()
  } catch {
    return reply.code(401).send({ message: 'Google could not verify this sign-in.' })
  }
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    return reply.code(401).send({ message: 'Google did not provide a verified email address.' })
  }

  const normalizedEmail = payload.email.trim().toLowerCase()
  const result = await sql.begin(async (transaction) => {
    const subjectUsers = await transaction`
      select id, is_platform_admin from app_user where google_subject = ${payload.sub}
    `
    if (subjectUsers[0]) return subjectUsers[0]

    const emailUsers = await transaction`
      select id, is_platform_admin, google_subject
      from app_user where lower(email) = ${normalizedEmail}
    `
    if (emailUsers[0]) {
      if (emailUsers[0].google_subject && emailUsers[0].google_subject !== payload.sub) {
        return null
      }
      await transaction`
        update app_user
        set google_subject = ${payload.sub}, email_verified_at = coalesce(email_verified_at, now())
        where id = ${emailUsers[0].id}
      `
      return emailUsers[0]
    }

    const userId = randomUUID()
    await transaction`
      insert into app_user (
        id, email, display_name, google_subject, email_verified_at, is_demo
      )
      values (
        ${userId}, ${normalizedEmail}, ${payload.name?.trim() || normalizedEmail.split('@')[0]},
        ${payload.sub}, now(), ${process.env.NODE_ENV !== 'production'}
      )
    `
    return { id: userId, is_platform_admin: false }
  })
  if (!result) {
    return reply.code(409).send({ message: 'This email address is linked to another Google identity.' })
  }

  await createSession(result.id, request, reply)
  return {
    status: 'signed_in',
    redirect_to: await redirectForUser(result.id, result.is_platform_admin),
    email_verified: true,
  }
})

app.post('/api/auth/login', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(128) }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'Enter a valid email address and password.' })
  }
  const normalizedEmail = parsed.data.email.trim().toLowerCase()
  const users = await sql`
    select id, password_hash, is_platform_admin
    from app_user where lower(email) = ${normalizedEmail}
  `
  const user = users[0]
  if (!user || !user.password_hash || !(await verify(user.password_hash, parsed.data.password))) {
    return reply.code(401).send({ message: 'Email address or password is incorrect.' })
  }
  await createSession(user.id, request, reply)
  return {
    status: 'signed_in',
    redirect_to: await redirectForUser(user.id, user.is_platform_admin),
  }
})

app.post('/api/auth/logout', async (request, reply) => {
  const token = request.cookies[sessionCookie]
  if (token) await sql`delete from auth_session where token_hash = ${tokenDigest(token)}`
  reply.clearCookie(sessionCookie, { path: '/' })
  return { status: 'signed_out' }
})

app.get('/api/auth/invitations/:token', async (request, reply) => {
  const { token } = request.params as { token: string }
  const invitations = await sql`
    select invitation.email, invitation.role, invitation.expires_at,
      invitation.accepted_at, restaurant.name as restaurant_name
    from restaurant_invitation invitation
    join restaurant on restaurant.id = invitation.restaurant_id
    where invitation.token_hash = ${tokenDigest(token)}
      and invitation.market_code = ${activeMarket}
  `
  const invitation = invitations[0]
  if (!invitation || invitation.accepted_at || new Date(invitation.expires_at) <= new Date()) {
    return reply.code(410).send({ message: 'This invitation is invalid, expired or already used.' })
  }
  return invitation
})

app.post('/api/auth/invitations/:token/register', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const { token } = request.params as { token: string }
  const parsed = z.object({
    display_name: z.string().trim().min(2).max(100),
    password: passwordSchema,
  }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({
      message: 'Use at least 12 characters with upper-case, lower-case, number and symbol.',
      issues: parsed.error.issues,
    })
  }

  const passwordHash = await hash(parsed.data.password)
  const registration = await sql.begin(async (transaction) => {
    const invitations = await transaction`
      select * from restaurant_invitation
      where token_hash = ${tokenDigest(token)}
        and market_code = ${activeMarket}
      for update
    `
    const invitation = invitations[0]
    if (!invitation || invitation.accepted_at || new Date(invitation.expires_at) <= new Date()) {
      return { error: 'invalid' as const }
    }
    const existingUsers = await transaction`select id from app_user where email = ${invitation.email}`
    if (existingUsers.length > 0) return { error: 'existing' as const }

    const userId = randomUUID()
    await transaction`
      insert into app_user (id, email, display_name, password_hash)
      values (${userId}, ${invitation.email}, ${parsed.data.display_name}, ${passwordHash})
    `
    await transaction`
      insert into restaurant_membership (user_id, restaurant_id, role)
      values (${userId}, ${invitation.restaurant_id}, ${invitation.role})
    `
    await transaction`
      update restaurant_invitation set accepted_at = now() where id = ${invitation.id}
    `
    return { userId }
  })

  if ('error' in registration) {
    const message = registration.error === 'existing'
      ? 'An account already exists for this email address.'
      : 'This invitation is invalid, expired or already used.'
    return reply.code(409).send({ message })
  }
  await createSession(registration.userId, request, reply)
  return { status: 'registered', redirect_to: '/restaurant-portal' }
})

app.get('/api/location/geocode', async (request, reply) => {
  const parsed = z.object({ query: z.string().trim().min(5).max(200) }).safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'Enter a complete Dutch delivery address.' })
  }

  const url = new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free')
  url.searchParams.set('q', parsed.data.query)
  url.searchParams.set('rows', '1')
  url.searchParams.set('fq', 'type:adres')
  url.searchParams.set('fl', 'weergavenaam,centroide_ll')
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) {
    return reply.code(502).send({ message: 'The Dutch address service is temporarily unavailable.' })
  }

  const result = await response.json() as {
    response?: { docs?: Array<{ weergavenaam?: string; centroide_ll?: string }> }
  }
  const address = result.response?.docs?.[0]
  const coordinates = address?.centroide_ll?.match(
    /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/,
  )
  if (!address?.weergavenaam || !coordinates) {
    return reply.code(404).send({
      message: 'We could not find that address. Include the street, house number and city.',
    })
  }

  return {
    label: address.weergavenaam,
    longitude: Number(coordinates[1]),
    latitude: Number(coordinates[2]),
  }
})

app.get('/api/discovery', async () => {
  const [restaurantRows, categoryRows, itemRows, offerRows, charityRows] = await Promise.all([
    sql`
      select restaurant.id, restaurant.name, restaurant.slug, restaurant.description,
        restaurant.address, restaurant.area, restaurant.cuisine,
        case
          when restaurant.review_count + count(review.id) = 0 then restaurant.rating::float
          else round(
            (
              restaurant.rating * restaurant.review_count + coalesce(sum(review.rating), 0)
            ) / (restaurant.review_count + count(review.id)),
            1
          )::float
        end as rating,
        (restaurant.review_count + count(review.id))::int as review_count,
        restaurant.delivery_minutes, restaurant.delivery_fee_cents,
        restaurant.minimum_order_cents, restaurant.free_delivery_threshold_cents,
        restaurant.service_fee_bps, restaurant.service_fee_cap_cents,
        restaurant.opening_time::text, restaurant.closing_time::text,
        restaurant.image_url, restaurant.logo_url, restaurant.landing_image_url,
        restaurant.latitude, restaurant.longitude, restaurant.delivery_radius_km,
        restaurant.halal_status, restaurant.is_open, restaurant.charity_id,
        restaurant.business_type, restaurant.service_modes,
        (
          restaurant.is_open
          and (
            (restaurant.opening_time <= restaurant.closing_time
              and localtime >= restaurant.opening_time and localtime < restaurant.closing_time)
            or (restaurant.opening_time > restaurant.closing_time
              and (localtime >= restaurant.opening_time or localtime < restaurant.closing_time))
          )
        ) as accepting_orders
      from restaurant
      left join customer_order_review review
        on review.restaurant_id = restaurant.id and review.status = 'published'
      where restaurant.market_code = ${activeMarket}
        and restaurant.onboarding_status = 'active'
      group by restaurant.id
      order by restaurant.is_open desc, rating desc
    `,
    sql`
      select id, restaurant_id, name, emoji, display_order
      from menu_category
      order by display_order
    `,
    sql`
      select id, category_id, name, description, price_cents, popular, image_url,
        ingredients, allergens, vat_rate::float, availability, item_type, modifier_config
      from menu_item
      order by popular desc, name
    `,
    sql`
      select id, restaurant_id, title, description, promotion_type, buy_quantity, reward_quantity,
        reward_discount_percent, qualifying_scope_type, qualifying_category_ids, qualifying_item_ids,
        reward_scope_type, reward_category_ids, reward_item_ids,
        order_discount_type, order_discount_value,
        minimum_order_cents, starts_at, ends_at, enabled,
        'active' as status
      from restaurant_promotion
      where enabled = true
        and starts_at <= now()
        and ends_at >= now()
      order by starts_at desc, id
    `,
    sql`
      select id, name, summary, area, focus, image_url
      from charity
      where market_code = ${activeMarket}
      order by name
    `,
  ])

  const itemsByCategory = Map.groupBy(itemRows, (item) => item.category_id)
  const categoriesByRestaurant = Map.groupBy(categoryRows, (category) => category.restaurant_id)
  const offersByRestaurant = Map.groupBy(offerRows, (offer) => offer.restaurant_id)

  return {
    restaurants: restaurantRows.map((restaurant) => ({
      ...restaurant,
      menu: (categoriesByRestaurant.get(restaurant.id) ?? []).map((category) => ({
        ...category,
        items: itemsByCategory.get(category.id) ?? [],
      })),
      offers: (offersByRestaurant.get(restaurant.id) ?? []).map(({ restaurant_id: _restaurantId, ...offer }) => offer),
    })),
    charities: charityRows,
  }
})

app.get('/api/restaurants/:slug/storefront', async (request, reply) => {
  const parsed = z.object({
    slug: z.string().regex(/^[a-z0-9-]{2,160}$/),
  }).safeParse(request.params)
  if (!parsed.success) return reply.code(400).send({ message: 'Invalid restaurant address.' })

  const restaurants = await sql`
    select restaurant.id, restaurant.name, restaurant.slug, restaurant.description,
      restaurant.address, restaurant.area, restaurant.cuisine,
      case
        when restaurant.review_count + count(review.id) = 0 then restaurant.rating::float
        else round((
          restaurant.rating * restaurant.review_count + coalesce(sum(review.rating), 0)
        ) / (restaurant.review_count + count(review.id)), 1)::float
      end as rating,
      (restaurant.review_count + count(review.id))::int as review_count,
      restaurant.delivery_minutes, restaurant.delivery_fee_cents,
      restaurant.minimum_order_cents, restaurant.free_delivery_threshold_cents,
      restaurant.service_fee_bps, restaurant.service_fee_cap_cents,
      restaurant.opening_time::text, restaurant.closing_time::text,
      restaurant.image_url, restaurant.logo_url, restaurant.landing_image_url,
      restaurant.halal_status, restaurant.is_open, restaurant.charity_id,
      (
        restaurant.is_open
        and (
          (restaurant.opening_time <= restaurant.closing_time
            and localtime >= restaurant.opening_time and localtime < restaurant.closing_time)
          or (restaurant.opening_time > restaurant.closing_time
            and (localtime >= restaurant.opening_time or localtime < restaurant.closing_time))
        )
      ) as accepting_orders
    from restaurant
    left join customer_order_review review
      on review.restaurant_id = restaurant.id and review.status = 'published'
    where restaurant.slug = ${parsed.data.slug}
      and restaurant.market_code = ${activeMarket}
      and restaurant.onboarding_status = 'active'
    group by restaurant.id
  `
  const restaurant = restaurants[0]
  if (!restaurant) return reply.code(404).send({ message: 'Restaurant not found.' })

  const [categoryRows, itemRows, reviewRows, offerRows, charityRows] = await Promise.all([
    sql`
      select id, name, emoji, display_order
      from menu_category where restaurant_id = ${restaurant.id}
      order by display_order, name
    `,
    sql`
      select item.id, item.category_id, item.name, item.description, item.price_cents,
        item.popular, item.image_url, item.ingredients, item.allergens,
        item.vat_rate::float, item.availability, item.item_type, item.modifier_config,
        (
          item.availability = 'all_day'
          or (item.availability = 'lunch' and localtime >= time '11:00' and localtime < time '15:00')
          or (item.availability = 'dinner' and localtime >= time '16:00' and localtime < time '23:59')
          or (item.availability = 'weekends' and extract(isodow from current_date) in (6, 7))
        ) as is_available
      from menu_item item
      join menu_category category on category.id = item.category_id
      where category.restaurant_id = ${restaurant.id}
      order by item.popular desc, item.name
    `,
    sql`
      select review.id, review.rating, review.comment, review.created_at,
        users.display_name, orders.order_number
      from customer_order_review review
      join app_user users on users.id = review.customer_user_id
      join customer_order orders on orders.id = review.order_id
      where review.restaurant_id = ${restaurant.id} and review.status = 'published'
      order by review.created_at desc
      limit 20
    `,
    sql`
      select id, title, description, promotion_type, buy_quantity, reward_quantity,
        reward_discount_percent, qualifying_scope_type, qualifying_category_ids, qualifying_item_ids,
        reward_scope_type, reward_category_ids, reward_item_ids,
        order_discount_type, order_discount_value,
        minimum_order_cents, starts_at, ends_at, enabled,
        'active' as status
      from restaurant_promotion
      where restaurant_id = ${restaurant.id}
        and enabled = true
        and starts_at <= now()
        and ends_at >= now()
      order by starts_at desc, id
    `,
    sql`
      select id, name, summary, area, focus, image_url
      from charity where market_code = ${activeMarket} order by name
    `,
  ])
  const itemsByCategory = Map.groupBy(itemRows, (item) => item.category_id)
  return {
    restaurant: {
      ...restaurant,
      menu: categoryRows.map((category) => ({
        ...category,
        items: itemsByCategory.get(category.id) ?? [],
      })),
      reviews: reviewRows,
      offers: offerRows,
    },
    charities: charityRows,
  }
})

app.get('/api/portal/me', async (request, reply) => {
  const user = await getAuthenticatedUser(request)
  if (!user) return reply.code(401).send({ message: 'Sign in to continue.' })
  const memberships = await sql`
    select restaurant_id, role from restaurant_membership
    where user_id = ${user.id}
    order by created_at
    limit 1
  `
  const membership = memberships[0]
  if (!membership) return reply.code(403).send({ message: 'Restaurant membership is required.' })
  const restaurantId = membership.restaurant_id

  const [restaurants, categories, menuItems, revisions, profileRevisions, teamMembers, teamInvitations, promotions] = await Promise.all([
    sql`
      select id, name, description, address, logo_url, image_url, landing_image_url,
        opening_time::text, closing_time::text, minimum_order_cents, delivery_fee_cents,
        free_delivery_threshold_cents, service_fee_bps, service_fee_cap_cents, halal_status
      from restaurant where id = ${restaurantId}
        and market_code = ${activeMarket}
    `,
    sql`
      select c.id, c.name, c.emoji, count(i.id)::int as published_item_count
      from menu_category c
      left join menu_item i on i.category_id = c.id
      where c.restaurant_id = ${restaurantId}
      group by c.id, c.name, c.display_order
      order by c.display_order
    `,
    sql`
      select item.id, item.category_id, item.name, item.price_cents
      from menu_item item
      join menu_category category on category.id = item.category_id
      where category.restaurant_id = ${restaurantId}
      order by category.display_order, item.name
    `,
    sql`
      select r.*, c.name as category_name
      from menu_item_revision r
      join menu_category c on c.id = r.category_id
      where r.restaurant_id = ${restaurantId}
      order by r.submitted_at desc
    `,
    sql`
      select * from restaurant_profile_revision
      where restaurant_id = ${restaurantId}
      order by submitted_at desc
    `,
    sql`
      select users.id, users.display_name, users.email, membership.role, membership.created_at
      from restaurant_membership membership
      join app_user users on users.id = membership.user_id
      where membership.restaurant_id = ${restaurantId}
      order by membership.created_at
    `,
    sql`
      select id, email, role, expires_at, accepted_at, created_at
      from restaurant_invitation
      where restaurant_id = ${restaurantId} and role = 'member'
      order by created_at desc
    `,
    sql`
      select id, title, description, promotion_type, buy_quantity, reward_quantity,
        reward_discount_percent, qualifying_scope_type, qualifying_category_ids, qualifying_item_ids,
        reward_scope_type, reward_category_ids, reward_item_ids,
        order_discount_type, order_discount_value,
        minimum_order_cents, starts_at, ends_at, enabled,
        case
          when not enabled then 'disabled'
          when starts_at > now() then 'upcoming'
          when ends_at < now() then 'expired'
          else 'active'
        end as status
      from restaurant_promotion
      where restaurant_id = ${restaurantId}
      order by starts_at desc, id
    `,
  ])

  if (restaurants.length === 0) {
    return reply.code(404).send({ message: 'Restaurant not found.' })
  }

  return {
    restaurant: restaurants[0],
    categories,
    menu_items: menuItems,
    revisions,
    profile_revisions: profileRevisions,
    current_user: {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
    },
    current_user_role: membership.role,
    team_members: teamMembers,
    team_invitations: teamInvitations,
    promotions,
  }
})

app.post('/api/portal/restaurants/:restaurantId/categories', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string }
  const parsed = categorySchema.safeParse(request.body)
  if (!z.uuid().safeParse(restaurantId).success || !parsed.success) {
    return reply.code(400).send({ message: 'Enter a category name and one emoji.' })
  }
  const duplicates = await sql`
    select id from menu_category
    where restaurant_id = ${restaurantId} and lower(name) = lower(${parsed.data.name})
  `
  if (duplicates.length > 0) {
    return reply.code(409).send({ message: 'A category with this name already exists.' })
  }
  const orderRows = await sql`
    select coalesce(max(display_order), -1)::int + 1 as next_order
    from menu_category where restaurant_id = ${restaurantId}
  `
  const id = randomUUID()
  await sql`
    insert into menu_category (id, restaurant_id, name, emoji, display_order)
    values (${id}, ${restaurantId}, ${parsed.data.name}, ${parsed.data.emoji}, ${orderRows[0].next_order})
  `
  return reply.code(201).send({ id, ...parsed.data })
})

app.patch('/api/portal/restaurants/:restaurantId/categories/:categoryId', async (request, reply) => {
  const { restaurantId, categoryId } = request.params as { restaurantId: string; categoryId: string }
  const parsed = categorySchema.safeParse(request.body)
  if (
    !z.uuid().safeParse(restaurantId).success ||
    !z.uuid().safeParse(categoryId).success ||
    !parsed.success
  ) {
    return reply.code(400).send({ message: 'Enter a category name and one emoji.' })
  }
  const duplicates = await sql`
    select id from menu_category
    where restaurant_id = ${restaurantId} and lower(name) = lower(${parsed.data.name})
      and id <> ${categoryId}
  `
  if (duplicates.length > 0) {
    return reply.code(409).send({ message: 'A category with this name already exists.' })
  }
  const updated = await sql`
    update menu_category set name = ${parsed.data.name}, emoji = ${parsed.data.emoji}
    where id = ${categoryId} and restaurant_id = ${restaurantId}
    returning id
  `
  if (updated.length === 0) return reply.code(404).send({ message: 'Category not found.' })
  return { id: categoryId, ...parsed.data }
})

async function validatePromotionScopesBelongToRestaurant(
  restaurantId: string,
  data: z.infer<typeof promotionSchema>,
): Promise<string | null> {
  const categoryIds = [...data.qualifying_scope.category_ids, ...data.reward_scope.category_ids]
  const itemIds = [...data.qualifying_scope.item_ids, ...data.reward_scope.item_ids]

  if (categoryIds.length > 0) {
    const rows = await sql`
      select count(*)::int as count from menu_category
      where restaurant_id = ${restaurantId} and id = any(${sql.array(categoryIds)}::uuid[])
    `
    if (rows[0].count !== new Set(categoryIds).size) {
      return 'One or more selected categories do not belong to this restaurant.'
    }
  }

  if (itemIds.length > 0) {
    const rows = await sql`
      select count(*)::int as count from menu_item item
      join menu_category category on category.id = item.category_id
      where category.restaurant_id = ${restaurantId} and item.id = any(${sql.array(itemIds)}::uuid[])
    `
    if (rows[0].count !== new Set(itemIds).size) {
      return 'One or more selected menu items do not belong to this restaurant.'
    }
  }

  return null
}

app.post('/api/portal/restaurants/:restaurantId/promotions', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string }
  const parsed = promotionSchema.safeParse(request.body)
  if (!z.uuid().safeParse(restaurantId).success || !parsed.success) {
    return reply.code(400).send({
      message: 'Add a title, description, valid order minimum and an end time after the start.',
      issues: parsed.error?.issues,
    })
  }

  const scopeError = await validatePromotionScopesBelongToRestaurant(restaurantId, parsed.data)
  if (scopeError) return reply.code(400).send({ message: scopeError })

  const id = randomUUID()
  const { qualifying_scope: qualifyingScope, reward_scope: rewardScope } = parsed.data
  await sql`
    insert into restaurant_promotion (
      id, restaurant_id, title, description, promotion_type, buy_quantity, reward_quantity,
      reward_discount_percent, qualifying_scope_type, qualifying_category_ids, qualifying_item_ids,
      reward_scope_type, reward_category_ids, reward_item_ids,
      order_discount_type, order_discount_value, minimum_order_cents,
      starts_at, ends_at, enabled, is_demo
    )
    values (
      ${id}, ${restaurantId}, ${parsed.data.title}, ${parsed.data.description},
      ${parsed.data.promotion_type}, ${parsed.data.buy_quantity}, ${parsed.data.reward_quantity},
      ${parsed.data.reward_discount_percent}, ${qualifyingScope.type},
      ${sql.array(qualifyingScope.category_ids)}::uuid[], ${sql.array(qualifyingScope.item_ids)}::uuid[],
      ${rewardScope.type}, ${sql.array(rewardScope.category_ids)}::uuid[], ${sql.array(rewardScope.item_ids)}::uuid[],
      ${parsed.data.order_discount_type}, ${parsed.data.order_discount_value},
      ${parsed.data.minimum_order_cents}, ${parsed.data.starts_at}, ${parsed.data.ends_at},
      ${parsed.data.enabled}, ${process.env.NODE_ENV !== 'production'}
    )
  `
  return reply.code(201).send({ id, status: 'published' })
})

app.patch('/api/portal/restaurants/:restaurantId/promotions/:promotionId', async (request, reply) => {
  const { restaurantId, promotionId } = request.params as {
    restaurantId: string
    promotionId: string
  }
  const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body)
  if (
    !z.uuid().safeParse(restaurantId).success ||
    !z.uuid().safeParse(promotionId).success ||
    !parsed.success
  ) {
    return reply.code(400).send({ message: 'Choose whether this offer is enabled.' })
  }
  const updated = await sql`
    update restaurant_promotion
    set enabled = ${parsed.data.enabled}, updated_at = now()
    where id = ${promotionId} and restaurant_id = ${restaurantId}
    returning id
  `
  if (updated.length === 0) return reply.code(404).send({ message: 'Offer not found.' })
  return { id: promotionId, enabled: parsed.data.enabled }
})

app.post('/api/portal/restaurants/:restaurantId/menu-items', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string }
  const parsed = menuSubmissionSchema.safeParse(request.body)
  if (!z.uuid().safeParse(restaurantId).success || !parsed.success) {
    return reply.code(400).send({
      message: 'Complete every mandatory menu field before submitting.',
      issues: parsed.error?.issues,
    })
  }

  const categories = await sql`
    select id from menu_category
    where id = ${parsed.data.category_id} and restaurant_id = ${restaurantId}
  `
  if (categories.length === 0) {
    return reply.code(400).send({ message: 'Choose a category owned by this restaurant.' })
  }
  if (parsed.data.target_item_id) {
    const targets = await sql`
      select item.id
      from menu_item item
      join menu_category category on category.id = item.category_id
      where item.id = ${parsed.data.target_item_id}
        and category.restaurant_id = ${restaurantId}
    `
    if (targets.length === 0) {
      return reply.code(400).send({ message: 'The edited menu item does not belong to this restaurant.' })
    }
  }

  const revisionId = randomUUID()
  const item = parsed.data
  await sql`
    insert into menu_item_revision (
      id, restaurant_id, target_item_id, category_id, name, description, price_cents,
      image_url, ingredients, allergens, vat_rate, availability, item_type, modifier_config,
      status
    )
    values (
      ${revisionId}, ${restaurantId}, ${item.target_item_id ?? null}, ${item.category_id},
      ${item.name}, ${item.description}, ${item.price_cents}, ${item.image_url},
      ${item.ingredients}, ${sql.array(item.allergens)}, ${item.vat_rate},
      ${item.availability}, ${item.item_type}, ${sql.json(item.modifier_config)},
      'pending_review'
    )
  `

  return reply.code(201).send({ id: revisionId, status: 'pending_review' })
})

app.post('/api/portal/restaurants/:restaurantId/menu-items/import', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string }
  const importSchema = z.object({
    rows: z.array(
      menuSubmissionSchema.omit({ category_id: true, target_item_id: true }).extend({
        category_name: z.string().trim().min(2),
      }),
    ).min(1).max(250),
  })
  const parsed = importSchema.safeParse(request.body)
  if (!z.uuid().safeParse(restaurantId).success || !parsed.success) {
    return reply.code(400).send({
      message: 'The menu file contains invalid or missing mandatory fields.',
      issues: parsed.error?.issues,
    })
  }

  const categories = await sql`
    select id, lower(name) as normalized_name
    from menu_category where restaurant_id = ${restaurantId}
  `
  const categoryByName = new Map(categories.map((category) => [category.normalized_name, category.id]))
  const unknownCategories = [
    ...new Set(
      parsed.data.rows
        .filter((row) => !categoryByName.has(row.category_name.toLowerCase()))
        .map((row) => row.category_name),
    ),
  ]
  if (unknownCategories.length > 0) {
    return reply.code(400).send({
      message: `Unknown categories: ${unknownCategories.join(', ')}.`,
    })
  }

  await sql.begin(async (transaction) => {
    for (const row of parsed.data.rows) {
      await transaction`
        insert into menu_item_revision (
          id, restaurant_id, category_id, name, description, price_cents, image_url,
          ingredients, allergens, vat_rate, availability, item_type, modifier_config, status
        )
        values (
          ${randomUUID()}, ${restaurantId},
          ${categoryByName.get(row.category_name.toLowerCase())}, ${row.name},
          ${row.description}, ${row.price_cents}, ${row.image_url}, ${row.ingredients},
          ${transaction.array(row.allergens)}, ${row.vat_rate}, ${row.availability},
          ${row.item_type}, ${transaction.json(row.modifier_config)},
          'pending_review'
        )
      `
    }
  })

  return reply.code(201).send({
    imported: parsed.data.rows.length,
    status: 'pending_review',
  })
})

app.post('/api/portal/restaurants/:restaurantId/profile', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string }
  const parsed = profileSubmissionSchema.safeParse(request.body)
  if (!z.uuid().safeParse(restaurantId).success || !parsed.success) {
    return reply.code(400).send({
      message: 'Complete all restaurant profile fields before submitting.',
      issues: parsed.error?.issues,
    })
  }

  const id = randomUUID()
  const profile = parsed.data
  await sql`
    insert into restaurant_profile_revision (
      id, restaurant_id, name, description, address, logo_url, landing_image_url,
      opening_time, closing_time, minimum_order_cents, delivery_fee_cents,
      free_delivery_threshold_cents, service_fee_bps, service_fee_cap_cents, status
    )
    values (
      ${id}, ${restaurantId}, ${profile.name}, ${profile.description},
      ${profile.address}, ${profile.logo_url}, ${profile.landing_image_url},
      ${profile.opening_time}, ${profile.closing_time}, ${profile.minimum_order_cents},
      ${profile.delivery_fee_cents}, ${profile.free_delivery_threshold_cents},
      ${profile.service_fee_bps}, ${profile.service_fee_cap_cents}, 'pending_review'
    )
  `
  return reply.code(201).send({ id, status: 'pending_review' })
})

app.post('/api/portal/team/invitations', async (request, reply) => {
  const user = await getAuthenticatedUser(request)
  if (!user) return reply.code(401).send({ message: 'Sign in to continue.' })
  const parsed = z.object({ email: z.email() }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'Enter a valid email address.' })
  }
  const memberships = await sql`
    select membership.restaurant_id, restaurant.name
    from restaurant_membership membership
    join restaurant on restaurant.id = membership.restaurant_id
    where membership.user_id = ${user.id}
      and membership.role = 'owner'
      and restaurant.market_code = ${activeMarket}
    order by membership.created_at
    limit 1
  `
  const membership = memberships[0]
  if (!membership) {
    return reply.code(403).send({ message: 'Only a restaurant owner can invite team members.' })
  }

  const email = parsed.data.email.trim().toLowerCase()
  const existingUsers = await sql`select id from app_user where email = ${email}`
  if (existingUsers.length > 0) {
    return reply.code(409).send({ message: 'An account already exists for this email address.' })
  }

  const token = randomBytes(32).toString('base64url')
  const id = randomUUID()
  await sql`
    insert into restaurant_invitation (
      id, restaurant_id, restaurant_name, email, role, token_hash, expires_at,
      invited_by_user_id, market_code, is_demo
    )
    values (
      ${id}, ${membership.restaurant_id}, ${membership.name}, ${email}, 'member',
      ${tokenDigest(token)}, now() + interval '7 days', ${user.id}, ${activeMarket}, true
    )
  `
  return reply.code(201).send({
    id,
    invite_path: `/restaurant-invite/${token}`,
    expires_in_days: 7,
  })
})

app.get('/api/admin/reviews', async () => {
  const [menuReviews, profileReviews, invitations, commercialTerms] = await Promise.all([
    sql`
      select r.*, c.name as category_name, restaurant.name as restaurant_name
      from menu_item_revision r
      join menu_category c on c.id = r.category_id
      join restaurant on restaurant.id = r.restaurant_id
      where restaurant.market_code = ${activeMarket}
      order by (r.status = 'pending_review') desc, r.submitted_at desc
    `,
    sql`
      select r.*, restaurant.name as current_restaurant_name
      from restaurant_profile_revision r
      join restaurant on restaurant.id = r.restaurant_id
      where restaurant.market_code = ${activeMarket}
      order by (r.status = 'pending_review') desc, r.submitted_at desc
    `,
    sql`
      select id, restaurant_name, email, expires_at, accepted_at, created_at
      from restaurant_invitation
      where market_code = ${activeMarket}
      order by created_at desc
    `,
    sql`
      select term.id, term.restaurant_id, restaurant.name as restaurant_name,
        term.commission_bps, term.effective_from
      from restaurant_commercial_term term
      join restaurant on restaurant.id = term.restaurant_id
      where term.effective_to is null and restaurant.market_code = ${activeMarket}
      order by restaurant.name
    `,
  ])
  return {
    menu_reviews: menuReviews,
    profile_reviews: profileReviews,
    invitations,
    commercial_terms: commercialTerms,
  }
})

app.post('/api/admin/restaurants/:restaurantId/commercial-terms', async (request, reply) => {
  const { restaurantId } = request.params as { restaurantId: string }
  const parsed = z.object({
    commission_percent: z.number().min(0).max(50),
  }).safeParse(request.body)
  if (!z.uuid().safeParse(restaurantId).success || !parsed.success) {
    return reply.code(400).send({
      message: 'Enter a commission percentage between 0% and 50%.',
      issues: parsed.error?.issues,
    })
  }

  const commissionBps = Math.round(parsed.data.commission_percent * 100)
  const created = await sql.begin(async (transaction) => {
    const restaurants = await transaction`
      select id from restaurant
      where id = ${restaurantId} and market_code = ${activeMarket}
      for update
    `
    if (restaurants.length === 0) return false

    await transaction`
      update restaurant_commercial_term
      set effective_to = now()
      where restaurant_id = ${restaurantId} and effective_to is null
    `
    await transaction`
      insert into restaurant_commercial_term (
        id, restaurant_id, commission_bps, effective_from, created_by, is_demo
      )
      values (
        ${randomUUID()}, ${restaurantId}, ${commissionBps}, now(), 'POC admin', true
      )
    `
    return true
  })

  if (!created) {
    return reply.code(404).send({ message: 'Restaurant not found.' })
  }
  return reply.code(201).send({
    restaurant_id: restaurantId,
    commission_bps: commissionBps,
    effective_from: new Date().toISOString(),
  })
})

app.post('/api/admin/poc/reset', async (request, reply) => {
  if (process.env.NODE_ENV === 'production') {
    return reply.code(404).send({ message: 'POC reset is not available in production.' })
  }
  const parsed = z.object({ confirmation: z.literal('RESET POC') }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'POC reset confirmation is required.' })
  }
  await resetPocData()
  return { status: 'reset', message: 'POC data restored to its original baseline.' }
})

app.get('/api/admin/reports/monthly', async (request, reply) => {
  const parsed = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  }).safeParse(request.query)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'Use a report month in YYYY-MM format.' })
  }

  const periodStart = `${parsed.data.month}-01`
  const [summaryRows, charityRows, restaurantRows, orderRows] = await Promise.all([
    sql`
      select count(*)::int as order_count,
        coalesce(sum(gross_cents), 0)::int as gross_cents,
        coalesce(sum(promotion_discount_cents), 0)::int as promotion_discount_cents,
        coalesce(sum(delivery_discount_cents), 0)::int as delivery_discount_cents,
        coalesce(sum(restaurant_payable_cents), 0)::int as restaurant_payable_cents,
        coalesce(sum(platform_fee_cents), 0)::int as platform_fee_cents,
        coalesce(sum(payment_fee_cents), 0)::int as payment_fee_cents,
        coalesce(sum(donation_total_cents), 0)::int as donation_total_cents
      from customer_order
      where status = 'paid'
        and market_code = ${activeMarket}
        and paid_at >= ${periodStart}::date
        and paid_at < (${periodStart}::date + interval '1 month')
    `,
    sql`
      select charity.id, charity.name, charity.area,
        sum(allocation.amount_cents)::int as amount_cents,
        count(distinct allocation.order_id)::int as contributing_orders,
        coalesce(payout.status, 'due') as payout_status,
        payout.reference
      from order_donation_allocation allocation
      join customer_order orders on orders.id = allocation.order_id
      join charity on charity.id = allocation.charity_id
      left join charity_payout payout
        on payout.charity_id = charity.id
        and payout.period_start = ${periodStart}::date
      where orders.status = 'paid'
        and orders.market_code = ${activeMarket}
        and orders.paid_at >= ${periodStart}::date
        and orders.paid_at < (${periodStart}::date + interval '1 month')
      group by charity.id, charity.name, charity.area, payout.status, payout.reference
      order by amount_cents desc
    `,
    sql`
      select restaurant.id, restaurant.name,
        count(orders.id)::int as order_count,
        sum(orders.gross_cents)::int as gross_cents,
        sum(orders.promotion_discount_cents)::int as promotion_discount_cents,
        sum(orders.delivery_discount_cents)::int as delivery_discount_cents,
        sum(orders.restaurant_payable_cents)::int as payable_cents,
        sum(orders.platform_fee_cents)::int as platform_fee_cents,
        min(orders.commission_bps)::int as minimum_commission_bps,
        max(orders.commission_bps)::int as maximum_commission_bps
      from customer_order orders
      join restaurant on restaurant.id = orders.restaurant_id
      where orders.status = 'paid'
        and orders.market_code = ${activeMarket}
        and orders.paid_at >= ${periodStart}::date
        and orders.paid_at < (${periodStart}::date + interval '1 month')
      group by restaurant.id, restaurant.name
      order by gross_cents desc
    `,
    sql`
      select orders.id, orders.order_number, orders.paid_at, restaurant.name as restaurant_name,
        orders.gross_cents, orders.food_subtotal_before_discount_cents, orders.subtotal_cents,
        orders.promotion_discount_cents, orders.delivery_discount_cents,
        orders.applied_promotion_id, orders.applied_promotion_title, orders.applied_promotion_type,
        orders.delivery_fee_cents,
        orders.service_fee_cents, orders.restaurant_payable_cents, orders.platform_fee_cents,
        orders.commission_bps, orders.payment_fee_cents, orders.donation_total_cents,
        coalesce(
          json_agg(
            json_build_object(
              'charity_name', charity.name,
              'amount_cents', allocation.amount_cents
            )
          ) filter (where charity.id is not null),
          '[]'
        ) as donations
      from customer_order orders
      join restaurant on restaurant.id = orders.restaurant_id
      left join order_donation_allocation allocation on allocation.order_id = orders.id
      left join charity on charity.id = allocation.charity_id
      where orders.status = 'paid'
        and orders.market_code = ${activeMarket}
        and orders.paid_at >= ${periodStart}::date
        and orders.paid_at < (${periodStart}::date + interval '1 month')
      group by orders.id, restaurant.name
      order by orders.paid_at
    `,
  ])

  const summary = summaryRows[0]
  return {
    month: parsed.data.month,
    generated_at: new Date().toISOString(),
    summary: {
      ...summary,
      platform_net_cents:
        summary.platform_fee_cents - summary.payment_fee_cents - summary.donation_total_cents,
    },
    charity_breakdown: charityRows,
    restaurant_breakdown: restaurantRows,
    orders: orderRows,
  }
})

app.get('/api/customer/orders', async (request, reply) => {
  const user = await getAuthenticatedUser(request)
  if (!user) return reply.code(401).send({ message: 'Sign in to view your orders.' })

  const orders = await sql`
    select orders.id, orders.order_number, orders.status, orders.paid_at,
      orders.confirmed_at, orders.confirmation_email_status,
      orders.confirmation_email_sent_at, orders.gross_cents,
      orders.food_subtotal_before_discount_cents, orders.subtotal_cents,
      orders.promotion_discount_cents, orders.delivery_discount_cents,
      orders.applied_promotion_id, orders.applied_promotion_title, orders.applied_promotion_type,
      orders.delivery_fee_cents, orders.service_fee_cents,
      orders.donation_total_cents, orders.payment_method,
      restaurant.id as restaurant_id, restaurant.name as restaurant_name,
      restaurant.image_url as restaurant_image_url,
      coalesce(
        (
          select json_agg(
            json_build_object(
              'name', item.item_name,
              'unit_price_cents', item.unit_price_cents,
              'quantity', item.quantity,
              'selected_options', item.selected_options,
              'note', item.note
            )
            order by item.item_name
          )
          from customer_order_item item
          where item.order_id = orders.id
        ),
        '[]'
      ) as items,
      (
        select json_build_object(
          'rating', review.rating,
          'comment', review.comment,
          'created_at', review.created_at,
          'updated_at', review.updated_at
        )
        from customer_order_review review
        where review.order_id = orders.id
      ) as review,
      (
        orders.confirmed_at is not null
        and orders.confirmation_email_sent_at is not null
      ) as eligible_for_review
    from customer_order orders
    join restaurant on restaurant.id = orders.restaurant_id
    where orders.customer_user_id = ${user.id}
      and orders.market_code = ${activeMarket}
    order by orders.paid_at desc
  `
  return {
    customer: {
      display_name: user.display_name,
      email: user.email,
    },
    orders,
  }
})

app.put('/api/customer/orders/:orderId/review', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const user = await getAuthenticatedUser(request)
  if (!user) return reply.code(401).send({ message: 'Sign in to review an order.' })
  const { orderId } = request.params as { orderId: string }
  const parsed = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(10).max(1000),
  }).safeParse(request.body)
  if (!z.uuid().safeParse(orderId).success || !parsed.success) {
    return reply.code(400).send({
      message: 'Choose a rating from 1 to 5 and write at least 10 characters.',
      issues: parsed.error?.issues,
    })
  }

  const result = await sql.begin(async (transaction) => {
    const orders = await transaction`
      select id, restaurant_id, confirmed_at, confirmation_email_sent_at
      from customer_order
      where id = ${orderId}
        and customer_user_id = ${user.id}
        and market_code = ${activeMarket}
      for update
    `
    const order = orders[0]
    if (!order) return { error: 'not_found' as const }
    if (!order.confirmed_at || !order.confirmation_email_sent_at) {
      return { error: 'not_confirmed' as const }
    }

    const reviewId = randomUUID()
    const reviews = await transaction`
      insert into customer_order_review (
        id, order_id, customer_user_id, restaurant_id, rating, comment, status, is_demo
      )
      values (
        ${reviewId}, ${order.id}, ${user.id}, ${order.restaurant_id},
        ${parsed.data.rating}, ${parsed.data.comment}, 'published',
        ${process.env.NODE_ENV !== 'production'}
      )
      on conflict (order_id) do update set
        rating = excluded.rating,
        comment = excluded.comment,
        status = 'published',
        updated_at = now()
      returning rating, comment, created_at, updated_at
    `
    return { review: reviews[0] }
  })
  if ('error' in result) {
    if (result.error === 'not_found') {
      return reply.code(404).send({ message: 'This order was not found in your account.' })
    }
    return reply.code(409).send({
      message: 'A review becomes available after the order and confirmation email are confirmed.',
    })
  }
  return { status: 'published', review: result.review }
})

app.post('/api/poc/checkout', async (request, reply) => {
  const checkoutSchema = z.object({
    restaurant_id: z.string().uuid(),
    items: z.array(z.object({
      item_id: z.string().uuid(),
      quantity: z.number().int().min(1).max(20),
      selected_options: selectedOptionsSchema.optional().default([]),
      note: z.string().trim().max(300).optional().default(''),
    })).min(1).max(50),
    charity_ids: z.array(z.string().uuid()).max(3),
    payment_method: z.enum(['fake_card', 'ideal_wero']),
  })
  const parsed = checkoutSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({
      message: 'The POC checkout contains invalid items or donation choices.',
      issues: parsed.error.issues,
    })
  }
  const customer = await getAuthenticatedUser(request)

  const itemIds = parsed.data.items.map((item) => item.item_id)
  const lineKeys = parsed.data.items.map((item) => (
    `${item.item_id}::${[...item.selected_options]
      .map((entry) => `${entry.group_id}:${[...entry.option_ids].sort().join(',')}`)
      .sort()
      .join('|')}::${item.note.toLowerCase()}`
  ))
  if (new Set(lineKeys).size !== lineKeys.length) {
    return reply.code(400).send({ message: 'Each configured item may appear only once in checkout.' })
  }
  const [menuItems, selectedCharities, commercialTerms, restaurantPolicies, activePromotions] = await Promise.all([
    sql`
      select item.id, item.category_id, item.name, item.price_cents, item.item_type, item.modifier_config
      from menu_item item
      join menu_category category on category.id = item.category_id
      join restaurant on restaurant.id = category.restaurant_id
      where category.restaurant_id = ${parsed.data.restaurant_id}
        and restaurant.market_code = ${activeMarket}
        and restaurant.onboarding_status = 'active'
        and restaurant.is_open = true
        and (
          item.availability = 'all_day'
          or (item.availability = 'lunch' and localtime >= time '11:00' and localtime < time '15:00')
          or (item.availability = 'dinner' and localtime >= time '16:00' and localtime < time '23:59')
          or (item.availability = 'weekends' and extract(isodow from current_date) in (6, 7))
        )
        and item.id = any(${sql.array(itemIds)}::uuid[])
    `,
    parsed.data.charity_ids.length === 0
      ? Promise.resolve([])
      : sql`
          select id from charity
          where id = any(${sql.array(parsed.data.charity_ids)}::uuid[])
            and market_code = ${activeMarket}
        `,
    sql`
      select commission_bps
      from restaurant_commercial_term
      join restaurant on restaurant.id = restaurant_commercial_term.restaurant_id
      where restaurant_commercial_term.restaurant_id = ${parsed.data.restaurant_id}
        and restaurant.market_code = ${activeMarket}
        and effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by effective_from desc
      limit 1
    `,
    sql`
      select minimum_order_cents, delivery_fee_cents, free_delivery_threshold_cents,
        service_fee_bps, service_fee_cap_cents,
        (
          is_open
          and onboarding_status = 'active'
          and (
            (opening_time <= closing_time and localtime >= opening_time and localtime < closing_time)
            or (opening_time > closing_time and (localtime >= opening_time or localtime < closing_time))
          )
        ) as accepting_orders
      from restaurant
      where id = ${parsed.data.restaurant_id} and market_code = ${activeMarket}
    `,
    sql`
      select id, title, promotion_type, buy_quantity, reward_quantity, reward_discount_percent,
        qualifying_scope_type, qualifying_category_ids, qualifying_item_ids,
        reward_scope_type, reward_category_ids, reward_item_ids,
        order_discount_type, order_discount_value, minimum_order_cents
      from restaurant_promotion
      where restaurant_id = ${parsed.data.restaurant_id}
        and enabled = true
        and starts_at <= now()
        and ends_at >= now()
        and promotion_type in ('quantity_discount', 'buy_x_get_y_free', 'order_value_discount')
      order by starts_at desc, id
    `,
  ])

  const policy = restaurantPolicies[0]
  if (!policy) return reply.code(404).send({ message: 'Restaurant not found.' })
  if (!policy.accepting_orders) {
    return reply.code(409).send({ message: 'This restaurant is currently closed for orders.' })
  }
  if (menuItems.length !== new Set(itemIds).size) {
    return reply.code(400).send({ message: 'One or more menu items are unavailable.' })
  }
  if (selectedCharities.length !== parsed.data.charity_ids.length) {
    return reply.code(400).send({ message: 'One or more selected charities are unavailable.' })
  }
  if (commercialTerms.length === 0) {
    return reply.code(409).send({
      message: 'This restaurant does not have an active commercial agreement.',
    })
  }

  const itemById = new Map(menuItems.map((item) => [item.id, item]))
  const resolvedLines: Array<{
    item_id: string
    category_id: string
    item_name: string
    quantity: number
    unit_price_cents: number
    selections: ResolvedSelection[]
    note: string
  }> = []
  for (const requestedItem of parsed.data.items) {
    const item = itemById.get(requestedItem.item_id)
    if (!item) continue
    const resolution = resolveModifierSelections(
      item.price_cents,
      item.modifier_config as ModifierConfig,
      requestedItem.selected_options,
    )
    if (!resolution.ok) {
      return reply.code(400).send({ message: resolution.message })
    }
    resolvedLines.push({
      item_id: item.id,
      category_id: item.category_id,
      item_name: item.name,
      quantity: requestedItem.quantity,
      unit_price_cents: resolution.unit_price_cents,
      selections: resolution.selections,
      note: requestedItem.note,
    })
  }
  const menuSubtotalCents = resolvedLines.reduce(
    (total, line) => total + line.unit_price_cents * line.quantity,
    0,
  )
  if (menuSubtotalCents < policy.minimum_order_cents) {
    return reply.code(409).send({
      message: `The minimum food order is €${(policy.minimum_order_cents / 100).toFixed(2)}.`,
      minimum_order_cents: policy.minimum_order_cents,
    })
  }
  const promotionLines: PromotionOrderLine[] = resolvedLines.map((line) => ({
    itemId: line.item_id,
    categoryId: line.category_id,
    unitPriceCents: line.unit_price_cents,
    quantity: line.quantity,
  }))
  const baseDeliveryFeeCents =
    policy.free_delivery_threshold_cents !== null &&
    menuSubtotalCents >= policy.free_delivery_threshold_cents
      ? 0
      : policy.delivery_fee_cents
  const appliedPromotion = selectBestAutomaticPromotion(
    activePromotions,
    promotionLines,
    menuSubtotalCents,
    baseDeliveryFeeCents,
  )
  const promotionDiscountCents = appliedPromotion?.foodDiscountCents ?? 0
  const deliveryDiscountCents = appliedPromotion?.deliveryDiscountCents ?? 0
  const subtotalCents = menuSubtotalCents - promotionDiscountCents
  const deliveryFeeCents = baseDeliveryFeeCents - deliveryDiscountCents
  const serviceFeeCents = Math.min(
    Math.round(subtotalCents * policy.service_fee_bps / 10_000),
    policy.service_fee_cap_cents,
  )
  const grossCents = subtotalCents + deliveryFeeCents + serviceFeeCents
  const commissionBps = commercialTerms[0].commission_bps
  const commissionCents = Math.round(subtotalCents * commissionBps / 10_000)
  const platformFeeCents = commissionCents + serviceFeeCents
  const restaurantPayableCents = subtotalCents + deliveryFeeCents - commissionCents
  const paymentFeeCents = Math.round(grossCents * 0.015) + 25
  const donationTotalCents =
    selectedCharities.length === 0
      ? 0
      : Math.min(Math.round(subtotalCents * 0.025), platformFeeCents)
  if (
    promotionDiscountCents < 0 ||
    promotionDiscountCents > menuSubtotalCents ||
    deliveryDiscountCents < 0 ||
    deliveryDiscountCents > baseDeliveryFeeCents ||
    grossCents !== subtotalCents + deliveryFeeCents + serviceFeeCents ||
    restaurantPayableCents + platformFeeCents !== grossCents ||
    donationTotalCents > platformFeeCents
  ) {
    throw new Error('Checkout reconciliation invariant failed.')
  }
  if (selectedCharities.length > donationTotalCents) {
    return reply.code(409).send({
      message: 'Select fewer charities for this contribution amount.',
    })
  }
  const orderId = randomUUID()
  const orderNumber = `HD-POC-${Date.now().toString().slice(-8)}`
  const simulatedConfirmationEmail =
    customer !== null && process.env.NODE_ENV !== 'production'

  await sql.begin(async (transaction) => {
    await transaction`
      insert into customer_order (
        id, order_number, customer_user_id, restaurant_id, gross_cents,
        food_subtotal_before_discount_cents, subtotal_cents, promotion_discount_cents,
        delivery_discount_cents, applied_promotion_id, applied_promotion_title,
        applied_promotion_type, delivery_fee_cents, service_fee_cents, restaurant_payable_cents,
        platform_fee_cents, payment_fee_cents, donation_total_cents, payment_method,
        commission_bps, market_code, status, paid_at, confirmed_at,
        confirmation_email_status, confirmation_email_sent_at, is_demo
      )
      values (
        ${orderId}, ${orderNumber}, ${customer?.id ?? null}, ${parsed.data.restaurant_id},
        ${grossCents}, ${menuSubtotalCents}, ${subtotalCents}, ${promotionDiscountCents},
        ${deliveryDiscountCents}, ${appliedPromotion?.promotionId ?? null},
        ${appliedPromotion?.title ?? null}, ${appliedPromotion?.promotionType ?? null},
        ${deliveryFeeCents}, ${serviceFeeCents},
        ${restaurantPayableCents}, ${platformFeeCents}, ${paymentFeeCents},
        ${donationTotalCents}, ${parsed.data.payment_method}, ${commissionBps},
        ${activeMarket}, 'paid', now(), now(),
        ${customer ? (simulatedConfirmationEmail ? 'simulated' : 'pending') : 'not_requested'},
        ${simulatedConfirmationEmail ? new Date() : null}, true
      )
    `

    if (customer) {
      for (const line of resolvedLines) {
        await transaction`
          insert into customer_order_item (
            order_id, menu_item_id, item_name, unit_price_cents, quantity, selected_options, note
          )
          values (
            ${orderId}, ${line.item_id}, ${line.item_name}, ${line.unit_price_cents},
            ${line.quantity}, ${transaction.json(line.selections)}, ${line.note}
          )
        `
      }
    }

    if (selectedCharities.length > 0) {
      const baseShare = Math.floor(donationTotalCents / selectedCharities.length)
      let remainder = donationTotalCents - baseShare * selectedCharities.length
      for (const charity of selectedCharities) {
        const amountCents = baseShare + (remainder > 0 ? 1 : 0)
        remainder = Math.max(0, remainder - 1)
        await transaction`
          insert into order_donation_allocation (order_id, charity_id, amount_cents)
          values (${orderId}, ${charity.id}, ${amountCents})
        `
      }
    }
  })

  return reply.code(201).send({
    order_id: orderId,
    order_number: orderNumber,
    status: 'paid',
    gross_cents: grossCents,
    subtotal_cents: subtotalCents,
    promotion_discount_cents: promotionDiscountCents,
    delivery_discount_cents: deliveryDiscountCents,
    applied_promotion: appliedPromotion
      ? {
          id: appliedPromotion.promotionId,
          title: appliedPromotion.title,
          type: appliedPromotion.promotionType,
          discount_cents: appliedPromotion.foodDiscountCents,
          delivery_discount_cents: appliedPromotion.deliveryDiscountCents,
          total_savings_cents: appliedPromotion.totalSavingsCents,
        }
      : null,
    delivery_fee_cents: deliveryFeeCents,
    service_fee_cents: serviceFeeCents,
    restaurant_payable_cents: restaurantPayableCents,
    platform_fee_cents: platformFeeCents,
    commission_bps: commissionBps,
    payment_fee_cents: paymentFeeCents,
    donation_total_cents: donationTotalCents,
    confirmation_email_status: customer
      ? (simulatedConfirmationEmail ? 'simulated' : 'pending')
      : 'not_requested',
    review_path: customer && simulatedConfirmationEmail ? `/account?order=${orderId}` : null,
  })
})

app.post('/api/admin/menu-reviews/:revisionId/approve', async (request, reply) => {
  const { revisionId } = request.params as { revisionId: string }
  if (!z.uuid().safeParse(revisionId).success) {
    return reply.code(400).send({ message: 'Invalid review identifier.' })
  }

  const approvedItemId = await sql.begin(async (transaction) => {
    const revisions = await transaction`
      select * from menu_item_revision where id = ${revisionId} for update
    `
    const revision = revisions[0]
    if (!revision || revision.status !== 'pending_review') {
      return null
    }

    const targetCategories = await transaction`
      select id from menu_category
      where id = ${revision.category_id}
        and restaurant_id = ${revision.restaurant_id}
    `
    if (targetCategories.length === 0) return null

    const itemId = revision.target_item_id ?? randomUUID()
    if (revision.target_item_id) {
      const ownedTargets = await transaction`
        select item.id
        from menu_item item
        join menu_category category on category.id = item.category_id
        where item.id = ${itemId}
          and category.restaurant_id = ${revision.restaurant_id}
      `
      if (ownedTargets.length === 0) return null
      const updated = await transaction`
        update menu_item set
          category_id = ${revision.category_id}, name = ${revision.name},
          description = ${revision.description}, price_cents = ${revision.price_cents},
          image_url = ${revision.image_url}, ingredients = ${revision.ingredients},
          allergens = ${transaction.array(revision.allergens)}, vat_rate = ${revision.vat_rate},
          availability = ${revision.availability}, item_type = ${revision.item_type},
          modifier_config = ${transaction.json(revision.modifier_config)}
        where id = ${itemId}
        returning id
      `
      if (updated.length !== 1) return null
    } else {
      await transaction`
        insert into menu_item (
          id, category_id, name, description, price_cents, popular, image_url,
          ingredients, allergens, vat_rate, availability, item_type, modifier_config
        )
        values (
          ${itemId}, ${revision.category_id}, ${revision.name}, ${revision.description},
          ${revision.price_cents}, false, ${revision.image_url}, ${revision.ingredients},
          ${transaction.array(revision.allergens)}, ${revision.vat_rate},
          ${revision.availability}, ${revision.item_type}, ${transaction.json(revision.modifier_config)}
        )
      `
    }
    await transaction`
      update menu_item_revision
      set status = 'approved', reviewed_at = now()
      where id = ${revisionId}
    `
    return itemId
  })

  if (!approvedItemId) {
    return reply.code(409).send({ message: 'This submission is no longer awaiting review.' })
  }
  return { item_id: approvedItemId, status: 'published' }
})

app.post('/api/admin/profile-reviews/:revisionId/approve', async (request, reply) => {
  const { revisionId } = request.params as { revisionId: string }
  if (!z.uuid().safeParse(revisionId).success) {
    return reply.code(400).send({ message: 'Invalid review identifier.' })
  }

  const updated = await sql.begin(async (transaction) => {
    const revisions = await transaction`
      select * from restaurant_profile_revision where id = ${revisionId} for update
    `
    const revision = revisions[0]
    if (!revision || revision.status !== 'pending_review') {
      return false
    }
    await transaction`
      update restaurant set
        name = ${revision.name}, description = ${revision.description},
        address = ${revision.address}, logo_url = ${revision.logo_url},
        landing_image_url = ${revision.landing_image_url},
        opening_time = ${revision.opening_time}, closing_time = ${revision.closing_time},
        minimum_order_cents = ${revision.minimum_order_cents},
        delivery_fee_cents = ${revision.delivery_fee_cents},
        free_delivery_threshold_cents = ${revision.free_delivery_threshold_cents},
        service_fee_bps = ${revision.service_fee_bps},
        service_fee_cap_cents = ${revision.service_fee_cap_cents}
      where id = ${revision.restaurant_id}
    `
    await transaction`
      update restaurant_profile_revision
      set status = 'approved', reviewed_at = now()
      where id = ${revisionId}
    `
    return true
  })

  if (!updated) {
    return reply.code(409).send({ message: 'This submission is no longer awaiting review.' })
  }
  return { status: 'published' }
})

app.post('/api/admin/invitations', async (request, reply) => {
  const parsed = invitationSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({
      message: 'A valid restaurant name and email address are required.',
      issues: parsed.error.issues,
    })
  }

  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const id = randomUUID()
  const restaurantId = randomUUID()
  const categoryId = randomUUID()
  const normalizedEmail = parsed.data.email.trim().toLowerCase()
  const slugBase = parsed.data.restaurant_name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  await sql.begin(async (transaction) => {
    await transaction`
      insert into restaurant (
        id, name, slug, description, address, area, cuisine, rating, review_count,
        delivery_minutes, delivery_fee_cents, minimum_order_cents, image_url, logo_url,
        landing_image_url,
        latitude, longitude, delivery_radius_km, halal_status, is_open, charity_id,
        market_code, onboarding_status, is_demo
      )
      values (
        ${restaurantId}, ${parsed.data.restaurant_name}, ${`${slugBase}-${restaurantId.slice(0, 8)}`},
        'Restaurant profile pending completion and approval.',
        'Address pending registration', 'Netherlands', ${transaction.array(['Halal'])},
        0, 0, 45, 0, 0,
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=500&q=80',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=85',
        52.3676, 4.9041, 0, 'Verification required', false, null,
        ${activeMarket}, 'pending_profile', true
      )
    `
    await transaction`
      insert into menu_category (id, restaurant_id, name, display_order, is_demo)
      values (${categoryId}, ${restaurantId}, 'Menu', 0, true)
    `
    await transaction`
      insert into restaurant_commercial_term (
        id, restaurant_id, commission_bps, effective_from, created_by, is_demo
      )
      values (${randomUUID()}, ${restaurantId}, 1500, now(), 'POC admin invitation', true)
    `
    await transaction`
      insert into restaurant_invitation (
        id, restaurant_id, restaurant_name, email, role, token_hash, expires_at,
        market_code, is_demo
      )
      values (
        ${id}, ${restaurantId}, ${parsed.data.restaurant_name}, ${normalizedEmail}, 'owner',
        ${tokenHash}, now() + interval '7 days', ${activeMarket}, true
      )
    `
  })

  return reply.code(201).send({
    id,
    invite_path: `/restaurant-invite/${token}`,
    expires_in_days: 7,
  })
})

await ensureSchema()
await app.listen({ port: 3001, host: '127.0.0.1' })
