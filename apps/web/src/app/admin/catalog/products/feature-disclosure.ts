import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SubEditorFrame } from '../ui/sub-editor-frame';

/** A switched feature's box (FR-ADM-20). Open on load where it is on; the lid
 * says "on" where the list-shaped boxes give a count. */
@Component({
  selector: 'app-feature-disclosure',
  imports: [SubEditorFrame],
  host: { class: 'block' },
  template: `
    <app-sub-editor-frame
      [label]="label()"
      [glyph]="glyph()"
      [count]="on() ? 1 : 0"
      [countLabel]="text.switchedOn"
      [(open)]="open"
    >
      <ng-content />
    </app-sub-editor-frame>
  `,
})
export class FeatureDisclosure implements OnInit {
  protected readonly text = inject(ADMIN_TEXT).products.editor;

  readonly label = input.required<string>();
  readonly glyph = input.required<Glyph>();
  readonly on = input(false);

  protected readonly open = signal(false);

  ngOnInit(): void {
    this.open.set(this.on());
  }
}
