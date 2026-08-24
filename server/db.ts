import postgres from 'postgres'

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://halaldelivery:halaldelivery_dev@localhost:55433/halaldelivery'

export const sql = postgres(connectionString)

export async function ensureSchema() {
  await sql`
    create table if not exists market (
      code text primary key check (length(code) = 2),
      name text not null,
      locale text not null,
      currency_code text not null,
      enabled boolean not null default false
    )
  `
  await sql`
    insert into market (code, name, locale, currency_code, enabled)
    values ('NL', 'Netherlands', 'nl-NL', 'EUR', true)
    on conflict (code) do update set
      name = excluded.name,
      locale = excluded.locale,
      currency_code = excluded.currency_code,
      enabled = excluded.enabled
  `

  await sql`
    create table if not exists charity (
      id uuid primary key,
      name text not null,
      summary text not null,
      area text not null,
      focus text not null,
      image_url text not null,
      market_code text not null default 'NL' check (length(market_code) = 2),
      onboarding_status text not null default 'active',
      is_demo boolean not null default false
    )
  `
  await sql`alter table charity add column if not exists market_code text not null default 'NL'`

  await sql`
    create table if not exists restaurant (
      id uuid primary key,
      name text not null,
      slug text not null unique,
      description text not null,
      address text not null,
      area text not null,
      cuisine text[] not null,
      business_type text not null default 'restaurant',
      service_modes text[] not null default '{delivery}',
      rating numeric(2,1) not null,
      review_count integer not null,
      delivery_minutes integer not null,
      delivery_fee_cents integer not null,
      minimum_order_cents integer not null,
      free_delivery_threshold_cents integer,
      service_fee_bps integer not null default 250,
      service_fee_cap_cents integer not null default 99,
      opening_time time not null default '11:00',
      closing_time time not null default '22:00',
      image_url text not null,
      landing_image_url text not null,
      latitude double precision not null,
      longitude double precision not null,
      delivery_radius_km double precision not null default 7,
      halal_status text not null,
      is_open boolean not null,
      charity_id uuid references charity(id),
      market_code text not null default 'NL' check (length(market_code) = 2),
      is_demo boolean not null default false
    )
  `
  await sql`alter table restaurant add column if not exists logo_url text`
  await sql`alter table restaurant add column if not exists latitude double precision`
  await sql`alter table restaurant add column if not exists longitude double precision`
  await sql`alter table restaurant add column if not exists delivery_radius_km double precision not null default 7`
  await sql`alter table restaurant add column if not exists market_code text not null default 'NL'`
  await sql`alter table restaurant add column if not exists business_type text not null default 'restaurant'`
  await sql`alter table restaurant add column if not exists service_modes text[] not null default '{delivery}'`
  await sql`alter table restaurant add column if not exists onboarding_status text not null default 'active'`
  await sql`alter table restaurant add column if not exists landing_image_url text`
  await sql`alter table restaurant add column if not exists opening_time time not null default '11:00'`
  await sql`alter table restaurant add column if not exists closing_time time not null default '22:00'`
  await sql`alter table restaurant add column if not exists free_delivery_threshold_cents integer`
  await sql`alter table restaurant add column if not exists service_fee_bps integer not null default 250`
  await sql`alter table restaurant add column if not exists service_fee_cap_cents integer not null default 99`
  await sql`update restaurant set logo_url = image_url where logo_url is null`
  await sql`update restaurant set landing_image_url = image_url where landing_image_url is null`
  await sql`alter table restaurant alter column landing_image_url set not null`

  await sql`
    create table if not exists menu_category (
      id uuid primary key,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      name text not null,
      emoji text not null default '🍽️',
      display_order integer not null,
      is_demo boolean not null default false
    )
  `
  await sql`alter table menu_category add column if not exists emoji text not null default '🍽️'`

  await sql`
    create table if not exists menu_item (
      id uuid primary key,
      category_id uuid not null references menu_category(id) on delete cascade,
      name text not null,
      description text not null,
      price_cents integer not null,
      popular boolean not null default false,
      item_type text not null default 'standard',
      modifier_config jsonb not null default '[]'::jsonb,
      is_demo boolean not null default false
    )
  `
  await sql`alter table menu_item add column if not exists image_url text not null default ''`
  await sql`alter table menu_item add column if not exists ingredients text not null default ''`
  await sql`alter table menu_item add column if not exists allergens text[] not null default '{}'`
  await sql`alter table menu_item add column if not exists vat_rate numeric(4,2) not null default 9`
  await sql`alter table menu_item add column if not exists availability text not null default 'all_day'`
  await sql`alter table menu_item add column if not exists item_type text not null default 'standard'`
  await sql`alter table menu_item add column if not exists modifier_config jsonb not null default '[]'::jsonb`

  await sql`
    create table if not exists menu_item_revision (
      id uuid primary key,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      target_item_id uuid references menu_item(id) on delete set null,
      category_id uuid not null references menu_category(id) on delete cascade,
      name text not null,
      description text not null,
      price_cents integer not null,
      image_url text not null,
      ingredients text not null,
      allergens text[] not null,
      vat_rate numeric(4,2) not null,
      availability text not null,
      item_type text not null default 'standard',
      modifier_config jsonb not null default '[]'::jsonb,
      status text not null,
      submitted_at timestamptz not null default now(),
      reviewed_at timestamptz,
      review_note text,
      is_demo boolean not null default false
    )
  `
  await sql`alter table menu_item_revision add column if not exists item_type text not null default 'standard'`
  await sql`alter table menu_item_revision add column if not exists modifier_config jsonb not null default '[]'::jsonb`

  await sql`
    create table if not exists restaurant_profile_revision (
      id uuid primary key,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      name text not null,
      description text not null,
      address text not null,
      logo_url text not null,
      landing_image_url text not null,
      opening_time time not null,
      closing_time time not null,
      minimum_order_cents integer not null,
      delivery_fee_cents integer not null,
      free_delivery_threshold_cents integer,
      service_fee_bps integer not null default 250,
      service_fee_cap_cents integer not null default 99,
      status text not null,
      submitted_at timestamptz not null default now(),
      reviewed_at timestamptz,
      review_note text,
      is_demo boolean not null default false
    )
  `
  await sql`alter table restaurant_profile_revision add column if not exists landing_image_url text`
  await sql`alter table restaurant_profile_revision add column if not exists opening_time time not null default '11:00'`
  await sql`alter table restaurant_profile_revision add column if not exists closing_time time not null default '22:00'`
  await sql`alter table restaurant_profile_revision add column if not exists minimum_order_cents integer not null default 0`
  await sql`alter table restaurant_profile_revision add column if not exists delivery_fee_cents integer not null default 0`
  await sql`alter table restaurant_profile_revision add column if not exists free_delivery_threshold_cents integer`
  await sql`alter table restaurant_profile_revision add column if not exists service_fee_bps integer not null default 250`
  await sql`alter table restaurant_profile_revision add column if not exists service_fee_cap_cents integer not null default 99`
  await sql`update restaurant_profile_revision revision set landing_image_url = restaurant.image_url from restaurant where revision.restaurant_id = restaurant.id and revision.landing_image_url is null`
  await sql`alter table restaurant_profile_revision alter column landing_image_url set not null`

  await sql`
    create table if not exists restaurant_promotion (
      id uuid primary key,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      title text not null,
      description text not null,
      promotion_type text not null default 'order_offer',
      buy_quantity integer,
      reward_quantity integer,
      minimum_order_cents integer,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      enabled boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      is_demo boolean not null default false,
      check (ends_at > starts_at),
      check (minimum_order_cents is null or minimum_order_cents >= 0)
    )
  `
  await sql`alter table restaurant_promotion add column if not exists promotion_type text not null default 'order_offer'`
  await sql`alter table restaurant_promotion add column if not exists buy_quantity integer`
  await sql`alter table restaurant_promotion add column if not exists reward_quantity integer`
  await sql`alter table restaurant_promotion add column if not exists reward_discount_percent integer`
  await sql`alter table restaurant_promotion add column if not exists qualifying_scope_type text not null default 'all'`
  await sql`alter table restaurant_promotion add column if not exists qualifying_category_ids uuid[] not null default '{}'`
  await sql`alter table restaurant_promotion add column if not exists qualifying_item_ids uuid[] not null default '{}'`
  await sql`alter table restaurant_promotion add column if not exists reward_scope_type text not null default 'same_as_qualifying'`
  await sql`alter table restaurant_promotion add column if not exists reward_category_ids uuid[] not null default '{}'`
  await sql`alter table restaurant_promotion add column if not exists reward_item_ids uuid[] not null default '{}'`
  await sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'restaurant_promotion_reward_discount_percent_check'
      ) then
        alter table restaurant_promotion
        add constraint restaurant_promotion_reward_discount_percent_check
        check (reward_discount_percent is null or reward_discount_percent between 1 and 100);
      end if;
    end $$
  `
  // One-time backfill: the original "buy X get Y free" promotion type predates configurable
  // reward discount percentages and qualifying/reward scopes. Every such row is always a 100%-off,
  // all-items, single-pool quantity rule, so it migrates losslessly into the generic
  // 'quantity_discount' type. Safe to run on every boot: it only ever touches legacy rows.
  await sql`
    update restaurant_promotion
    set promotion_type = 'quantity_discount',
        reward_discount_percent = 100,
        qualifying_scope_type = 'all',
        reward_scope_type = 'same_as_qualifying'
    where promotion_type = 'buy_x_get_y_free'
  `
  await sql`create index if not exists restaurant_promotion_storefront on restaurant_promotion (restaurant_id, enabled, starts_at, ends_at)`

  await sql`
    create table if not exists app_user (
      id uuid primary key,
      email text not null unique,
      display_name text not null,
      password_hash text,
      google_subject text unique,
      email_verified_at timestamptz,
      is_platform_admin boolean not null default false,
      created_at timestamptz not null default now(),
      is_demo boolean not null default false
    )
  `
  await sql`alter table app_user alter column password_hash drop not null`
  await sql`alter table app_user add column if not exists google_subject text`
  await sql`alter table app_user add column if not exists email_verified_at timestamptz`
  await sql`create unique index if not exists app_user_google_subject_key on app_user (google_subject) where google_subject is not null`

  await sql`
    create table if not exists restaurant_membership (
      user_id uuid not null references app_user(id) on delete cascade,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      role text not null check (role in ('owner', 'member')),
      created_at timestamptz not null default now(),
      primary key (user_id, restaurant_id)
    )
  `

  await sql`
    create table if not exists auth_session (
      id uuid primary key,
      user_id uuid not null references app_user(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `

  await sql`
    create table if not exists restaurant_invitation (
      id uuid primary key,
      restaurant_id uuid references restaurant(id) on delete cascade,
      restaurant_name text not null,
      email text not null,
      role text not null default 'owner' check (role in ('owner', 'member')),
      token_hash text not null unique,
      expires_at timestamptz not null,
      accepted_at timestamptz,
      invited_by_user_id uuid references app_user(id) on delete set null,
      market_code text not null default 'NL' check (length(market_code) = 2),
      created_at timestamptz not null default now(),
      is_demo boolean not null default false
    )
  `
  await sql`alter table restaurant_invitation add column if not exists restaurant_id uuid references restaurant(id) on delete cascade`
  await sql`alter table restaurant_invitation add column if not exists role text not null default 'owner'`
  await sql`alter table restaurant_invitation add column if not exists invited_by_user_id uuid references app_user(id) on delete set null`
  await sql`alter table restaurant_invitation add column if not exists market_code text not null default 'NL'`

  await sql`
    create table if not exists customer_order (
      id uuid primary key,
      order_number text not null unique,
      customer_user_id uuid references app_user(id) on delete set null,
      restaurant_id uuid not null references restaurant(id),
      gross_cents integer not null,
      subtotal_cents integer not null,
      delivery_fee_cents integer not null,
      service_fee_cents integer not null,
      restaurant_payable_cents integer not null,
      platform_fee_cents integer not null,
      commission_bps integer not null default 1500,
      payment_fee_cents integer not null,
      donation_total_cents integer not null,
      payment_method text not null default 'fake_card',
      market_code text not null default 'NL' check (length(market_code) = 2),
      status text not null,
      paid_at timestamptz not null,
      confirmed_at timestamptz,
      confirmation_email_status text not null default 'not_requested'
        check (confirmation_email_status in ('not_requested', 'pending', 'sent', 'simulated', 'failed')),
      confirmation_email_sent_at timestamptz,
      is_demo boolean not null default false,
      check (
        restaurant_payable_cents + platform_fee_cents = gross_cents
        and donation_total_cents <= platform_fee_cents
      )
    )
  `
  await sql`alter table customer_order add column if not exists customer_user_id uuid references app_user(id) on delete set null`
  await sql`alter table customer_order add column if not exists payment_method text not null default 'fake_card'`
  await sql`alter table customer_order add column if not exists commission_bps integer not null default 1500`
  await sql`alter table customer_order add column if not exists market_code text not null default 'NL'`
  await sql`alter table customer_order add column if not exists confirmed_at timestamptz`
  await sql`alter table customer_order add column if not exists confirmation_email_status text not null default 'not_requested'`
  await sql`alter table customer_order add column if not exists confirmation_email_sent_at timestamptz`
  await sql`alter table customer_order add column if not exists subtotal_cents integer`
  await sql`alter table customer_order add column if not exists delivery_fee_cents integer not null default 0`
  await sql`alter table customer_order add column if not exists service_fee_cents integer not null default 0`
  await sql`update customer_order set subtotal_cents = gross_cents - delivery_fee_cents - service_fee_cents where subtotal_cents is null`
  await sql`alter table customer_order alter column subtotal_cents set not null`

  await sql`
    create table if not exists customer_order_item (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references customer_order(id) on delete cascade,
      menu_item_id uuid references menu_item(id) on delete set null,
      item_name text not null,
      unit_price_cents integer not null check (unit_price_cents >= 0),
      quantity integer not null check (quantity between 1 and 20),
      selected_options jsonb not null default '[]'::jsonb,
      note text not null default '' check (char_length(note) <= 300)
    )
  `
  await sql`alter table customer_order_item add column if not exists id uuid default gen_random_uuid()`
  await sql`update customer_order_item set id = gen_random_uuid() where id is null`
  await sql`alter table customer_order_item alter column id set not null`
  await sql`alter table customer_order_item drop constraint if exists customer_order_item_pkey`
  await sql`alter table customer_order_item add primary key (id)`
  await sql`alter table customer_order_item add column if not exists selected_options jsonb not null default '[]'::jsonb`
  await sql`alter table customer_order_item add column if not exists note text not null default ''`

  await sql`
    create table if not exists customer_order_review (
      id uuid primary key,
      order_id uuid not null unique references customer_order(id) on delete cascade,
      customer_user_id uuid not null references app_user(id) on delete cascade,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      rating integer not null check (rating between 1 and 5),
      comment text not null check (char_length(comment) between 10 and 1000),
      status text not null default 'published' check (status in ('published', 'hidden')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      is_demo boolean not null default false
    )
  `
  await sql`
    create index if not exists customer_order_review_restaurant
    on customer_order_review (restaurant_id, status, created_at desc)
  `

  await sql`
    create table if not exists restaurant_commercial_term (
      id uuid primary key,
      restaurant_id uuid not null references restaurant(id) on delete cascade,
      commission_bps integer not null check (commission_bps between 0 and 5000),
      effective_from timestamptz not null,
      effective_to timestamptz,
      created_at timestamptz not null default now(),
      created_by text not null,
      is_demo boolean not null default false,
      check (effective_to is null or effective_to > effective_from)
    )
  `
  await sql`
    create unique index if not exists restaurant_commercial_term_one_active
    on restaurant_commercial_term (restaurant_id)
    where effective_to is null
  `

  await sql`
    create table if not exists order_donation_allocation (
      order_id uuid not null references customer_order(id) on delete cascade,
      charity_id uuid not null references charity(id),
      amount_cents integer not null check (amount_cents > 0),
      primary key (order_id, charity_id)
    )
  `

  await sql`
    create table if not exists charity_payout (
      id uuid primary key,
      charity_id uuid not null references charity(id),
      period_start date not null,
      period_end date not null,
      amount_cents integer not null,
      status text not null,
      paid_at timestamptz,
      reference text,
      is_demo boolean not null default false,
      unique (charity_id, period_start, period_end)
    )
  `
}
