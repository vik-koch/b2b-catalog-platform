# 0072 — Keep the web app's views apart from what loads and changes data

**Status:** accepted · **Date:** 2026-10-28

## Context

Inside a feature folder of the web app (`storefront/catalog/`, `admin/orders/`) every
file sat side by side: routed pages, services, URL-state writers, pure helpers and
components that only draw. Nothing told them apart but reading them, and a view that
grew a service call stayed where it was. The building blocks had the same problem
and got a library ([ADR 0071](0071-a-ui-library-apart-from-the-app.md)); what remains in
the app is the views that know the domain and its wording, and the code that fetches and
writes.

A top-level `ui/` folder was considered. It would cut across the storefront, admin and
shared split of [ADR 0069](0069-split-web-texts-and-contracts-by-audience.md), or need that
split again inside it, and it would move every view away from the pages it serves.

## Decision

A feature folder keeps its containers at its root and its views in a `ui/` subfolder. A
view takes data through inputs and hands events back through outputs; it may use the
UI library, the shared library's helpers and types, text and config tokens, `RouterLink`
and other views. It imports no service, API client or generated contract routes. A
feature with several services may group them in `data/`.

A view's `ui/` is the one in the nearest folder that holds all its users: the feature's
(`storefront/catalog/product-page/ui/`), the area's (`storefront/catalog/ui/`) or the
shared core's (`core/catalog/ui/`), never deeper, and with no subfolders. A view that knows
no domain, text or deployment goes to the UI library instead.

## Rationale

- **The line where the halves change for different reasons.** A view changes when the
  design does; a container changes when the API or a rule does. Splitting there is worth
  the inputs and outputs it costs; splitting a view further, by look or by size, is not.
- **Per feature, not one folder.** A view stays next to the pages that use it, and the
  audience split of ADR 0069 holds without being repeated.
- **Lint holds most of it.** A rule on `src/app/**/ui/**` refuses services, the oRPC
  client, the generated routes and `HttpClient`; a service cannot be injected without its
  import. Contracts it cannot tell from types, because the shared library's entry points
  export both: review and `import type` hold that half.
- **Pure helpers stay at the root**, beside what uses them. They are neither views nor
  containers, and a `utils/` folder becomes the next place where roles mix.
- **Gradual.** The rule applies only inside `ui/`, so a view moves when it is next
  touched; nothing has to move at once.

## Consequences

- (+) A file's role is read off its path, and a view that reaches for data fails lint.
- (+) A view's spec needs no service fakes, and a second page can use it as it is.
- (−) Data passes through inputs from a container, sometimes through more than one level.
- (−) Until every feature has been touched, both shapes exist side by side.
