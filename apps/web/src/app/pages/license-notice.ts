/** One package's entry in the build's third-party notice file. */
export interface LicenseNotice {
  readonly name: string;
  /** SPDX id as the package declared it, or null when it declared none. */
  readonly license: string | null;
  /** The verbatim license text — the part that actually satisfies the clause. */
  readonly text: string;
}

/**
 * Parses `3rdpartylicenses.txt` as the Angular build writes it: blocks divided
 * by a rule of dashes, each opening with `Package:` and `License:` lines and
 * followed by the verbatim license text.
 *
 * Deliberately forgiving — a block the format changes under us still renders,
 * it just carries less structure. Silently dropping an attribution because a
 * header line moved is the one failure mode worth designing against here.
 */
export function parseLicenseNotices(source: string): LicenseNotice[] {
  return source
    .split(/^-{10,}$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(parseBlock)
    .filter((notice): notice is LicenseNotice => notice !== null);
}

function parseBlock(block: string): LicenseNotice | null {
  const name = /^Package:[ \t]*(.+)$/m.exec(block)?.[1]?.trim();
  if (!name) return null;

  const license = /^License:[ \t]*(.+)$/m.exec(block)?.[1]?.trim();
  // The build quotes the id ("MIT"); the quotes are not part of it.
  const spdx = license ? license.replace(/^"(.*)"$/, '$1') : null;

  // Everything after the last header line is the license text itself.
  const headerEnd = /^License:.*$/m.exec(block);
  const text = headerEnd
    ? block.slice(headerEnd.index + headerEnd[0].length).trim()
    : block.slice(block.indexOf('\n') + 1).trim();

  return { name, license: spdx, text };
}
