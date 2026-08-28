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

/**
 * Describes what the software actually does with a customer's data, section by
 * section — most importantly what "delete my account" means here, which is
 * narrower than a plain reading (ADR 0032: the row survives, tombstoned). A
 * notice that promised more than the code delivers would be the wrong half of
 * the pair to leave unmaintained.
 */
export const privacyPageSeed: PageSeed = {
  slug: 'privacy',
  title: 'Privacy policy',
  bodyHtml: [
    '<p>We store only the data needed to decide on your account and to run',
    'it once it is open.</p>',
    '<h2>What we store</h2>',
    '<ul>',
    '<li>What you tell us when you register: your name, email address and',
    'phone number, and — if you register as a company — your business',
    'registration number.</li>',
    '<li>A pricing group, which our staff assign when they approve your',
    'account. It decides which price list you see and is not shown to you;',
    'ask us and we will tell you which one you are on.</li>',
    '<li>Any delivery addresses you save, so you do not retype them.</li>',
    '<li>Your order history, and on each order the details you gave with it:',
    'who to contact about it, where it goes, and who it is invoiced to.</li>',
    '</ul>',
    '<p>Our staff can see and correct these details. We do not sell or share',
    'personal data with third parties beyond what delivery requires.</p>',
    '<h2>Cookies and what stays in your browser</h2>',
    '<p>No tracking or marketing cookies are set, and nothing here is shared',
    'with anyone. What the site does keep on your device is:</p>',
    '<ul>',
    '<li>A sign-in cookie, and a second one noting only that you are signed',
    'in, so a page does not first draw itself as though you were not.</li>',
    '<li>Whether you last viewed product listings as cards or as rows.</li>',
    '<li>Your cart. It is held in your browser rather than on our servers,',
    'so it is not part of your account and does not follow you to another',
    'device — and it stays until you order it or empty it yourself.</li>',
    '</ul>',
    '<h2>If we cannot open an account for you</h2>',
    '<p>A registration we decline is deleted outright, along with everything',
    'you entered on it.</p>',
    '<h2>Deleting your account</h2>',
    '<p>You can delete your account yourself, from your account page. Doing',
    'so removes your name, contact details and pricing group, and closes the',
    'account for good — it cannot be undone.</p>',
    '<p>Two things deliberately survive it, and it is worth knowing which:</p>',
    '<ul>',
    '<li>Past orders are kept for as long as our bookkeeping obligations',
    'require, with your personal details removed from them.</li>',
    '<li>A record with no personal data in it remains, so that those orders',
    'and our internal change history still refer to something. Your email',
    'address is removed from it, which means you are free to register again',
    'later — but that is a new account, and your earlier orders will not',
    'appear in it.</li>',
    '</ul>',
    '<h2>Your rights</h2>',
    '<p>You can ask us at any time what we hold about you, have it',
    'corrected, or have it deleted. Deleting your account does most of this',
    'directly; get in touch for anything else.</p>',
    '<p>A production deployment replaces this page with the operating',
    "business's own privacy notice, as required by its jurisdiction.</p>",
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

/**
 * The contact page's prose. The office list and maps around it are deployment
 * config rendered by the code route; only this part is editable content.
 */
export const contactPageSeed: PageSeed = {
  slug: 'contact',
  title: 'Contact',
  bodyHtml: [
    '<p>Visit us or get in touch — find our offices below.</p>',
    '<p>Our wholesale team answers enquiries within one working day. For',
    'existing accounts, please quote your customer number.</p>',
  ].join('\n'),
};

export const pageSeeds: PageSeed[] = [
  aboutPageSeed,
  conditionsPageSeed,
  privacyPageSeed,
  imprintPageSeed,
  contactPageSeed,
];
