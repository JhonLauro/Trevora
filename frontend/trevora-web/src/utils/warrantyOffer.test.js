import { describe, expect, it } from 'vitest';
import { readWarrantyOffer, warrantyOfferPatch } from './warrantyOffer';

const receipt = (start, end) => ({
  fieldMetadata: { receiptWarrantyStartDate: start, receiptWarrantyExpiryDate: end },
});
const vehicleWith = (startDate, expiryDate) => ({
  vehicleId: 'v1',
  warranty: { status: startDate || expiryDate ? 'TIME_ONLY' : 'NOT_SET', startDate, expiryDate },
});

describe('warranty offer from a receipt', () => {
  it('offers the printed period to a vehicle with no warranty dates', () => {
    expect(readWarrantyOffer(receipt('2024-07-31', '2026-07-31'), vehicleWith(null, null)))
      .toEqual({ kind: 'offer', start: '2024-07-31', end: '2026-07-31' });
  });

  it('says nothing when the receipt printed no warranty dates', () => {
    expect(readWarrantyOffer(receipt(null, null), vehicleWith(null, null))).toBeNull();
    expect(readWarrantyOffer({ fieldMetadata: {} }, vehicleWith(null, null))).toBeNull();
  });

  it('says nothing when both sides agree, including a date only one side has', () => {
    expect(readWarrantyOffer(receipt('2024-07-31', '2026-07-31'), vehicleWith('2024-07-31', '2026-07-31')))
      .toBeNull();
    expect(readWarrantyOffer(receipt(null, '2026-07-31'), vehicleWith('2024-07-31', '2026-07-31')))
      .toBeNull();
  });

  /* A different date is usually a typo or an extended warranty, not another car. */
  it('reports a disagreement with both periods so the owner can choose', () => {
    expect(readWarrantyOffer(receipt('2024-07-31', '2027-07-31'), vehicleWith('2024-07-31', '2026-07-31')))
      .toEqual({
        kind: 'conflict',
        start: '2024-07-31',
        end: '2027-07-31',
        recordedStart: '2024-07-31',
        recordedEnd: '2026-07-31',
      });
  });

  it('ignores a value that is not an ISO date', () => {
    expect(readWarrantyOffer(receipt('31/07/2024', null), vehicleWith(null, null))).toBeNull();
  });

  it('sends only the dates the receipt printed, marked as from the receipt', () => {
    expect(warrantyOfferPatch({ start: '2024-07-31', end: '2026-07-31' }))
      .toEqual({ warrantySource: 'RECEIPT', warrantyStartDate: '2024-07-31', warrantyExpiryDate: '2026-07-31' });
    expect(warrantyOfferPatch({ start: null, end: '2026-07-31' }))
      .toEqual({ warrantySource: 'RECEIPT', warrantyExpiryDate: '2026-07-31' });
  });
});
