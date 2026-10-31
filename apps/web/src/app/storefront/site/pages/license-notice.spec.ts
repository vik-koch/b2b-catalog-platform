import { parseLicenseNotices } from './license-notice';

const RULE = '-'.repeat(80);

/** A faithful excerpt of what the Angular build writes. */
const NOTICE_FILE = `
${RULE}
Package: slugify
License: "MIT"

The MIT License (MIT)

Copyright (c) Simeon Velichkov

Permission is hereby granted, free of charge.

${RULE}
Package: @angular/cdk
License: "MIT"

The MIT License

Copyright (c) 2026 Google LLC.
`;

describe('parseLicenseNotices', () => {
  it('splits the notice file into one entry per package', () => {
    const notices = parseLicenseNotices(NOTICE_FILE);

    expect(notices.map((n) => n.name)).toEqual(['slugify', '@angular/cdk']);
    expect(notices.map((n) => n.license)).toEqual(['MIT', 'MIT']);
  });

  it('keeps the license text verbatim, minus the header lines', () => {
    const [slugify] = parseLicenseNotices(NOTICE_FILE);

    expect(slugify.text).toContain('The MIT License (MIT)');
    expect(slugify.text).toContain('Copyright (c) Simeon Velichkov');
    // The header is structure, not part of the notice that must be reproduced.
    expect(slugify.text).not.toContain('Package:');
    expect(slugify.text).not.toContain('License:');
  });

  it('reports a package that declares no license rather than dropping it', () => {
    const notices = parseLicenseNotices(
      `${RULE}\nPackage: mystery\n\nSome license text.\n`,
    );

    expect(notices).toEqual([
      { name: 'mystery', license: null, text: 'Some license text.' },
    ]);
  });

  it('is empty for an empty file', () => {
    expect(parseLicenseNotices('')).toEqual([]);
  });
});
