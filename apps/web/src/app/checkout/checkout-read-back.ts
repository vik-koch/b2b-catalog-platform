import { computed, inject, Signal } from '@angular/core';
import {
  AddressInput,
  fillText,
  unitQuantity,
} from '@b2b-catalog-platform/shared';
import { AddressForm } from '../addresses/address-form';
import { addressLines } from '../addresses/address-format';
import { CartService, CartStoredLine } from '../cart/cart.service';
import { formatPriceMinor } from '../catalog/price';
import { formatUnitQuantity } from '../catalog/quantity';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { ReadBackLine, ReviewBlock } from '../orders/order-read-back';
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
  const text = inject(APP_TEXT).checkout;
  const catalogText = inject(APP_TEXT).catalog;
  const locations = config.pickup?.locations ?? [];

  /**
   * The quantity in the unit the line was bought through and, where that is
   * not the piece, what it comes to in pieces — a unit is a lens on a piece
   * count (FR-UNIT-01), and this is the one screen where the figure the shop
   * actually picks is worth spelling out beside the one that was ordered.
   */
  const lineQuantity = (line: CartStoredLine): string => {
    const review = text.review;
    const units = catalogText.units;
    const qty = formatUnitQuantity(
      unitQuantity(line.packaging, line.unit, line.pieces) ?? line.pieces,
      config.catalog.currency,
    );
    const unit = units[line.unit];
    if (line.unit === 'piece') {
      return fillText(review.quantity, { qty, unit });
    }
    return fillText(review.quantityPieces, {
      qty,
      unit,
      pieces: formatUnitQuantity(line.pieces, config.catalog.currency),
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
    return addressLines(
      { ...address, id: '', createdAt: '', updatedAt: '' },
      config.address,
    );
  };

  const formatDate = (iso: string): string =>
    new Intl.DateTimeFormat(config.catalog.currency.locale, {
      dateStyle: 'long',
    }).format(new Date(`${iso}T00:00:00`));

  return {
    lines: computed<ReadBackLine[]>(() =>
      cart.lines().map((line) => ({
        key: line.slug,
        name: line.name,
        note: line.note,
        quantity: lineQuantity(line),
        // A dash rather than a zero: a line the shop cannot price yet is not a
        // free one, and the summary beside this says so in full.
        total:
          line.lineTotalMinor === null
            ? '—'
            : formatPriceMinor(line.lineTotalMinor, config.catalog.currency),
      })),
    ),

    blocks: computed<ReviewBlock[]>(() => {
      const draft = deps.draft();
      const review = text.review;
      const fulfilment = text.fulfilment;

      const arrival = deps.isPickup()
        ? [fulfilment.pickupTitle, ...pickupLines()]
        : [
            fulfilment.deliveryTitle,
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
        { heading: review.fulfilment, lines: arrival },
        { heading: review.invoice, lines: invoice },
        {
          // The form's own words for the question, so the read-back is the
          // same question and not a shorter one: what is recorded is a wish.
          heading: deps.isPickup()
            ? text.timing.pickupLabel
            : text.timing.deliveryLabel,
          lines: [
            draft.preferredDate
              ? formatDate(draft.preferredDate)
              : review.whenAny,
          ],
        },
        {
          heading: review.payment,
          lines: [
            draft.paymentMethod === 'bank-transfer'
              ? text.payment.transferTitle
              : text.payment.cashTitle,
          ],
        },
      ];
      // Only where there is one: an empty heading is a question the customer
      // answered by leaving it alone.
      if (draft.customerNote) {
        blocks.push({ heading: review.note, lines: [draft.customerNote] });
      }
      // A blank line would be a claim that something was answered with nothing.
      return blocks.map((block) => ({
        ...block,
        lines: block.lines.filter((line) => line.trim().length > 0),
      }));
    }),
  };
}
