# 0070 — Build every form on Signal Forms, around one field shell

**Status:** accepted · **Date:** 2026-10-26

## Context

The web app's forms had grown into two families. Thirteen used reactive forms,
with `FieldErrors` deciding when a message shows. Nine admin editors kept their
draft in signals, checked it on save and reported one line at the foot of the
form, so a new product sent empty marked none of the fields that stopped it.

Within either family, each fact about a field was written by hand at every
site. A required field carried a `*`, an `aria-required` and a validator, and
the three disagreed: 30 asterisks, 26 `aria-required`, 27 native `required`.
Of 38 fields that set `aria-invalid`, 11 pointed at their message with
`aria-describedby`. A field that switched between required and optional did it
by subscribing to another control and swapping validators. Each error key was
mapped to its wording in the template, and zoneless change detection needed a
control's value mirrored into a signal before a template could react to it.
Four lazy pages loaded Zod to check a length or a pattern: about 110 kB each.

Angular 22 makes Signal Forms public API. A form is a schema over a signal
model, and each field's state (required, disabled, hidden, errors with their
messages) is a signal the template reads.

Alternatives considered:

- **A field shell over reactive forms.** The shell finds its control through
  `contentChild(NgControl)` and reads requiredness from its validators. That
  fixes the templates: one caption, one mark, one error line, one place for the
  ARIA wiring. The component classes stay as they are, with the subscriptions,
  the validator swapping, the error-key mapping and the signal mirrors, and the
  nine signal editors remain a second family.
- **Validating with the contract's Zod schemas** (`validateStandardSchema`).
  This puts Zod in the browser, which ADR 0043 keeps out.
- **Angular Aria.** Its directives implement widget patterns (combobox,
  listbox, menu, tabs, grid). They do nothing for a form field.

## Decision

**Every form is a Signal Forms `form()`** over a signal model. Its rules live in
the schema: `required` with a `when` where a field is only sometimes required,
`hidden` for a branch the page does not show (it counts for nothing and is not
sent), `disabled` for the fields an external system owns. Every rule carries a
message from the deployment's text files; limits and patterns come from the
import-free modules. `filled()` is `required` that takes spaces alone as
nothing, for the fields a save trims.

**Every field is an `<app-field>`.** The shell draws the caption (a `<legend>`
in group mode), the required mark, the hint and the error, all read from the
field it is given; an element marked `appFieldCaption` joins the caption.
`FieldBinding` sits on each `[formField]` control and gives it the id,
`aria-describedby`, `aria-required` and `aria-invalid` the shell decides;
`SubmitAttempt` on `form[formRoot]` records the first submit. A page whose save
button is not inside a `<form>` provides `FIELD_ATTEMPT` itself. A template
imports the lot as `FORM_FIELDS`.

**A control with its own behaviour is a control of the form.** `Segmented` and
`DigitMask` implement `FormValueControl`: one `value` model that `[formField]`
binds. A composite that wraps a native input (`PhoneInput`, `DateField`,
`CategoryPicker`, the suggestion inputs) takes the `field` and binds its inner
input, so the shell's label names the element that is typed in.

**When a message shows is the shell's rule**, the same on every form. A valid
field shows none. A missing required value waits for the first submit. Any
other error shows once the field is left, and hides while it is being edited.
After the first submit, every error shows as it stands. A refused save focuses
the first field that stopped it. The line at the foot of a form is left for
what names no field: the server's refusal.

**Some inputs are not fields, and say their errors their own way.** The list
builders (a product's parts and variants) are a list and an add box: their
rules block the save, and their message stays in their own box. The packaging
table rewrites neighbouring cells as one is typed in, so it keeps its own
inputs and shows its rule on one line under the table, with `aria-invalid` on
the rows it names. A confirmation dialog's reason is a gate on its button, not
a form. The rich-text editor (a page's body, a product's description) is
read once and reports each edit; nothing in it is checked. The attribute
rename and the category filters check nothing.

## Rationale

- **Each fact is stated once.** The mark, `aria-required` and the native
  `required` all come from the one rule, so they cannot disagree. A message is
  written beside the rule it explains, so no template chooses between error
  keys. Two hand-written asterisks are left in the app: the consent box, a
  field of its own beside the forms it closes, and a dialog's reason.
- **The shell fixes the templates; Signal Forms fixes the classes.** The shell
  alone would have removed the hand-written markup. Signal Forms removes what
  the components did to keep reactive controls in step: the subscriptions, the
  validator swapping, the value mirrors and the version counters that made a
  form readable from a signal. 23 forms and 83 fields moved; the app's code
  came out 26 lines shorter for it, with per-field errors on every admin
  editor that had none.
- **One visibility rule, not an opt-in.** `FieldErrors` worked where a form
  remembered to construct it and route every field through it. In the shell,
  a field cannot leave the rule out.
- **Nothing extra at the call site.** `FieldBinding` and `SubmitAttempt` use
  the selectors of the Signal Forms directives they sit beside, so a control
  or a form cannot forget them. Each carries a lint exception for its selector
  prefix.
- **Rules from the import-free modules, not from Zod.** The set-password,
  change-password, tier and attribute pages each shed 100–113 kB gzip.

## Consequences

- (+) Requiredness, the ARIA wiring and error visibility are each decided in
  one place, for both sides of the app, and no form uses reactive forms.
- (+) A form's rules read as a list, and conditional ones are a `when` or a
  `hidden`, not a subscription.
- (+) Migrated pages mostly got smaller: checkout −5.3 kB gzip, order adjust
  −4.0, user editor −2.8, register −2.2, address editor −2.1. The product
  editor grew by 1.6 kB gzip for its per-field rules.
- (−) The first load grows by 17.1 kB raw / 7.0 kB gzip (ADR 0043, amendment
  2026-10-26). Signal Forms builds on the reactive forms classes, so both ship.
- (−) The API is new to this codebase, and has traps:
  - `[formField]` writes a control only when the value differs from the last
    one _it_ wrote. A model that changes and changes back before the next
    render leaves the screen showing the middle state.
  - An unnamed `form()` names its controls with a counter that the server
    shares across requests, so every form passes a `name`.
  - `required` takes `"   "` and `[]` as given: `filled()` and a length check
    of the `required` kind cover them.
  - Array items carry identity symbols, which a spread copies: a request body
    is built field by field.
  - A native `<select>` is read on `input`, not `change`.
  - A template reference named `form` hides the component's `form` from the
    template, and only the template compiler notices.
