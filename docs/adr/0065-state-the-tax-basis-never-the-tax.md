# 0065 — State the tax basis, never the tax

**Status:** accepted · **Date:** 2026-10-06

## Context

A shop's prices are quoted on a tax basis: tax included, tax added on the
invoice, or no tax charged ([NFR-LEGAL-11](../requirements.md#nfr-legal-11)).
Goods may be taxed at different rates, and the rate and the basis both change
while orders are open, through a new rate or through the shop becoming liable
for tax.

Working out the tax was considered: the amount contained in an included price,
or added to a net one, shown under every total. It would make the platform a
second author of a figure the shop's billing documents already state — the
invoice from the shop's own system, the receipt from its till. Rounding per line
or per total, per rate group or per document, is that system's rule, and a
figure computed here could differ from the invoice by a cent with nothing to
say which one is right. Some jurisdictions also forbid showing the tax as a
separate amount on documents handed to consumers.

## Decision

The platform states the basis and the rates, and calculates nothing from
them. The basis is the seller's, set once per deployment, and an order keeps
the basis it was submitted under. A rate belongs to each line, and a version of
an order states the rates in force when it was written. A total names the rate
its lines share, or only the basis once they differ.

## Rationale

A statement cannot disagree with the invoice; an amount can. Every number the
platform shows is one it also stores and the shop also bills — prices, line
totals, the order total — and the tax would have been the first figure that is
only the platform's opinion.

The basis is the seller's rather than the product's because a total that adds
net prices to gross ones means nothing. "Everything exempt except these goods"
is a basis that charges tax, a default rate of nothing and a rate on those
goods.

A version re-reads the rate as it re-reads a price the line does not fix: if
the law moves a rate while an order is open, the shop's invoice will state the
new one, and a version written after the change should say the same.

## Consequences

- (+) No rounding rule, rate table or tax amount to keep in step with the
  shop's billing system; the source system that owns the catalog owns the
  rates.
- (+) A deployment in any jurisdiction picks its basis and words its own
  sentence.
- (−) A customer who wants the tax as a figure reads it off the invoice, not the
  order page.
- (−) A rate is a number with no meaning attached: a zero-rated product and an
  exempt one both read "0 %", and telling them apart would be a separate
  requirement.
