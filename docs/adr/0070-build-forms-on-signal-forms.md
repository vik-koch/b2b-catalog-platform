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

Angular 22 makes Signal Forms public API. A form is a schema over a signal
model, and each field's state (required, disabled with a reason, errors with
their messages) is a signal the template reads.

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
a message on every rule taken from the deployment's text files, and limits and
patterns from the import-free modules.

**Every field is an `<app-field>`.** The shell draws the caption (a `<legend>`
in group mode), the required mark, the hint and the error, all read from the
field it is given. `FieldBinding` sits on each `[formField]` control and gives
it the id, `aria-describedby`, `aria-required` and `aria-invalid` the shell
decides; `SubmitAttempt` on `form[formRoot]` records the first submit. A
template imports the lot as `FORM_FIELDS`.

**When a message shows is the shell's rule**, the same on every form. A valid
field shows none. A missing required value waits for the first submit. Any
other error shows once the field is left, and hides while it is being edited.

## Rationale

- **Each fact is stated once.** The mark, `aria-required` and the native
  `required` all come from the one `required` rule, so they cannot disagree.
  A message is written beside the rule it explains, so no template chooses
  between error keys.
- **The shell fixes the templates; Signal Forms fixes the classes.** The shell
  alone would have removed the hand-written markup. Signal Forms removes what
  the components did to keep reactive controls in step: on the inquiry form,
  the subscription and validator swapping became two `when` conditions, and
  the page went from 274 lines to 230.
- **One visibility rule, not an opt-in.** `FieldErrors` worked where a form
  remembered to construct it and route every field through it. In the shell,
  a field cannot leave the rule out.
- **Nothing extra at the call site.** `FieldBinding` and `SubmitAttempt` use
  the selectors of the Signal Forms directives they sit beside, so a control
  or a form cannot forget them. Each carries a lint exception for its selector
  prefix.
- **Form by form.** A signal field and a reactive form can be checked side by
  side. The consent box became a field of its own, read by the inquiry form
  and by the two auth forms that are still reactive. The forms move one at a
  time, each change tested on its own.

## Consequences

- (+) Requiredness, the ARIA wiring and error visibility are each decided in
  one place, for both sides of the app.
- (+) A form's rules read as a list, and conditional ones are a `when`, not a
  subscription.
- (+) The admin editors get per-field errors from the same shell as everything
  else.
- (−) The first load grows by 11.6 kB gzip (ADR 0043, amendment 2026-10-26).
  Signal Forms builds on the reactive forms classes, so both ship.
- (−) The API is new to this codebase, and it has a trap: `[formField]` writes
  a control only when the value differs from the last one _it_ wrote. A model
  that changes and changes back before the next render leaves the screen
  showing the middle state.
- (−) An unnamed `form()` names its controls with a counter that the server
  shares across requests, so every form passes a `name`.
- (−) Until the last reactive form moves, both families exist, and `FieldErrors`
  exposes `attempted` for the fields kept outside its group.
