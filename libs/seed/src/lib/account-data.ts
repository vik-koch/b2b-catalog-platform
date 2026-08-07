/**
 * Demo accounts and the demo wholesale tier for the fictional Hamburg roastery.
 *
 * Everything here is fixture data for the demo deployment and local stacks:
 * addresses use reserved `.example` domains and never the `@example.com` the
 * e2e suites claim, and the tier key is a plain word where every e2e tier key
 * is prefixed `e2e-` — so a seeded stack and a test run cannot reach for the
 * same row.
 */

/** The one additional tier, beside the base list every product already has. */
export const wholesaleTier = {
  key: 'wholesale',
  label: 'Wholesale',
  sortOrder: 0,
};

/**
 * What the wholesale list takes off the base price, by top-level category.
 * A category with no entry is priced the same for everyone — the tier carries
 * only its exceptions, and the fallback to the base list is worth showing in
 * the demo rather than hiding behind a blanket discount.
 */
const wholesaleDiscount: Record<string, number> = {
  espresso: 0.18,
  filter: 0.15,
  decaf: 0.15,
  'single-origin': 0.12,
  tea: 0.12,
  'cold-brew': 0.1,
  syrups: 0.1,
  chocolate: 0.1,
  milk: 0.08,
  grinders: 0.07,
  machines: 0.07,
};

/**
 * The wholesale price for a product, or null where the tier does not price it.
 * Rounded down to whole ten cents, which is how a real price list reads.
 */
export function wholesalePriceMinor(
  categoryKey: string,
  priceMinor: number,
): number | null {
  const discount = wholesaleDiscount[categoryKey];
  if (discount === undefined) return null;
  return Math.floor((priceMinor * (1 - discount)) / 10) * 10;
}

export interface AccountSeed {
  email: string;
  role: 'admin' | 'manager' | 'user';
  status: 'pending' | 'invited' | 'active' | 'disabled' | 'anonymized';
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  customerType: 'person' | 'company' | null;
  companyRegistrationId: string | null;
  /** True for the accounts staff put on the wholesale list. */
  wholesale: boolean;
  /**
   * Fixed id, for the one row seeded already anonymized: its address is derived
   * from the id, so the seed has to know the id to write the address the app's
   * own deletion would have produced — and knowing it is also what keeps the
   * re-seed a no-op.
   */
  id?: string;
}

/** Staff. Both offices work the same customer list; neither may touch roles. */
const staff: AccountSeed[] = [
  {
    email: 'office1@coffee-kontor.example',
    role: 'manager',
    status: 'active',
    firstName: 'Birte',
    lastName: 'Ahrens',
    phone: '+494012345001',
    customerType: null,
    companyRegistrationId: null,
    wholesale: false,
  },
  {
    email: 'office2@coffee-kontor.example',
    role: 'manager',
    status: 'active',
    firstName: 'Jonas',
    lastName: 'Petersen',
    phone: '+494012345002',
    customerType: null,
    companyRegistrationId: null,
    wholesale: false,
  },
];

/**
 * Customers, written out one per line rather than generated, so the list reads
 * like the account screen it fills: a long tail of ordinary active accounts,
 * plus enough of every other state to show what those look like.
 *
 * Tier and customer type are related but not derived from one another (ADR
 * 0031): most companies buy at wholesale and most people at the base list, and
 * the exceptions in both directions are here on purpose.
 */
const customer = (
  email: string,
  firstName: string,
  lastName: string,
  digits: string,
  customerType: 'person' | 'company',
  status: AccountSeed['status'],
  wholesale: boolean,
  companyRegistrationId: string | null = null,
): AccountSeed => ({
  email,
  role: 'user',
  status,
  firstName,
  lastName,
  // Stored the way the app stores every number: country code plus bare
  // national digits, no grouping. `40` is the area code and the leading `1`
  // pads each roster entry to the ten digits the demo mask asks for — a number
  // that is one digit short reads as incomplete and cannot be re-saved.
  phone: `+49401${digits}`,
  customerType,
  companyRegistrationId,
  wholesale,
});

