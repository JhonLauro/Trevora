import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Camera, Plus, Sun, Upload } from 'lucide-react';
import FlowChrome from '../components/flow/FlowChrome';
import GarageTransition from '../components/GarageTransition.jsx';
import ProcessingModal, {
  ProcessingStep,
  formatWait,
  useElapsedSeconds,
} from '../components/flow/ProcessingModal.jsx';
import { createReceiptPagesServiceDraft, primeServiceDraftReview } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';
import { prepareReceiptFile, prepareCanvasCapture } from '../utils/receiptImage';

/** Length of the hand-off into the draft review screen. */
const HANDOFF_MS = 2000;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export default function ReceiptUploadPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const uploadInputRef = useRef(null);
  const scanInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const analysisCanvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const pagesRef = useRef([]);
  const replaceInputRef = useRef(null);
  const replacingPageIdRef = useRef(null);
  // Which control is on screen, not which basket the pages go in. Upload and
  // scan used to hold separate arrays and submit sent only the active one, so
  // photographing two pages and then adding a third from the gallery filed a
  // one-page receipt and dropped the other two without saying so.
  const [activeMode, setActiveMode] = useState('UPLOAD');
  const [vehicle, setVehicle] = useState(null);
  const [pages, setPages] = useState([]);
  const [previewPage, setPreviewPage] = useState(null);
  // The draft to open once the hand-off has played. Set only on success, so
  // the car never appears over a receipt that failed to read.
  const [handoffDraftId, setHandoffDraftId] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preparingUpload, setPreparingUpload] = useState(false);
  const [replacingPageId, setReplacingPageId] = useState(null);
  const [lightingHint, setLightingHint] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    function preventBrowserFileOpen(event) {
      event.preventDefault();
    }

    window.addEventListener('dragover', preventBrowserFileOpen);
    window.addEventListener('drop', preventBrowserFileOpen);

    return () => {
      window.removeEventListener('dragover', preventBrowserFileOpen);
      window.removeEventListener('drop', preventBrowserFileOpen);
    };
  }, []);

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

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => () => {
    stopCamera(false);
    pagesRef.current.forEach((page) => URL.revokeObjectURL(page.previewUrl));
  }, []);

  useEffect(() => {
    if (activeMode === 'UPLOAD') {
      stopCamera();
    }
  }, [activeMode]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        setCameraMessage('Camera preview is ready. If it does not start, check your browser camera permission.');
      });
    }
  }, [cameraActive]);

  useEffect(() => {
    if (!cameraActive) {
      setLightingHint(null);
      return undefined;
    }

    const canvas = analysisCanvasRef.current;
    if (!canvas) return undefined;
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext('2d');

    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        context.drawImage(video, 0, 0, 48, 48);
        const { data } = context.getImageData(0, 0, 48, 48);
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }
        const averageLuminance = total / (data.length / 4);
        if (averageLuminance < 60) {
          setLightingHint('dark');
        } else if (averageLuminance > 225) {
          setLightingHint('bright');
        } else {
          setLightingHint('good');
        }
      } catch {
        // Transient frame read errors (video not ready yet) are safe to ignore.
      }
    }, 700);

    return () => window.clearInterval(interval);
  }, [cameraActive]);

  const isScanMode = activeMode === 'SCAN';
  const hasScannedPage = pages.some((page) => page.source === 'SCAN');

  async function addUploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(isSupportedReceiptFile);
    if (files.length === 0) {
      setError('Choose supported receipt image files.');
      return;
    }

    setError('');
    setPreparingUpload(true);
    try {
      const prepared = await Promise.all(files.map(prepareReceiptFile));
      setPages((current) => renumberPages([
        ...current,
        ...prepared.map((result) => toPage(result.file, 'UPLOAD', result.isBlurry)),
      ]));
    } finally {
      setPreparingUpload(false);
    }
  }

  function requestReplaceUploadPage(pageId) {
    replacingPageIdRef.current = pageId;
    replaceInputRef.current?.click();
  }

  async function handleReplaceFileSelected(fileList) {
    const pageId = replacingPageIdRef.current;
    const file = Array.from(fileList || []).find(isSupportedReceiptFile);
    if (!pageId || !file) {
      setError('Choose a supported receipt image to replace this page.');
      return;
    }

    setError('');
    setReplacingPageId(pageId);
    try {
      const result = await prepareReceiptFile(file);
      setPages((current) => current.map((page) => {
        if (page.id !== pageId) return page;
        URL.revokeObjectURL(page.previewUrl);
        return {
          ...page,
          file: result.file,
          isBlurry: result.isBlurry,
          previewUrl: URL.createObjectURL(result.file),
        };
      }));
    } finally {
      setReplacingPageId(null);
      replacingPageIdRef.current = null;
    }
  }

  function addScanFile(fileList) {
    const file = Array.from(fileList || []).find(isSupportedReceiptFile);
    if (!file) {
      setError('Capture a supported receipt image.');
      return;
    }
    setPages((current) => renumberPages([...current, toPage(file, 'SCAN')]));
    setError('');
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraUnavailable(true);
      setCameraMessage('If camera scanning is unavailable, you can upload receipt images instead.');
      return;
    }

    setCameraStarting(true);
    setCameraMessage('');
    setError('');

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraUnavailable(false);
      setCameraMessage('Align the receipt within the guide, then capture.');
    } catch {
      setCameraActive(false);
      setCameraUnavailable(true);
      setCameraMessage('Camera access is required to scan receipts. If camera scanning is unavailable, you can upload receipt images instead.');
    } finally {
      setCameraStarting(false);
    }
  }

  function stopCamera(updateState = true) {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (updateState) {
      setCameraActive(false);
      setCameraStarting(false);
    }
  }

  async function captureScanPage() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraStreamRef.current) {
      setError('Start the camera before capturing a receipt page.');
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, width, height);

    const { blob, isBlurry } = await prepareCanvasCapture(canvas);
    if (!blob) {
      setError('The camera frame could not be captured. Please try again or upload receipt images instead.');
      return;
    }

    // A blurry capture is added and flagged rather than silently refused. An
    // uploaded page that looks blurry gets a badge and a Replace button; a
    // captured one used to just not appear, which reads as a broken button.
    const pageNumber = pagesRef.current.length + 1;
    const file = new File([blob], `receipt-scan-page-${pageNumber}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    setPages((current) => renumberPages([...current, toPage(file, 'SCAN', isBlurry)]));
    setError('');
    setCameraMessage(isBlurry
      ? `Page ${pageNumber} captured, but it looks blurry. Retake it for a better read.`
      : `Page ${pageNumber} captured. Add another page or finish scanning.`);
  }

  function retakeLastScanPage() {
    setPages((current) => {
      const page = current[current.length - 1];
      if (!page) return current;
      URL.revokeObjectURL(page.previewUrl);
      return renumberPages(current.slice(0, -1));
    });
    setCameraMessage('Last page removed. Capture it again when ready.');
  }

  function removePage(pageId) {
    setPages((current) => {
      const page = current.find((item) => item.id === pageId);
      if (page) URL.revokeObjectURL(page.previewUrl);
      return renumberPages(current.filter((item) => item.id !== pageId));
    });
  }

  /**
   * Page order is what the extractor reads as page 1, page 2, and a multi-page
   * invoice photographed out of order used to mean starting over. Buttons
   * rather than drag-and-drop: this is used one-handed on a phone, where a drag
   * target is the wrong control for a thumb.
   */
  function movePage(pageId, offset) {
    setPages((current) => {
      const index = current.findIndex((item) => item.id === pageId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return renumberPages(next);
    });
  }

  function retakeScanPage(pageId) {
    removePage(pageId);
    if (!cameraUnavailable) {
      window.setTimeout(() => {
        if (!cameraStreamRef.current) startCamera();
      }, 0);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    if (activeMode !== 'UPLOAD') return;
    addUploadFiles(event.dataTransfer.files);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pages.length === 0) {
      setError('Add at least one receipt page.');
      return;
    }

    setSaving(true);
    setError('');
    setProgress({ stage: 'STORING', storedPages: 0, totalPages: pages.length });

    // The review screen is a lazy route, so without this its chunk starts
    // downloading at `navigate()` — the moment the car leaves the frame — and
    // the hand-off ends on a Suspense fallback instead of the screen it just
    // promised. Reading a receipt takes seconds; the chunk is a few KB. Start
    // it now and it is resident long before the transition is over. Rejection
    // is ignored on purpose: this is a warm-up, and the real import on the
    // route will surface any genuine failure.
    import('./ServiceDraftReviewPage.jsx').catch(() => {});

    try {
      const draft = await createReceiptPagesServiceDraft({
        vehicleId,
        pages,
        // Camera capture brings its own artefacts - glare, skew, focus - and a
        // mixed set contains them, so one scanned page is enough to say so.
        receiptInputMode: hasScannedPage ? 'SCAN' : 'UPLOAD',
        onProgress: setProgress,
      });
      stopCamera();
      // Start the review request now rather than on arrival, so the two
      // seconds of transition are spent fetching instead of waiting. The
      // review screen calls the same function and is handed this result.
      primeServiceDraftReview(draft.draftId);
      // Reduced motion gets the same cut the walkthrough gives it: straight
      // to the draft, no car.
      if (prefersReducedMotion()) navigate(`/service-drafts/${draft.draftId}`);
      else setHandoffDraftId(draft.draftId);
    } catch (err) {
      setError(friendlyReceiptError(err));
      setProgress(null);
    } finally {
      setSaving(false);
    }
  }

  // Two seconds, matched to HANDOFF_MS in both places at once: the overlay is
  // told how long to drive and the timer waits exactly that long, so the car
  // is still leaving the frame as the review screen arrives.
  useEffect(() => {
    if (!handoffDraftId) return undefined;
    const timer = window.setTimeout(
      () => navigate(`/service-drafts/${handoffDraftId}`),
      HANDOFF_MS,
    );
    return () => window.clearTimeout(timer);
  }, [handoffDraftId, navigate]);

  const vehicleName = vehicle ? vehicle.nickname || `${vehicle.make} ${vehicle.model}` : '';

  return (
    <FlowChrome
      step={3}
      width="mid"
      vehicleName={vehicleName}
      title="The receipt"
      subtitle={pages.length === 0
        ? 'Add every page of one visit. Photograph them, upload them, or both.'
        : `${pages.length} page${pages.length === 1 ? '' : 's'}, in the order they print.`}
      onExit={() => { stopCamera(); navigate('/'); }}
    >
      {/* The first page, which is the one being read first. Local blob URLs,
          so nothing is fetched to show it. */}
      {saving && <ReadingOverlay progress={progress} preview={pages[0]?.previewUrl} />}

      {/* The read succeeded and the next screen is a different kind of task —
          checking what we got, rather than adding to it. Same hand-off the
          walkthrough uses into the vehicle form, at two seconds rather than
          five: there is a real screen waiting behind it here, so it is a beat,
          not a journey. No skip hint, because nothing listens for one. */}
      {handoffDraftId && (
        <GarageTransition
          label="Let’s check what we read"
          durationMs={HANDOFF_MS}
          hint={null}
        />
      )}

      {error && <div className="flow-alert">{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Two ways into ONE page list. They used to hold separate arrays and
            submit sent only the active one, so photographing two pages and
            then adding a third from the gallery filed a one-page receipt and
            dropped the other two without saying so. */}
        <div className="flow-tabs" role="tablist" aria-label="How to add pages" data-tip="receipt-capture">
          <button
            className={activeMode === 'UPLOAD' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={activeMode === 'UPLOAD'}
            onClick={() => setActiveMode('UPLOAD')}
          >
            <Upload size={18} aria-hidden="true" />
            Upload
          </button>
          <button
            className={activeMode === 'SCAN' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={activeMode === 'SCAN'}
            onClick={() => setActiveMode('SCAN')}
          >
            <Camera size={18} aria-hidden="true" />
            Camera
          </button>
        </div>

        <input
          ref={uploadInputRef}
          className="sr-only"
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={(event) => { addUploadFiles(event.target.files); event.target.value = ''; }}
        />
        <input
          ref={replaceInputRef}
          className="sr-only"
          type="file"
          accept="image/*,.heic,.heif"
          onChange={(event) => { handleReplaceFileSelected(event.target.files); event.target.value = ''; }}
        />
        <input
          ref={scanInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => { addScanFile(event.target.files); event.target.value = ''; }}
        />
        <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
        <canvas ref={analysisCanvasRef} className="sr-only" aria-hidden="true" />

        {activeMode === 'SCAN' && (
          <section className="flow-camera" onDrop={handleDrop}>
            <div className="flow-camera__stage">
              {cameraActive ? (
                <>
                  <video ref={videoRef} playsInline muted autoPlay />
                  <span className="flow-camera__corner flow-camera__corner--tl" aria-hidden="true" />
                  <span className="flow-camera__corner flow-camera__corner--tr" aria-hidden="true" />
                  <span className="flow-camera__corner flow-camera__corner--bl" aria-hidden="true" />
                  <span className="flow-camera__corner flow-camera__corner--br" aria-hidden="true" />
                  {lightingHint && lightingHint !== 'good' && (
                    <div className="flow-camera__hint" role="status">
                      <Sun size={20} strokeWidth={1.7} aria-hidden="true" />
                      {lightingHint === 'dark'
                        ? 'Too dark to read — move nearer a light'
                        : 'Too bright — turn away from the glare'}
                    </div>
                  )}
                </>
              ) : (
                <p className="flow-eyebrow">Camera preview</p>
              )}
            </div>

            <div className="flow-camera__bar">
              <span className="flow-camera__count">
                <b>{pages.length}</b>
                {pages.length === 1 ? 'page so far' : 'pages so far'}
              </span>

              {cameraActive ? (
                <button
                  className="flow-shutter"
                  type="button"
                  onClick={captureScanPage}
                  aria-label="Capture this page"
                />
              ) : (
                <button
                  className="flow-btn flow-btn--ghost"
                  type="button"
                  onClick={startCamera}
                  disabled={cameraStarting}
                >
                  {cameraStarting ? 'Starting…' : 'Start camera'}
                </button>
              )}

              <button
                className="flow-camera__done"
                type="button"
                onClick={() => { stopCamera(); setActiveMode('UPLOAD'); }}
              >
                Done
              </button>
            </div>

            {cameraUnavailable && (
              <div style={{ padding: '0 20px 22px' }}>
                <button
                  className="flow-btn flow-btn--ghost"
                  type="button"
                  onClick={() => scanInputRef.current?.click()}
                >
                  Use your phone&apos;s camera app instead
                </button>
              </div>
            )}
          </section>
        )}

        <div onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
          <div className="flow-pages">
            {pages.map((page, index) => (
              <article
                className={`flow-page-card${page.isBlurry ? ' is-blurry' : ''}`}
                key={page.id}
              >
                <button
                  className="flow-page-card__img"
                  type="button"
                  onClick={() => setPreviewPage(page)}
                  aria-label={`See page ${page.pageNumber} full size`}
                >
                  <img src={page.previewUrl} alt="" />
                  <span className="flow-page-card__n">{page.pageNumber}</span>
                </button>

                {page.isBlurry ? (
                  <div className="flow-page-card__blur">
                    <span className="flow-page-card__blur-msg">Too blurry to read</span>
                    <button
                      className="flow-btn flow-btn--ghost"
                      type="button"
                      style={{ height: 38, fontSize: 14 }}
                      onClick={() => (page.source === 'SCAN'
                        ? retakeScanPage(page.id)
                        : requestReplaceUploadPage(page.id))}
                      disabled={replacingPageId === page.id}
                    >
                      {page.source === 'SCAN' ? 'Retake' : 'Replace'}
                    </button>
                  </div>
                ) : (
                  <div className="flow-page-card__foot">
                    <button
                      className="flow-link"
                      type="button"
                      onClick={() => (page.source === 'SCAN'
                        ? retakeScanPage(page.id)
                        : requestReplaceUploadPage(page.id))}
                      disabled={replacingPageId === page.id}
                    >
                      {replacingPageId === page.id
                        ? 'Replacing…'
                        : page.source === 'SCAN' ? 'Retake' : 'Replace'}
                    </button>
                    <button
                      className="flow-link"
                      type="button"
                      style={{ color: 'var(--ink-muted)' }}
                      onClick={() => removePage(page.id)}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Reorder stays on buttons rather than drag. This is used
                    one-handed on a phone with the paper in the other hand,
                    where a drag target is the wrong control for a thumb. */}
                {pages.length > 1 && (
                  <div className="flow-page-card__foot" style={{ paddingTop: 0 }}>
                    <button
                      className="flow-x"
                      type="button"
                      onClick={() => movePage(page.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move page ${page.pageNumber} earlier`}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="flow-x"
                      type="button"
                      onClick={() => movePage(page.id, 1)}
                      disabled={index === pages.length - 1}
                      aria-label={`Move page ${page.pageNumber} later`}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </article>
            ))}

            <button
              className="flow-page-add"
              type="button"
              onClick={() => (activeMode === 'SCAN' && !cameraActive
                ? startCamera()
                : activeMode === 'SCAN' ? captureScanPage() : uploadInputRef.current?.click())}
              disabled={preparingUpload}
            >
              <Plus size={24} strokeWidth={1.6} aria-hidden="true" />
              {preparingUpload ? 'Preparing…' : 'Add a page'}
            </button>
          </div>
        </div>

        {pages.length === 0 ? (
          <ul className="flow-note" style={{ margin: 0, paddingLeft: 20 }}>
            <li>Flat surface, good lighting, no glare or shadows</li>
            <li>All four corners of the page visible in frame</li>
            <li>Sharp focus — hold steady before taking the photo</li>
          </ul>
        ) : (
          <p className="flow-note">The order here is the order we read them in.</p>
        )}

        {cameraMessage && <p className="flow-note">{cameraMessage}</p>}

        <div className="flow-actions">
          <button
            className="flow-btn flow-btn--ghost"
            type="button"
            onClick={() => { stopCamera(); navigate(`/service-input/${vehicleId}`); }}
          >
            Back
          </button>
          <button className="flow-btn" type="submit" disabled={saving || loading || pages.length === 0}>
            {pages.length > 1 ? `Read these ${pages.length} pages` : 'Read this receipt'}
          </button>
        </div>
      </form>

      {previewPage && (
        <div
          className="image-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Receipt page preview"
        >
          <button
            className="image-preview-close"
            type="button"
            aria-label="Close receipt preview"
            onClick={() => setPreviewPage(null)}
          >
            ×
          </button>
          <img src={previewPage.previewUrl} alt={`Receipt page ${previewPage.pageNumber}`} />
        </div>
      )}
    </FlowChrome>
  );
}

