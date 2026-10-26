# Design language

The rules the web app's colours follow. [styles.css](../apps/web/src/styles.css) holds the
values; this page holds the reasoning, so a new screen can pick a colour by what it does rather
than by how it looks. Lint keeps the names honest and the audit keeps the contrast honest
([Keeping to it](#keeping-to-it)).

## Naming

A colour's name is **family · role · intensity · state**, each part optional, always in that
order: `danger-surface`, `surface-hover`, `ink-subtle`, `primary-press`.

- **Family.** Brand (`primary`, `secondary`, `accent`), neutral (no prefix) and status
  (`danger`, `warning`, `success`, `info`).
- **Role**, what the colour paints:
  - a ground: `surface`, `chip`, `skeleton`;
  - text: `ink`;
  - a line: `edge`;
  - a marker: `dot`.

  A status colour's bare name is its text on the page and its fill; `-ink` is its text on its own
  `-surface`.

- **Intensity**: `-subtle` is a step closer to the page than the base, `-strong` a step further
  from it, `-stronger` a step further still. `surface-subtle` is the page itself, `ink-subtle`
  the quieter text, `edge-subtle` the lighter line.
- **State**: `-hover` and `-press`, named for what they happen on, one and two steps from its
  resting colour; `-disabled` for a control that cannot be used. The brand's hover is its own
  colour, `accent`.

A name says what a colour does, never which shade it is. Two roles may share a value (a hovered
row and a recessed panel are both stone-100) and still keep two names, because they do different
jobs and a deployment may want to tell them apart. Two roles that do the same job are one role.

Tailwind's palette (`stone-200`, `red-700`) is where the values come from, not a name a template
may use: `styles.css` switches it off and keeps the steps the roles use as private `--palette-*`
values. `white` and `black` stay: white is the text on every fill, black only ever a translucent
overlay.

## Contrast

The floors are WCAG 2.1 AA.

<!-- prettier-ignore -->
| What | Floor | Against |
|---|---|---|
| Text, except `ink-disabled` | 4.5:1 | every ground it is drawn on |
| A glyph that identifies a control (an icon button, a chevron), a dot that stands alone, a focus indicator | 3:1 | the ground beside it |
| `ink-disabled`, lines, separators, a dot beside its own words | none | |

A state keeps its floor: text that turns `accent` on hover still reaches 4.5:1 on the ground it
hovers over. Colour is never the only sign of a state; a refusal also says so in words.

How the defaults meet the floors:

<!-- prettier-ignore -->
| Pair | Ratio |
|---|---|
| `ink` / `ink-subtle` on `surface`, the darkest ground they meet | 16.0 / 4.95 |
| `primary` / `accent` on `surface` | 6.8 / 4.6 |
| `accent-strong` on `chip` / on the stone-200 hover grounds | 6.3 / 5.7 |
| `danger` / `warning` / `success` on `surface` | 5.9 / 4.6 / 4.5 |
| A status `-ink` on its `-surface` (danger, warning, success, info) | 6.9 / 6.4 / 6.5 / 6.5 |
| White on `primary` / `primary-press` / `accent` | 7.4 / 10.0 / 5.0 |
| White on `danger` / `danger-hover` / `danger-press` | 6.4 / 8.4 / 10.0 |
| `secondary`, the focus colour, on white | 4.7 |
| A `-dot` on `surface-subtle` (danger, warning, success, info) | 4.6 / 3.1 / 3.1 / 3.9 |
| `ink-disabled` on white | 2.6 |

Known exceptions:

- **The cart's count** is white on `warning-dot`, 3.2:1. The count is the same dot as the
  account's waiting-work marker, and white figures were chosen over dark ones that read as a
  foreign colour in the header.
- **`edge-strong`**, the edge of a field, is 1.5:1 on white. Read strictly, an edge that
  identifies a control wants 3:1; the field's label and position identify it here, and a darker
  edge everywhere is a decision of its own.
- **An unavailable unit option** differs from an available one by its shade alone.

## The roles

The defaults below are the coffee theme's; [Themes](#themes) says what a deployment changes.

### Brand

<!-- prettier-ignore -->
| Role | Default | Used for |
|---|---|---|
| `primary` | `#6f4e37` | The resting brand colour: primary buttons, links, the selected option |
| `primary-press` | primary, 15% toward black | Every pressed control. A colour of its own, because a press that only undid the hover would show nothing to a finger, which never hovers |
| `secondary` | `#8b6f52` | Focus, on every control |
| `accent` | `#b45309` | Hover, on every control; highlights and eyebrows |
| `accent-strong` | accent, 15% toward black | Accent on a ground too dark for it: a hovered chip, a segment hovered inside its track, a notice badge |

### Text

<!-- prettier-ignore -->
| Role | Default | Used for |
|---|---|---|
| `ink` | stone-900 | Body text |
| `ink-subtle` | stone-500 → 600, a quarter step | Everything quieter than body text: secondary copy, meta text (table headers, counts, timestamps), and every glyph that steps back (icons at rest, chevrons, unavailable options) |
| `ink-disabled` | stone-400 | A control that cannot be used |

`ink-subtle` sits a quarter step from stone-500 toward stone-600: stone-500 itself falls below 4.5:1
on the recessed grounds.

### Lines

<!-- prettier-ignore -->
| Role | Default | Used for |
|---|---|---|
| `edge-subtle` | stone-100 | Rows that repeat: grid and list dividers |
| `edge` | stone-200 | Structure: card edges, dividers, table rules |
| `edge-strong` | stone-300 | The edge that makes a control look operable: fields, secondary buttons; breadcrumb separators |

### Grounds and their states

<!-- prettier-ignore -->
| Role | Default | Used for |
|---|---|---|
| `surface-subtle` | stone-50 | The page, and the level of the white things on it |
| `surface-subtle-hover` / `surface-subtle-press` | stone-100 / 200 | A control on the page or on white, hovered and pressed |
| `surface` | stone-100 | A recessed ground: footer, notes, pills, a segmented track, a disabled field, a nested row. One step from the page, as a status colour's `-surface` is |
| `surface-hover` / `surface-press` | stone-200 / 300 | A control on a recessed ground |
| `surface-strong` | stone-200 | One step further: a switch that is off, a disabled primary button |
| `chip` / `chip-hover` | stone-100 → 200, a quarter step / stone-200 | A small fill that has to show on the page: the category chip, the neutral badge. Between stone-100, which all but vanishes on the page, and stone-200, which turns a grid of them grey |
| `skeleton` | stone-200 | A block standing in for content still loading |

White belongs to the page level: cards, fields and the menus over the page are white, and a
control on them takes `surface-subtle-hover` and `surface-subtle-press` like one on the page.

### Status

<!-- prettier-ignore -->
| Family | Says | Roles it has |
|---|---|---|
| `danger` (red) | A refusal: an error, a refused field, a destructive control | bare, `-hover`, `-press`, `-ink`, `-surface`, `-edge`, `-edge-strong`, `-dot` |
| `warning` (amber) | Something to weigh before going on, or work that waits for someone | bare, `-ink`, `-surface`, `-edge`, `-dot` |
| `success` (green) | A thing done | bare, `-ink`, `-surface`, `-dot` |
| `info` (sky) | A state worth pointing out | `-ink`, `-surface`, `-edge`, `-dot` |

Each colour has only the roles the app draws. Their steps are the same across the four: the bare
name is 700, `-ink` 800, `-surface` 100, `-edge` 200, `-edge-strong` 300,
`-dot` 600, and danger's `-hover` and `-press` 800 and 900. Badges and panels share the one
ground, a step from the page as the neutral `surface` is: a badge is `-ink` on `-surface` with
a `-dot` (`appStatusBadge`), a panel is `-ink` on `-surface` inside an `-edge` (`appNotice`).
The neutral badge is the one exception, on `chip`, because a grey a step from the page all but
vanishes on it.

## Themes

A deployment's `branding.theme` overrides the roles at runtime: `App` writes them onto `<html>`,
server-rendered pages included, so one image serves every deployment
([ADR 0008](adr/0008-tailwind-owned-primitives-runtime-theming.md)). A key is the role of the
same name, `surfaceStrong` for `surface-strong`; [theme-config.ts](../libs/shared/src/lib/config/theme-config.ts)
lists them with what each one colours.

- **The brand** (`primary`, `secondary`, `accent`) is the one part a deployment must set. Its
  press and its stronger accent are mixed from it, 15% toward black, unless set too.
- **A grey** is set one role at a time, and a derived role follows the role it derives from: a
  deployment that sets `surface` and `surfaceStrong` gets the hovers, the presses, the chip and the
  skeleton to match without naming them. A cool palette is about ten keys; a different page colour
  is one.
- **A status colour** is set whole or not at all, every role it has in `#rrggbb`: its shades only
  work as a set. At boot each pair is measured against the floors above (its text on the page and
  on its own surface, its dot on the page, a white label on danger's fills), and a pair below its
  floor stops the app with the role named.

## Keeping to it

- **Only the roles exist.** With Tailwind's palette switched off, `bg-stone-200` draws nothing
  and lint reports it as unknown. Lint also refuses a colour with a palette step, a palette
  variable, a literal colour other than black or white and a Typography colour theme anywhere in
  web code, in templates and in TypeScript strings alike (`no-restricted-classes` in
  [eslint.config.mjs](../apps/web/eslint.config.mjs)).
- **Mail** draws in the same greys: the API's layout takes `ink`, `inkSubtle`, `edge`, `surface`
  and `surfaceSubtle` from the theme where they are hex, the defaults above otherwise.
- **The audit** (`npx nx run web-e2e:audit`) screenshots every page on desktop and phone and
  runs axe against WCAG 2.1 AA, so a contrast slip shows up as a new finding next to its ratio.
- **A new role** gets a name by the grammar above, a default in `styles.css`, a row here, and a
  measured ratio if it carries text.
