import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq } from 'drizzle-orm';
import { AddressConfig } from '@b2b-catalog-platform/shared';
import { ADDRESS_CONFIG } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { addresses } from '../../db/schema';
import {
  Address,
  ADDRESS_BOOK_MAX,
  AddressInput,
  postalCodeMatches,
  postalCodeRuleFor,
} from '@b2b-catalog-platform/shared/core/accounts';

type AddressRow = typeof addresses.$inferSelect;

/** A function, so each throw carries its own stack. */
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

/** One account's address book. Every query is scoped by the session's
 * account, so another's row does not match and reads as a 404. */
@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(ADDRESS_CONFIG) private readonly config: AddressConfig | undefined,
  ) {}

  /** Oldest first, so the picker's rows never move. */
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

  /** A new account's first address, from its company suggestion
   * (FR-AUTH-10). Silent on a refusal: registration must not fail for it. */
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

  /** Public for checkout, which holds a guest's address to the same rules. */
  assertValid(input: AddressInput): void {
    this.assertSupportedCountry(input.country);
    this.assertPostalCode(input);
  }

  /** No countries configured: any well-formed code. */
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

  /** The delivery zone is read from this field, so a malformed code quotes
   * an order against the wrong area. */
  private assertPostalCode(input: AddressInput): void {
    const rule = postalCodeRuleFor(input.country, this.config?.countries);
    if (postalCodeMatches(input.postalCode, rule)) return;
    throw new ConflictException({
      code: 'invalid-postal-code',
      message: `A postal code in ${input.country} looks like ${rule?.example}`,
    });
  }
}
