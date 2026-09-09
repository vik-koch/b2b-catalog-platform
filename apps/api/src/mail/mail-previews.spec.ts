import { mailPreviews, renderMailPreviews } from './mail-previews';

/**
 * The gallery's own guard rail. The committed previews are checked against the
 * templates by `tools/generate-mail-previews.mjs --check` in CI; what a byte
 * comparison cannot say is whether the message it compared makes sense, so the
 * things that are wrong in *any* message are asserted here once instead of
 * template by template.
 */
describe('mail previews', () => {
  const rendered = renderMailPreviews();

  it('names every message once, so no preview overwrites another', () => {
    const slugs = mailPreviews.map((preview) => preview.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(rendered.map((preview) => [preview.slug, preview] as const))(
    '%s says something in both parts',
    (_slug, preview) => {
      expect(preview.rendered.subject).not.toBe('');
      expect(preview.content.heading).not.toBe('');
      // The preheader is what an inbox shows next to the subject; a message
      // without one is read as a blank line in every client that shows it.
      expect(preview.content.preheader).not.toBe('');
      expect(preview.rendered.text).toContain(preview.content.heading);
      expect(preview.rendered.html).toContain('<!doctype html>');
    },
  );

  /**
   * The wording is a template with `{placeholders}` the code fills in, and a
   * renamed placeholder fails silently: the mail goes out with the braces still
   * in it. Cheap to catch here, and impossible to see in a passing unit test
   * that asserted on a different field.
   */
  it.each(rendered.map((preview) => [preview.slug, preview] as const))(
    '%s leaves no placeholder unfilled',
    (_slug, preview) => {
      expect(preview.rendered.text).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(preview.rendered.subject).not.toMatch(/\{[a-zA-Z]+\}/);
    },
  );
});
