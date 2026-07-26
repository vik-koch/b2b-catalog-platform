import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { RICH_TEXT_LINK_SCHEMES } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { LucideIcon, LucideIconName } from '../ui/icons/lucide-icon';

interface ToolbarAction {
  id: string;
  label: string;
  icon: LucideIconName;
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

/**
 * Rich-text editing surface, shared by static pages and (later) product copy.
 * The schema mirrors the server's allowlist exactly, so nothing the toolbar can
 * produce is stripped on save. Browser-only: created after render, never on SSR.
 */
@Component({
  selector: 'app-rich-text-editor',
  imports: [LucideIcon],
  template: `
    <div class="relative">
      <div
        class="overflow-hidden rounded-md border border-stone-300 focus-within:border-primary"
      >
        <div
          role="toolbar"
          [attr.aria-label]="text.toolbar.label"
          class="flex flex-wrap items-center gap-0.5 border-b border-stone-200 bg-stone-50 p-1.5"
        >
          @for (action of actions; track action.id) {
            <button
              type="button"
              [attr.aria-label]="action.label"
              [attr.title]="action.label"
              [attr.aria-pressed]="activeIds().includes(action.id)"
              [class]="buttonClass(activeIds().includes(action.id))"
              (click)="run(action)"
            >
              <app-lucide-icon [name]="action.icon" class="h-4 w-4" />
            </button>
          }
        </div>
        <div
          #host
          class="prose prose-stone max-w-none p-4 [&_.ProseMirror]:min-h-64 [&_.ProseMirror]:outline-none"
        ></div>
      </div>

      @if (linkPanelOpen()) {
        <div
          class="absolute left-2 top-14 z-10 w-72 rounded-md border border-stone-300 bg-white p-3 shadow-lg"
          role="dialog"
          [attr.aria-label]="link.heading"
        >
          <label class="block">
            <span class="mb-1 block text-sm font-medium">{{
              link.urlLabel
            }}</span>
            <input
              #linkInput
              type="text"
              class="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              [placeholder]="link.placeholder"
              [value]="linkDraft()"
              (input)="linkDraft.set($any($event.target).value)"
              (keydown.enter)="applyLink()"
              (keydown.escape)="closeLinkPanel()"
            />
          </label>
          <div class="mt-3 flex justify-end gap-2">
            @if (editingExistingLink()) {
              <button
                type="button"
                class="mr-auto rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
                (click)="removeLink()"
              >
                {{ link.remove }}
              </button>
            }
            <button
              type="button"
              class="rounded px-2 py-1 text-sm text-ink hover:bg-stone-100"
              (click)="closeLinkPanel()"
            >
              {{ link.cancel }}
            </button>
            <button
              type="button"
              class="rounded bg-primary px-2 py-1 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
              [disabled]="!linkDraft().trim()"
              (click)="applyLink()"
            >
              {{ link.apply }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class RichTextEditor {
  protected readonly text = inject(APP_TEXT).pageEditor;
  protected readonly link = this.text.linkPanel;

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly linkInput =
    viewChild<ElementRef<HTMLInputElement>>('linkInput');

  /** Read once, when the editor is created; later edits flow out via output. */
  readonly value = input<string>('');
  readonly contentChange = output<string>();

  private editor?: Editor;
  protected readonly activeIds = signal<string[]>([]);
  protected readonly linkPanelOpen = signal(false);
  protected readonly linkDraft = signal('');
  protected readonly editingExistingLink = signal(false);
  // Captured when the panel opens: focusing the input collapses the editor
  // selection, so we restore this range before applying the link.
  private linkRange: { from: number; to: number } | null = null;

  protected readonly actions: ToolbarAction[] = [
    {
      id: 'bold',
      label: this.text.toolbar.bold,
      icon: 'bold',
      run: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive('bold'),
    },
    {
      id: 'italic',
      label: this.text.toolbar.italic,
      icon: 'italic',
      run: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive('italic'),
    },
    {
      id: 'underline',
      label: this.text.toolbar.underline,
      icon: 'underline',
      run: (e) => e.chain().focus().toggleUnderline().run(),
      isActive: (e) => e.isActive('underline'),
    },
    {
      id: 'strike',
      label: this.text.toolbar.strikethrough,
      icon: 'strikethrough',
      run: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive('strike'),
    },
    {
      id: 'heading2',
      label: this.text.toolbar.heading2,
      icon: 'heading-2',
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: (e) => e.isActive('heading', { level: 2 }),
    },
    {
      id: 'heading3',
      label: this.text.toolbar.heading3,
      icon: 'heading-3',
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: (e) => e.isActive('heading', { level: 3 }),
    },
    {
      id: 'bulletList',
      label: this.text.toolbar.bulletList,
      icon: 'list',
      run: (e) => e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive('bulletList'),
    },
    {
      id: 'orderedList',
      label: this.text.toolbar.orderedList,
      icon: 'list-ordered',
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive('orderedList'),
    },
    {
      id: 'blockquote',
      label: this.text.toolbar.blockquote,
      icon: 'quote',
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      isActive: (e) => e.isActive('blockquote'),
    },
    {
      id: 'link',
      label: this.text.toolbar.link,
      icon: 'link',
      run: () => this.openLinkPanel(),
      isActive: (e) => e.isActive('link'),
    },
    {
      id: 'unlink',
      label: this.text.toolbar.unlink,
      icon: 'unlink',
      run: (e) => e.chain().focus().unsetLink().run(),
    },
    {
      id: 'removeFormatting',
      label: this.text.toolbar.removeFormatting,
      icon: 'remove-formatting',
      run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
    },
    {
      id: 'horizontalRule',
      label: this.text.toolbar.horizontalRule,
      icon: 'square-split-vertical',
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ];

  constructor() {
    afterNextRender(() => this.createEditor());
    inject(DestroyRef).onDestroy(() => this.editor?.destroy());
  }

  private createEditor(): void {
    this.editor = new Editor({
      element: this.host().nativeElement,
      content: this.value(),
      extensions: [
        StarterKit.configure({
          // Excluded because they are not in the server allowlist.
          code: false,
          codeBlock: false,
          heading: { levels: [2, 3, 4] },
          link: {
            protocols: [...RICH_TEXT_LINK_SCHEMES],
            openOnClick: false,
            HTMLAttributes: { rel: 'noopener noreferrer', target: null },
          },
        }),
      ],
      onUpdate: ({ editor }) => {
        this.contentChange.emit(editor.getHTML());
        this.refreshActive(editor);
      },
      onSelectionUpdate: ({ editor }) => this.refreshActive(editor),
    });
    this.refreshActive(this.editor);
  }

  private refreshActive(editor: Editor): void {
    this.activeIds.set(
      this.actions.filter((a) => a.isActive?.(editor)).map((a) => a.id),
    );
  }

  protected run(action: ToolbarAction): void {
    if (this.editor) {
      action.run(this.editor);
    }
  }

  protected buttonClass(active: boolean): string {
    const base =
      'flex h-8 w-8 items-center justify-center rounded transition-colors';
    return active
      ? `${base} bg-primary text-white`
      : `${base} text-ink hover:bg-stone-200`;
  }

  private openLinkPanel(): void {
    if (!this.editor) {
      return;
    }
    const { from, to } = this.editor.state.selection;
    this.linkRange = { from, to };
    const href = this.editor.getAttributes('link')['href'] ?? '';
    this.editingExistingLink.set(!!href);
    this.linkDraft.set(href);
    this.linkPanelOpen.set(true);
    afterNextRender(() => this.linkInput()?.nativeElement.focus());
  }

  protected closeLinkPanel(): void {
    this.linkPanelOpen.set(false);
    this.linkRange = null;
    this.editor?.chain().focus().run();
  }

  protected removeLink(): void {
    this.editor?.chain().focus().unsetLink().run();
    this.closeLinkPanel();
  }

  protected applyLink(): void {
    const text = this.linkDraft().trim();
    const href = normalizeHref(text);
    if (!href || !this.editor) {
      return;
    }
    const range = this.linkRange;
    const chain = this.editor.chain().focus();
    if (range) {
      chain.setTextSelection(range);
    }
    if (range && range.from === range.to) {
      // No selection: drop the address in as its own linked text.
      chain.insertContent({
        type: 'text',
        text,
        marks: [{ type: 'link', attrs: { href } }],
      });
    } else {
      chain.extendMarkRange('link').setLink({ href });
    }
    chain.run();
    this.closeLinkPanel();
  }
}

/**
 * Turns friendly input into an allowed absolute URL: bare domains get https://,
 * bare addresses get mailto:. Anything already carrying an accepted scheme is
 * left as-is; the sanitizer is still the final authority.
 */
function normalizeHref(value: string): string {
  if (!value) {
    return '';
  }
  if (/^(https?:|mailto:)/i.test(value)) {
    return value;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `mailto:${value}`;
  }
  return `https://${value}`;
}
