# Deployments

Each directory here is one deployment of the public image: a complete
[config directory](fixture/config/README.md) and a
[seed bundle](fixture/seed/README.md), deployed with `CONFIG_DIR` and
`SEED_DIR` (see [infra/README.md](../infra/README.md)).

| Directory           | Stack | Shop                                                        |
| ------------------- | ----- | ----------------------------------------------------------- |
| `fixture`           | —     | the test fixture: the Coffee Kontor in English, B2B and B2C |
| `coffee-kontor-de`  | dev   | the Coffee Kontor, wholly in German                         |
| `slaney-labware-ie` | prod  | Slaney Labware, an Irish laboratory supplier, B2B only      |

The fixture is what the suites run on and assert the wording of: the unit specs
read it whatever `CONFIG_PATH` the workspace `.env` names, and the e2e suites
seed and mount it. It is deployable like the others, but no long-lived stack
runs it, so it can change for a test's sake without anyone's shop changing.

A deployment's config starts as a copy of the fixture's and is then
translated or reworded for its trade, so its files carry the same keys. Its seed
bundle is either a translated copy of the fixture's or a shop of its own. A change that adds, renames or moves a key in the
fixture makes the same change here, wording translated — by hand, or with
[`tools/migrate-config.mjs`](fixture/config/README.md#when-a-release-moves-config-keys-or-files)
once the change has its map. CI runs
`node tools/check-deployments.mjs`, which loads every deployment the way the
apps and the seeder do and fails on the first one that would not boot or seed.

The seed never deletes, so moving a stack from one deployment to another needs
an empty database first; otherwise the old orders and accounts stay beside the
new catalog.
