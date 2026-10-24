# Demo and real at once

This repository is two things: the platform a real client will run, and a public demonstration
of it. Both run the same image. This page describes how the two are kept apart, what each
deployment is, and what serving both purposes costs.

## Public and private

<!-- prettier-ignore -->
| In this repository | In the client's private repository |
| --- | --- |
| The platform: storefront, admin panel, API, migrations | The client's [deployment](../deployments/README.md): configuration, texts, branding, its own pages |
| The ports a regional provider plugs into: address and company suggestions, the sign-in code or call, mail | The adapters for the client's providers, each a container beside the stack |
| The machine API and its documentation | The ERP adapter, and the extension inside the ERP |
| A simulated back office that drives the machine API | — |
| Three deployments: a test fixture and two demo shops | The client's deployment workflow, copied from [the template](../infra/private-deploy/README.md) |
| The images, published to the GitHub container registry on every merge and release | Nothing that is built: the private repository deploys the public images by version |

The private repository consumes only what this one publishes, so the client's shop is never a
fork. A fix released here reaches it as an image version, and a configuration change it needs
arrives as a [migration map](../deployments/fixture/config/README.md#when-a-release-moves-config-keys-or-files).

## The deployments

<!-- prettier-ignore -->
|  | Test fixture | Coffee Kontor | Slaney Labware | Client |
| --- | --- | --- | --- | --- |
| **Runs on** | test suites, local serving | the demo VM, every merge to `main` | the demo VM, every release tag | the client's own VM, by hand |
| **Language** | English | German | English (Ireland) | its own |
| **Sells to** | businesses and private buyers | businesses and private buyers | companies only | its own choice |
| **Back office** | none | none: the admin panel owns everything | simulated: owns catalog, customers, orders | the client's ERP, through the private adapter |
| **Prices** | tax included | tax included | tax added | its own basis |
| **Content** | seed bundle | seed bundle, reset by a deploy that changes it | seed bundle, reset by a release that changes it | real, never seeded |
| **Mail** | a local sink | a sink with a reviewer inbox | a sink with a reviewer inbox | real SMTP |
| **Search engines** | — | kept out | kept out | indexed |

The fixture is what the tests assert their wording against, so it can change for a test's sake
without any shop changing. The two demo shops are fictional, with their own photos, catalog,
customers and orders, and each says on every page and in every mail that it is a demonstration.

## What it costs

- **Every shop carries every setting and every text.** A deployment's configuration is loaded
  whole, with no defaults baked into the image, so a missing key stops the boot rather than
  falling back to someone else's wording. Each deployment holds about two thousand texts,
  including ones it never shows. Slaney Labware sells only to companies, takes only bank
  transfers and publishes no withdrawal page, yet its files word a private buyer, cash payment
  and the link to the right of withdrawal. The client's files are the same.
- **Features are built more generally than one shop needs.** Companies-only selling, a second
  tax basis and the site notice exist because the demos needed them. They are real features,
  configured per deployment, but each is code the client carries without using.
- **Every key change lands four times**: in the fixture, both demo shops and the client's
  deployment. A CI check boots every committed deployment and fails on the first one that would
  not, and a release that moves keys ships a map that moves them in a deployment's own files.
- **Demo plumbing has to stay out of the client's stack.** The mail sink, the reviewer inbox,
  the simulated back office and the seed resets come in through a Compose overlay and a seed
  bundle that the client's deployment never loads.
- **The documents never name the client**, its region or its providers. Examples use the demo
  shops, and a decision driven by a regional constraint is stated as the rule it led to rather
  than the place it came from.

## What it buys

- **Cases one client would never exercise.** A second language proves that nothing in the
  code is tied to one; a companies-only shop proves the customer rules hold everywhere; an
  ERP-owned catalog proves the exchanges work end to end.
- **A working reference client.** The simulated back office uses nothing but the public machine
  API, so an adapter author can read a client that runs against it every hour
  ([ADR 0068](adr/0068-simulate-the-demo-back-office-through-the-machine-api.md)).
- **Documentation that has to be true.** A public repository is read by people who were not in
  the room, so behaviour is written down where it can be checked, and the lifecycle documents
  are generated from the rules and the end-to-end tests.

## What being real changed

A real client changes the plan in ways a demo never would. Some examples from the
[roadmap](roadmap.md):

- The admin login, with rate limiting and password hashing, came forward to the second
  iteration, because the client started entering its catalog there.
- Planning the cart showed that the shop does not sell by the piece: it sells by piece, pack or
  box, with minimum quantities. Units of sale became an iteration of their own before the cart,
  so the client could enter packaging data a release earlier.
- The client asked for attribute filters, and they took the cart's place. Filters change what
  the client types in, and aligning attributes is far cheaper before a catalog is entered than
  after.
- An upgrade of the client's ERP mid-project made a fuller exchange possible. Customer exchange,
  which had not been a requirement at all, was written and delivered before the order exchange.
- A compliance pass was scheduled once the go-live had a date, ordered by what each missing
  piece would cost the shop.
