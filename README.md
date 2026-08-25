# Halal Delivery

Halal Delivery is a proof-of-concept food delivery marketplace: a React, TanStack Query,
TanStack Router, Vite, Fastify, and PostgreSQL application with customer, restaurant-owner,
and admin portals.

## Functional specification

The client-facing application overview, complete role workflows, business rules, and current
screenshots are available in:

- [`docs/Halal-Delivery-Functional-Specification.pdf`](docs/Halal-Delivery-Functional-Specification.pdf)
- [`docs/Halal-Delivery-Functional-Specification.html`](docs/Halal-Delivery-Functional-Specification.html)

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/)
- Docker (for the local PostgreSQL 17 container)

## Getting started

```powershell
docker compose up -d
pnpm install
pnpm db:reset
pnpm dev
```

- `docker compose up -d` starts the `postgres` service defined in `compose.yaml` (PostgreSQL 17,
  database/user `halaldelivery`, password `halaldelivery_dev`, exposed on host port `55433`).
- `pnpm db:reset` deletes records marked as POC data, then recreates the sample charities,
  restaurants, menu categories, and items deterministically. The local PostgreSQL connection
  can be overridden with the `DATABASE_URL` environment variable (defaults to
  `postgres://halaldelivery:halaldelivery_dev@localhost:55433/halaldelivery`).
- `pnpm dev` runs the Vite dev server (`dev:web`) and the Fastify API (`dev:api`) concurrently.
  Halal Delivery uses fixed ports and fails instead of selecting a different port when one is busy:
  web `5173`, API `3001`, and PostgreSQL host `55433`.

Open `http://localhost:5173`. Customers can create an immediately active manual account from
`/login`; until an email provider is connected, these accounts are clearly marked as
email-unverified.

## Routes

- `/` — public marketing landing page and address search
- `/restaurants` — signed-in-style restaurant and grocery discovery with delivery/collection,
  cuisine, offer, rating, favourite, and open-now filters
- `/restaurant/:slug` — dedicated restaurant storefront, category browsing, offers, fee-aware
  basket, and checkout
- `/account` — confirmed customer order history and verified-order restaurant reviews
- `/restaurant-portal` — restaurant profile, governed menu submissions (including modifier
  templates), and promotions
- `/admin` — invitations, approvals, sales splits, donation liabilities, and print report

## Local role-isolated testing

Local multi-role testing uses separate loopback hosts so each browser tab keeps an independent
cookie session:

- Customer: `http://127.0.0.1:5173/login`
- Administrator: `http://127.0.0.2:5173/login`
- Restaurant owner: `http://127.0.0.3:5173/login`

The matching demo credentials are prefilled on each local login page.

## Public POC role testing

When the development server is exposed through ngrok, open the same-origin customer link:
`https://<active-ngrok-host>/login?pocRole=customer`. The login page also provides Admin and
Restaurant buttons that retain the current public origin and prefill the matching demo credentials.
Unlike the three loopback hosts, one public hostname has one cookie session: sign out before
switching roles and test roles sequentially.

Development builds show this public POC panel automatically. Production builds hide it and disable
credential prefill unless `VITE_ENABLE_POC_TESTING=true` is explicitly set at build time. Keep the
flag disabled for production deployments.

## Demo credentials

POC accounts recreated by `pnpm db:reset`:

| Role | Email | Password |
| --- | --- | --- |
| Platform admin | `admin@halaldelivery.demo` | `AdminDemo!2026` |
| Restaurant owner | `owner@emberandolive.demo` | `RestaurantDemo!2026` |
| Customer | `customer@halaldelivery.demo` | `CustomerDemo!2026` |

The fake checkout writes paid demo orders into the monthly ledger. Donations are optional, come
from the platform commission, and may be divided equally among up to three selected charities.
Run `pnpm db:reset` to restore the deterministic baseline at any time.

## Database configuration

The API connects using the `DATABASE_URL` environment variable, defaulting to the `compose.yaml`
`postgres` service (`postgres://halaldelivery:halaldelivery_dev@localhost:55433/halaldelivery`).
Set `DATABASE_URL` before running `pnpm dev`/`pnpm db:reset` to point at a different PostgreSQL 17
instance.

The local runtime ports are intentionally fixed to avoid colliding with other repositories:

| Service | Local endpoint |
| --- | --- |
| Web | `http://127.0.0.1:5173` |
| API | `http://127.0.0.1:3001` |
| PostgreSQL | `localhost:55433` |

