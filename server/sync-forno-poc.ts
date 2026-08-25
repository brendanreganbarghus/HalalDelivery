import { ensureSchema, sql } from './db.js'
import { restaurants } from './seed-data.js'

const forno = restaurants.find((restaurant) => restaurant.slug === 'forno-halal-pizza')

if (!forno) {
  throw new Error('Forno Halal Pizza is missing from the POC seed data.')
}

await ensureSchema()

await sql.begin(async (transaction) => {
  await transaction`
    update restaurant
    set is_open = true,
        description = ${forno.description},
        address = ${forno.address},
        opening_time = ${forno.openingTime},
        closing_time = ${forno.closingTime}
    where id = ${forno.id}
  `

  for (const [categoryIndex, category] of forno.categories.entries()) {
    await transaction`
      insert into menu_category (id, restaurant_id, name, emoji, display_order, is_demo)
      values (${category.id}, ${forno.id}, ${category.name}, ${category.emoji}, ${categoryIndex}, true)
      on conflict (id) do update set
        name = excluded.name,
        emoji = excluded.emoji,
        display_order = excluded.display_order
    `

    for (const item of category.items) {
      await transaction`
        insert into menu_item (
          id, category_id, name, description, price_cents, popular, image_url, item_type,
          modifier_config, is_vegetarian, is_active, is_demo
        )
        values (
          ${item.id}, ${category.id}, ${item.name}, ${item.description}, ${item.priceCents},
          ${item.popular}, ${'imageUrl' in item ? item.imageUrl : forno.imageUrl},
          ${'itemType' in item ? item.itemType : 'standard'},
          ${transaction.json('modifierConfig' in item ? item.modifierConfig : [])},
          ${'vegetarian' in item ? item.vegetarian : false}, true, true
        )
        on conflict (id) do update set
          category_id = excluded.category_id,
          name = excluded.name,
          description = excluded.description,
          price_cents = excluded.price_cents,
          popular = excluded.popular,
          image_url = excluded.image_url,
          item_type = excluded.item_type,
          modifier_config = excluded.modifier_config,
          is_vegetarian = excluded.is_vegetarian
      `
    }
  }
})

console.log(`Synced ${forno.name}: ${forno.categories.length} categories and ${forno.categories.flatMap((category) => category.items).length} items.`)
await sql.end()
