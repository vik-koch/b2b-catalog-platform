import { computed, inject, Signal } from '@angular/core';

import {
  AddressInput,
  addressLines,
} from '@b2b-catalog-platform/shared/core/accounts';
import { unitQuantity } from '@b2b-catalog-platform/shared/core/catalog';
import {
  calendarDay,
  fillText,
  formatMoneyMinor,
  moneyFormat,
} from '@b2b-catalog-platform/shared/platform';

import { ACCOUNTS_CONFIG } from '../../../core/accounts/accounts-config';
import { AddressForm } from '../../../core/accounts/addresses/address-form';
import { formatUnitQuantity } from '../../../core/catalog/buying/quantity';
import { SHARED_CATALOG_TEXT } from '../../../core/catalog/catalog-text';
import { useTaxStatement } from '../../../core/catalog/tax-statement';
import { ORDERING_CONFIG } from '../../../core/ordering/ordering-config';
import { SHARED_ORDERING_TEXT } from '../../../core/ordering/ordering-text';
import {
  ReadBackLine,
  ReviewBlock,
} from '../../../core/ordering/ui/order-read-back';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { CartService, CartStoredLine } from '../cart/cart.service';
import { STOREFRONT_ORDERING_TEXT } from '../ordering-text';
import { CheckoutDraft } from './checkout-draft';

/** What the draft alone cannot say: the settled addresses, the account's name,
 * whether an invoice address exists. */
export interface ReadBackDeps {
  draft: Signal<CheckoutDraft>;
  isPickup: Signal<boolean>;
  needsBillingPicker: Signal<boolean>;
  billingEnabled: boolean;
  guest: Signal<boolean>;
  /** The account's registered name, null until the profile answers. */
  accountName: Signal<string | null>;
  /** The chosen saved row, or what is in the picker's own fields. */
  addressFor: (id: string | null, form: AddressForm) => AddressInput | null;
  deliveryForm: AddressForm;
  billingForm: AddressForm;
  /** The party as the form named it, for the invoice heading. */
  typedParty: () => {
    personName: string;
    companyName: string;
    companyId: string;
  };
  /** A guest's own name, which doubles as their party's. */
  guestName: () => string;
}

/** The order as shown before sending, built from the same answers as the
 * submission. */
export function createCheckoutReadBack(deps: ReadBackDeps) {
  const cart = inject(CartService);
  const config = inject(DEPLOYMENT_CONFIG);
  const accountsConfig = inject(ACCOUNTS_CONFIG);
  const text = inject(STOREFRONT_ORDERING_TEXT).checkout;
  const blockText = inject(SHARED_ORDERING_TEXT).orderBlocks;
  const common = inject(SHARED_TEXT);
  const units = inject(SHARED_CATALOG_TEXT).units;
  const orderingNames = inject(SHARED_ORDERING_TEXT);
  const names = orderingNames.order;
  const locations = inject(ORDERING_CONFIG).pickup?.locations ?? [];

  /** The ordered quantity and, for another unit, its pieces (FR-UNIT-01): the
   * figure the shop picks. */
  const lineQuantity = (line: CartStoredLine): string => {
    const qty = formatUnitQuantity(
      unitQuantity(line.packaging, line.unit, line.pieces) ?? line.pieces,
      moneyFormat(config),
    );
    const unit = units[line.unit];
    if (line.unit === 'piece') {
      return fillText(common.quantity, { qty, unit });
    }
    return fillText(common.quantityPieces, {
      qty,
      unit,
      pieces: formatUnitQuantity(line.pieces, moneyFormat(config)),
      pieceUnit: units.piece,
    });
  };

  /** The chosen collection point, as it is configured. */
  const pickupLines = (): string[] => {
    const point = locations.find(
      (location) => location.key === deps.draft().pickupLocationKey,
    );
    return point ? [point.name, point.address] : [];
  };

  /** The invoiced party, with its number under the name where there is one. */
  const partyName = (): string => {
    const draft = deps.draft();
    if (draft.party === 'account') {
      return deps.accountName() ?? text.party.own;
    }
    const { personName, companyName, companyId } = deps.typedParty();
    const name =
      draft.party === 'company'
        ? companyName
        : deps.guest()
          ? deps.guestName()
          : personName;
    return draft.party === 'company' && companyId.trim()
      ? `${name.trim()} · ${companyId.trim()}`
      : name.trim();
  };

  const lines = (address: AddressInput | null): string[] => {
    if (!address) return [];
    return addressLines(address, accountsConfig.address);
  };

  const tax = useTaxStatement();

  return {
    lines: computed<ReadBackLine[]>(() => {
      // The cart's own rule: a line states its rate once the lines differ.
      const perLine = tax.perLine(cart.taxRates());
      return cart.lines().map((line) => ({
        key: line.slug,
        name: line.name,
        note: line.note,
        quantity: lineQuantity(line),
        // A dash, not a zero: an unpriced line is not free.
        total:
          line.lineTotalMinor === null
            ? '—'
            : formatMoneyMinor(line.lineTotalMinor, moneyFormat(config)),
        taxRate:
          perLine && line.taxRate != null ? tax.line(line.taxRate) : null,
      }));
    }),

    blocks: computed<ReviewBlock[]>(() => {
      const draft = deps.draft();

      const arrival = deps.isPickup()
        ? [orderingNames.fulfilment.pickup, ...pickupLines()]
        : [
            orderingNames.fulfilment.delivery,
            ...lines(
              deps.addressFor(draft.deliveryAddressId, deps.deliveryForm),
            ),
          ];

      // The invoice address only where the deployment invoices one.
      const invoice = [partyName()];
      if (deps.needsBillingPicker()) {
        invoice.push(
          ...lines(deps.addressFor(draft.billingAddressId, deps.billingForm)),
        );
      } else if (deps.billingEnabled) {
        invoice.push(blockText.billingSame);
      }

      const blocks: ReviewBlock[] = [
        { heading: orderingNames.fulfilment.label, lines: arrival },
        { heading: names.invoicedTo, lines: invoice },
        {
          // The form's own words: what is recorded is a wish.
          heading: deps.isPickup()
            ? names.preferredPickup
            : names.preferredDelivery,
          lines: [
            draft.preferredDate
              ? calendarDay(draft.preferredDate, config.locale)
              : blockText.whenAny,
          ],
        },
        {
          heading: names.payment,
          lines: [
            draft.paymentMethod === 'bank-transfer'
              ? names.paymentMethods.transfer
              : names.paymentMethods.cash,
          ],
        },
      ];
      if (draft.customerNote) {
        blocks.push({
          heading: names.note,
          lines: [draft.customerNote],
        });
      }
      // A blank line would be a claim that something was answered with nothing.
      return blocks.map((block) => ({
        ...block,
        lines: block.lines.filter((line) => line.trim().length > 0),
      }));
    }),
  };
}