/**
 * Two steps, because two things happen and neither of them is invented.
 *
 * <p>The first counts pages actually stored, and its bar is that fraction. The
 * second has no fraction to show — OCR is one request that returns when it
 * returns — so it gets an indeterminate bar and the seconds it has really been
 * waiting. See ProcessingModal for why that distinction is load-bearing here.
 */
function ReadingOverlay({ progress, preview }) {
  const { stage, storedPages = 0, totalPages = 0 } = progress ?? {};
  const storing = stage !== 'READING';
  const storedPct = totalPages > 0 ? Math.round((storedPages / totalPages) * 100) : 0;
  const readingSeconds = useElapsedSeconds(!storing);
  const pageWord = `${totalPages} page${totalPages === 1 ? '' : 's'}`;

  return (
    <ProcessingModal
      preview={preview}
      previewWaiting={storing}
      title={storing ? 'Saving your pages' : 'Reading your receipt'}
      sub="Two steps. This is the slow part — leave it running and it will finish."
      foot={storing
        ? 'Both counts are real. Neither is a timer.'
        : 'A long receipt takes longer. Nothing is lost while this runs.'}
    >
      <ProcessingStep
        name="Saving the pages"
        state={storing ? 'active' : 'done'}
        count={storing ? `${storedPages} of ${totalPages} saved` : `${pageWord} saved`}
        progress={storing ? storedPct : null}
      />
      <ProcessingStep
        name="Reading them"
        state={storing ? 'pending' : 'active'}
        count={storing ? 'Waiting for the pages' : `${pageWord} · ${formatWait(readingSeconds)}`}
        progress={storing ? null : 'waiting'}
      />
    </ProcessingModal>
  );
}

function toPage(file, source, isBlurry = false) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    // How this page was captured. Kept per page rather than per submission
    // because a receipt can be part photographed and part uploaded.
    source,
    pageNumber: 1,
    previewUrl: URL.createObjectURL(file),
    isBlurry,
  };
}

function renumberPages(pages) {
  return pages.map((page, index) => ({ ...page, pageNumber: index + 1 }));
}

function isSupportedReceiptFile(file) {
  if (!file) return false;
  if (file.type.startsWith('image/')) return true;
  return /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name);
}



function friendlyReceiptError(error) {
  const message = error?.message || '';
  if (message.toLowerCase().includes('storage')) {
    return 'The pages could not be uploaded. Check your connection and try again.';
  }
  if (message.toLowerCase().includes('ocr') || message.toLowerCase().includes('openai')) {
    return 'We could not read the receipt this time. Try again, or add the details yourself on the next screen.';
  }
  return message || 'The receipt could not be read. Try again.';
}
