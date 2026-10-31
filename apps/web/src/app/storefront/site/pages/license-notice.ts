/** One package's entry in the build's third-party notice file. */
export interface LicenseNotice {
  readonly name: string;
  /** SPDX id as the package declared it, or null when it declared none. */
  readonly license: string | null;
  readonly text: string;
}

/**
 * Parses the build's `3rdpartylicenses.txt`. Forgiving: a block whose format
 * changed still renders with less structure rather than dropping an
 * attribution.
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
