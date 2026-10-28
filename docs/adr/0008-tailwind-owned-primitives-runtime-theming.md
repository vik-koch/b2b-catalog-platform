# 0008 — Tailwind with owned UI primitives and runtime theme tokens

**Status:** accepted (amended 2026-09-04, 2026-09-05, 2026-10-02, 2026-10-26, 2026-10-27) · **Date:** 2026-07-19

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
  the `uiButton` directive and `ui/icons/*` SVG icon components — extracted
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

## Amendment — 2026-09-04 (v1.6.0): the logo and one type weight join the tokens

Two things a deployment needs turned out to sit just outside the seam this ADR
drew. Both are now on the same side of it as the colours.

- **The logo is painted through a CSS mask**, not served as an `<img>`. An
  external SVG cannot see the page's custom properties, so the one element in
  the header that could not answer a pointer with the accent colour was the
  wordmark. Masked, it is ordinary text colour and follows the theme with no
  second asset to keep in step. The cost is that the mark comes out in one
  colour; both current deployments draw theirs in the theme's own colours, so
  it is not made switchable. It stays a per-deployment file, swapped at the
  same mount as before.
- **`--font-weight-emphasis`** joins the runtime tokens, overridable from
  `branding.font.emphasisWeight` — with the face rather than with the colours,
  since how heavy a price should be set is a property of the typeface. 700 is
  a step up from the body text in the system stack and a shout in a face whose
  medium and semibold are barely apart. It is one token, not a type scale: the
  rest of the weights are the app's own design and stay in the templates.

## Amendment — 2026-09-05 (v1.7.0): one link treatment, one set of control states

The primitives were extracted one at a time, each answering its own screen, and
by the ninth iteration they disagreed with each other. Two rules were settled
across all of them.

- **`uiLink` is the one link treatment.** Three idioms had grown up in
  parallel — `text-primary underline`, `text-accent hover:underline`, and an
  `underline hover:no-underline` inversion — so the same affordance meant three
  things depending on which screen it was on. `ui/actions/link.ts` replaces them at
  every call site, with the underline drawn in a tint of the text colour so it
  reads as a hairline rather than a second line of the same weight. A global
  `a { … }` rule is the wrong shape here: most anchors in this app are nav
  items, tiles, breadcrumbs and `uiButton` links, and a global rule would be
  undone at each one. But rich text arrives as sanitized HTML (0020) where no
  directive can reach, so `styles.css` carries `.prose a` matching the
  directive — **two copies of one rule, kept in step by hand**, which is the
  price of the directive form.
- **Hover and focus are the same everywhere.** Buttons, checkboxes, radios,
  switches, segmented controls, select fields, choice cards, disclosures and
  icon buttons now share one set of states rather than each carrying its own,
  and their spacing came into line with them. Nothing about the token model
  changes; what changes is that a control's states are read from the shared
  set instead of being written again per primitive.

The underline is rationed on purpose: it is what distinguishes a link inside a
sentence, where nothing else does. Outside running text, position and spacing
already say a thing is operable. A handful of standalone text controls (show
password, generate, browse) carry it anyway because they have no other
affordance at all — the cleaner answer is a second tone in the same file, and
it is not built.

## Amendment — 2026-10-02 (v1.13.0): the text button

The second tone is built: `uiTextButton`, in the same file as `uiLink`. It
keeps the link's colour and weight but underlines on hover only, and it takes
the standalone text controls — show password, generate, enter manually, a map
link under an address, reset widths. A word inside a sentence keeps `uiLink`,
and so does a count in a record row, which links to the list it counts.

## Amendment — 2026-10-26 (v1.15.2): every colour is a role, and lint holds the line

The semantic names covered the brand and the text, but the rest of the colour
in the templates was still Tailwind's palette: the greys of every hover, ground
and placeholder, and the red, amber, green and sky of every status. A
deployment could replace the greys only as a whole ramp and the status colours
not at all, and nothing stopped a new template from adding more.

- **Every colour a template draws is a role in `styles.css`**, named family ·
  role · intensity · state: a ground (`surface`), text (`ink`), a line
  (`edge`) or a marker (`dot`), stepped `-subtle` < base < `-strong`, with
  `-hover`, `-press` and `-disabled` named for what they happen on
  (`surface-hover`, `danger-press`, `ink-disabled`). The status colours use the
  same roles: the bare name is text on the page, `-ink` text on the colour's
  own `-surface`. The roles take Tailwind's shades, copied into private
  `--palette-*` steps so an upgrade cannot move them; a value between two
  steps is a mix of them, not a picked hex. Rich text takes the same roles through Typography's colour
  variables instead of one of its palettes. The grammar, the contrast floors
  and the measured pairs are in [design-language.md](../design-language.md).
- **A deployment sets a role by its own name** instead of a grey ramp step by
  step: a derived role follows the one it derives from, the brand's press and
  stronger accent are mixed from it, and a status colour is set whole, its
  pairs measured against the contrast floors at boot.
- **The theme is written onto `<html>`**, not onto the root component: a
  dialog appended to `<body>` sits outside that component and drew in the
  default colours.
- **Only the roles exist.** `styles.css` switches Tailwind's own colours off
  (`--color-*: initial`), keeping white and black, so a palette class draws
  nothing and `no-unknown-classes` reports it. Lint also refuses, in templates
  and in every TypeScript string, a colour class with a palette step, a
  palette variable, a literal colour other than black or white, and a
  Typography colour theme (`no-restricted-classes` in
  `apps/web/eslint.config.mjs`). The discipline this ADR named as a cost is
  now a check, and it needs no list of palettes to keep current.
- **Mail draws in the same greys.** The API's message layout takes the roles
  it uses (`ink`, `inkSubtle`, `edge`, `surface`, `surfaceSubtle`) from the
  theme where they are set as hex, and the web app's defaults otherwise.

## Amendment — 2026-10-27 (v1.15.2): icons are data

Two icon components, a storefront set and an admin set, kept the admin glyphs out of a
visitor's download: a component's `@switch` ships every glyph it holds, so the split was by
bundle, and 17 glyphs were copied into both. The admin set also drew at a heavier stroke.

- **A glyph is a constant**, `glyphs/<lucide-name>.ts`, holding the SVG's elements as data.
  One `Icon` component draws whichever it is given and holds none itself, so a chunk carries
  exactly the glyphs it imports. The copies and the two sets go.
- **Imported from its own module, never through a barrel.** Chunks are cut by module, not by
  export: a module re-exporting every glyph put all of them into the first load.
- **One stroke weight**, 1.75, raised to 2.25 for emphasis (the navigation's current tab),
  through `--icon-stroke-width`. The rules are in [design-language.md](../design-language.md#icons).
