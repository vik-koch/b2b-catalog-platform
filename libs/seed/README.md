# seed

Single source of truth for seed data and the idempotent seeding routine.

Consumers: the `api-e2e` and `web-e2e` global-setups (and, later, the demo
deployment's seed step) — so tests, local stacks and demo servers all serve
the same content.

What it seeds: static pages, the demo catalog (categories, products, generated
placeholder images), the `wholesale` customer tier with its price list, and the
demo accounts — two managers plus a roster of customers spread across every
account status. Pages, catalog and prices are upserted; accounts are
create-if-missing, so a demo click-through survives the next deploy.

The accounts that can sign in share one published password (`DEMO_PASSWORD` in
`account-data.ts`) — this seeds the public demo, and the dev-only `seed` one-shot
never runs where real accounts live.

Nothing here collides with the e2e suites: seeded addresses use reserved
`.example` domains, never the `@example.com` those suites claim, and the tier key
is `wholesale` where every e2e tier key is prefixed `e2e-`.
