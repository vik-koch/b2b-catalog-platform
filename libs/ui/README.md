# libs/ui

The web app's building blocks and the design tokens they draw with
([ADR 0071](../../docs/adr/0071-a-ui-library-apart-from-the-app.md)). The reasoning behind the
colours and icons is in [design-language.md](../../docs/design-language.md).

## What belongs here

A piece that knows nothing of the domain, the deployment's texts or its config. What it needs
from the app (its words, a locale, a rule such as which input to refuse) it is given through an
input or an injection token the app provides. Lint refuses `@b2b-catalog-platform/*` in this
library, and Nx refuses an import from an app.

A piece that names a product, an order or a customer, or reads the deployment, is a composition:
it stays in the app and is built from these.

A piece exports its directive or component, the types of its inputs and pure helpers; its classes
stay private. Another element that needs the look takes the directive (a directive styles any
element), and a look that varies is an input (`<a appLink tone="warning">`).

## Names

- **Field:** the labelled unit around a value, with its caption, required mark, hint and error
  (`Field`, `FieldGroup` and their parts). Only these carry "field" in their name.
- **Input:** what holds the value, with a native form element at its core: a directive on that
  element (`input[appInput]`, `input[appCheckbox]`) or a component wrapping one, named `…Input`
  (`DateInput`, `SelectInput`).
- **Control:** the native element itself, named only as the inner part of an input component
  (`appUnitInputControl`).

A directive that changes what a control accepts or does is named for that (`appAllow`,
`appDigitMask`, `appAutoGrow`).

## Importing

One file at a time, by its path:

```ts
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { searchIcon } from '@b2b-catalog-platform/ui/icons/glyphs/search';
```

There is no `index.ts`, and lint refuses a path that names the library or a group: chunks are cut
by module, so a barrel would carry everything behind it into the first load.

<!-- prettier-ignore -->
| Folder | Holds |
| --- | --- |
| `actions/` | Buttons and links: `appButton`, `appIconButton`, `appTextButton`, `appDiscButton`, `appLink`, `appActionLink` and the shared `ButtonBox` |
| `choices/` | Inputs that pick a value: `appCheckbox`, `appRadio`, `appSwitch`, `appTickable`, `appTickLabel`, `ChoiceCard`, `ChoiceBranch`, `Segmented` with `Segment` and `SegmentGroup` |
| `content/` | What a page shows rather than asks: `PageHeader`, `appPageTitle`, `appPageIntro`, `appNotice`, `WarningNote`, `EmptyState`, `Skeleton`, `appStatusBadge`, `HintBadge`, `EmphasisedText`, `appFrame`, `ImagePlaceholder` |
| `core/` | What the pieces share and draw nothing: `fill`, the `UI_TEXT` token, `debounced`, the narrow-screen query |
| `disclosure/` | What opens and closes: `DisclosureToggle`, `appDisclosureFrame`, `disclosureState`, `Collapsible`, `ShowMoreToggle` |
| `fields/` | The labelled unit around an input: `Field`, `FieldGroup`, `FieldStatus`, `FieldBinding`, `appFieldLabel`, `appFieldAction`, `SubmitAttempt`, `appErrorText`, `appHint`, and `FORM_FIELDS` to import them with Signal Forms |
| `icons/` | `Icon`, the `Glyph` type and one module per glyph |
| `inputs/` | What holds a typed value: `appInput`, `SelectInput`, `DateInput`, `UnitInput` with `appUnitInputControl`, `CodeInput`, `PhoneInput`, `appInputPrefix`; and what shapes a control: `appAllow` with `numericRules`, `appDigitMask`, `appAutoGrow`, `appFileTarget`, `appDropZone` |
| `overlay/` | What opens over the page: `ConfirmService` with `ConfirmDialog`, `DialogPanel`, `appDialogActions`, `Popover` |
| `suggest/` | The type-ahead combobox: `SuggestField` with `appSuggestInput` and `appSuggestRow`, the `SuggestList` state behind it, `HighlightedLine` for a matched row |
| `ui.css` | Tailwind, the breakpoints, the type weight and the colour roles; the app's stylesheet imports it |

## Checking

`npx nx test ui` runs the specs through the web app's development build (the library has no build
of its own); `npx nx lint ui` and `npx nx typecheck ui` as usual.
