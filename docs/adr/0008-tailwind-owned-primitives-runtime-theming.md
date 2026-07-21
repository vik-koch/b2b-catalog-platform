# 0008 — Tailwind with owned UI primitives and runtime theme tokens

**Status:** accepted · **Date:** 2026-07-19

## Context

The storefront's look is part of what this project must demonstrate (0001):
a custom, non-generic UI, built by a maintainer whose strength includes
UI/UX. Two extra constraints shape the choice. First, deployments share the
public Docker images (the client deployment consumes public artifacts), yet
each deployment needs its own branding — colors and logo differ between the
demo persona and the client. Second, the design language itself is not
settled; it will mature alongside the catalog UI in iteration 2.

Alternatives considered: PrimeNG (previously used by the maintainer),
Angular Material, and Taiga UI as styled component libraries; spartan/ui as
a headless base layer.

## Decision

- **Tailwind CSS (v4)** utilities for layout and page composition; no
  styled component library.
- **Owned primitives** (shadcn model): small, repo-owned building blocks —
  the `appButton` directive and `ui/icons/*` SVG icon components — extracted
  when a pattern repeats or carries design decisions. Headless spartan/ui
  primitives (Angular CDK based) are adopted per-component when complex
  interactive widgets arrive (expected first: the admin UI in iteration 2).
- **Icons** (added 2026-07-21): **Lucide** (ISC) owned as inline-SVG
  components under `ui/icons/`, not a runtime icon library — the same
  no-treadmill reasoning as the other primitives, and Lucide is the set
  shadcn already uses. Sized via a height/width class, coloured via
  `currentColor`. Brand/social marks come from simple-icons when needed.
- **Semantic theme tokens** (`primary`, `secondary`, `accent`, `surface`,
  `ink`) declared in Tailwind's `@theme`; templates use only semantic names.
  Tokens compile to CSS custom properties, so a **built image can be
  re-themed at runtime** by overriding `:root` variables — the mechanism
  (SSR-injected from deployment config, like the map embed URL) is built
  when the second deployment exists. Logo and favicon are static assets
  swapped per deployment along the same seam.

## Rationale

1. **Design control is the point.** A styled component library demonstrates
   configuration and fights back when the look must not be generic — the
   same argument that decided 0001 applies to the UI layer.
2. **The deployment model forces runtime theming.** Build-time theming
   would require the private client repo to rebuild public images,
   contradicting the consume-public-artifacts rule. CSS custom properties
   make theming a config concern instead of a build concern.
3. **Owned primitives have a known, bounded cost.** Components live in the
   repo: no upgrade treadmill, exact fit, and the UI code is itself
   portfolio material. The price — building each primitive — is paid only
   for primitives actually needed.
4. **Measured cost is small:** the full styling system currently compiles
   to ~28 KB CSS (~5 KB gzipped) with zero runtime JavaScript.

Concessions: PrimeNG would deliver admin-style CRUD screens much faster,
and the maintainer already knows it — deliberately traded for design
control on the public surface. Utility classes in templates are a taste
trade-off, mitigated by extracting components. A token rule must be
maintained by hand: replacement palettes must keep similar lightness, since
`primary` serves as text on white (≥ 4.5:1) and as background under white
text.

## Consequences

- (+) One public image serves differently-branded deployments; re-theming
  is a config change, not a release.
- (+) Contrast decisions transfer between palettes that follow the token
  rule; the demo palette passes WCAG AA/AAA where it is used.
- (+) CSS stays small and grows sublinearly (utilities are shared).
- (−) No ready-made component ecosystem: every table, dialog, or datepicker
  is built or vendored (spartan) when needed.
- (−) Discipline required: raw palette colors in templates would silently
  break per-deployment theming.
