import { describe, expect, it } from 'vitest';
import { vehicleDetailsPayload } from '../components/ink/EditVehicleDetailsDialog.jsx';
import { warrantyDialogPayload } from '../components/ink/EditWarrantyDialog.jsx';

/**
 * Two partial editors, and a PATCH endpoint that leaves alone what they do not
 * mention.
 *
 * <p>Under the whole-vehicle PUT this replaced, each dialog had to hand back
 * every column the other one owned, and forgetting was silent — the save
 * succeeded, the screen looked right, and a field was null. The guarantee now
 * lives on the server; what these tests hold is the other half of it, which is
 * that each dialog actually sends a *narrow* body. A payload padded back out
 * with unchanged values would still pass the server's rules and quietly
 * reintroduce the same overwrite.
 */
describe('vehicle patch payloads', () => {
  const detailsForm = {
    plateNumber: 'ABC 1234',
    vinChassisNumber: 'PM2SA1234N1234567',
    year: '2018',
    odometer: '42300',
  };

  const warrantyForm = {
    warrantyStartDate: '2025-03-14',
    warrantyMonths: '36',
    warrantyKmLimit: '100000',
  };

  const photo = { bucket: 'vehicle-photos', path: 'user/v1.jpg' };

  it('sends the four registration fields and the photo pointer, and nothing else', () => {
    expect(Object.keys(vehicleDetailsPayload(detailsForm, photo)).sort()).toEqual([
      'odometer',
      'photoBucket',
      'photoPath',
      'plateNumber',
      'vinChassisNumber',
      'year',
    ]);
  });

  /* The point of the split. A key that is absent cannot overwrite anything, so
     these three must not appear in a details save at all — not even as the
     values they currently hold. */
  it('never mentions the warranty from the details dialog', () => {
    const payload = vehicleDetailsPayload(detailsForm, photo);

    expect(payload).not.toHaveProperty('warrantyStartDate');
    expect(payload).not.toHaveProperty('warrantyMonths');
    expect(payload).not.toHaveProperty('warrantyKmLimit');
    expect(payload).not.toHaveProperty('make');
    expect(payload).not.toHaveProperty('model');
  });

  it('sends only the three terms from the warranty dialog', () => {
    expect(Object.keys(warrantyDialogPayload(warrantyForm)).sort()).toEqual([
      'warrantyKmLimit',
      'warrantyMonths',
      'warrantyStartDate',
    ]);
  });

  it('never mentions the registration fields from the warranty dialog', () => {
    const payload = warrantyDialogPayload(warrantyForm);

    expect(payload).not.toHaveProperty('plateNumber');
    expect(payload).not.toHaveProperty('vinChassisNumber');
    expect(payload).not.toHaveProperty('odometer');
    expect(payload).not.toHaveProperty('photoPath');
  });

  /* An emptied field is sent as an explicit null rather than dropped. Dropping
     it would mean the server left the old value in place, and there would be
     no way to take back a purchase date typed by mistake. */
  it('sends null for a cleared field rather than omitting it', () => {
    const payload = warrantyDialogPayload({ ...warrantyForm, warrantyStartDate: '', warrantyKmLimit: '  ' });

    expect(payload).toHaveProperty('warrantyStartDate', null);
    expect(payload).toHaveProperty('warrantyKmLimit', null);
    expect(payload.warrantyMonths).toBe(36);
  });

  it('sends null for a cleared plate rather than omitting it', () => {
    const payload = vehicleDetailsPayload({ ...detailsForm, plateNumber: '' }, photo);

    expect(payload).toHaveProperty('plateNumber', null);
  });

  it('accepts a mileage limit typed with separators', () => {
    expect(warrantyDialogPayload({ ...warrantyForm, warrantyKmLimit: '100,000' }).warrantyKmLimit)
      .toBe(100000);
  });

  /* Both halves travel together or the server refuses the change — it cannot
     guess which one was meant to survive. */
  it('sends both halves of the photo pointer when it is cleared', () => {
    const payload = vehicleDetailsPayload(detailsForm, { bucket: null, path: null });

    expect(payload).toHaveProperty('photoBucket', null);
    expect(payload).toHaveProperty('photoPath', null);
  });

  it('keeps an odometer of zero rather than dropping it as falsy', () => {
    expect(vehicleDetailsPayload({ ...detailsForm, odometer: '0' }, photo).odometer).toBe(0);
  });
});
