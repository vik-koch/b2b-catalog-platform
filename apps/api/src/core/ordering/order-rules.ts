import {
  OrderingParty,
  PaymentMethod,
  resolveDeliveryZone,
  OrderAdjustment,
  DeliveryConfig,
} from '@b2b-catalog-platform/shared/core/ordering';
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
  COMPANY_ID_RULE,
  CompanyIdRule,
  DELIVERY_CONFIG,
  PICKUP_LOCATIONS,
  PickupLocation,
} from '../../platform/config/deployment-config';
import { ACCEPTED_CUSTOMER_TYPES } from '../accounts/accounts-config';

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
   * The addresses by the deployment's country rules, as a saved address is
   * held: a guest's never passed through the book.
   */
  assertAddresses(order: OrderDetails): void {
    const billing = this.billingAddress(order);
    if (billing) this.checkAddress(billing);
    if (order.deliveryAddress) {
      this.checkAddress(order.deliveryAddress);
    }
  }

  /**
   * The invoice address, where the deployment invoices one of its own
   * (FR-CART-07); otherwise none, whatever a stale browser sent.
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
   * The book refuses with a 409, which here means a re-priced cart; re-thrown
   * as the 400 the contract lists, so a postcode is not read as a moved cart.
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
   * The party and payment rules, held for checkout and adjustment alike: a rule
   * the shop could break on the way past is no rule.
   */
  assertParty(party: OrderingParty, method: PaymentMethod): void {
    // A registration number makes a company. First: a kind the shop does not
    // sell to is refused whatever it pays with.
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

    // A company is invoiced: cash and a card by phone leave none of the paper
    // it is owed.
    if (method !== 'bank-transfer' && party.registrationId) {
      throw new BadRequestException({
        code: 'cash-not-available',
        message: 'A company is invoiced, never paid in cash or by card',
      });
    }
  }

  /**
   * Where the order goes, decided once: the contract guarantees one
   * destination, and the zone comes from the server's config, never the
   * browser.
   */
  resolveFulfilment(order: OrderDetails): Fulfilment {
    if (order.fulfilmentMethod === 'delivery') {
      const address = order.deliveryAddress;
      // Narrowed, not asserted: a loosened refine must fail loudly.
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
   * The invoice address an adjusted version carries: the form's where the
   * deployment invoices one, otherwise what the order already holds. Turning
   * the question off changes what checkout asks, not what an order says.
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
