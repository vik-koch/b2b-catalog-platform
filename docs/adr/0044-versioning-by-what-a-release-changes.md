# 0044 — Version releases by blast radius, then by scope

**Status:** accepted · **Date:** 2026-09-03

## Context

The project ships strict semver and avoids breaking changes, but has never
written down what "breaking" means for something that is deployed rather than
imported. A library's answer — its public API — does not transfer: nobody calls
this platform from their own code. The working rule so far has been that the
database schema is the only thing that can force a major, which is right about
the common case and silent about everything else.

"A major is a release the operator must act on by hand" does not survive
contact with this deployment. There is one operator, and they act by hand on
**every** release: the texts and `deployment.json`, the environment file the
deploy script reads, the secrets in the repository, and starting the pipeline
itself. A criterion true of every release sorts nothing.

What does differ is how far a release reaches. Most stay inside the deploy
unit — new images, and whatever config travels beside them. A few reach past
it, to something the pipeline does not own: a sidecar built against a changed
port, a migration a person has to run and check. Inside the deploy unit, the
question that remains is what the release is _for_: a capability the platform
did not have, or the continued shaping of one it already shipped.

Alternatives seriously considered:

- **Keep "the DB schema is the criterion"**, and leave everything else
  undocumented.
- **Major for a new capability, minor for a fix needing config, patch for a
  plain redeploy** — the cleanest fit for how the work divides, and rejected
  only because the project is at 1.5.3 and the numbers would stop meaning what
  the released ones mean.
- **Let config decide minor from patch**: a new or renamed key in
  `deployment.json`, a text, an env var, a secret makes it a minor. Rejected —
  see below.

## Decision

**Major** — the release reaches outside the deploy unit. A **port's contract**
breaks (the suggestion sidecar, the media store, the mailer), so its adapter or
the service behind it has to be rebuilt or moved; or a **database migration
cannot be applied unattended** and a person has to run or repair it.

**Minor** — the release carries **new scope**: a requirement the platform did
not have before, or an existing one extended to cover ground it did not cover.

**Patch** — the release carries **no new scope**. Fixes, polish, performance,
refactoring, dependency work, and the continued shaping of what the last minor
shipped. A requirement may be edited here to say what testing taught — never
replaced by a different one.

**Configuration is not a criterion at any level.** A renamed `deployment.json`
key, a new app-text or admin-text string, an added environment variable or
secret can ride in a patch as easily as in a minor — they are one category,
because they share one loader: all of it is validated whole-or-die at boot
(0018), so a key not copied across is a container that does not start, whichever
file it lives in. What config always forces is a **release note that lists it**:
file, key, and whether the operator has to _decide_ a value or merely _write_ a
string.

**The HTTP API carries its own version**, independent of the application's,
from the release that first exposes it to a consumer outside the deployment.

## Rationale

**Scope, not preparation, separates minor from patch**, because that is how the
releases were actually cut. v1.5.1 through v1.5.3 fixed and finished what
iteration 7 shipped in v1.5.0 — the same feature, better — and each edited
config on the way. Calling those minors would have said "something new arrived"
about releases where nothing did, and the version's job here is to say how far
the product moved, not how many files the operator opened.

**Config is version-neutral because it is universal.** It moves in the same
deploy, in the same repository, on the same schedule, and a rename forced by a
small refactor is not evidence of anything. A criterion that fires on nearly
every release sorts nearly nothing — the same reason "the operator acts by
hand" fails as a major. The preparation is real, so it belongs in the release
notes, which can name the key; a version number cannot.

**Splitting config by file was considered and rejected**: `deployment.json` and
the environment forcing a minor, the text files staying free. The two do differ
in what they ask of the operator — a flag or a URL is a decision only the
deployment can make, a text key is wording anyone can supply — but not in
consequence, since both fail the same boot. The distinction belongs in the
release note, which can say which it is; and the split misnumbers v1.5.2, whose
`billingAddressEnabled` flag it would make a minor.

**This trades away semver's patch promise** — _safe to deploy without reading
anything_ — and that costs little here, where one operator starts every deploy
by hand and reads the notes because the pipeline gives them no choice. A promise
nobody would cash is not worth the bit. Revisit this the day there is a second
deployment, an unattended deploy, or an operator who is not the author: the
tighter rule then is that a patch must boot on the config already running, which
keeps the promise at the price of letting a rename dictate the version.

**Ports, not just the schema, for a major.** The schema is one instance of
"something the pipeline cannot fix by shipping new images"; a regional adapter
behind a port is another, and the private deployment consumes those as separate
artifacts on their own release cycle. Naming both keeps the rule from having to
be rediscovered the first time a sidecar's contract moves.

**A separate API version**, because the app's version answers a question its
external consumers are not asking. Tying them means either a major on an app
where nothing else changed, or — far more likely — quietly breaking an
integrator to avoid one.

Deliberately not decided here: which release the API version arrives in, and
whether it is a URL prefix or a header. Neither matters until there is a
consumer, and both are cheap to settle then.

## Consequences

- (+) The rule matches the releases already shipped: v1.5.0 opened iteration
  7's scope, v1.5.1–v1.5.3 closed it, nothing needs backdating.
- (+) An iteration maps to a minor and its follow-up work to patches, so the
  version reads as the roadmap does.
- (⚠) A patch is no longer safe to deploy without reading the notes. Whether
  config has to be edited first is carried entirely by the release notes, and a
  patch that adds a key and does not say so breaks the boot. Every release note
  names the config it needs, or there is nothing left that does.
- (⚠) A release can be a large diff and still a patch. Replacing the contract
  layer touched all 78 endpoints, broke no port and added no requirement — a
  patch, and the number will understate the diff. That is the rule working.
- (−) "New scope" is a judgement call in a way "a migration ran by hand" is
  not. The tie-breaker is the requirements document: if a release adds an
  FR/NFR or widens one, it is a minor.
