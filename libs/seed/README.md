# seed

Single source of truth for seed data and the idempotent seeding routine.

Consumers: the `api-e2e` and `web-e2e` global-setups (and, later, the demo
deployment's seed step) — so tests, local stacks and demo servers all serve
the same content.