// One line per account — email, name, phone digits, type, status, wholesale,
// registration number — so the roster reads like the list it fills.
// prettier-ignore
const customers: AccountSeed[] = [
  // Companies on the wholesale list — the bulk of the book.
  customer('einkauf@cafe-nordlicht.example', 'Lena', 'Brinkmann', '2010001', 'company', 'active', true, 'DE811234501'),
  customer('bestellung@roesterei-eimsbuettel.example', 'Tobias', 'Wendt', '2010002', 'company', 'active', true, 'DE811234502'),
  customer('office@hafenkantine.example', 'Marlene', 'Suhr', '2010003', 'company', 'active', true, 'DE811234503'),
  customer('kontakt@backhaus-altona.example', 'Hendrik', 'Voss', '2010004', 'company', 'active', true, 'DE811234504'),
  customer('einkauf@hotel-elbblick.example', 'Sabine', 'Rohde', '2010005', 'company', 'active', true, 'DE811234505'),
  customer('info@kantine-speicherstadt.example', 'Yusuf', 'Demir', '2010006', 'company', 'active', true, 'DE811234506'),
  customer('einkauf@buchcafe-ottensen.example', 'Clara', 'Wieland', '2010007', 'company', 'active', true, 'DE811234507'),
  customer('bestellung@kaffeebar-schanze.example', 'Nils', 'Grote', '2010008', 'company', 'active', true, 'DE811234508'),
  customer('office@coworking-hammerbrook.example', 'Petra', 'Lindemann', '2010009', 'company', 'active', true, 'DE811234509'),
  customer('einkauf@bistro-winterhude.example', 'Ali', 'Haddad', '2010010', 'company', 'active', true, 'DE811234510'),

  // Companies that buy at retail volumes, so nobody put them on the list.
  customer('hallo@atelier-stpauli.example', 'Marie', 'Kroeger', '2010011', 'company', 'active', false, 'DE811234511'),
  customer('kontakt@buero-harvestehude.example', 'Sven', 'Thiel', '2010012', 'company', 'active', false, 'DE811234512'),

  // People, on the base list — the ordinary case.
  customer('anna.behrens@mail.example', 'Anna', 'Behrens', '2010013', 'person', 'active', false),
  customer('m.oezdemir@mail.example', 'Meltem', 'Özdemir', '2010014', 'person', 'active', false),
  customer('j.kowalski@mail.example', 'Jakub', 'Kowalski', '2010015', 'person', 'active', false),
  customer('greta.hansen@mail.example', 'Greta', 'Hansen', '2010016', 'person', 'active', false),
  customer('p.dasilva@mail.example', 'Paulo', 'da Silva', '2010017', 'person', 'active', false),
  customer('k.novak@mail.example', 'Katarína', 'Novák', '2010018', 'person', 'active', false),

  // …and one who buys a pallet at a time, tier assigned by hand.
  customer('r.steinberg@mail.example', 'Rita', 'Steinberg', '2010019', 'person', 'active', true),

  // Registrations waiting for someone to decide: no tier, no approver, and
  // nothing they can sign in with.
  customer('einkauf@teestube-eppendorf.example', 'Ingrid', 'Falk', '2010020', 'company', 'pending', false, 'DE811234520'),
  customer('bestellung@foodtruck-elbpark.example', 'Mehmet', 'Yildiz', '2010021', 'company', 'pending', false, 'DE811234521'),
  customer('l.jansen@mail.example', 'Lars', 'Jansen', '2010022', 'person', 'pending', false),
  customer('s.moreau@mail.example', 'Sophie', 'Moreau', '2010023', 'person', 'pending', false),

  // Approved, tier assigned, link sent — still nothing to sign in with.
  customer('einkauf@konditorei-uhlenhorst.example', 'Bettina', 'Schroeder', '2010024', 'company', 'invited', true, 'DE811234524'),
  customer('office@brauerei-veddel.example', 'Arne', 'Duwe', '2010025', 'company', 'invited', true, 'DE811234525'),
  customer('t.iverson@mail.example', 'Thea', 'Iverson', '2010026', 'person', 'invited', false),

  // Switched off, name kept: the customer who stopped ordering, and the one
  // whose shop closed.
  customer('einkauf@kiosk-barmbek.example', 'Dieter', 'Möller', '2010027', 'company', 'disabled', true, 'DE811234527'),
  customer('f.abiodun@mail.example', 'Femi', 'Abiodun', '2010028', 'person', 'disabled', false),
];

/**
 * The self-deleted account (FR-AUTH-06): a tombstone, not a person. Written as
 * the app's own anonymization leaves it — every identifying column null, the
 * address derived from the row id — because what staff screens have to cope
 * with is this shape, not a tidier stand-in.
 */
const anonymized: AccountSeed = {
  id: '00000000-0000-4000-8000-00000000d001',
  email: 'deleted-00000000-0000-4000-8000-00000000d001@deleted.invalid',
  role: 'user',
  status: 'anonymized',
  firstName: null,
  lastName: null,
  phone: null,
  customerType: null,
  companyRegistrationId: null,
  wholesale: false,
};

export const accountSeeds: AccountSeed[] = [...staff, ...customers, anonymized];

/** The roles that approve customers — used to pick the seeded approver. */
export const managerEmails = staff.map((s) => s.email);

/**
 * The password every demo account that can sign in shares. Public on purpose:
 * this seeds the public demo, where the point is that a visitor can look around
 * as a customer. It is only ever written by the dev-only content seed, so no
 * deployment that carries real accounts ever runs it.
 */
export const DEMO_PASSWORD = 'demo-kontor-2021';
