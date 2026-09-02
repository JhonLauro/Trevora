import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FlowChrome from '../components/flow/FlowChrome';
import GarageTransition from '../components/GarageTransition.jsx';
import ProcessingModal, {
  ProcessingStep,
  formatWait,
  useElapsedSeconds,
} from '../components/flow/ProcessingModal.jsx';
import {
  createVoiceServiceDraft,
  primeServiceDraftReview,
  transcribeVoiceAudio,
  translateVoiceTranscript,
} from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

/**
 * Step 3b.
 *
 * <p>The raw transcript lands first, in whatever language was spoken, and is
 * editable from the moment it appears. **Translation adds a panel; it never
 * replaces the original.** A translation that overwrites the raw transcript
 * destroys the only copy of what the owner actually said, and the owner is the
 * only one who can tell whether the translation got it right.
 *
 * <p>Because the original is the source of truth, editing it invalidates a
 * translation made from it — the English panel clears rather than sitting
 * there stale. What gets sent for extraction is the English when one exists,
 * and the original otherwise; that is the behaviour the backend already had,
 * and changing which language the extractor sees is an extraction change, not
 * a layout one.
 */

/** Length of the hand-off into the draft review screen. Matched to the
 *  receipt flow: both paths end on the same screen and should feel alike. */
const HANDOFF_MS = 2000;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

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

function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Fifteen bars, lit up to however far the recording has run. */
const WAVE = Array.from({ length: 15 }, (_, i) => 9 + ((i * 7) % 26));

/* What to say, before they say it.

   The six items are not general advice -- they are exactly the fields
   VoiceProcessingService pulls out of a transcript (serviceDate, shopName,
   odometer, totalCost, partsReplaced, laborPerformed). Anything not spoken is
   left blank on purpose: the extractor is told never to infer a value the
   transcript does not support, so a date that goes unsaid becomes a date the
   owner types in by hand on the next screen.

   Placed above the recorder because it is only useful before you talk. */
const SPOKEN_FIELDS = [
  { label: 'When', hint: 'the date of the service' },
  { label: 'Where', hint: 'the shop or mechanic' },
  { label: 'Odometer', hint: 'the reading that day' },
  { label: 'Cost', hint: 'the total you paid' },
  { label: 'Parts', hint: 'what was replaced' },
  { label: 'Work', hint: 'what was actually done' },
];

function SpeakingGuide() {
  return (
    <section className="flow-card voice-guide">
      <span className="flow-eyebrow">Saying it well</span>
      <p className="voice-guide__lead">
        Mention these six and the next screen arrives mostly filled in. Say them in any
        order, in any language, in whatever way is natural.
      </p>

      <ul className="voice-guide__fields">
        {SPOKEN_FIELDS.map((field) => (
          <li key={field.label}>
            <strong>{field.label}</strong>
            <span>{field.hint}</span>
          </li>
        ))}
      </ul>

      <p className="voice-guide__example">
        <span className="voice-guide__example-tag">Like this</span>
        “On August 11 I had the head gasket leak repaired at Canyon Creek Toyota.
        The odometer read 45,000 kilometres. They replaced the water outlet gasket
        and the timing chain. It came to 3,981 pesos.”
      </p>

      <p className="flow-source__foot">
        Anything you leave unsaid is left blank rather than guessed at, so you can
        type it on the next screen. A spoken note records the summary — for an
        itemised parts-and-labour breakdown, photograph the receipt instead.
      </p>
    </section>
  );
}

