import React, { useEffect, useRef, useState } from 'react';
import { describeVehiclePhotoLimit, validateVehiclePhoto } from '../../api/vehiclePhoto.js';

/**
 * Choosing a photo of the vehicle.
 *
 * <p>Shared by the signup step, the in-app Add vehicle page and the edit
 * dialog, like {@link VehicleIdentityFields}, so the three cannot drift apart.
 *
 * <p><b>Nothing is uploaded here.</b> The component hands the chosen `File`
 * up and shows a local preview; the page uploads it when the form is
 * submitted. A form somebody abandons half way should not leave a file in the
 * bucket, and a photo swapped three times before saving should not leave
 * three.
 *
 * <p>Two modes, which is why there are two removal paths. On a new vehicle
 * there is only a chosen file, and clearing it just clears the chooser. On an
 * existing vehicle there may also be a stored photo behind it: `existingUrl`
 * shows it, and `onRemoveExisting` says the owner wants it gone, which is a
 * different intention from "I changed my mind about this file" and has to
 * survive as far as the save.
 *
 * <p>Optional, and it says so. A photo is the one field on these forms that
 * cannot be got wrong -- the vehicle is identified by plate and model, not by
 * a picture -- so it must never be in the way of finishing.
 */
export default function VehiclePhotoField({
  file,
  onChange,
  existingUrl = null,
  onRemoveExisting = null,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  /* An object URL holds the file in memory until it is revoked. Revoking on
     change and on unmount is what keeps swapping photos from leaking one
     bitmap per attempt. */
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The chosen file wins over the stored photo: it is what will be saved.
  const shown = preview || existingUrl;
  const showingStored = !preview && Boolean(existingUrl);

  function handleFile(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;

    const problem = validateVehiclePhoto(chosen);
    if (problem) {
      setError(problem);
      // Clearing lets the same file be re-picked after fixing the problem;
      // without it the input holds the rejected file and fires no change.
      event.target.value = '';
      return;
    }

    setError('');
    onChange(chosen);
    event.target.value = '';
  }

  function remove() {
    setError('');
    if (showingStored && onRemoveExisting) {
      onRemoveExisting();
      return;
    }
    onChange(null);
  }

  return (
    <div className="veh-photo" data-tip="vehicle-photo">
      <div className="veh-photo__head">
        <span className="veh-photo__label">Photo</span>
        <span className="veh-photo__optional">Optional</span>
      </div>
      <p className="veh-photo__hint">
        A picture of the vehicle, so you can tell your cars apart at a glance. Up to{' '}
        {describeVehiclePhotoLimit()}. You can add or change it later.
      </p>

      <div className="veh-photo__body">
        <div className={`veh-photo__frame${shown ? ' has-photo' : ''}`}>
          {shown
            ? <img src={shown} alt={showingStored ? 'The photo saved for this vehicle' : 'The vehicle photo you chose'} />
            : <span className="veh-photo__empty">No photo</span>}
        </div>

        <div className="veh-photo__actions">
          <input
            ref={inputRef}
            className="ink-sr-only"
            id="vehicle-photo-input"
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={handleFile}
          />
          <button
            className="ink-button ink-button--outline ink-button--sm"
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {shown ? 'Choose a different photo' : 'Add a photo'}
          </button>
          {shown && (
            <button
              className="veh-photo__remove"
              type="button"
              disabled={disabled}
              onClick={remove}
            >
              Remove
            </button>
          )}
          {file && <span className="veh-photo__name">{file.name}</span>}
        </div>
      </div>

      {error && <p className="veh-photo__error">{error}</p>}
    </div>
  );
}
