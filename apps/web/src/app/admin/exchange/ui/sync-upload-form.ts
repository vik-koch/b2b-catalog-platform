import { Component, inject, input, output } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { ChoiceCard } from '@b2b-catalog-platform/ui/choices/choice-card';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { uploadIcon } from '@b2b-catalog-platform/ui/icons/glyphs/upload';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { DropZone } from '@b2b-catalog-platform/ui/inputs/drop-zone';
import {
  FileTarget,
  pasteKeys,
} from '@b2b-catalog-platform/ui/inputs/file-target';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';

export interface SyncUploadPresetView {
  name: string;
  title: string;
  description?: string;
}

export interface SyncUploadFlagView {
  key: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
}

/**
 * The first two steps of an upload, whatever its area: what the file is, then
 * the file. The intent is a preset first, with the raw flags folded away.
 */
@Component({
  selector: 'app-sync-upload-form',
  imports: [
    Button,
    Checkbox,
    ChoiceCard,
    DropZone,
    ErrorText,
    FieldLabel,
    FileTarget,
    Icon,
    TickLabel,
  ],
  template: `
    <section class="mb-8">
      <h2 class="mb-3 text-sm font-medium">{{ text.modeLabel }}</h2>
      <!-- Cards, as at checkout for a choice that reshapes what follows: each
           preset needs a sentence. -->
      <div class="space-y-2">
        @for (option of presets(); track option.name) {
          <ui-choice-card
            name="preset"
            [value]="option.name"
            [checked]="preset() === option.name"
            [title]="option.title"
            [description]="option.description"
            (chosen)="presetChosen.emit(option.name)"
          />
        }
      </div>

      <details class="mt-4">
        <summary class="cursor-pointer text-sm text-ink-subtle">
          {{ text.advanced }}
        </summary>
        <div class="mt-3 space-y-2 border-l-2 border-edge-subtle pl-4">
          @for (flag of flags(); track flag.key) {
            <label uiTickLabel>
              <input
                type="checkbox"
                uiCheckbox
                [checked]="flag.checked"
                [disabled]="flag.disabled"
                (change)="
                  flagToggled.emit({
                    key: flag.key,
                    on: $any($event.target).checked,
                  })
                "
              />
              <span>
                {{ flag.label }}
                @if (flag.hint) {
                  <span class="block text-ink-subtle">{{ flag.hint }}</span>
                }
              </span>
            </label>
          }
        </div>
      </details>
    </section>

    <section class="mb-8">
      <span uiFieldLabel>{{ fileLabel() }}</span>

      <!-- The picker is the drop target: a bare file input is easy to miss
           where uploading is the whole point. -->
      <input
        #fileInput
        type="file"
        accept=".csv,text/csv"
        class="sr-only"
        (change)="onFile($event)"
      />
      <button
        type="button"
        class="w-full p-4"
        uiFileTarget=".csv,text/csv"
        uiDropZone
        [filled]="!!file()"
        (click)="openPicker(fileInput)"
        (filesReceived)="chosen($event[0])"
      >
        <ui-icon [glyph]="uploadIcon" class="size-6 mb-2" />
        @if (file(); as picked) {
          <span class="font-medium">{{ picked.name }}</span>
          <span class="text-sm text-ink-subtle">{{ text.changeFile }}</span>
        } @else {
          <span class="font-medium">{{ text.dropHint }}</span>
          <span class="text-sm">{{ text.browse }}</span>
        }
        <span class="hidden text-xs pointer-fine:block">{{ pasteHint }}</span>
      </button>
      <p class="mt-1 text-sm text-ink-subtle">{{ fileHint() }}</p>

      <div class="mt-4 flex items-center gap-3">
        <button
          uiButton
          type="button"
          [disabled]="!file() || previewing()"
          (click)="previewRequested.emit()"
        >
          {{ previewing() ? text.previewing : text.preview }}
        </button>
        @if (previewed()) {
          <button
            uiButton
            variant="secondary"
            type="button"
            (click)="discarded.emit()"
          >
            {{ text.discard }}
          </button>
        }
      </div>

      @if (error(); as message) {
        <p uiErrorText class="mt-3" role="alert">{{ message }}</p>
      }
    </section>
  `,
})
export class SyncUploadForm {
  protected readonly uploadIcon = uploadIcon;
  protected readonly text = inject(ADMIN_TEXT).sync;
  protected readonly pasteHint = fillText(inject(ADMIN_TEXT).upload.pasteHint, {
    keys: pasteKeys(),
  });

  readonly presets = input.required<readonly SyncUploadPresetView[]>();
  readonly preset = input.required<string>();
  readonly flags = input.required<readonly SyncUploadFlagView[]>();
  readonly fileLabel = input.required<string>();
  readonly fileHint = input.required<string>();
  readonly file = input<File | null>(null);
  readonly previewing = input(false);
  /** Whether a preview is staged, which the discard button gives up. */
  readonly previewed = input(false);
  readonly error = input<string | null>(null);

  readonly presetChosen = output<string>();
  readonly flagToggled = output<{ key: string; on: boolean }>();
  readonly fileChosen = output<File>();
  readonly previewRequested = output<void>();
  readonly discarded = output<void>();

  protected onFile(event: Event): void {
    this.chosen((event.target as HTMLInputElement).files?.[0]);
  }

  /** Cleared first, so choosing the same file again still fires change. */
  protected openPicker(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  protected chosen(file: File | undefined): void {
    if (file) this.fileChosen.emit(file);
  }
}
