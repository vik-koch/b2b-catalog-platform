import { computed, inject, Signal } from '@angular/core';
import {
  AddressInput,
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared';
import { unitQuantity } from '@b2b-catalog-platform/shared/core/catalog';
import { AddressForm } from '../../shared/addresses/address-form';
import { addressLines } from '../../shared/addresses/address-format';
import { CartService, CartStoredLine } from '../../shared/cart/cart.service';
import { formatUnitQuantity } from '../../core/catalog/buying/quantity';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { useTaxStatement } from '../../core/catalog/pricing/tax-statement';
import { ReadBackLine, ReviewBlock } from '../../shared/orders/order-read-back';
import { CheckoutDraft } from './checkout-draft.service';

/**
 * What the read-back has to be told, because none of it can be worked out from
 * the draft alone: which address a picker settled on, what the account is
 * called, and whether the invoice has an address of its own to state.
 */
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

/**
 * The order as the customer is shown it before sending (ADR 0039) — the same
 * answers the submission is built from, worded rather than encoded, so what is
 * shown and what is sent cannot differ.
 */
export function createCheckoutReadBack(deps: ReadBackDeps) {
  const cart = inject(CartService);
  const config = inject(DEPLOYMENT_CONFIG);
  const text = inject(STOREFRONT_TEXT).checkout;
  const common = inject(SHARED_TEXT);
  const names = common.order;
  const locations = config.pickup?.locations ?? [];

  /**
   * The quantity in the unit the line was bought through and, where that is
   * not the piece, what it comes to in pieces — a unit is a lens on a piece
   * count (FR-UNIT-01), and this is the one screen where the figure the shop
   * actually picks is worth spelling out beside the one that was ordered.
   */
  const lineQuantity = (line: CartStoredLine): string => {
    const units = common.units;
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

  /** Who the invoice is made out to — the account's own party, or the one the
   * form named. The number under the name, where there is one. */
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
    return addressLines(address, config.address);
  };

  const tax = useTaxStatement();

  const formatDate = (iso: string): string =>
    new Intl.DateTimeFormat(config.locale, {
      dateStyle: 'long',
    }).format(new Date(`${iso}T00:00:00`));

  return {
    lines: computed<ReadBackLine[]>(() => {
      // The cart's own rule: a line states its rate once the lines differ.
      const perLine = tax.perLine(cart.taxRates());
      return cart.lines().map((line) => ({
        key: line.slug,
        name: line.name,
        note: line.note,
        quantity: lineQuantity(line),
        // A dash rather than a zero: a line the shop cannot price yet is not a
        // free one, and the summary beside this says so in full.
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
      const review = text.review;

      const arrival = deps.isPickup()
        ? [common.fulfilment.pickup, ...pickupLines()]
        : [
            common.fulfilment.delivery,
            ...lines(
              deps.addressFor(draft.deliveryAddressId, deps.deliveryForm),
            ),
          ];

      // The party, and where its invoice goes — the second half only where the
      // deployment invoices an address at all.
      const invoice = [partyName()];
      if (deps.needsBillingPicker()) {
        invoice.push(
          ...lines(deps.addressFor(draft.billingAddressId, deps.billingForm)),
        );
      } else if (deps.billingEnabled) {
        invoice.push(review.billingSame);
      }

      const blocks: ReviewBlock[] = [
        { heading: common.fulfilment.label, lines: arrival },
        { heading: names.invoicedTo, lines: invoice },
        {
          // The form's own words for the question, so the read-back is the
          // same question and not a shorter one: what is recorded is a wish.
          heading: deps.isPickup()
            ? names.preferredPickup
            : names.preferredDelivery,
          lines: [
            draft.preferredDate
              ? formatDate(draft.preferredDate)
              : review.whenAny,
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
      // Only where there is one: an empty heading is a question the customer
      // answered by leaving it alone.
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
