import {
  OrderingParty,
  PaymentMethod,
  resolveDeliveryZone,
  OrderAdjustment,
} from '@b2b-catalog-platform/shared/core/ordering';
import { DeliveryConfig } from '@b2b-catalog-platform/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {} from 'drizzle-orm';
import {
  AddressInput,
  CustomerType,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  rowBillingAddress,
  OrderRow,
  OrderDetails,
  Fulfilment,
} from './order-rows';
import { AddressesService } from '../accounts/addresses.service';
import {
  BILLING_ADDRESS_ENABLED,
  ACCEPTED_CUSTOMER_TYPES,
  COMPANY_ID_RULE,
  CompanyIdRule,
  DELIVERY_CONFIG,
  PICKUP_LOCATIONS,
  PickupLocation,
} from '../../config/deployment-config';

/**
 * What an order must say to be written, held the same for the checkout and a
 * manager's adjustment: an order a customer could not place, staff may not
 * write either.
 */
@Injectable()
export class OrderRules {
  constructor(
    private readonly addresses: AddressesService,
    @Inject(PICKUP_LOCATIONS)
    private readonly locations: readonly PickupLocation[],
    @Inject(DELIVERY_CONFIG)
    private readonly delivery: DeliveryConfig | undefined,
    @Inject(COMPANY_ID_RULE) private readonly companyIdRule: CompanyIdRule,
    @Inject(ACCEPTED_CUSTOMER_TYPES)
    private readonly customerTypes: readonly CustomerType[],
    @Inject(BILLING_ADDRESS_ENABLED)
    private readonly billingAddressEnabled: boolean,
  ) {}

  /**
   * The addresses an order carries, by the deployment's own country rules — the
   * same ones a saved address is held to. A guest's address never passed
   * through the book, so this is the only place it is checked.
   */
  assertAddresses(order: OrderDetails): void {
    const billing = this.billingAddress(order);
    if (billing) this.checkAddress(billing);
    if (order.deliveryAddress) {
      this.checkAddress(order.deliveryAddress);
    }
  }

  /**
   * The address the invoice goes to, as this deployment answers the question.
   * Where it invoices none of its own (FR-CART-07), a browser sending one
   * anyway is out of step with the config its form was drawn from, and the
   * order carries nothing rather than an address the shop does not use.
   */
  billingAddress(order: OrderDetails): AddressInput | null {
    if (!this.billingAddressEnabled) return null;
    if (!order.billingAddress) {
      throw new BadRequestException({
        code: 'billing-address-required',
        message: 'This deployment invoices an address of its own',
      });
    }
    return order.billingAddress;
  }

  /**
   * The book refuses an address with a 409, which is this endpoint's
   * cart-changed answer and carries a re-priced cart with it. Here the same
   * refusals are a malformed submission, so they are re-thrown as the 400 the
   * contract lists them under — otherwise the browser would read a refusal
   * about a postcode as a cart that moved, and look for pricing that is not
   * there.
   */
  private checkAddress(address: AddressInput): void {
    try {
      this.addresses.assertValid(address);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new BadRequestException(error.getResponse());
      }
      throw error;
    }
  }

  /**
   * The two rules that tie the party to how the order is paid, asked wherever
   * an order is written — the checkout, and a manager adjusting one. A rule
   * only staff were held to on the way in would be a rule the shop could
   * break on the way past.
   */
  assertParty(party: OrderingParty, method: PaymentMethod): void {
    // A party with a registration number is a company and one without is a
    // person, the same reading the payment rules below make. First, because a
    // kind the shop does not sell to is refused whatever it pays with.
    const kind: CustomerType = party.registrationId ? 'company' : 'person';
    if (!this.customerTypes.includes(kind)) {
      throw new BadRequestException({
        code: 'customer-type-not-accepted',
        message: 'This shop does not sell to that kind of customer',
      });
    }

    if (
      party.registrationId !== null &&
      !this.companyIdRule(party.registrationId)
    ) {
      throw new BadRequestException({
        code: 'invalid-company-id',
        message: 'The registration number matches no configured format',
      });
    }

    if (method === 'bank-transfer' && !party.registrationId) {
      throw new BadRequestException({
        code: 'billing-details-required',
        message: 'Bank transfer invoices a company, which needs its number',
      });
    }

    // A company is invoiced. Neither of the two ways a private customer
    // settles up — cash at the door, a card arranged on the phone — leaves the
    // paper a company is owed, and an order written either way would have to
    // be put right before it could be invoiced at all.
    if (method !== 'bank-transfer' && party.registrationId) {
      throw new BadRequestException({
        code: 'cash-not-available',
        message: 'A company is invoiced, never paid in cash or by card',
      });
    }
  }

  /**
   * Where the order goes, decided **once**. The contract guarantees a
   * submission carries exactly one destination — an address or a collection
   * point, never both and never neither — so this is the only place that has to
   * know which it is, and the zone is resolved from the server's own config
   * rather than from anything the browser sent.
   */
  resolveFulfilment(order: OrderDetails): Fulfilment {
    if (order.fulfilmentMethod === 'delivery') {
      const address = order.deliveryAddress;
      // Narrowed rather than asserted: the refine is what guarantees it, and if
      // that guarantee is ever loosened this must fail loudly, not book an
      // order to nowhere.
      if (!address)
        throw new Error('a delivery order reached submit with no address');
      const zone = resolveDeliveryZone(this.delivery?.zones ?? [], address);
      return {
        address,
        zone: zone && {
          key: zone.key,
          freeFromMinor: zone.freeFromMinor ?? null,
        },
        pickup: null,
      };
    }

    const key = order.pickupLocationKey;
    const location = this.locations.find((entry) => entry.key === key);
    if (!location) {
      throw new BadRequestException({
        code: 'unknown-pickup-location',
        message: 'That collection point does not exist',
      });
    }
    return { address: null, zone: null, pickup: location };
  }

  /**
   * The invoice address the new version carries. Where the deployment invoices
   * an address of its own it is the one the form sent; where it does not, the
   * version keeps what the order already carried.
   *
   * The order is a snapshot: one submitted while the shop asked for an invoice
   * address holds the address the customer gave, and turning that question off
   * changes what checkout asks rather than what an order already says. Nulling
   * it here would make every adjustment of an older order silently delete an
   * address nobody touched.
   */
  adjustedBilling(
    input: OrderAdjustment,
    current: OrderRow,
  ): AddressInput | null {
    if (this.billingAddressEnabled) return this.billingAddress(input);
    // The snapshot carries no label — nothing reads one off an order.
    const carried = rowBillingAddress(current);
    return carried && { ...carried, label: null };
  }
}
