import { Directive } from '@angular/core';

/**
 * What a tickable native control wears — the checkbox below and the radio
 * beside it, which are one control with two shapes and had the string twice.
 *
 * **The paint is ours, the control is the platform's.** `accent-color` reaches
 * only a *checked* control's fill: an unchecked box has no border a stylesheet
 * can recolour, because the UA draws the shape internally rather than as a
 * border on the element. An outline is not a substitute — the element itself
 * has no radius, so a ring around a radio comes out square. `appearance-none`
 * is the only way to recolour the edge, and it costs nothing that matters: the
 * element stays an `<input type="checkbox">`, so keyboard operation, form
 * participation and the accessible name are all untouched. Only the pixels
 * change hands.
 *
 * With the edge ours, hover is what it is everywhere else in the app — the
 * border goes accent, and a checked one's fill goes accent with it, exactly as
 * a primary button does.
 *
 * **The target is the row, not the box.** These sit inside a `<label>` whose
 * text is most of what there is to point at — a facet's value, a consent
 * sentence — and a 16px square that lights up only when the pointer is exactly
 * on it is a control nobody finds. `label:hover &` says so without a `group`
 * class at any of the twelve call sites; where a control has no label around
 * it, the rule simply never matches and its own `:hover` still does.
 *
 * Focus is left to the app's one ring (`styles.css`), which is the documented
 * exception for these two: a recoloured 1px edge on a 16px box is too small to
 * find. It lands on the border rather than outside it, so the two never draw
 * two lines.
 *
 * The hover rules carry `:not(:disabled)` inside the variant rather than
 * relying on a `disabled:hover:` utility, so which one wins is a matter of
 * specificity rather than of the order Tailwind happened to emit them in.
 */
const TICKABLE =
  'h-4 w-4 shrink-0 cursor-pointer appearance-none border border-border-strong ' +
  'bg-white bg-contain bg-center bg-no-repeat transition-colors ' +
  'checked:border-primary checked:bg-primary ' +
  '[&:not(:disabled):hover]:border-accent ' +
  '[&:checked:not(:disabled):hover]:bg-accent ' +
  '[label:hover_&:not(:disabled)]:border-accent ' +
  '[label:hover_&:checked:not(:disabled)]:bg-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export { TICKABLE };

/**
 * The app's checkbox (shadcn-style owned primitive): the native control, sized
 * and tinted, so a consent box, a sync option and a picker row are the same
 * control rather than three sets of utility classes.
 *
 * Sized explicitly so it can be aligned exactly: 16px in the 20px line box of
 * `text-sm`. A row that aligns to the first line of wrapping text (`items-start`)
 * adds `mt-0.5` for the 2px nudge — that is layout, and stays with the caller.
 *
 * The `<label>` around it wants `cursor-pointer`, which is layout too: the
 * pointer belongs to the whole row, and only the caller knows how far it runs.
 *
 *   <label class="flex cursor-pointer items-start gap-2 text-sm">
 *     <input type="checkbox" appCheckbox class="mt-0.5" />
 *     <span>…</span>
 *   </label>
 */
@Directive({
  selector: 'input[type="checkbox"][appCheckbox]',
  // The square's own two additions: a corner, and the tick that fills it.
  host: {
    class: `${TICKABLE} rounded-sm checked:bg-(image:--tick-mark)`,
  },
})
export class Checkbox {}
