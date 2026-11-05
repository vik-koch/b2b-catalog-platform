import { ADMIN_EXCHANGE_TEXT } from './exchange-text';
import { inject, signal, WritableSignal } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { SyncRun } from '@b2b-catalog-platform/shared/core/exchange';
import { SyncFormatErrorBody } from '@b2b-catalog-platform/shared/admin/exchange';
import { PreviewResult, SyncService } from './sync.service';

/** One checkbox of a run's advanced options, read and written on the options
 * object, since some are booleans and some members of `fields`. */
export interface SyncFlag<O, L extends string> {
  key: string;
  label: L;
  hint?: L;
  get: (options: O) => boolean;
  set: (options: O, on: boolean) => O;
  disabled?: (options: O) => boolean;
}

/** `fields` with `field` added or removed, in the contract's order. */
export function withField<F extends string>(
  all: readonly F[],
  fields: readonly F[],
  field: F,
  on: boolean,
): F[] {
  const set = new Set(fields);
  if (on) set.add(field);
  else set.delete(field);
  return all.filter((f) => set.has(f));
}

/**
 * An upload's state, whatever area the file is for: the intent, the file, the
 * staged preview and its apply. Nothing is written before the apply; the
 * preview is a dry run the server stages and the commit re-checks. Created in
 * an injection context.
 */
export class SyncUpload<N extends string, O, P extends { run: SyncRun }> {
  private readonly sync = inject(SyncService);
  private readonly text = inject(ADMIN_EXCHANGE_TEXT).sync;

  readonly preset: WritableSignal<N>;
  readonly options: WritableSignal<O>;
  readonly file = signal<File | null>(null);
  readonly previewing = signal(false);
  readonly previewed = signal<P | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly applying = signal(false);
  readonly applyError = signal<string | null>(null);
  readonly appliedRun = signal<SyncRun | null>(null);

  constructor(
    private readonly config: {
      initial: N;
      custom: N;
      presetFor: (name: N) => O;
      preview: (file: File, options: O) => Promise<PreviewResult<P>>;
    },
  ) {
    this.preset = signal(config.initial);
    this.options = signal(config.presetFor(config.initial));
  }

  selectPreset(name: N): void {
    this.preset.set(name);
    if (name !== this.config.custom) {
      this.options.set(this.config.presetFor(name));
    }
    // A staged run computed with the old intent no longer says what happens.
    this.discardPreview();
  }

  /** Hand-set options: no preset describes them any more. */
  setOptions(options: O): void {
    this.options.set(options);
    this.preset.set(this.config.custom);
    this.discardPreview();
  }

  setFile(file: File): void {
    this.file.set(file);
    this.discardPreview();
  }

  async runPreview(): Promise<void> {
    const file = this.file();
    if (!file) return;

    this.previewing.set(true);
    this.previewError.set(null);
    this.appliedRun.set(null);
    try {
      const result = await this.config.preview(file, this.options());
      if (result.ok) this.previewed.set(result.preview);
      else this.previewError.set(this.failureText(result.failure));
    } finally {
      this.previewing.set(false);
    }
  }

  async apply(): Promise<void> {
    const staged = this.previewed();
    if (!staged) return;

    this.applying.set(true);
    this.applyError.set(null);
    try {
      const result = await this.sync.commit(staged.run.id);
      if (!result.ok) {
        this.applyError.set(this.text.applyErrors[result.code]);
        return;
      }
      this.appliedRun.set(result.result.run);
      this.reset();
    } finally {
      this.applying.set(false);
    }
  }

  reset(): void {
    this.file.set(null);
    this.discardPreview();
  }

  private discardPreview(): void {
    this.previewed.set(null);
    this.previewError.set(null);
    this.applyError.set(null);
  }

  /** The deployment's wording for the refusal, quoting the admin's own file;
   * the generic line for a body that was not the API's. */
  private failureText(failure: SyncFormatErrorBody | null): string {
    if (!failure) return this.text.previewError;
    return fillText(this.text.formatErrors[failure.code], failure.params ?? {});
  }
}
