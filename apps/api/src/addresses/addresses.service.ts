import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq } from 'drizzle-orm';
import {
  Address,
  ADDRESS_BOOK_MAX,
  AddressConfig,
  AddressInput,
} from '@b2b-catalog-platform/shared';
import { ADDRESS_CONFIG } from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { addresses } from '../db/schema';

type AddressRow = typeof addresses.$inferSelect;

/** The one 404 here; a function so each throw carries its own stack. */
const notFound = () =>
  new NotFoundException({
    code: 'address-not-found',
    message: 'Address not found',
  });

function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    label: row.label,
    street: row.street,
    street2: row.street2,
    postalCode: row.postalCode,
    city: row.city,
    region: row.region,
    country: row.country,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * One account's address book. Every query is scoped by the `userId` the session
 * carries and never by anything in the request, so "may I touch this row" is
 * not a question this service can answer wrongly — a row belonging to somebody
 * else simply does not match, and reads as a 404.
 */
@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ADDRESS_CONFIG) private readonly config: AddressConfig | undefined,
  ) {}

  /** Oldest first: the book is a short list and a stable order is worth more
   * than recency here — the picker's rows should not move under a customer. */
  async list(userId: string): Promise<Address[]> {
    const rows = await this.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(asc(addresses.createdAt), asc(addresses.id));
    return rows.map(toAddress);
  }

  async create(userId: string, input: AddressInput): Promise<Address> {
    this.assertValid(input);

    // Checked rather than enforced by a constraint: a ceiling on a list is a
    // refusal the form can explain, not a database error to translate.
    const count = await this.db.$count(addresses, eq(addresses.userId, userId));
    if (count >= ADDRESS_BOOK_MAX) {
      throw new ConflictException({
        code: 'address-limit-reached',
        message: `An account may keep at most ${ADDRESS_BOOK_MAX} addresses`,
      });
    }

    const [row] = await this.db
      .insert(addresses)
      .values({ userId, ...input })
      .returning();
    return toAddress(row);
  }

  /**
   * The first address of a brand-new account, from the company suggestion its
   * owner picked (FR-AUTH-10). Silent on every refusal, because it is a
   * courtesy on a path that must not fail for it: a registration is not worth
   * less because a registry answered half an address.
   *
   * An ordinary row in every other respect — no verified flag, nothing locked —
   * so the account holder edits or deletes it like any other.
   */
  async seed(userId: string, input: AddressInput): Promise<void> {
    try {
      await this.create(userId, input);
    } catch (error) {
      this.logger.warn(
        `Could not seed the first address: ${(error as Error).message}`,
      );
    }
  }

  async update(
    userId: string,
    id: string,
    input: AddressInput,
  ): Promise<Address> {
    this.assertValid(input);

    const [row] = await this.db
      .update(addresses)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();
    if (!row) throw notFound();
    return toAddress(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const [row] = await this.db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning({ id: addresses.id });
    if (!row) throw notFound();
  }

  /**
   * The deployment's own rules, applied server-side: a picker and a mask are
   * entry aids, and a rule enforced only in the browser is not a rule.
   *
   * Public because checkout runs it over an address that never entered the
   * book — a guest's, typed once — and the two must be held to the same rules.
   */
  assertValid(input: AddressInput): void {
    this.assertSupportedCountry(input.country);
  }

  /**
   * The country list is a rule, not only a picker: the browser sends whatever
   * it likes, and an address outside the countries a deployment ships to would
   * become an order nobody can fulfil. A deployment that configures none takes
   * any well-formed code.
   */
  private assertSupportedCountry(country: string): void {
    const countries = this.config?.countries;
    if (!countries) return;
    if (!countries.some((entry) => entry.code === country)) {
      throw new ConflictException({
        code: 'unsupported-country',
        message: `This deployment does not ship to ${country}`,
      });
    }
  }
}
