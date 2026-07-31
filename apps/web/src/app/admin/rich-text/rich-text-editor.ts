import {
  afterNextRender,
  Component,
  computed,
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
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  RICH_TEXT_IMAGE_ALIGNMENTS,
  RICH_TEXT_IMAGE_SIZE_MAX_PERCENT,
  RICH_TEXT_IMAGE_SIZE_MIN_PERCENT,
  RICH_TEXT_LINK_SCHEMES,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { LucideIcon, LucideIconName } from '../../ui/icons/lucide-icon';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import { RichTextImage } from './rich-text-image';
import { MediaService } from '../media/media.service';

type ImageAlign = (typeof RICH_TEXT_IMAGE_ALIGNMENTS)[number];

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
  imports: [LucideIcon, FieldLabel, Input],
  template: `
    <div class="relative">
      <div
        class="overflow-hidden rounded-md border border-border-strong bg-white focus-within:border-primary focus-within:outline-1 focus-within:outline-offset-0 focus-within:outline-primary"
      >
        <div
          role="toolbar"
          [attr.aria-label]="text.toolbar.label"
          class="flex flex-wrap items-center gap-0.5 border-b border-border bg-stone-100 p-1.5"
        >
          @for (action of visibleActions(); track action.id) {
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
        <!-- Typography's direct-child rules do not survive the .ProseMirror
             wrapper; styles.css re-applies them so the editing surface matches
             the saved page exactly. -->
        <div
          #host
          class="prose prose-stone max-w-none p-4 [&_.ProseMirror]:min-h-64 [&_.ProseMirror]:outline-none"
        ></div>
      </div>

      <input
        #fileInput
        type="file"
        class="hidden"
        [accept]="acceptImages"
        (change)="onFileSelected($event)"
      />

      @if (uploading()) {
        <p class="mt-2 text-sm text-muted" role="status">
          {{ common.uploading }}
        </p>
      }
      @if (uploadError()) {
        <p class="mt-2 text-sm text-red-700" role="alert">
          {{ common.uploadError }}
        </p>
      }

      @if (linkPanelOpen()) {
        <div
          class="absolute left-2 top-14 z-10 w-72 rounded-md border border-border-strong bg-white p-3 shadow-lg"
          role="dialog"
          [attr.aria-label]="link.heading"
        >
          <label class="block">
            <span appFieldLabel>{{ link.urlLabel }}</span>
            <input
              #linkInput
              type="text"
              appInput
              size="sm"
              class="w-full"
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
                {{ common.remove }}
              </button>
            }
            <button
              type="button"
              class="rounded px-2 py-1 text-sm text-ink hover:bg-stone-100"
              (click)="closeLinkPanel()"
            >
              {{ common.cancel }}
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

      @if (imagePanelOpen()) {
        <div
          class="absolute right-2 top-14 z-10 w-72 rounded-md border border-border-strong bg-white p-3 shadow-lg"
          role="dialog"
          [attr.aria-label]="image.heading"
        >
          <label class="block">
            <span appFieldLabel>{{ image.altLabel }}</span>
            <input
              type="text"
              appInput
              size="sm"
              class="w-full"
              [placeholder]="image.altPlaceholder"
              [value]="imageAlt()"
              (input)="onImageAltInput($any($event.target).value)"
            />
            <span class="mt-1 block text-xs text-subtle">{{
              image.altHint
            }}</span>
          </label>

          <label class="mt-3 block">
            <span appFieldLabel>{{ image.linkLabel }}</span>
            <input
              type="text"
              appInput
              size="sm"
              class="w-full"
              [placeholder]="image.linkPlaceholder"
              [value]="imageHref()"
              (input)="onImageHrefInput($any($event.target).value)"
            />
          </label>

          <div class="mt-3">
            <span appFieldLabel>{{ image.alignLabel }}</span>
            <div class="flex gap-1">
              <button
                type="button"
                [class]="alignButtonClass(imageAlign() === null)"
                (click)="setImageAlign(null)"
              >
                {{ image.alignNone }}
              </button>
              @for (a of alignments; track a) {
                <button
                  type="button"
                  [class]="alignButtonClass(imageAlign() === a)"
                  (click)="setImageAlign(a)"
                >
                  {{ alignLabel(a) }}
                </button>
              }
            </div>
          </div>

          <label class="mt-3 block">
            <span class="mb-1 flex justify-between text-sm font-medium">
              <span>{{ image.widthLabel }}</span>
              <span class="text-subtle">{{ imageSize() }}%</span>
            </span>
            <input
              type="range"
              class="w-full accent-primary"
              [min]="sizeMin"
              [max]="sizeMax"
              [value]="imageSize()"
              (input)="onImageSizeInput($any($event.target).value)"
            />
          </label>

          <div class="mt-3 flex justify-end gap-2">
            <button
              type="button"
              class="mr-auto rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
              (click)="removeImage()"
            >
              {{ image.remove }}
            </button>
            <button
              type="button"
              class="rounded bg-primary px-2 py-1 text-sm text-white hover:bg-primary/90"
              (click)="closeImagePanel()"
            >
              {{ image.done }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class RichTextEditor {
  protected readonly text = inject(ADMIN_TEXT).pageEditor;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly link = this.text.linkPanel;
  protected readonly image = this.text.imagePanel;
  private readonly media = inject(MediaService);

  protected readonly acceptImages = ACCEPTED_IMAGE_MIME_TYPES.join(',');
  protected readonly sizeMin = RICH_TEXT_IMAGE_SIZE_MIN_PERCENT;
  protected readonly sizeMax = RICH_TEXT_IMAGE_SIZE_MAX_PERCENT;
  protected readonly alignments = RICH_TEXT_IMAGE_ALIGNMENTS;

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly linkInput =
    viewChild<ElementRef<HTMLInputElement>>('linkInput');
  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Read once, when the editor is created; later edits flow out via output. */
  readonly value = input<string>('');
  readonly contentChange = output<string>();

  /**
   * Which vocabulary the editor exposes. `page` (default) is the full static-page
   * set; `product` is the product-description set (PRODUCT_RICH_TEXT_TAGS: the
   * page set minus headings, links and images). The preset gates both the
   * toolbar and the tiptap schema, so a product editor cannot even produce markup
   * the server would strip on save.
   */
  readonly preset = input<'page' | 'product'>('page');

  /** Toolbar buttons the product preset hides (everything else stays). */
  private readonly productHiddenIds = [
    'heading2',
    'heading3',
    'link',
    'unlink',
    'image',
  ];
  protected readonly visibleActions = computed<ToolbarAction[]>(() =>
    this.preset() === 'product'
      ? this.actions.filter((a) => !this.productHiddenIds.includes(a.id))
      : this.actions,
  );

  private editor?: Editor;
  /** Whether a caret has ever been placed; gates the toolbar's active states. */
  private focused = false;
  protected readonly activeIds = signal<string[]>([]);
  protected readonly linkPanelOpen = signal(false);
  protected readonly linkDraft = signal('');
  protected readonly editingExistingLink = signal(false);
  // Image editing panel, driven by whether the current selection is an image.
  protected readonly imagePanelOpen = signal(false);
  protected readonly imageAlt = signal('');
  // Raw link text as typed; normalized to an allowed URL before it is stored.
  protected readonly imageHref = signal('');
  protected readonly imageAlign = signal<ImageAlign | null>(null);
  // Percentage of the image's natural width shown on the size slider; the node
  // stores the resulting pixel width.
  protected readonly imageSize = signal(RICH_TEXT_IMAGE_SIZE_MAX_PERCENT);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal(false);
  // Document position of the image the panel is currently bound to, so panel
  // state is re-seeded only when the selection moves to a different image.
  private selectedImagePos: number | null = null;
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
    {
      id: 'image',
      label: this.text.toolbar.image,
      icon: 'image',
      run: () => this.pickImage(),
      isActive: (e) => e.isActive('image'),
    },
  ];

  constructor() {
    afterNextRender(() => this.createEditor());
    inject(DestroyRef).onDestroy(() => this.editor?.destroy());
  }

  private createEditor(): void {
    const minimal = this.preset() === 'product';
    // The product preset disables the nodes outside PRODUCT_RICH_TEXT_TAGS
    // (headings and links; images come from a separate extension omitted below),
    // so the schema itself — not just the toolbar — refuses them. Lists, quotes,
    // underline, strike and the divider stay.
    const starterKit = minimal
      ? StarterKit.configure({
          code: false,
          codeBlock: false,
          heading: false,
          link: false,
        })
      : StarterKit.configure({
          // Excluded because they are not in the server allowlist.
          code: false,
          codeBlock: false,
          heading: { levels: [2, 3, 4] },
          link: {
            protocols: [...RICH_TEXT_LINK_SCHEMES],
            openOnClick: false,
            HTMLAttributes: { rel: 'noopener noreferrer', target: null },
          },
        });

    this.editor = new Editor({
      element: this.host().nativeElement,
      content: this.value(),
      extensions: minimal
        ? [starterKit]
        : [
            starterKit,
            // Same-origin uploaded images only; base64 would defeat the store.
            RichTextImage.configure({ inline: false, allowBase64: false }),
          ],
      editorProps: {
        // Pasted (or dragged-in) image files must go through the media store
        // like any other image — otherwise the browser drops in a blob/data URL
        // that dies with the tab and never survives a save. Swallowed entirely
        // in the product preset, whose schema has no image node.
        handlePaste: (_view, event) =>
          this.handleImageFiles(event.clipboardData?.files),
        handleDrop: (_view, event) =>
          this.handleImageFiles((event as DragEvent).dataTransfer?.files),
      },
      onFocus: () => {
        // Until the user actually puts a caret in the document, the toolbar
        // reflects nothing: ProseMirror's initial selection sits at the start of
        // the first block, which would light up its buttons (a list, a quote)
        // with no visible caret to explain why.
        this.focused = true;
        if (this.editor) this.refreshActive(this.editor);
      },
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
      this.focused
        ? this.actions.filter((a) => a.isActive?.(editor)).map((a) => a.id)
        : [],
    );
    // Mirror the selected image's attributes into the panel signals, but only
    // when the *selected image changes* — re-seeding them on every keystroke
    // would rewrite the alt input mid-edit and jump the caret. While the same
    // image stays selected, the panel's own handlers own the signals.
    if (editor.isActive('image')) {
      const pos = editor.state.selection.from;
      if (pos !== this.selectedImagePos) {
        this.selectedImagePos = pos;
        const attrs = editor.getAttributes('image');
        this.imageAlt.set(attrs['alt'] ?? '');
        this.imageHref.set(attrs['href'] ?? '');
        this.imageAlign.set(attrs['align'] ?? null);
        this.syncImageSize(Number(attrs['width']) || 0);
      }
      this.imagePanelOpen.set(true);
    } else {
      this.selectedImagePos = null;
      this.imagePanelOpen.set(false);
    }
  }

  /**
   * Derives the size-slider percentage from the stored pixel width and the
   * image's natural width. If the image has not finished loading yet its natural
   * width is 0, so recompute once it loads; until then default to full size.
   */
  private syncImageSize(widthPx: number): void {
    const img = this.selectedImage();
    const toPercent = () => {
      const natural = img?.naturalWidth ?? 0;
      this.imageSize.set(
        natural > 0 && widthPx > 0
          ? Math.round((widthPx / natural) * 100)
          : RICH_TEXT_IMAGE_SIZE_MAX_PERCENT,
      );
    };
    if (img && img.naturalWidth === 0) {
      img.addEventListener('load', toPercent, { once: true });
    }
    toPercent();
  }

  /** The DOM node of the currently selected image, if any. */
  private selectedImage(): HTMLImageElement | null {
    return this.host().nativeElement.querySelector<HTMLImageElement>(
      'img.ProseMirror-selectednode',
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

  protected alignButtonClass(active: boolean): string {
    const base = 'flex-1 rounded px-2 py-1 text-xs transition-colors';
    return active
      ? `${base} bg-primary text-white`
      : `${base} text-ink hover:bg-stone-200`;
  }

  protected alignLabel(align: ImageAlign): string {
    return align === 'left'
      ? this.image.alignLeft
      : align === 'center'
        ? this.image.alignCenter
        : this.image.alignRight;
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

  protected pickImage(): void {
    this.uploadError.set(false);
    this.fileInput()?.nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file again still fires a change event.
    input.value = '';
    if (file) {
      await this.uploadAndInsert(file);
    }
  }

  /**
   * Takes over a paste or drop that carries an image file, routing it through
   * the same upload as the toolbar button. Returns true when it handled the
   * event (ProseMirror then leaves the clipboard content alone), false to let
   * normal handling continue — text pastes are untouched. The product preset
   * has no image node, so there it only blocks the file.
   */
  private handleImageFiles(files: FileList | null | undefined): boolean {
    const accepted: readonly string[] = ACCEPTED_IMAGE_MIME_TYPES;
    const file = [...(files ?? [])].find((f) => accepted.includes(f.type));
    if (!file) {
      return false;
    }
    if (this.preset() !== 'product') {
      void this.uploadAndInsert(file);
    }
    return true;
  }

  /** Uploads an image and inserts it at the caret, then selects it. */
  private async uploadAndInsert(file: File): Promise<void> {
    if (!this.editor) {
      return;
    }

    this.uploadError.set(false);
    this.uploading.set(true);
    try {
      const src = await this.media.upload(file);
      // Insert at natural size (no width attr — CSS caps it at the column), then
      // select it so the panel opens for alt and placement right away.
      this.editor
        .chain()
        .focus()
        .insertContent({ type: 'image', attrs: { src } })
        .run();
      // The image is a block node, so inserting it splits the current paragraph
      // and the cursor lands in the block after it — a fixed offset back would
      // miss. Find the image nearest before the cursor (the one just inserted)
      // and select it, which opens the placement panel via onSelectionUpdate.
      const { doc, selection } = this.editor.state;
      let imagePos: number | null = null;
      doc.descendants((node, pos) => {
        if (node.type.name === 'image' && pos < selection.from) {
          imagePos = pos;
        }
      });
      if (imagePos !== null) {
        this.editor.commands.setNodeSelection(imagePos);
      }
    } catch {
      this.uploadError.set(true);
    } finally {
      this.uploading.set(false);
    }
  }

  // Panel edits deliberately do NOT call .focus(): focusing the editor would
  // pull focus out of the panel's own input after each keystroke. The image
  // stays selected in editor state regardless of DOM focus, so updateAttributes
  // still targets it.
  protected onImageAltInput(value: string): void {
    this.imageAlt.set(value);
    this.editor?.chain().updateAttributes('image', { alt: value }).run();
  }

  protected onImageHrefInput(value: string): void {
    this.imageHref.set(value);
    const trimmed = value.trim();
    // Empty clears the link; otherwise normalize like a text link. The server
    // sanitizer is the final authority on the scheme and forces the safe rel.
    this.editor
      ?.chain()
      .updateAttributes('image', {
        href: trimmed ? normalizeHref(trimmed) : null,
      })
      .run();
  }

  protected setImageAlign(align: ImageAlign | null): void {
    this.imageAlign.set(align);
    this.editor?.chain().updateAttributes('image', { align }).run();
  }

  protected onImageSizeInput(value: string): void {
    const percent = Number(value);
    this.imageSize.set(percent);
    const natural = this.selectedImage()?.naturalWidth ?? 0;
    if (!this.editor || natural <= 0) {
      return;
    }
    // Percent of the image's natural width -> absolute pixels (what we store).
    const width = Math.max(1, Math.round((natural * percent) / 100));
    this.editor.chain().updateAttributes('image', { width }).run();
  }

  protected removeImage(): void {
    this.editor?.chain().focus().deleteSelection().run();
    this.imagePanelOpen.set(false);
  }

  protected closeImagePanel(): void {
    this.imagePanelOpen.set(false);
    this.editor?.chain().focus().run();
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
