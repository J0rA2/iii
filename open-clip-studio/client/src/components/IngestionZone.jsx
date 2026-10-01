import React, { useState, useRef } from 'react';
import { UploadCloud, Link as LinkIcon, Play, Sparkles, ArrowRight, Loader2, Zap, Film } from 'lucide-react';

export default function IngestionZone({
  onSelectSample,
  onUploadFile,
  onDownloadUrl,
  samples,
  isLoading,
  scanMode = 'lightning',
  onScanModeChange,
  enableHookScan = true,
  onEnableHookScanChange,
  isStaticDemo = false,
  backendUrl = '',
  onOpenSettings
}) {
  const [url, setUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const notifyStaticDemo = () => {
    alert(
      '⚠️ Backend Server Required for Custom Videos:\n\n' +
      'GitHub Pages only provides static hosting and cannot run yt-dlp, FFmpeg, or Faster-Whisper on GitHub servers.\n\n' +
      'How to process custom videos:\n' +
      '1. Run locally: In terminal run "npm run dev" and open http://localhost:5173\n' +
      '2. Or click Settings: Connect your backend server URL.\n\n' +
      'To test the full Studio Editor right now, click "Try Live Demo Sample" below!'
    );
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (isStaticDemo && !backendUrl) {
        notifyStaticDemo();
        return;
      }
      onUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    // Reset so picking the same video again still fires onChange
    e.target.value = '';
    if (file) {
      if (isStaticDemo && !backendUrl) {
        notifyStaticDemo();
        return;
      }
      onUploadFile(file);
    }
  };

  const handleSubmitUrl = (e) => {
    e.preventDefault();
    if (url.trim()) {
      if (isStaticDemo && !backendUrl) {
        notifyStaticDemo();
        return;
      }
      onDownloadUrl(url.trim());
    }
  };

  return (
    <div className="page-shell" style={{ maxWidth: '980px', margin: '36px auto 56px auto', padding: '0 24px' }}>
      {/* Hero Header */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--glass-specular)',
          color: 'var(--text-secondary)',
          fontSize: '0.78rem',
          fontWeight: 500,
          marginBottom: '18px'
        }}>
          <Sparkles size={13} color="#94a3b8" />
          <span>Automated Video Repurposing &amp; Kinetic Studio</span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '2.75rem',
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: '-1px',
          marginBottom: '14px'
        }} className="text-specular hero-title">
          Repurpose Long Videos Into Viral Vertical Shorts
        </h1>

        <p style={{
          fontSize: '1.02rem',
          color: 'var(--text-muted)',
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: 1.55,
          fontWeight: 400
        }}>
          Automated speech transcription, intelligent speaker re-centering, and animated kinetic typography.
        </p>
      </div>

      {/* GitHub Pages Static Demo Banner */}
      {isStaticDemo && !backendUrl && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))',
          border: '1px solid rgba(129, 140, 248, 0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Sparkles size={18} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff', marginBottom: '3px' }}>
                GitHub Pages Web Showcase (Static Demo)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                To process your own video files or YouTube links with local AI (Whisper, OpenCV &amp; FFmpeg), run OpenClip locally with <code style={{ color: '#a5b4fc', background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '4px' }}>npm run dev</code> on <strong>http://localhost:5173</strong>.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => samples && samples.length > 0 && onSelectSample(samples[0])}
              className="btn-secondary"
              style={{ padding: '7px 14px', fontSize: '0.78rem', gap: '6px' }}
            >
              <Play size={12} />
              <span>Try Live Demo Sample</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="btn-primary"
              style={{ padding: '7px 14px', fontSize: '0.78rem' }}
            >
              Connect Backend API
            </button>
          </div>
        </div>
      )}

      {/* Lowkey Pipeline Controls Strip */}
      <div style={{
        background: 'rgba(14, 18, 28, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--glass-specular)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 18px',
        marginBottom: '26px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Analysis Mode Segmented Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
            Analysis
          </span>
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.35)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px',
            border: '1px solid var(--border-subtle)'
          }}>
            <button
              type="button"
              onClick={() => onScanModeChange && onScanModeChange('lightning')}
              style={{
                background: scanMode === 'lightning' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: scanMode === 'lightning' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                color: scanMode === 'lightning' ? '#ffffff' : 'var(--text-muted)',
                padding: '5px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
                fontSize: '0.76rem',
                boxShadow: scanMode === 'lightning' ? 'var(--glass-specular)' : 'none'
              }}
            >
              <Zap size={12} color={scanMode === 'lightning' ? '#ffffff' : 'currentColor'} />
              <span>Fast Preview (10m)</span>
            </button>

            <button
              type="button"
              onClick={() => onScanModeChange && onScanModeChange('full')}
              style={{
                background: scanMode === 'full' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: scanMode === 'full' ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                color: scanMode === 'full' ? '#ffffff' : 'var(--text-muted)',
                padding: '5px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
                fontSize: '0.76rem',
                boxShadow: scanMode === 'full' ? 'var(--glass-specular)' : 'none'
              }}
            >
              <Film size={12} color={scanMode === 'full' ? '#ffffff' : 'currentColor'} />
              <span>Full Video Scan</span>
            </button>
          </div>
        </div>

        {/* Viral Hook Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onEnableHookScanChange && onEnableHookScanChange(!enableHookScan)}
            style={{
              background: enableHookScan ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.02)',
              border: enableHookScan ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid var(--border-subtle)',
              color: enableHookScan ? '#ffffff' : 'var(--text-muted)',
              padding: '5px 12px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 500,
              fontSize: '0.76rem',
              cursor: 'pointer',
              boxShadow: enableHookScan ? 'var(--glass-specular)' : 'none'
            }}
          >
            <span style={{
              width: '26px',
              height: '14px',
              borderRadius: '8px',
              background: enableHookScan ? '#ffffff' : 'rgba(255, 255, 255, 0.15)',
              position: 'relative',
              display: 'inline-block',
              transition: 'background 0.2s ease',
              flexShrink: 0
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: enableHookScan ? '#07090e' : '#ffffff',
                position: 'absolute',
                top: '2px',
                left: enableHookScan ? '14px' : '2px',
                transition: 'left 0.2s ease'
              }} />
            </span>
            <span>Hook Prioritization</span>
          </button>
        </div>
      </div>

      {/* Ingestion Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '20px', marginBottom: '32px' }}>
        {/* Upload Box */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="glass-card"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          style={{
            position: 'relative',
            padding: '34px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            border: dragActive ? '1px dashed #ffffff' : '1px solid var(--border-subtle)',
            backgroundColor: dragActive ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mov,.mp4,.m4v"
            // Visually hidden rather than display:none: iOS Safari only opens the
            // Photos/Files picker reliably for inputs that are still rendered.
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
            onClick={(e) => e.stopPropagation()}
            onChange={handleFileChange}
          />
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'var(--glass-specular)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px'
          }}>
            <UploadCloud size={22} color="#cbd5e1" strokeWidth={1.5} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '5px', color: '#ffffff' }}>
            Upload Local Video
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            From Photos or Files: MP4, MOV, MKV, WEBM (up to 4GB)
          </p>
          <span className="btn-secondary" style={{ pointerEvents: 'none', fontSize: '0.78rem', padding: '6px 14px' }}>
            Select File
          </span>
        </div>

        {/* URL Box */}
        <div className="glass-card" style={{
          padding: '34px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'var(--glass-specular)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px'
          }}>
            <LinkIcon size={20} color="#cbd5e1" strokeWidth={1.5} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '5px', color: '#ffffff' }}>
            Import Stream, VOD, or Video URL
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Paste links from YouTube, Twitch, Kick, Twitter/X, or Vimeo
          </p>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              YouTube
            </span>
            <span style={{ fontSize: '0.72rem', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              Twitch VODs &amp; Clips
            </span>
            <span style={{ fontSize: '0.72rem', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              Kick VODs &amp; Clips
            </span>
          </div>

          <form onSubmit={handleSubmitUrl} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="url"
              placeholder="Paste YouTube, Twitch, or Kick URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{
                flex: 1,
                padding: '9px 13px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(7, 10, 18, 0.8)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '0.84rem'
              }}
              onFocus={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
            />
            <button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="btn-primary"
              style={{ padding: '9px 14px' }}
            >
              {isLoading ? <Loader2 size={15} className="spin-animate" /> : <ArrowRight size={15} />}
            </button>
          </form>
        </div>
      </div>

      {/* Handcrafted Interactive Project Demos */}
      {samples && samples.length > 0 && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Interactive Pre-Analyzed Demos
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
              Instant zero-load testing
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: samples.length > 1 ? 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' : '1fr', gap: '14px' }}>
            {samples.map((sample, idx) => (
              <div
                key={sample.id || idx}
                className="glass-card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, marginRight: '14px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    flexShrink: 0
                  }}>
                    <Play size={15} fill="currentColor" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                        {sample.title}
                      </span>
                      <span className="badge-tag">
                        {idx === 1 ? 'Dual-Speaker' : 'Podcast'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                      {sample.description}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onSelectSample(sample)}
                  disabled={isLoading}
                  className="btn-secondary"
                  style={{
                    padding: '7px 13px',
                    fontSize: '0.78rem',
                    flexShrink: 0,
                    color: '#ffffff'
                  }}
                >
                  {isLoading ? <Loader2 size={13} className="spin-animate" /> : <Play size={13} />}
                  <span>Open Demo</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
