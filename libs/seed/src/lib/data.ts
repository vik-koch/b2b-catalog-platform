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
 *
 * Three sections describe the exchange with the business system (NFR-LEGAL-07,
 * NFR-LEGAL-08) — the account, the orders it places, and what deleting it
 * reaches — and belong **only to a deployment that has one**. They are
 * seeded because the demo shop does: a transfer is configured, never assumed —
 * nothing leaves this platform until somebody issues a credential that can read
 * accounts or orders — so an operator who has issued none deletes those
 * sections, the same edit they make to every other line of this page.
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
    '<h2>Your account in our business system</h2>',
    '<p>We run the shop from the same system we run the rest of the business',
    'from, and the two are kept in step: your name, contact details, company',
    'details and pricing group are transferred to it, so that an order placed',
    'here can be invoiced and delivered there. The recipient is our own',
    'business software — the supplier who provides it can reach the data in',
    'the course of maintaining it, and nobody else does. Nothing about your',
    'password ever leaves this shop: it is stored here, and the business',
    'system neither receives it nor can set one for you.</p>',
    '<h2>Your orders in our business system</h2>',
    '<p>The orders you place here are transferred to the same system, for the',
    'same purpose and to the same recipient: what you ordered, what it came',
    'to, and the details you gave with it — who to contact about it, where it',
    'goes and who it is invoiced to. That is where the order is actually',
    'worked: what you read on it here — the state it is in, any agreed',
    'change, the invoice we send you — is what that system tells this one.',
    'Nothing else about you travels with it, and nothing about an order is',
    'passed on beyond what delivering and invoicing it requires.</p>',
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
    '<p>Deleting your account here reaches this shop, and we would rather say',
    'so plainly than promise more. Our business system is told that you have',
    'withdrawn, and it stops receiving anything further about you — but it',
    'keeps its own record of you under its own obligations, the same record it',
    'would hold for a customer who had never used this website. Ask us and we',
    'will deal with that side by hand. One detail survives here for your',
    'benefit: the reference our business system knows you by stays on the',
    'emptied record, which is what stops a later update from recreating the',
    'account you asked us to close.</p>',
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
 * The cancellation notice (NFR-LEGAL-04). Demo content: which shops owe one,
 * to whom, and in what words is a matter for the deployment's jurisdiction and
 * its lawyer — the platform only provides the page, and a deployment that owes
 * nothing simply does not publish it.
 */
export const withdrawalPageSeed: PageSeed = {
  slug: 'withdrawal',
  title: 'Right of withdrawal',
  bodyHtml: [
    '<p>This page is demonstration text for a fictional shop. A real',
    'deployment replaces it with the cancellation notice its own',
    'jurisdiction requires, in the wording that jurisdiction prescribes.</p>',
    '<h2>Who this applies to</h2>',
    '<p>We sell to businesses. Where an order is placed by a consumer rather',
    'than in the course of a trade, that consumer may have a statutory right',
    'to withdraw from the contract; the paragraphs below would set out how',
    'long that right lasts and how to exercise it.</p>',
    '<h2>How to withdraw</h2>',
    '<p>Tell us in writing — an email naming the order reference is enough.',
    'Quote the reference printed on the order confirmation so we can find',
    'it.</p>',
    '<h2>Goods that cannot be returned</h2>',
    '<p>Roasted coffee is a foodstuff. Once a sealed bag has been opened it',
    'cannot be taken back, for hygiene reasons; unopened goods in a',
    'resaleable condition can be.</p>',
    '<h2>Refunds</h2>',
    '<p>Where a withdrawal applies, the money is returned the way it was',
    'paid. This platform records payment as a fact rather than moving money,',
    'so a refund is arranged by the shop directly.</p>',
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
  withdrawalPageSeed,
  contactPageSeed,
];
