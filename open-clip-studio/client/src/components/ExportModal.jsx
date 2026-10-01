import React, { useEffect, useState } from 'react';
import { Download, CheckCircle, Loader2, X, Share } from 'lucide-react';
import confetti from 'canvas-confetti';

const DIMS = {
  '16:9': { label: '1920x1080 landscape', ratio: '16 / 9' },
  '1:1': { label: '1080x1080 square', ratio: '1 / 1' },
  '9:16': { label: '1080x1920 vertical', ratio: '9 / 16' }
};

export default function ExportModal({ isRendering, progress, exportResult, error, onClose, getApiUrl = (u) => u }) {
  const [shareFile, setShareFile] = useState(null);
  const [shareError, setShareError] = useState(null);

  const resultRatio = exportResult?.aspectRatio || progress?.aspectRatio || '9:16';
  const dims = DIMS[resultRatio] || DIMS['9:16'];
  const videoUrl = exportResult?.downloadUrl ? getApiUrl(exportResult.downloadUrl) : null;
  const downloadUrl = videoUrl ? `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}download=1` : null;

  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  useEffect(() => {
    if (exportResult && exportResult.success) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    }
  }, [exportResult]);

  // Pre-fetch the finished MP4 so "Save to Photos" can open the iOS share sheet
  // immediately on tap (Safari requires the share call to happen in the tap itself).
  useEffect(() => {
    setShareFile(null);
    setShareError(null);
    if (!videoUrl || !canShareFiles) return undefined;
    let cancelled = false;
    fetch(videoUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        const file = new File([blob], exportResult.fileName || 'openclip.mp4', { type: 'video/mp4' });
        if (navigator.canShare({ files: [file] })) setShareFile(file);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleShare = async () => {
    if (!shareFile) return;
    try {
      await navigator.share({ files: [shareFile], title: 'OpenClip video' });
    } catch (e) {
      if (e && e.name !== 'AbortError') setShareError('Sharing is not available here. Use Download instead.');
    }
  };

  const percent = typeof progress?.percent === 'number' ? progress.percent : null;

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div className="glass-panel modal-panel" style={{
        maxWidth: '520px',
        width: '100%',
        padding: '32px',
        position: 'relative',
        textAlign: 'center',
        border: '1px solid var(--border-focus)',
        boxShadow: '0 25px 60px -15px rgba(99, 102, 241, 0.4)',
        maxHeight: '100%',
        overflowY: 'auto'
      }}>
        {!isRendering && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255, 255, 255, 0.06)',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)'
            }}
          >
            <X size={18} />
          </button>
        )}

        {isRendering && (
          <div>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(16, 185, 129, 0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <Loader2 size={36} color="#10b981" className="spin-animate" />
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
              Rendering {dims.label} video
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              {progress?.message || 'FFmpeg is framing the clip and burning in the captions.'}
            </p>
            <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255, 255, 255, 0.07)', overflow: 'hidden' }}>
              <div
                className={percent === null ? 'progress-indeterminate' : ''}
                style={{
                  height: '100%',
                  width: percent === null ? '35%' : `${Math.max(2, percent)}%`,
                  background: 'linear-gradient(90deg, #10b981, #6366f1)',
                  borderRadius: '999px',
                  transition: 'width 0.6s ease'
                }}
              />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '14px' }}>
              You can lock your phone; the render keeps going on the server.
            </p>
          </div>
        )}

        {error && (
          <div role="alert">
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(244, 63, 94, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#f43f5e'
            }}>
              <X size={32} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '8px', color: '#f43f5e' }}>
              Export failed
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {error}
            </p>
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        )}

        {exportResult && exportResult.success && (
          <div>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              color: '#10b981'
            }}>
              <CheckCircle size={30} />
            </div>

            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '6px' }}>
              Your clip is ready
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              {exportResult.width && exportResult.height ? `${exportResult.width}x${exportResult.height}` : dims.label} MP4 with burned-in captions.
            </p>

            <div style={{
              width: '100%',
              maxWidth: resultRatio === '9:16' ? '220px' : '100%',
              aspectRatio: dims.ratio,
              margin: '0 auto 20px',
              borderRadius: '14px',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              backgroundColor: '#000000'
            }}>
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            </div>

            <div className="export-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href={downloadUrl}
                download={exportResult.fileName}
                className="btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  textDecoration: 'none',
                  padding: '12px 22px',
                  fontSize: '0.95rem'
                }}
              >
                <Download size={18} />
                <span>Download MP4</span>
              </a>

              {canShareFiles && (
                <button
                  onClick={handleShare}
                  disabled={!shareFile}
                  className="btn-secondary"
                  style={{ padding: '12px 18px', fontSize: '0.95rem' }}
                >
                  {shareFile ? <Share size={17} /> : <Loader2 size={17} className="spin-animate" />}
                  <span>{shareFile ? 'Save to Photos / Share' : 'Preparing share...'}</span>
                </button>
              )}

              <button onClick={onClose} className="btn-secondary" style={{ padding: '12px 18px' }}>
                Done
              </button>
            </div>
            {shareError && (
              <p style={{ fontSize: '0.8rem', color: '#fbbf24', marginTop: '12px' }}>{shareError}</p>
            )}
            <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '14px' }}>
              On iPhone, Download saves to the Files app (Downloads). Use Save to Photos to put it in your camera roll.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
