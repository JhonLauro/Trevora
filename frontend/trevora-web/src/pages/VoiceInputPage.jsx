import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StepIndicator from '../components/StepIndicator';
import { createVoiceServiceDraft, transcribeVoiceAudio } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

function preferredAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function filenameFor(blob) {
  if (blob.type.includes('mp4')) return 'trevora-voice-note.mp4';
  if (blob.type.includes('wav')) return 'trevora-voice-note.wav';
  return 'trevora-voice-note.webm';
}

export default function VoiceInputPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [vehicle, setVehicle] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const recorderSupported = typeof window !== 'undefined'
    && 'MediaRecorder' in window
    && Boolean(navigator.mediaDevices?.getUserMedia);

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

  useEffect(() => () => {
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearRecording() {
    if (recording && recorderRef.current) {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    stopStream();
    chunksRef.current = [];
    setRecording(false);
    setAudioBlob(null);
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }

  async function startRecording() {
    if (!recorderSupported) {
      setError('Voice recording is not supported in this browser. You can still type the transcript manually.');
      return;
    }

    try {
      clearRecording();
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        recorderRef.current = null;
        stopStream();
        setRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      stopStream();
      setRecording(false);
      setError('Microphone access was blocked or unavailable. You can still type the transcript manually.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }

  async function handleTranscribe() {
    if (!audioBlob) {
      setError('Record a voice note before transcribing.');
      return;
    }

    setTranscribing(true);
    setError('');

    try {
      const audioFile = new File([audioBlob], filenameFor(audioBlob), {
        type: audioBlob.type || 'audio/webm',
      });
      const result = await transcribeVoiceAudio({ vehicleId, audioFile });
      setTranscript(result.transcript || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setTranscribing(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!transcript.trim()) {
      setError('Record and transcribe a voice note, or type the spoken service details before creating a draft.');
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
              <h2>Record your service note</h2>
              <p>Record audio, transcribe it, then review the transcript before creating the draft.</p>
            </div>
            <span className="method-badge">Speech to text</span>
          </div>

          <div className={`voice-recorder-card${recording ? ' recording' : ''}`}>
            <span className="voice-pulse">{recording ? 'REC' : 'V'}</span>
            <div className="voice-recorder-copy">
              <strong>{recording ? 'Recording voice note...' : 'Voice note recorder'}</strong>
              <p>
                {recording
                  ? 'Speak clearly and include the service type, date, parts, cost, and shop if you know them.'
                  : 'Use your microphone to capture the service details, or type them manually below.'}
              </p>
            </div>
            <div className="voice-recorder-actions">
              {!recording ? (
                <button type="button" onClick={startRecording} disabled={loading || transcribing || saving}>
                  Start recording
                </button>
              ) : (
                <button type="button" onClick={stopRecording}>
                  Stop recording
                </button>
              )}
              <button className="button-secondary" type="button" onClick={clearRecording} disabled={!audioBlob && !recording}>
                Re-record
              </button>
            </div>
            {audioUrl && (
              <audio className="voice-audio-preview" controls src={audioUrl}>
                Your browser does not support audio playback.
              </audio>
            )}
            <button
              className="button-secondary full-width"
              type="button"
              onClick={handleTranscribe}
              disabled={!audioBlob || recording || transcribing}
            >
              {transcribing ? 'Transcribing...' : 'Transcribe recording'}
            </button>
          </div>

          <div className="voice-entry-box">
            <label>
              Transcript
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
            <p>{transcript.trim() || 'No transcript yet. Record audio or type the service details manually.'}</p>
          </div>

          <div className="actions">
            <Link className="secondary-link" to={`/service-input/${vehicleId}`}>
              Change method
            </Link>
            <button type="submit" disabled={saving || loading || transcribing || recording}>
              {saving ? 'Creating draft...' : 'Create voice draft'}
            </button>
          </div>
        </form>

        <aside className="guidance-stack">
          <section className="helper-card">
            <h2>How speech-to-text works</h2>
            <dl className="compact-facts">
              <div>
                <dt>Audio</dt>
                <dd>The browser records a short voice note from your microphone.</dd>
              </div>
              <div>
                <dt>Transcript</dt>
                <dd>The backend sends the audio to OpenAI and returns editable text.</dd>
              </div>
              <div>
                <dt>Draft fields</dt>
                <dd>Trevora still uses the existing voice draft parser before review.</dd>
              </div>
            </dl>
          </section>
          <section className="helper-card warning">
            <h2>Review before saving</h2>
            <p>Speech transcripts can miss costs, dates, or shop names. Correct the transcript or fix fields in the review step.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
