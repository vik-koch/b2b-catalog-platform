import { PageSlug } from '@b2b-catalog-platform/shared';

export interface PageSeed {
  slug: PageSlug;
  title: string;
  bodyHtml: string;
}

// Demo persona: a fictional Hamburg specialty-coffee importer/roastery
// selling wholesale to cafés, restaurants and offices across Europe.
export const aboutPageSeed: PageSeed = {
  slug: 'about',
  title: 'About us',
  bodyHtml: [
    "<p>From our warehouse at the edge of Hamburg's historic Speicherstadt",
    'we import, roast and distribute specialty coffee for cafés, restaurants',
    'and offices across Europe.</p>',
    '<h2>What we do</h2>',
    '<p>We source green coffee directly from growing cooperatives, roast in',
    'small batches, and deliver on wholesale terms — from a few kilograms for',
    'a neighbourhood café to recurring pallet orders for hotel groups.</p>',
    '<h2>How we work</h2>',
    '<ul>',
    '<li>Direct relationships with farms and export cooperatives</li>',
    '<li>Small-batch roasting profiles per origin lot</li>',
    '<li>Wholesale pricing negotiated per customer</li>',
    '</ul>',
  ].join('\n'),
};

// The remaining static pages (conditions, privacy, imprint) are seeded in a
// follow-up — extend this list, nothing else changes.
export const pageSeeds: PageSeed[] = [aboutPageSeed];
