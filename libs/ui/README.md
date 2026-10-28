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
element), and a look that varies is an input (`<a uiLink tone="warning">`).

## Names

- **Field:** the labelled unit around a value, with its caption, required mark, hint and error
  (`Field`, `FieldGroup` and their parts). Only these carry "field" in their name.
- **Input:** what holds the value, with a native form element at its core: a directive on that
  element (`input[uiInput]`, `input[uiCheckbox]`) or a component wrapping one, named `…Input`
  (`DateInput`, `SelectInput`).
- **Control:** the native element itself, named only as the inner part of an input component
  (`uiUnitInputControl`).

A directive that changes what a control accepts or does is named for that (`uiAllow`,
`uiDigitMask`, `uiAutoGrow`).

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
| `actions/` | Buttons and links: `uiButton`, `uiIconButton`, `uiTextButton`, `uiDiscButton`, `uiLink`, `uiActionLink`, `ClearFiltersButton` and the shared `uiButtonBox` |
| `choices/` | Inputs that pick a value: `uiCheckbox`, `uiRadio`, `Switch`, `uiTickable`, `uiTickLabel`, `ChoiceCard`, `ChoiceBranch`, `Segmented` with `uiSegment` and `uiSegmentGroup` |
| `content/` | What a page shows rather than asks: `PageHeader`, `uiPageTitle`, `uiPageIntro`, `uiNotice`, `WarningNote`, `EmptyState`, `Skeleton`, `uiStatusBadge`, `HintBadge`, `EmphasisedText`, `uiCard`, `uiFrame`, `ImagePlaceholder` |
| `core/` | What the pieces share and draw nothing: `fill`, the `UI_TEXT` token, `debounced`, the narrow-screen query |
| `disclosure/` | What opens and closes: `DisclosureToggle`, `uiDisclosureFrame`, `disclosureState`, `Collapsible`, `ShowMoreToggle`, `ShowMoreList` |
| `fields/` | The labelled unit around an input: `Field`, `FieldGroup`, `FieldStatus`, `FieldBinding`, `uiFieldLabel`, `uiFieldAction`, `SubmitAttempt`, `uiErrorText`, `uiHint`, and `FORM_FIELDS` to import them with Signal Forms |
| `grid/` | A list as a table on a wide screen and records below: `DataGrid` with its column model, `uiGridRow` and `uiGridCard`, `GridHeader`, `GridPagination`, the `GRID_TEXT` token |
| `icons/` | `Icon`, the `Glyph` type and one module per glyph |
| `inputs/` | What holds a typed value: `uiInput`, `SelectInput`, `DateInput`, `UnitInput` with `uiUnitInputControl`, `CodeInput`, `PhoneInput`, `uiInputPrefix`; and what shapes a control: `uiAllow` with `numericRules`, `uiDigitMask`, `uiAutoGrow`, `uiFileTarget`, `uiDropZone` |
| `lists/` | Short lists and paging: `RecordRow`, `uiRecordFields`, `uiRecordFormActions`, `Pagination` |
| `overlay/` | What opens over the page: `ConfirmService` with `ConfirmDialog`, `uiDialogPanel`, `uiDialogActions`, `Popover` |
| `suggest/` | The type-ahead combobox: `SuggestField` with `uiSuggestInput` and `uiSuggestRow`, the `SuggestList` state behind it, `HighlightedLine` for a matched row |
| `ui.css` | Tailwind, the breakpoints, the type weight, the colour roles and the pieces' own animations; the app's stylesheet imports it |

## Checking

`npx nx test ui` runs the specs through the web app's development build (the library has no build
of its own); `npx nx lint ui` and `npx nx typecheck ui` as usual.
