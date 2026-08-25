import { ensureSchema, sql } from './db.js'
import { charities, promotions, restaurants } from './seed-data.js'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hash } from '@node-rs/argon2'

export async function resetPocData() {
  await ensureSchema()
  const [adminPasswordHash, ownerPasswordHash, customerPasswordHash] = await Promise.all([
    hash('AdminDemo!2026'),
    hash('RestaurantDemo!2026'),
    hash('CustomerDemo!2026'),
  ])

  await sql.begin(async (transaction) => {
    await transaction`delete from restaurant_invitation where is_demo = true`
    await transaction`
      delete from app_user
      where is_demo = true
        and id not in (
          '80000000-0000-4000-8000-000000000001',
          '80000000-0000-4000-8000-000000000002',
          '80000000-0000-4000-8000-000000000003'
        )
    `
    await transaction`delete from charity_payout where is_demo = true`
    await transaction`delete from customer_order where is_demo = true`
    await transaction`delete from restaurant where is_demo = true`
    await transaction`delete from charity where is_demo = true`

    for (const charity of charities) {
      await transaction`
        insert into charity (id, name, summary, area, focus, image_url, market_code, is_demo)
        values (
          ${charity.id}, ${charity.name}, ${charity.summary}, ${charity.area},
          ${charity.focus}, ${charity.imageUrl}, 'NL', true
        )
      `
    }

    for (const restaurant of restaurants) {
      await transaction`
        insert into restaurant (
          id, name, slug, description, address, area, cuisine, business_type, service_modes,
          rating, review_count,
          delivery_minutes, delivery_fee_cents, minimum_order_cents, image_url,
          landing_image_url, opening_time, closing_time, free_delivery_threshold_cents,
          service_fee_bps, service_fee_cap_cents,
          latitude, longitude, delivery_radius_km, halal_status, is_open, charity_id,
          market_code, is_demo
        )
        values (
          ${restaurant.id}, ${restaurant.name}, ${restaurant.slug}, ${restaurant.description},
          ${restaurant.address}, ${restaurant.area}, ${transaction.array(restaurant.cuisine)},
          ${restaurant.businessType}, ${transaction.array(restaurant.serviceModes)},
          ${restaurant.rating}, ${restaurant.reviewCount}, ${restaurant.deliveryMinutes},
          ${restaurant.deliveryFeeCents}, ${restaurant.minimumOrderCents}, ${restaurant.imageUrl},
          ${restaurant.landingImageUrl}, ${restaurant.openingTime}, ${restaurant.closingTime},
          ${restaurant.freeDeliveryThresholdCents}, ${restaurant.serviceFeeBps},
          ${restaurant.serviceFeeCapCents},
          ${restaurant.latitude}, ${restaurant.longitude}, ${restaurant.deliveryRadiusKm},
          ${restaurant.halalStatus}, ${restaurant.isOpen}, ${restaurant.charityId}, 'NL', true
        )
      `

      for (const [categoryIndex, category] of restaurant.categories.entries()) {
        await transaction`
          insert into menu_category (id, restaurant_id, name, emoji, display_order, is_demo)
          values (${category.id}, ${restaurant.id}, ${category.name}, ${category.emoji}, ${categoryIndex}, true)
        `

        for (const item of category.items) {
          await transaction`
            insert into menu_item (
              id, category_id, name, description, price_cents, popular, image_url, item_type,
              modifier_config, is_vegetarian, is_demo
            )
            values (
              ${item.id}, ${category.id}, ${item.name}, ${item.description},
              ${item.priceCents}, ${item.popular},
              ${'imageUrl' in item ? item.imageUrl : restaurant.imageUrl},
              ${'itemType' in item ? item.itemType : 'standard'},
              ${transaction.json('modifierConfig' in item ? item.modifierConfig : [])},
              ${'vegetarian' in item ? item.vegetarian : false}, true
            )
          `
        }
      }

    }

    for (const promotion of promotions) {
      await transaction`
        insert into restaurant_promotion (
          id, restaurant_id, title, description, promotion_type, buy_quantity, reward_quantity,
          reward_discount_percent, qualifying_scope_type, qualifying_category_ids, qualifying_item_ids,
          reward_scope_type, reward_category_ids, reward_item_ids,
          order_discount_type, order_discount_value, minimum_order_cents,
          starts_at, ends_at, enabled, is_demo
        )
        values (
          ${promotion.id}, ${promotion.restaurantId}, ${promotion.title},
          ${promotion.description}, ${promotion.promotionType},
          ${promotion.buyQuantity}, ${promotion.rewardQuantity}, ${promotion.rewardDiscountPercent},
          ${promotion.qualifyingScopeType}, ${transaction.array([...promotion.qualifyingCategoryIds])}::uuid[],
          ${transaction.array([...promotion.qualifyingItemIds])}::uuid[],
          ${promotion.rewardScopeType}, ${transaction.array([...promotion.rewardCategoryIds])}::uuid[],
          ${transaction.array([...promotion.rewardItemIds])}::uuid[],
          ${promotion.orderDiscountType}, ${promotion.orderDiscountValue}, ${promotion.minimumOrderCents},
          ${promotion.startsAt}, ${promotion.endsAt}, ${promotion.enabled}, true
        )
      `
    }

    const commercialTerms = [
      ['70000000-0000-4000-8000-000000000001', restaurants[0].id, 1500],
      ['70000000-0000-4000-8000-000000000002', restaurants[1].id, 1400],
      ['70000000-0000-4000-8000-000000000003', restaurants[2].id, 1650],
      ['70000000-0000-4000-8000-000000000004', restaurants[3].id, 1500],
      ['70000000-0000-4000-8000-000000000005', restaurants[4].id, 1200],
    ] as const
    for (const term of commercialTerms) {
      await transaction`
        insert into restaurant_commercial_term (
          id, restaurant_id, commission_bps, effective_from, created_by, is_demo
        )
        values (${term[0]}, ${term[1]}, ${term[2]}, '2026-08-01T00:00:00+02:00', 'POC seed', true)
      `
    }

    await transaction`
      insert into app_user (
        id, email, display_name, password_hash, is_platform_admin, is_demo
      )
      values (
        '80000000-0000-4000-8000-000000000001',
        'admin@halaldelivery.demo',
        'Halal Delivery Admin',
        ${adminPasswordHash},
        true,
        true
      ), (
        '80000000-0000-4000-8000-000000000002',
        'owner@emberandolive.demo',
        'Ember & Olive Owner',
        ${ownerPasswordHash},
        false,
        true
      ), (
        '80000000-0000-4000-8000-000000000003',
        'customer@halaldelivery.demo',
        'Demo Customer',
        ${customerPasswordHash},
        false,
        true
      )
      on conflict (id) do update set
        email = excluded.email,
        display_name = excluded.display_name,
        password_hash = excluded.password_hash,
        is_platform_admin = excluded.is_platform_admin,
        is_demo = true
    `
    await transaction`
      insert into restaurant_membership (user_id, restaurant_id, role)
      values (
        '80000000-0000-4000-8000-000000000002',
        ${restaurants[0].id},
        'owner'
      )
    `

    await transaction`
      insert into menu_item_revision (
        id, restaurant_id, category_id, name, description, price_cents, image_url,
        ingredients, allergens, vat_rate, availability, status, is_demo
      )
      values (
        '50000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'Pomegranate lamb flatbread',
        'Slow-cooked lamb, pomegranate, mint yoghurt and pickled red onion.',
        1495,
        'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=900&q=80',
        'Lamb, flatbread, pomegranate, yoghurt, mint, red onion',
        ${transaction.array(['Gluten', 'Milk'])},
        9,
        'all_day',
        'pending_review',
        true
      )
    `

    const orders = [
      ['60000000-0000-4000-8000-000000000001', 'HD-2608-1001', restaurants[0].id, 3890, 3307, 583, 1500, 48, 120, '2026-08-03T18:42:00+02:00'],
      ['60000000-0000-4000-8000-000000000002', 'HD-2608-1002', restaurants[1].id, 5215, 4485, 730, 1400, 59, 175, '2026-08-08T19:16:00+02:00'],
      ['60000000-0000-4000-8000-000000000003', 'HD-2608-1003', restaurants[2].id, 2790, 2330, 460, 1650, 39, 90, '2026-08-12T12:25:00+02:00'],
      ['60000000-0000-4000-8000-000000000004', 'HD-2608-1004', restaurants[0].id, 6475, 5504, 971, 1500, 68, 250, '2026-08-17T20:03:00+02:00'],
      ['60000000-0000-4000-8000-000000000005', 'HD-2608-1005', restaurants[2].id, 4350, 3632, 718, 1650, 52, 150, '2026-08-22T18:11:00+02:00'],
    ] as const

    for (const order of orders) {
      await transaction`
        insert into customer_order (
          id, order_number, customer_user_id, restaurant_id, gross_cents,
          food_subtotal_before_discount_cents, subtotal_cents,
          delivery_fee_cents, service_fee_cents, restaurant_payable_cents,
          platform_fee_cents, commission_bps, payment_fee_cents, donation_total_cents,
          market_code, status, paid_at, confirmed_at, confirmation_email_status,
          confirmation_email_sent_at, is_demo
        )
        values (
          ${order[0]}, ${order[1]},
          ${order[0] === orders[0][0] || order[0] === orders[3][0]
            ? '80000000-0000-4000-8000-000000000003'
            : null},
          ${order[2]}, ${order[3]}, ${order[3]}, ${order[3]}, 0, 0, ${order[4]},
          ${order[5]}, ${order[6]}, ${order[7]}, ${order[8]}, 'NL', 'paid',
          ${order[9]}, ${order[9]}, 'simulated', ${order[9]}, true
        )
      `
    }

    await transaction`
      insert into customer_order_item (
        order_id, menu_item_id, item_name, unit_price_cents, quantity
      )
      values (
        ${orders[0][0]}, ${restaurants[0].categories[0].items[0].id},
        ${restaurants[0].categories[0].items[0].name},
        1945, 2
      ), (
        ${orders[3][0]}, ${restaurants[0].categories[0].items[1].id},
        ${restaurants[0].categories[0].items[1].name},
        6475, 1
      )
    `

    await transaction`
      insert into customer_order_review (
        id, order_id, customer_user_id, restaurant_id, rating, comment, status, is_demo
      )
      values (
        '90000000-0000-4000-8000-000000000001',
        ${orders[0][0]},
        '80000000-0000-4000-8000-000000000003',
        ${restaurants[0].id},
        5,
        'Wonderful flavours, careful packaging and a delivery that arrived exactly when promised.',
        'published',
        true
      )
    `

    const allocations = [
      [orders[0][0], charities[1].id, 120],
      [orders[1][0], charities[0].id, 100],
      [orders[1][0], charities[2].id, 75],
      [orders[2][0], charities[2].id, 90],
      [orders[3][0], charities[0].id, 125],
      [orders[3][0], charities[1].id, 125],
      [orders[4][0], charities[1].id, 150],
    ] as const
    for (const allocation of allocations) {
      await transaction`
        insert into order_donation_allocation (order_id, charity_id, amount_cents)
        values (${allocation[0]}, ${allocation[1]}, ${allocation[2]})
      `
    }
  })

  console.log(
    `POC data recreated: ${restaurants.length} restaurants and ${charities.length} charities.`,
  )
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (entryPoint === import.meta.url) {
  resetPocData()
    .catch((error) => {
      console.error('Unable to reset POC data.', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await sql.end()
    })
}
