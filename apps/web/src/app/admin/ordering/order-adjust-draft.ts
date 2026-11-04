import { fillText, MoneyFormat } from '@b2b-catalog-platform/shared/platform';
import {
  AdminOrderDetail,
  OrderAdjustmentPreview,
  PaymentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';
import { ProductUnit } from '@b2b-catalog-platform/shared/core/catalog';
import { AddressDraft } from '../../core/accounts/addresses/address-form';
import {
  formatPriceInput,
  parsePriceInput,
} from '../../core/catalog/pricing/price';
import { AdminText } from '../../shared/config/admin-text.type';
import { AdjustmentRefusal } from './orders.service';

export type PartyKind = 'person' | 'company';

/** One line as the form holds it, before the server has priced it. */
export interface DraftLine {
  /** Stable, so a row and its cursor survive reordering and removal. */
  key: string;
  slug: string;
  name: string;
  pieces: number;
  /** The customer's reading; null on a line staff added. */
  unit: ProductUnit | null;
  note: string | null;
  priceText: string;
  /** Waiting for the list's price: sent without one, which asks the server to
   * price it; the answer fills the field, so a manager rounds it rather than
   * retyping. */
  fromList: boolean;
}

/** The answers the details fold holds in its form. */
export interface AdjustAnswers {
  party: { personName: string; companyName: string; companyId: string };
  contact: { name: string; email: string; phone: string };
  delivery: AddressDraft;
  billing: AddressDraft;
}

/** Which fold a refusal is said in, beside its fields. */
export const REFUSAL_PART: Record<AdjustmentRefusal, 'lines' | 'details'> = {
  'unknown-product': 'lines',
  'unknown-tier': 'lines',
  'invalid-company-id': 'details',
  'billing-details-required': 'details',
  'cash-not-available': 'details',
  'billing-address-required': 'details',
  'customer-type-not-accepted': 'details',
  'unsupported-country': 'details',
  'invalid-postal-code': 'details',
  'unknown-pickup-location': 'details',
  'order-changed': 'details',
  // Raised only by the save, so said under the note.
  'no-change': 'details',
  'order-not-found': 'details',
};

/** The order's lines as the form starts them. */
export function draftLines(
  order: AdminOrderDetail,
  currency: MoneyFormat,
): DraftLine[] {
  return order.lines.map((line, index) => ({
    key: `${index}-${line.slug}`,
    slug: line.slug,
    name: line.name,
    pieces: line.pieces,
    unit: line.unit,
    note: line.note,
    priceText: formatPriceInput(line.priceMinor, currency),
    fromList: false,
  }));
}

/** Null for an empty field, which asks the list. */
export function draftPrice(
  line: DraftLine,
  currency: MoneyFormat,
): number | null {
  if (line.fromList || !line.priceText.trim()) return null;
  return parsePriceInput(line.priceText, currency);
}

/** A company is invoiced only: cash and card are refused by the server, so not
 * offered. */
export function paymentOptions(
  kind: PartyKind,
  payments: AdminText['orders']['paymentMethods'],
): { value: PaymentMethod; label: string }[] {
  const invoiced = {
    value: 'bank-transfer' as const,
    label: payments.transfer,
  };
  if (kind === 'company') return [invoiced];
  return [
    { value: 'cash', label: payments.cash },
    invoiced,
    { value: 'card-later', label: payments.card },
  ];
}

/** Off the list where it differs; a line the list does not price cannot be off
 * it. */
export function offList(line: {
  priceMinor: number;
  listPriceMinor: number | null;
}): boolean {
  return (
    line.listPriceMinor !== null && line.priceMinor !== line.listPriceMinor
  );
}

/** A price moved here, and one already off the list (provisional pricing):
 * neither shows in a total, so both are said above the save. */
export function priceNotices(
  order: AdminOrderDetail,
  preview: OrderAdjustmentPreview,
  text: AdminText['orders']['adjust']['priceNotice'],
  tier: string,
): string[] {
  const was = new Map(order.lines.map((line) => [line.slug, line]));
  const moved = preview.lines.filter((line) => {
    const before = was.get(line.slug);
    return before !== undefined && before.priceMinor !== line.priceMinor;
  }).length;
  const off = preview.lines.filter(offList).length;

  const notices: string[] = [];
  if (moved > 0) notices.push(fillText(text.moved, { count: moved }));
  if (off > 0) notices.push(fillText(text.offList, { count: off, tier }));
  return notices;
}
