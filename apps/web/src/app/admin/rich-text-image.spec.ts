import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { RichTextImage } from './rich-text-image';

function html(content: string): string {
  const editor = new Editor({
    extensions: [StarterKit, RichTextImage.configure({ inline: false })],
    content,
  });
  const out = editor.getHTML();
  editor.destroy();
  return out;
}

describe('RichTextImage', () => {
  it('renders alignment as data-align', () => {
    expect(html('<img src="/media/a.webp" data-align="right" />')).toContain(
      'data-align="right"',
    );
  });

  it('renders width as both data-width and an inline width style', () => {
    const out = html('<img src="/media/a.webp" data-width="40" />');
    expect(out).toContain('data-width="40"');
    // The DOM serializer may normalize spacing (width: 40%); match either form.
    expect(out).toMatch(/width:\s*40%/);
  });

  it('round-trips placement attributes it parsed from HTML', () => {
    const out = html(
      '<img src="/media/a.webp" data-align="center" data-width="75" />',
    );
    expect(out).toContain('data-align="center"');
    expect(out).toMatch(/width:\s*75%/);
  });

  it('emits no placement attributes when none are set', () => {
    const out = html('<img src="/media/a.webp" />');
    expect(out).not.toContain('data-align');
    expect(out).not.toContain('data-width');
    expect(out).not.toContain('style');
  });
});