## Modifier templates

Configurable menu items (pizza, burger, kebab, meal, drink, milkshake) share a single reusable
modifier engine (`server/modifiers.ts`, `src/modifiers.ts`). For example, the pizza template
defines one required size choice, one required sauce/base, and optional extra sauces/toppings;
applying the template to a menu item is a one-time configuration step rather than per-item
duplication. Customers pick modifier options through `ModifierModal`, and each basket line can
carry a free-text special-instructions note (up to 300 characters) that is not a substitute for
allergen information.

## Customer item notes

When adding an item to the basket, customers may add an optional note (e.g. "no tomato, sauce
on the side"). Notes are shown to the restaurant with the order but are explicitly not treated as
allergen declarations — a warning to that effect is shown in the modal.

## Generic promotions

Restaurant owners manage three promotion types from `/restaurant-portal`:

- **Promotional announcements** — scheduled storefront messages with no financial effect.
- **Order-value offers** — percentage off the food subtotal, a fixed euro discount capped at the
  food subtotal, or free delivery, with an optional pre-discount minimum food order.
- **Quantity offers** (e.g. "buy 1 get 1 free", "buy X get the cheapest Y free", "second at
  half price") — configurable qualifying and reward scopes (whole order, a category, or specific
  items).

Automatic offers do not stack. The shared promotion engine evaluates every eligible active
quantity and order-value offer, then applies the single offer with the greatest customer savings
(including delivery savings). Ties are resolved by promotion ID for deterministic client/server
results. The basket is a preview only: checkout recalculates the winning offer from current menu
prices and configuration on the server, uses the discounted amount for the simulated payment, and
snapshots the applied promotion and savings on the order for customer history and finance reports.
Legacy `order_offer` rows remain compatible and are treated as message-only announcements.

The restaurant portal includes an in-app **"How offers work"** help panel (promotion help panel)
that explains the available promotion types, scopes, and presets with worked examples, and a
live preview of the configured promotion before publishing. Promotions publish directly for the
POC; only enabled promotions inside their configured time window appear as active on the
customer storefront.

Restaurant owners also manage storefront settings from `/restaurant-portal`: landing image,
opening hours, minimum order, delivery/free-delivery thresholds, and capped service fees are
submitted through the existing admin approval workflow. Categories (name and emoji) are
immediately available to menu management.

Checkout snapshots the food subtotal, delivery fee, and capped service fee. Commission is
calculated on the food subtotal, while restaurant payable includes delivery and the platform fee
includes commission plus the service fee.

## Reviews and confirmation email simulation

Signed-in customer checkouts snapshot their order items and simulate a confirmation email for
the POC. A review becomes available only after the order is confirmed and the confirmation email
is recorded as sent. Reviews are restricted to the order owner and contribute to the restaurant
rating shown in discovery. A real email provider will replace the simulated delivery state before
production.

## Invitations

Admin restaurant invitations and restaurant-owner team invitations use single-use, seven-day
tokens. New users choose their own password and are linked to the invited restaurant before being
redirected to its portal.

## Google authentication (optional)

Google authentication does not require a transactional email provider. Create a Google OAuth 2.0
Client ID with application type **Web application**, add `http://localhost:5173` (and any public
POC URL you use) as authorised JavaScript origins, then set the client ID before starting the app:

```powershell
$env:GOOGLE_CLIENT_ID = "your-client-id.apps.googleusercontent.com"
pnpm dev
```

Without `GOOGLE_CLIENT_ID`, manual customer registration remains available and the Google option
displays its configuration status rather than pretending to sign in.

Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID` to enable it locally.

## POC limitations

- No real payment processing — checkout is simulated.
- No real transactional email provider — confirmation emails are recorded as "sent" without being
  delivered.
- Restaurant menu items are managed directly in the portal UI; there is no bulk/file-based
  (CSV/XLSX) import.
- `pnpm db:reset` is destructive to POC-tagged data and is intended for local/demo use only.

## Available scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Run the Vite dev server and Fastify API concurrently |
| `pnpm dev:web` | Run only the Vite dev server |
| `pnpm dev:api` | Run only the Fastify API with file watching |
| `pnpm db:reset` | Reset the database to the deterministic POC baseline |
| `pnpm build` | Type-check and build the frontend for production |
| `pnpm lint` | Run Oxlint |
| `pnpm preview` | Preview the production build locally |
