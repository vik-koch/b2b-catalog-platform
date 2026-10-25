import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openRoute } from './open-route';
import { AUDIT_ROUTES, stateFile } from './routes';

/*
 * The axe findings per audited page against WCAG 2.1 A and AA, kept as a text
 * baseline in tmp/baselines/a11y/. A run that adds a finding fails with the
 * line it added; one that fixes a finding fails too, until the baseline is
 * retaken, so progress is recorded rather than assumed.
 */

const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** What axe measured, for a contrast finding: the colour decision it needs. */
function measured(node: { any: { data?: unknown }[] }): string {
  const data = node.any[0]?.data as
    | {
        contrastRatio?: number;
        expectedContrastRatio?: string;
        fgColor?: string;
        bgColor?: string;
      }
    | undefined;
  return data?.contrastRatio
    ? `  ${data.contrastRatio}:1, needs ${data.expectedContrastRatio}, ${data.fgColor} on ${data.bgColor}`
    : '';
}

for (const route of AUDIT_ROUTES) {
  test.describe(() => {
    if (route.as) test.use({ storageState: stateFile(route.as) });
    // Someone else's embed, and the random strip the screenshot hides too.
    const excluded = ['iframe', ...(route.hide ? [route.hide] : [])];

    test(route.name, async ({ page }, { project }) => {
      await openRoute(page, route);
      const { violations } = await excluded
        .reduce(
          (builder, selector) => builder.exclude(selector),
          new AxeBuilder({ page }).withTags(WCAG_21_AA),
        )
        .analyze();
      const report = violations
        .map((violation) =>
          [
            `${violation.id} (${violation.impact}): ${violation.help}`,
            ...violation.nodes.map(
              (node) => `  ${node.target.join(' ')}${measured(node)}`,
            ),
          ].join('\n'),
        )
        .sort()
        .join('\n');
      expect(`${report || 'no findings'}\n`).toMatchSnapshot([
        'a11y',
        project.name,
        `${route.name}.txt`,
      ]);
    });
  });
}
