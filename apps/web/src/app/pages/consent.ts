import {
  computed,
  effect,
  inject,
  resource,
  signal,
  Signal,
} from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import {
  CONSENT_PAGE_SLUGS,
  CONSENT_PATHS,
  ConsentPurpose,
} from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { PageService } from './page.service';

/**
 * One form's consent box (NFR-LEGAL-09): whether it is asked, the text it
 * links and the wording it shows, and the version the form posts back.
 *
 * Owns its checkbox control, so a form adds it to its group and the required
 * rule follows whether the box is asked at all.
 */
export interface ConsentRequest {
  /** Where the consent text is read; the box's bracketed words link it. */
  readonly path: string;
  readonly asked: Signal<boolean>;
  /** `loading` until the text arrives; `unavailable` when it has none. */
  readonly state: Signal<'idle' | 'loading' | 'ready' | 'unavailable'>;
  readonly label: Signal<string | null>;
  readonly control: FormControl<boolean>;
  /**
   * What the last refusal said, beside the box: the text changed under the
   * open form, or the API has no text to hold the form to.
   */
  readonly notice: Signal<'changed' | 'unavailable' | null>;
  /** Whether the form may be sent as far as consent goes. */
  readonly sendable: Signal<boolean>;
  /** What the form posts: the version shown, where a box was asked. */
  version(): number | undefined;
  /**
   * Takes a refusal code from the API. True when it was a consent refusal,
   * which this has already acted on: a stale text is reloaded and the box
   * cleared, so the person reads the new wording before ticking again.
   */
  refused(code: string | undefined): boolean;
}

/**
 * A purpose is asked where the deployment switches it on, unless the caller
 * knows better — the first-password form asks only when the API says the
 * account still owes it.
 */
export function useConsent(
  purpose: ConsentPurpose,
  owed?: Signal<boolean>,
): ConsentRequest {
  const pages = inject(PageService);
  const slug = CONSENT_PAGE_SLUGS[purpose];
  const switchedOn = inject(DEPLOYMENT_CONFIG).consent[purpose];
  const asked = computed(() => switchedOn && (owed?.() ?? true));

  const page = resource({
    params: () => (asked() ? { slug } : undefined),
    loader: ({ params }) => pages.getPage(params.slug),
  });
  const current = computed(() =>
    page.hasValue() ? (page.value() ?? null) : undefined,
  );

  const state = computed(() => {
    if (!asked()) return 'idle';
    if (page.status() === 'error') return 'unavailable';
    const value = current();
    if (value === undefined) return 'loading';
    return value?.consentLabel ? 'ready' : 'unavailable';
  });

  const control = new FormControl(false, {
    nonNullable: true,
    validators: (box) => (asked() ? Validators.requiredTrue(box) : null),
  });
  // The rule reads `asked`, which a form validated before it changed.
  effect(() => {
    asked();
    control.updateValueAndValidity({ emitEvent: false });
  });

  const notice = signal<'changed' | 'unavailable' | null>(null);
  // Ticked again after reading the new wording: the notice has done its job.
  control.valueChanges.subscribe((ticked) => {
    if (ticked && notice() === 'changed') notice.set(null);
  });

  return {
    path: CONSENT_PATHS[purpose],
    asked,
    state,
    label: computed(() => current()?.consentLabel ?? null),
    control,
    notice: notice.asReadonly(),
    sendable: computed(() => !asked() || state() === 'ready'),
    version: () => (asked() ? current()?.version : undefined),
    refused(code) {
      if (code === 'consent-stale') {
        control.setValue(false);
        notice.set('changed');
        page.reload();
        return true;
      }
      if (code === 'consent-unavailable') {
        notice.set('unavailable');
        return true;
      }
      return code === 'consent-required';
    },
  };
}
