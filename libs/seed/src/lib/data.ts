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

export const conditionsPageSeed: PageSeed = {
  slug: 'conditions',
  title: 'Payment & delivery',
  bodyHtml: [
    '<h2>Ordering &amp; payment</h2>',
    '<p>We sell wholesale to businesses. Orders are invoiced — payment by',
    'bank transfer within 14 days of the invoice date. Recurring customers',
    'receive individually agreed prices and payment terms; contact us to set',
    'up an account.</p>',
    '<h2>Delivery</h2>',
    '<ul>',
    '<li>Hamburg metropolitan area: own delivery, typically within two',
    'working days</li>',
    '<li>Germany and EU: freight partners, three to five working days</li>',
    '<li>Pickup at our Speicherstadt warehouse by arrangement</li>',
    '</ul>',
    '<p>Roast dates are printed on every bag; we ship no coffee older than',
    'ten days past roast.</p>',
  ].join('\n'),
};

export const privacyPageSeed: PageSeed = {
  slug: 'privacy',
  title: 'Privacy policy',
  bodyHtml: [
    '<p>We store only the data needed to run your wholesale account and',
    'process orders.</p>',
    '<h2>What we store</h2>',
    '<p>Account details (company, contact person, delivery address) and your',
    'order history. We do not sell or share personal data with third',
    'parties beyond what delivery requires.</p>',
    '<h2>Cookies</h2>',
    '<p>This site uses only cookies that are strictly necessary for signing',
    'in. No tracking or marketing cookies are set.</p>',
    '<h2>Your rights</h2>',
    '<p>You can request access to, correction of, or deletion of your',
    'personal data at any time. When an account is deleted, personal data is',
    'removed and past orders are anonymized.</p>',
  ].join('\n'),
};

export const imprintPageSeed: PageSeed = {
  slug: 'imprint',
  title: 'Imprint',
  bodyHtml: [
    '<p><strong>Coffee Kontor</strong> is a fictional demonstration shop —',
    'no real business is operated under this name and no orders are',
    'fulfilled.</p>',
    '<h2>Demonstration details</h2>',
    '<p>Coffee Kontor Roastery &amp; Wholesale<br />',
    'Speicherstra&szlig;e 0, 20457 Hamburg, Germany<br />',
    'Managing director: Max Mustermann<br />',
    'Commercial register: HRB 000000 (fictional)<br />',
    'VAT ID: DE000000000 (fictional)</p>',
    '<p>A production deployment replaces this page with the operating',
    "business's real seller information as required by its jurisdiction.</p>",
  ].join('\n'),
};

export const pageSeeds: PageSeed[] = [
  aboutPageSeed,
  conditionsPageSeed,
  privacyPageSeed,
  imprintPageSeed,
];
