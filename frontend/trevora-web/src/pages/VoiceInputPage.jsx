import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import { createVoiceServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

export default function VoiceInputPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getVehicle(vehicleId)
      .then((data) => {
        if (active) {
          setVehicle(data);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [vehicleId]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!transcript.trim()) {
      setError('Enter the spoken service details before creating a draft.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const draft = await createVoiceServiceDraft({
        vehicleId,
        transcript: transcript.trim(),
      });
      navigate(`/service-drafts/${draft.draftId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">
          <Link className="inline-link" to="/vehicles">
            Change method
          </Link>
          <span>Voice</span>
        </p>
        <h1>Add Service Record</h1>
        {loading ? (
          <p>Loading selected vehicle...</p>
        ) : vehicle ? (
          <p>
            Drafting for {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
            {vehicle.plateNumber ? ` - ${vehicle.plateNumber}` : ''}
          </p>
        ) : null}
      </section>

      <StepIndicator currentStep={3} />

      {error && <div className="alert">{error}</div>}

      <section className="content-two">
        <form className="panel record-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <h2>Describe your service</h2>
              <p>For MVP, type the transcript you would have spoken into a voice note.</p>
            </div>
            <span className="method-badge">Mock voice</span>
          </div>

          <div className="voice-entry-box">
            <span className="voice-pulse">V</span>
            <label>
              Spoken-service text
              <textarea
                value={transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  setError('');
                }}
                placeholder="Example: I changed the oil and replaced the filter today. Total cost was around 1200."
                rows="8"
              />
            </label>
          </div>

          <div className="voice-summary">
            <h2>Transcript preview</h2>
            <p>{transcript.trim() || 'No spoken-service text entered yet.'}</p>
          </div>

          <div className="actions">
            <Link className="secondary-link" to={`/service-input/${vehicleId}`}>
              Change method
            </Link>
            <button type="submit" disabled={saving || loading}>
              {saving ? 'Creating draft...' : 'Create voice draft'}
            </button>
          </div>
        </form>

        <aside className="guidance-stack">
          <section className="helper-card">
            <h2>What AI will extract</h2>
            <dl className="compact-facts">
              <div>
                <dt>Service type</dt>
                <dd>Inferred from keywords like oil, brake, tire, or battery.</dd>
              </div>
              <div>
                <dt>Labor details</dt>
                <dd>The transcript is preserved for review.</dd>
              </div>
              <div>
                <dt>Cost and date</dt>
                <dd>Mocked for now and marked with confidence metadata.</dd>
              </div>
            </dl>
          </section>
          <section className="helper-card warning">
            <h2>Voice drafts may be sparse</h2>
            <p>Shop, exact date, and parts can be missing until real transcription and extraction are added.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
