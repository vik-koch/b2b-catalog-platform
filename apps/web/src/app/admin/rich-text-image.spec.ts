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

  it('renders width as both data-width and an inline pixel width style', () => {
    const out = html('<img src="/media/a.webp" data-width="240" />');
    expect(out).toContain('data-width="240"');
    // The DOM serializer may normalize spacing (width: 240px); match either form.
    expect(out).toMatch(/width:\s*240px/);
  });

  it('round-trips placement attributes it parsed from HTML', () => {
    const out = html(
      '<img src="/media/a.webp" data-align="center" data-width="360" />',
    );
    expect(out).toContain('data-align="center"');
    expect(out).toMatch(/width:\s*360px/);
  });

  it('emits no placement attributes when none are set', () => {
    const out = html('<img src="/media/a.webp" />');
    expect(out).not.toContain('data-align');
    expect(out).not.toContain('data-width');
    expect(out).not.toContain('style');
  });

  it('wraps a linked image in an anchor, read back from the parent <a>', () => {
    const out = html(
      '<a href="https://shop.test"><img src="/media/a.webp" /></a>',
    );
    expect(out).toContain('href="https://shop.test"');
    expect(out).toContain('src="/media/a.webp"');
    // The <a> comes before the <img> (it wraps it), not the reverse.
    expect(out.indexOf('<a')).toBeLessThan(out.indexOf('<img'));
  });

  it('renders no anchor when the image has no link', () => {
    expect(html('<img src="/media/a.webp" />')).not.toContain('<a');
  });
});
