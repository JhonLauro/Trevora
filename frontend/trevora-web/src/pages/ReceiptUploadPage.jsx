import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, FileImage, Plus, RotateCcw, Trash2, Video, X } from 'lucide-react';
import StepIndicator from '../components/StepIndicator';
import { createReceiptPagesServiceDraft } from '../api/serviceDrafts';
import { getVehicle } from '../api/vehicles';

export default function ReceiptUploadPage() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const uploadInputRef = useRef(null);
  const scanInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const uploadPagesRef = useRef([]);
  const scanPagesRef = useRef([]);
  const [activeMode, setActiveMode] = useState('UPLOAD');
  const [vehicle, setVehicle] = useState(null);
  const [uploadPages, setUploadPages] = useState([]);
  const [scanPages, setScanPages] = useState([]);
  const [previewPage, setPreviewPage] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [processingStep, setProcessingStep] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    uploadPagesRef.current = uploadPages;
  }, [uploadPages]);

  useEffect(() => {
    scanPagesRef.current = scanPages;
  }, [scanPages]);

  useEffect(() => () => {
    stopCamera(false);
    [...uploadPagesRef.current, ...scanPagesRef.current].forEach((page) => URL.revokeObjectURL(page.previewUrl));
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

  const activePages = activeMode === 'UPLOAD' ? uploadPages : scanPages;
  const isScanMode = activeMode === 'SCAN';

  function addUploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(isSupportedReceiptFile);
    if (files.length === 0) {
      setError('Choose supported receipt image files.');
      return;
    }
    setUploadPages((current) => renumberPages([...current, ...files.map(toPage)]));
    setError('');
  }

  function addScanFile(fileList) {
    const file = Array.from(fileList || []).find(isSupportedReceiptFile);
    if (!file) {
      setError('Capture a supported receipt image.');
      return;
    }
    setScanPages((current) => renumberPages([...current, toPage(file)]));
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

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setError('The camera frame could not be captured. Please try again or upload receipt images instead.');
      return;
    }

    const pageNumber = scanPagesRef.current.length + 1;
    const file = new File([blob], `receipt-scan-page-${pageNumber}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    setScanPages((current) => renumberPages([...current, toPage(file)]));
    setError('');
    setCameraMessage(`Page ${pageNumber} captured. Add another page or finish scanning.`);
  }

  function retakeLastScanPage() {
    setScanPages((current) => {
      const page = current[current.length - 1];
      if (!page) return current;
      URL.revokeObjectURL(page.previewUrl);
      return renumberPages(current.slice(0, -1));
    });
    setCameraMessage('Last page removed. Capture it again when ready.');
  }

  function removePage(mode, pageId) {
    const setter = mode === 'UPLOAD' ? setUploadPages : setScanPages;
    setter((current) => {
      const page = current.find((item) => item.id === pageId);
      if (page) URL.revokeObjectURL(page.previewUrl);
      return renumberPages(current.filter((item) => item.id !== pageId));
    });
  }

  function retakeScanPage(pageId) {
    removePage('SCAN', pageId);
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
    if (activePages.length === 0) {
      setError(activeMode === 'UPLOAD' ? 'Select at least one receipt page.' : 'Capture at least one receipt page.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const draft = await runWithProcessingSteps(() => createReceiptPagesServiceDraft({
        vehicleId,
        pages: activePages,
        receiptInputMode: activeMode,
      }), setProcessingStep);
      if (activeMode === 'SCAN') {
        stopCamera();
      }
      navigate(`/service-drafts/${draft.draftId}`);
    } catch (err) {
      setError(friendlyReceiptError(err));
      setProcessingStep('');
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
              <button className="receipt-input-cta" type="button" onClick={() => uploadInputRef.current?.click()}>
                <FileImage size={24} aria-hidden="true" />
                <strong>{uploadPages.length ? 'Add more pages' : 'Select receipt pages'}</strong>
                <span>Select multiple images at once or drag them into this panel.</span>
              </button>
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

              <div className="receipt-camera-stage">
                {cameraActive ? (
                  <video ref={videoRef} className="receipt-camera-preview" playsInline muted autoPlay />
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
                      <strong>{scanPages.length ? 'Add another page' : 'Capture page'}</strong>
                      <span>Save the current frame as the next receipt page.</span>
                    </button>
                    <button className="button-secondary" type="button" onClick={stopCamera}>
                      <X size={16} aria-hidden="true" />
                      Stop camera
                    </button>
                  </>
                )}

                {scanPages.length > 0 && (
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
              <strong>{isScanMode ? 'Captured pages' : 'Selected pages'}</strong>
              <span>{activePages.length} page{activePages.length === 1 ? '' : 's'} ready</span>
            </div>
            {isScanMode && activePages.length > 0 && (
              <button className="button-secondary" type="button" onClick={cameraActive ? captureScanPage : startCamera}>
                Add another page
              </button>
            )}
          </div>

          <ReceiptPageList
            mode={activeMode}
            pages={activePages}
            onPreview={setPreviewPage}
            onRemove={removePage}
            onRetake={retakeScanPage}
          />

          {saving && (
            <div className="processing-status">
              <strong>{processingStep || 'Creating draft'}</strong>
              <span>{activePages.length} page{activePages.length === 1 ? '' : 's'} queued for receipt analysis.</span>
            </div>
          )}

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
            <button type="submit" disabled={saving || loading}>
              {saving ? 'Analyzing...' : activeMode === 'SCAN' ? 'Finish scanning and analyze' : 'Analyze Receipt Pages'}
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

function ReceiptPageList({ mode, pages, onPreview, onRemove, onRetake }) {
  if (pages.length === 0) {
    return (
      <div className="receipt-pages-empty">
        <strong>{mode === 'UPLOAD' ? 'No pages selected yet' : 'No pages captured yet'}</strong>
        <span>
          {mode === 'UPLOAD'
            ? 'Add one or more service document images to start.'
            : 'Capture page 1, then add more pages until the transaction is complete.'}
        </span>
      </div>
    );
  }

  return (
    <div className="receipt-page-grid">
      {pages.map((page) => (
        <article className="receipt-page-card" key={page.id}>
          <button type="button" onClick={() => onPreview(page)}>
            <img src={page.previewUrl} alt={`Receipt page ${page.pageNumber}`} />
          </button>
          <div>
            <strong>Page {page.pageNumber}</strong>
            <span>{page.file.name}</span>
            <small>{Math.round(page.file.size / 1024)} KB</small>
          </div>
          <div className="receipt-page-actions">
            {mode === 'SCAN' && (
              <button className="button-secondary" type="button" onClick={() => onRetake(page.id)}>
                Retake
              </button>
            )}
            <button className="button-secondary danger-lite" type="button" onClick={() => onRemove(mode, page.id)} aria-label={`Remove page ${page.pageNumber}`}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function toPage(file) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    pageNumber: 1,
    previewUrl: URL.createObjectURL(file),
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithProcessingSteps(task, setProcessingStep) {
  const steps = ['Preparing pages', 'Running OCR', 'Analyzing service details', 'Creating draft'];
  let index = 0;
  setProcessingStep(steps[index]);
  const interval = window.setInterval(() => {
    index = Math.min(index + 1, steps.length - 1);
    setProcessingStep(steps[index]);
  }, 900);

  try {
    return await task();
  } finally {
    window.clearInterval(interval);
  }
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