export default function VoiceInputPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const [vehicle, setVehicle] = useState(null);
  const [original, setOriginal] = useState('');
  const [translation, setTranslation] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The draft to open once the hand-off has played. Set only on success, so
  // the car never appears over a note that failed to file.
  const [handoffDraftId, setHandoffDraftId] = useState(null);
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
    if (tickRef.current) window.clearInterval(tickRef.current);
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
    if (tickRef.current) window.clearInterval(tickRef.current);
    setRecording(false);
    setElapsed(0);
    setOriginal('');
    setTranslation('');
    setAudioBlob(null);
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
  }

  async function startRecording() {
    if (!recorderSupported) {
      setError('This browser cannot record audio. You can type what you want to say instead.');
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
        if (event.data.size > 0) chunksRef.current.push(event.data);
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
        if (tickRef.current) window.clearInterval(tickRef.current);
        setRecording(false);
        void transcribeBlob(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setElapsed(0);
      tickRef.current = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    } catch {
      stopStream();
      setRecording(false);
      setError('Trevora could not reach the microphone. Allow access, or type what you want to say instead.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  async function transcribeBlob(blob) {
    if (!blob) {
      setError('Record a voice note before transcribing.');
      return;
    }

    setTranscribing(true);
    setError('');
    setTranslation('');

    try {
      const audioFile = new File([blob], filenameFor(blob), { type: blob.type || 'audio/webm' });
      const result = await transcribeVoiceAudio({ vehicleId, audioFile });
      setOriginal(result.sourceTranscript || result.transcript || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setTranscribing(false);
    }
  }

  async function handleTranslate() {
    const raw = original.trim();
    if (!raw) {
      setError('Record or type a voice note before translating.');
      return;
    }

    setTranslating(true);
    setError('');

    try {
      const result = await translateVoiceTranscript({ vehicleId, transcript: raw });
      // Only keep it as a translation if it actually is one. When the note was
      // already in English the two are the same string, and showing it twice
      // would imply work was done that was not.
      setTranslation(result.translated && result.transcript !== raw ? result.transcript : '');
      if (!result.translated) {
        setError('That already reads as English, so there was nothing to translate.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTranslating(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const toRead = (translation || original).trim();
    if (!toRead) {
      setError('Record a voice note, or type what you want to say, before going on.');
      return;
    }

    setSaving(true);
    setError('');
    // The review screen is a lazy route: without this its chunk only starts
    // downloading when the car leaves the frame, and the hand-off lands on a
    // Suspense fallback instead of the screen it promised.
    import('./ServiceDraftReviewPage.jsx').catch(() => {});

    try {
      const draft = await createVoiceServiceDraft({ vehicleId, transcript: toRead });
      // Start the review request now rather than on arrival, so the two seconds
      // of transition are spent fetching instead of waiting.
      primeServiceDraftReview(draft.draftId);
      if (prefersReducedMotion()) navigate(`/service-drafts/${draft.draftId}`);
      else setHandoffDraftId(draft.draftId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!handoffDraftId) return undefined;
    const timer = window.setTimeout(
      () => navigate(`/service-drafts/${handoffDraftId}`),
      HANDOFF_MS,
    );
    return () => window.clearTimeout(timer);
  }, [handoffDraftId, navigate]);

  const vehicleName = vehicle ? vehicle.nickname || `${vehicle.make} ${vehicle.model}` : '';
  const busy = recording || transcribing || translating || saving;

  return (
    <FlowChrome
      step={3}
      width="mid"
      vehicleName={vehicleName}
      title="Say what was done"
      subtitle="Date, cost, shop, and what was replaced. Anything you leave out you can type on the next screen."
      onExit={() => navigate('/')}
    >
      {saving && <FilingOverlay />}

      {/* Same hand-off the receipt takes, because it ends on the same screen
          and a note filed by voice should not feel like a lesser route in. */}
      {handoffDraftId && (
        <GarageTransition
          label="Let’s check what we heard"
          durationMs={HANDOFF_MS}
          hint={null}
        />
      )}

      {error && <div className="flow-alert">{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <SpeakingGuide />

        <section className="flow-card flow-recorder">
          <button
            className={`flow-recorder__btn${recording ? '' : ' is-idle'}`}
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing || translating || saving}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            <span />
          </button>

          <div className="flow-recorder__mid">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span className="flow-recorder__time">{clock(elapsed)}</span>
              <span className="flow-note">
                {recording
                  ? 'Recording — tap the square to stop'
                  : transcribing
                    ? 'Writing down what you said…'
                    : audioBlob ? 'Recorded. Play it back or record again.' : 'Tap the circle to start'}
              </span>
            </div>
            <div className="flow-wave" aria-hidden="true">
              {WAVE.map((height, index) => (
                <i
                  key={index}
                  className={recording && index <= (elapsed % WAVE.length) ? 'is-live' : ''}
                  style={{ height }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {audioUrl && (
              <audio controls src={audioUrl} style={{ height: 52 }}>
                Your browser does not support audio playback.
              </audio>
            )}
            <button
              className="flow-btn flow-btn--ghost"
              type="button"
              onClick={clearRecording}
              disabled={!audioBlob && !recording && !original}
            >
              Record again
            </button>
          </div>
        </section>

        <div className="flow-transcripts">
          <section className="flow-card flow-transcript-card">
            <span className="flow-eyebrow">What we heard</span>
            <textarea
              value={original}
              onChange={(event) => {
                setOriginal(event.target.value);
                // The English was made from the old text. Keeping it would
                // leave a translation of something nobody said any more.
                if (translation) setTranslation('');
                setError('');
              }}
              placeholder="Example: I changed the oil and replaced the filter today. Total cost was around 1200."
              aria-label="What we heard"
            />
            <p className="flow-source__foot">
              This is the copy we keep. Editing here changes what we read.
            </p>
          </section>

          {translation ? (
            <section className="flow-card flow-transcript-card">
              <span className="flow-eyebrow">In English</span>
              <p className="flow-transcript">{translation}</p>
              <p className="flow-source__foot">
                The original stays exactly as you said it. This is what we will read.
              </p>
            </section>
          ) : (
            <section className="flow-transcript-card flow-transcript-card--empty">
              <span className="flow-eyebrow">In English</span>
              <p className="flow-note">Not translated yet. The original beside this stays either way.</p>
              <button
                className="flow-btn flow-btn--ghost"
                type="button"
                onClick={handleTranslate}
                disabled={!original.trim() || busy}
              >
                {translating ? 'Translating…' : 'Translate to English'}
              </button>
            </section>
          )}
        </div>

        <div className="flow-actions">
          <button
            className="flow-btn flow-btn--ghost"
            type="button"
            onClick={() => navigate(`/service-input/${vehicleId}`)}
          >
            Back
          </button>
          <button className="flow-btn" type="submit" disabled={busy || loading || !original.trim()}>
            {saving ? 'Creating draft…' : 'Check the details'}
          </button>
        </div>
      </form>
    </FlowChrome>
  );
}

/**
 * One step, because one thing happens: the transcript goes to the extractor
 * and comes back as a draft. There is no fraction to show — it is a single
 * request — so it shows an indeterminate bar and the seconds it has actually
 * been running, and claims nothing else.
 */
function FilingOverlay() {
  const seconds = useElapsedSeconds(true);

  return (
    <ProcessingModal
      title="Reading your note"
      sub="Pulling out the date, the shop, the cost and the work. This is the slow part — leave it running and it will finish."
      foot="Whatever it misses, you fill in on the next screen. Nothing is lost while this runs."
    >
      <ProcessingStep
        name="Reading what you said"
        state="active"
        count={formatWait(seconds)}
        progress="waiting"
      />
    </ProcessingModal>
  );
}
