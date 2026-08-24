import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Camera, CheckCircle2, FileImage, RotateCcw, Trash2, Video, X } from 'lucide-react';
import StepIndicator from '../components/StepIndicator';
import { createReceiptPagesServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';
import { prepareReceiptFile, prepareCanvasCapture } from '../utils/receiptImage';

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
      navigate(`/service-drafts/${draft.draftId}`);
    } catch (err) {
      setError(friendlyReceiptError(err));
      setProgress(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      {saving && (
        <ReceiptProcessingOverlay progress={progress} />
      )}

      <section className="page-header">
        <p className="eyebrow">
          <Link className="inline-link" to={`/service-input/${vehicleId}`}>
            Change method
          </Link>
          <span>Receipt</span>
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
              <h2>Receipt source</h2>
              <p>Attach all pages for one service transaction before Trevora creates the draft.</p>
            </div>
            <span className="method-badge">Receipt OCR</span>
          </div>

          <div className="receipt-mode-tabs" role="tablist" aria-label="Receipt input mode">
            <button className={activeMode === 'UPLOAD' ? 'active' : ''} type="button" onClick={() => setActiveMode('UPLOAD')}>
              <FileImage size={17} aria-hidden="true" />
              Upload Receipt
            </button>
            <button className={activeMode === 'SCAN' ? 'active' : ''} type="button" onClick={() => setActiveMode('SCAN')}>
              <Camera size={17} aria-hidden="true" />
              Scan Receipt
            </button>
          </div>

          {activeMode === 'UPLOAD' ? (
            <section className="receipt-input-panel" onDrop={handleDrop}>
              <div className="receipt-input-copy">
                <strong>Upload existing service documents</strong>
                <p>Use this for saved photos of receipt pages, invoices, job orders, or official receipts for the same service visit.</p>
              </div>
              <ul className="receipt-upload-tips">
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Flat surface, good lighting, no glare or shadows</span>
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>All four corners of the page visible in frame</span>
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Sharp focus — hold steady before taking the photo</span>
                </li>
              </ul>
              <input
                ref={uploadInputRef}
                className="sr-only"
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                onChange={(event) => {
                  addUploadFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <button className="receipt-input-cta" type="button" onClick={() => uploadInputRef.current?.click()} disabled={preparingUpload}>
                <FileImage size={24} aria-hidden="true" />
                <strong>{preparingUpload ? 'Preparing images...' : pages.length ? 'Add more pages' : 'Select receipt pages'}</strong>
                <span>Select multiple images at once or drag them into this panel.</span>
              </button>
              <input
                ref={replaceInputRef}
                className="sr-only"
                type="file"
                accept="image/*,.heic,.heif"
                onChange={(event) => {
                  handleReplaceFileSelected(event.target.files);
                  event.target.value = '';
                }}
              />
            </section>
          ) : (
            <section className="receipt-input-panel">
              <div className="receipt-input-copy">
                <strong>Capture pages one at a time</strong>
                <p>Start the camera, line up each page, capture, then add another page or finish scanning.</p>
              </div>
              <input
                ref={scanInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  addScanFile(event.target.files);
                  event.target.value = '';
                }}
              />
              <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
              <canvas ref={analysisCanvasRef} className="sr-only" aria-hidden="true" />

              <div className="receipt-camera-stage">
                {cameraActive ? (
                  <>
                    <video ref={videoRef} className="receipt-camera-preview" playsInline muted autoPlay />
                    <div className="receipt-camera-guide" aria-hidden="true">
                      <span className="receipt-camera-corner receipt-camera-corner-tl" />
                      <span className="receipt-camera-corner receipt-camera-corner-tr" />
                      <span className="receipt-camera-corner receipt-camera-corner-bl" />
                      <span className="receipt-camera-corner receipt-camera-corner-br" />
                    </div>
                    {lightingHint && lightingHint !== 'good' && (
                      <div className="receipt-camera-lighting-hint" role="status">
                        {lightingHint === 'dark'
                          ? 'Low light — move to a brighter area'
                          : 'Too bright — reduce glare or backlight'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="receipt-camera-empty">
                    <Camera size={30} aria-hidden="true" />
                    <strong>Camera preview</strong>
                    <span>Camera access is required to scan receipts.</span>
                  </div>
                )}
              </div>

              {cameraMessage && <div className="receipt-camera-message">{cameraMessage}</div>}

              <div className="receipt-camera-actions">
                {!cameraActive ? (
                  <button className="receipt-input-cta receipt-camera-action" type="button" onClick={startCamera} disabled={cameraStarting}>
                    <Video size={22} aria-hidden="true" />
                    <strong>{cameraStarting ? 'Starting camera...' : 'Start camera'}</strong>
                    <span>Uses your browser camera on localhost or HTTPS.</span>
                  </button>
                ) : (
                  <>
                    <button className="receipt-input-cta receipt-camera-action" type="button" onClick={captureScanPage}>
                      <Camera size={22} aria-hidden="true" />
                      <strong>{pages.length ? 'Add another page' : 'Capture page'}</strong>
                      <span>Save the current frame as the next receipt page.</span>
                    </button>
                    <button className="button-secondary" type="button" onClick={stopCamera}>
                      <X size={16} aria-hidden="true" />
                      Stop camera
                    </button>
                  </>
                )}

                {pages.length > 0 && (
                  <button className="button-secondary" type="button" onClick={retakeLastScanPage}>
                    <RotateCcw size={16} aria-hidden="true" />
                    Retake last page
                  </button>
                )}
              </div>

              {cameraUnavailable && (
                <div className="receipt-camera-fallback">
                  <p>If camera scanning is unavailable, you can upload receipt images instead.</p>
                  <button className="button-secondary" type="button" onClick={() => scanInputRef.current?.click()}>
                    <FileImage size={16} aria-hidden="true" />
                    Use fallback capture picker
                  </button>
                </div>
              )}
            </section>
          )}

          <div className="receipt-page-section-heading">
            <div>
              <strong>Pages in this receipt</strong>
              <span>
                {pages.length} page{pages.length === 1 ? '' : 's'} ready
                {pages.length > 1 ? ', in the order shown' : ''}
              </span>
            </div>
            {isScanMode && pages.length > 0 && (
              <button className="button-secondary" type="button" onClick={cameraActive ? captureScanPage : startCamera}>
                Add another page
              </button>
            )}
          </div>

          <ReceiptPageList
            pages={pages}
            onPreview={setPreviewPage}
            onRemove={removePage}
            onRetake={retakeScanPage}
            onReplace={requestReplaceUploadPage}
            onMove={movePage}
            replacingPageId={replacingPageId}
          />



          {previewPage && (
            <div className="image-preview-overlay" role="dialog" aria-modal="true" aria-label="Receipt page preview">
              <button
                className="image-preview-close"
                type="button"
                aria-label="Close receipt preview"
                onClick={() => setPreviewPage(null)}
              >
                ×
              </button>
              <img src={previewPage.previewUrl} alt={`Receipt page ${previewPage.pageNumber} preview`} />
            </div>
          )}

          <div className="actions">
            <Link className="secondary-link" to={`/service-input/${vehicleId}`}>
              Change method
            </Link>
            <button type="submit" disabled={saving || loading || pages.length === 0}>
              {saving
                ? 'Reading...'
                : pages.length > 1
                  ? `Read ${pages.length} pages`
                  : 'Read this receipt'}
            </button>
          </div>
        </form>

        <aside className="guidance-stack">
          <section className="helper-card">
            <h2>What happens next</h2>
            <ul className="feature-list">
              <li>
                <strong>Pages stay together</strong>
                <span>Use one draft for the full service visit, even when the paperwork spans several pages.</span>
              </li>
              <li>
                <strong>Each page is read separately</strong>
                <span>Trevora keeps the page order and combines the extracted text before drafting details.</span>
              </li>
              <li>
                <strong>You still review</strong>
                <span>The draft is reviewed before any final record is saved.</span>
              </li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ReceiptProcessingOverlay({ progress }) {
  const { stage, storedPages = 0, totalPages = 0 } = progress ?? {};
  const storing = stage !== 'READING';

  return (
    <div className="receipt-processing-overlay" role="status" aria-live="polite">
      <section className="receipt-processing-card">
        <div className="receipt-processing-orbit" aria-hidden="true">
          <span />
          <i />
        </div>
        <div>
          <p className="eyebrow">Receipt</p>
          <h2>{storing ? 'Saving your pages' : 'Reading your receipt'}</h2>
          <p>
            {storing
              ? `${storedPages} of ${totalPages} saved.`
              : `${totalPages} page${totalPages === 1 ? '' : 's'} saved. Reading them now - this is the slow part.`}
          </p>
        </div>
        {/* Two steps, because two things happen. There used to be four, walked
            through on a 900ms timer with no connection to the request: it
            claimed to be "Analyzing service details" 1.8s in whether or not
            OCR had returned, then sat on the last step indefinitely. */}
        <div className="receipt-processing-steps">
          <span className="active">Saving pages</span>
          <span className={storing ? '' : 'active'}>Reading</span>
        </div>
      </section>
    </div>
  );
}

function ReceiptPageList({ pages, onPreview, onRemove, onRetake, onReplace, onMove, replacingPageId }) {
  if (pages.length === 0) {
    return (
      <div className="receipt-pages-empty">
        <strong>No pages yet</strong>
        <span>Add photos of every page of one service visit - upload them, scan them, or both.</span>
      </div>
    );
  }

  return (
    <div className="receipt-page-grid">
      {pages.map((page, index) => (
        <article className={`receipt-page-card${page.isBlurry ? ' receipt-page-card-blurry' : ''}`} key={page.id}>
          <button type="button" onClick={() => onPreview(page)}>
            <img src={page.previewUrl} alt={`Receipt page ${page.pageNumber}`} />
          </button>
          <div>
            <strong>Page {page.pageNumber}</strong>
            <span>{page.file.name}</span>
            <small>
              {Math.round(page.file.size / 1024)} KB · {page.source === 'SCAN' ? 'Scanned' : 'Uploaded'}
            </small>
            {page.isBlurry && (
              <span className="receipt-page-blur-flag">
                Looks blurry — {page.source === 'SCAN' ? 'retake' : 'replace'} for a better read
              </span>
            )}
          </div>
          <div className="receipt-page-actions">
            {pages.length > 1 && (
              <div className="receipt-page-order">
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => onMove(page.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move page ${page.pageNumber} earlier`}
                >
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => onMove(page.id, 1)}
                  disabled={index === pages.length - 1}
                  aria-label={`Move page ${page.pageNumber} later`}
                >
                  <ArrowDown size={15} aria-hidden="true" />
                </button>
              </div>
            )}
            {page.source === 'SCAN' ? (
              <button className="button-secondary" type="button" onClick={() => onRetake(page.id)}>
                Retake
              </button>
            ) : (
              <button
                className={`button-secondary${page.isBlurry ? ' receipt-page-replace-flagged' : ''}`}
                type="button"
                onClick={() => onReplace(page.id)}
                disabled={replacingPageId === page.id}
              >
                {replacingPageId === page.id ? 'Replacing...' : 'Replace'}
              </button>
            )}
            <button
              className="button-secondary danger-lite"
              type="button"
              onClick={() => onRemove(page.id)}
              aria-label={`Remove page ${page.pageNumber}`}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </article>
      ))}
    </div>
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
    return 'The receipt pages could not be uploaded. Please check your connection and try again.';
  }
  if (message.toLowerCase().includes('ocr') || message.toLowerCase().includes('openai')) {
    return 'Some details could not be extracted automatically. Please try again or review and complete the draft.';
  }
  return message || 'The receipt could not be analyzed. Please try again.';
}
