# seed

The idempotent seeding routine and the schema of a seed bundle. It holds no
content: what it writes comes from a bundle — the committed demo's is
[seed/](../../seed/), whose README describes the format and what each case in
it is there to show.

Consumers: the seeder one-shot (`apps/seeder`, run by the `seed` compose
service and by `nx run seeder:seed`), the `api-e2e` global setup (through the
built seeder) and the `web-e2e` one (calling `seedDatabase` directly), and the
specs that assert against seeded content (`loadSeedBundle`).

Pages, catalog and prices are upserted; accounts, orders and consents are
create-if-missing, so a demo click-through survives the next deploy.
