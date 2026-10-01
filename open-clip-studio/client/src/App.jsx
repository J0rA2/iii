import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import IngestionZone from './components/IngestionZone';
import ProcessingStatus from './components/ProcessingStatus';
import ClipList from './components/ClipList';
import StudioEditor from './components/StudioEditor';
import ExportModal from './components/ExportModal';
import ApiSettingsModal from './components/ApiSettingsModal';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [samples, setSamples] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);

  const [activeVideo, setActiveVideo] = useState(() => {
    try {
      const saved = localStorage.getItem('openclip_active_video');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  const [processingStep, setProcessingStep] = useState(1);
  const [processingText, setProcessingText] = useState('');
  const [processingPercent, setProcessingPercent] = useState(null);
  const [processingError, setProcessingError] = useState(null);
  const [renderProgress, setRenderProgress] = useState(null);
  const pollCancelRef = useRef(null);
  const wakeLockRef = useRef(null);
  const [clips, setClips] = useState(() => {
    try {
      const saved = localStorage.getItem('openclip_clips');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [selectedClip, setSelectedClip] = useState(() => {
    try {
      const saved = localStorage.getItem('openclip_selected_clip');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('openclip_view');
    const hasClips = localStorage.getItem('openclip_clips');
    if (saved) return saved;
    return hasClips ? 'clips' : 'ingestion';
  });

  // Export State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [exportError, setExportError] = useState(null);

  // Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState(() => {
    return {
      geminiApiKey: localStorage.getItem('openclip_gemini_key') || '',
      groqApiKey: localStorage.getItem('openclip_groq_key') || '',
      githubToken: localStorage.getItem('openclip_github_token') || '',
      backendUrl: localStorage.getItem('openclip_backend_url') || '',
      ytCookies: localStorage.getItem('openclip_yt_cookies') || ''
    };
  });

  const getApiUrl = (endpoint) => {
    const customBackend = apiKeys.backendUrl || localStorage.getItem('openclip_backend_url') || '';
    if (customBackend) {
      return `${customBackend.replace(/\/$/, '')}${endpoint}`;
    }
    return endpoint;
  };

  // Fetch initial samples & system status on mount
  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    const onStaticHost = !apiKeys.backendUrl && typeof window !== 'undefined' && window.location.hostname.includes('github.io');

    const loadSamples = () => fetch(getApiUrl('/api/samples'))
      .then(res => res.json())
      .then(data => { if (!cancelled) setSamples(data.samples || []); })
      .catch(() => {
        if (cancelled || !onStaticHost) return;
        // Fallback sample for the static GitHub Pages demo only
        setSamples([
          {
            id: 'sample_podcast',
            title: 'Tech & AI Founders Podcast (Dual Speaker Demo)',
            videoUrl: './samples/sample_podcast.mp4',
            vttUrl: './samples/sample_podcast.vtt',
            duration: 35
          }
        ]);
      });

    const loadStatus = (attempt = 0) => fetch(getApiUrl('/api/status'))
      .then(res => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        setSystemStatus(data);
        loadSamples();
      })
      .catch(() => {
        if (cancelled) return;
        if (onStaticHost) {
          setSystemStatus({
            status: 'ok',
            platform: 'OpenClip Studio Web Demo',
            pricing: '100% Free & Open-Source',
            isStaticDemo: true,
            ffmpegReady: false
          });
          loadSamples();
          return;
        }
        // Real server that is still waking up (e.g. Render cold start): keep retrying
        setSystemStatus({ status: 'starting', ffmpegReady: false });
        retryTimer = setTimeout(() => loadStatus(attempt + 1), Math.min(10000, 2000 + attempt * 1000));
      });

    loadStatus();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [apiKeys.backendUrl]);

  const handleSaveKeys = (newKeys) => {
    setApiKeys(newKeys);
    localStorage.setItem('openclip_gemini_key', newKeys.geminiApiKey || '');
    localStorage.setItem('openclip_groq_key', newKeys.groqApiKey || '');
    localStorage.setItem('openclip_github_token', newKeys.githubToken || '');
    localStorage.setItem('openclip_backend_url', newKeys.backendUrl || '');
    localStorage.setItem('openclip_yt_cookies', newKeys.ytCookies || '');
  };

  useEffect(() => {
    if (activeVideo) localStorage.setItem('openclip_active_video', JSON.stringify(activeVideo));
    else localStorage.removeItem('openclip_active_video');
  }, [activeVideo]);

  useEffect(() => {
    if (clips && clips.length > 0) localStorage.setItem('openclip_clips', JSON.stringify(clips));
    else localStorage.removeItem('openclip_clips');
  }, [clips]);

  useEffect(() => {
    if (selectedClip) localStorage.setItem('openclip_selected_clip', JSON.stringify(selectedClip));
    else localStorage.removeItem('openclip_selected_clip');
  }, [selectedClip]);

  useEffect(() => {
    localStorage.setItem('openclip_view', view);
  }, [view]);

  // Safe fetch helper to guarantee JSON parsing and clear error messages
  const safeFetchJson = async (url, options = {}) => {
    const targetUrl = url.startsWith('http') ? url : getApiUrl(url);
    const res = await fetch(targetUrl, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (res.status === 502 || res.status === 503) {
        throw new Error(
          'The server is currently waking up or updating (Render Free Tier cold-start). Please wait ~15-30 seconds and try again!'
        );
      }
      if (res.status === 405 || text.includes('405 Not Allowed')) {
        throw new Error(
          'GitHub Pages is a static host and cannot run FFmpeg / yt-dlp.\n\n' +
          'To process your own videos or YouTube links:\n' +
          '1. Run OpenClip locally with "npm run dev" (http://localhost:5173)\n' +
          '2. Or click "Settings" (top right) to connect your Backend Server URL.'
        );
      }
      throw new Error(`Server returned an error (${res.status}): ${text.slice(0, 160)}`);
    }
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Server request failed (${res.status})`);
    }
    return data;
  };

  const [scanMode, setScanMode] = useState('lightning');
  const [enableHookScan, setEnableHookScan] = useState(true);

  const isStaticDemo = Boolean(
    !apiKeys.backendUrl &&
    (systemStatus?.isStaticDemo || (typeof window !== 'undefined' && window.location.hostname.includes('github.io')))
  );

  // Keep the iPhone screen awake while uploading/processing (Safari 16.4+).
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null; });
      }
    } catch (e) { /* not supported or denied: processing still works */ }
  };
  const releaseWakeLock = () => {
    try { wakeLockRef.current && wakeLockRef.current.release(); } catch (e) {}
    wakeLockRef.current = null;
  };

  /**
   * Polls a background job until it finishes. Safari pauses timers while the
   * phone is locked; polling simply resumes when the page is visible again.
   */
  const pollJob = (jobId, onUpdate) => new Promise((resolve, reject) => {
    let cancelled = false;
    let failures = 0;
    const cancel = () => { cancelled = true; reject(new Error('cancelled')); };
    const tick = async () => {
      if (cancelled) return;
      try {
        const data = await safeFetchJson(`/api/jobs/${jobId}`);
        failures = 0;
        const job = data.job;
        onUpdate && onUpdate(job);
        if (job.state === 'done') return resolve(job.result);
        if (job.state === 'error') return reject(new Error(job.error || 'Processing failed'));
      } catch (err) {
        // Brief network drops (switching Wi-Fi/5G, Safari backgrounding) are retried
        failures += 1;
        if (failures > 40 || /Job not found/.test(err.message)) return reject(err);
      }
      setTimeout(tick, 2000);
    };
    tick();
    pollCancelRef.current = cancel;
  });

  const applyProcessJobUpdate = (job) => {
    if (job.step) setProcessingStep(Math.max(1, Math.min(5, job.step)));
    if (job.message) setProcessingText(job.state === 'queued' ? 'Waiting for another video to finish processing...' : job.message);
    setProcessingPercent(typeof job.percent === 'number' ? job.percent : null);
  };

  const finishProcessing = (result) => {
    localStorage.removeItem('openclip_process_job');
    releaseWakeLock();
    setActiveVideo({
      filePath: result.filePath,
      videoUrl: result.videoUrl || `/api/stream?path=${encodeURIComponent(result.filePath)}`,
      meta: result.meta
    });
    setClips(result.clips || []);
    setView('clips');
  };

  const failProcessing = (err) => {
    localStorage.removeItem('openclip_process_job');
    releaseWakeLock();
    if (err && err.message === 'cancelled') return;
    console.error('Processing failed:', err);
    setProcessingError(err?.message || 'Processing failed');
  };

  // Static GitHub Pages build only: show the bundled demo clips, never on a real server
  const loadStaticDemoClips = (filePath, videoUrl) => {
    const fallbackClips = [
      {
        id: 'demo_clip_1',
        title: 'The Single Most Effective Brain Protocol ⚡',
        hookType: 'Actionable Advice',
        start: 0, end: 32.5, startTime: 0, endTime: 32.5, duration: 32.5,
        viralityScore: 97, hookScore: 94, flowScore: 92, energyScore: 89, climaxScore: 96,
        viralityReason: 'Agency ML Analysis: Rapid 0.8s hook-to-setup velocity, featuring high-retention curiosity opening, optimal speech cadence (165 WPM), and decisive mic-drop payoff.',
        mlModel: 'OpenClip-Proprietary-v4-46D-Multimodal',
        semanticMargin: 0.94, acousticPower: 0.72, hookVelocity: 0.96, survivalProbability: 0.94, mlVerified: true,
        hashtags: ['#shorts', '#brainhack', '#podcast', '#health'],
        suitablePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels'],
        words: [
          { word: 'The', start: 0.1, end: 0.28 }, { word: 'best', start: 0.29, end: 0.55 },
          { word: 'way', start: 0.56, end: 0.78 }, { word: 'to', start: 0.79, end: 0.95 },
          { word: 'spike', start: 0.96, end: 1.35 }, { word: 'morning', start: 1.36, end: 1.7 },
          { word: 'energy', start: 1.71, end: 2.1 }, { word: 'is', start: 2.15, end: 2.3 },
          { word: 'to', start: 2.35, end: 2.5 }, { word: 'get', start: 2.55, end: 2.75 },
          { word: 'bright', start: 2.76, end: 3.1 }, { word: 'light', start: 3.15, end: 3.45 },
          { word: 'in', start: 3.46, end: 3.6 }, { word: 'your', start: 3.61, end: 3.75 },
          { word: 'eyes', start: 3.76, end: 4.1 }, { word: 'within', start: 4.15, end: 4.45 },
          { word: 'the', start: 4.46, end: 4.6 }, { word: 'first', start: 4.61, end: 4.9 },
          { word: 'thirty', start: 4.95, end: 5.3 }, { word: 'minutes', start: 5.35, end: 5.75 },
          { word: 'of', start: 5.76, end: 5.9 }, { word: 'your', start: 5.91, end: 6.1 },
          { word: 'day.', start: 6.15, end: 6.6 }
        ]
      }
    ];
    setActiveVideo({
      filePath: filePath || 'sample_podcast.mp4',
      videoUrl: videoUrl || './samples/sample_podcast.mp4',
      meta: { title: 'Sample Podcast Demo', duration: 35 }
    });
    setClips(fallbackClips);
    setView('clips');
  };

  // 1. Process Video Pipeline (background job + polling)
  const runProcessingPipeline = async (filePath, vttPath = null, videoUrl = null, sourceUrl = null) => {
    setView('processing');
    setProcessingError(null);
    setProcessingStep(1);
    setProcessingPercent(null);
    setProcessingText(sourceUrl ? 'Starting download...' : 'Starting AI processing...');

    if (isStaticDemo) {
      loadStaticDemoClips(filePath, videoUrl);
      return;
    }

    acquireWakeLock();
    try {
      const data = await safeFetchJson('/api/jobs/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath,
          url: sourceUrl,
          cookies: sourceUrl ? (apiKeys.ytCookies || localStorage.getItem('openclip_yt_cookies') || '') : undefined,
          vttPath,
          geminiApiKey: apiKeys.geminiApiKey,
          groqApiKey: apiKeys.groqApiKey,
          githubToken: apiKeys.githubToken,
          scanMode,
          enableHookScan
        })
      });
      localStorage.setItem('openclip_process_job', data.job.id);
      applyProcessJobUpdate(data.job);
      const result = await pollJob(data.job.id, applyProcessJobUpdate);
      finishProcessing(result);
    } catch (err) {
      failProcessing(err);
    }
  };

  // Resume a processing job after Safari reloads the tab (it does this to save memory)
  useEffect(() => {
    const pendingJob = localStorage.getItem('openclip_process_job');
    if (!pendingJob) return;
    setView('processing');
    setProcessingText('Reconnecting to your processing job...');
    pollJob(pendingJob, applyProcessJobUpdate).then(finishProcessing).catch(failProcessing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Upload file handler with real-time percentage, MB counter & speed tracking
  const handleUploadFile = (file) => {
    setView('processing');
    setProcessingError(null);
    setProcessingStep(1);
    setProcessingPercent(0);
    acquireWakeLock();
    const totalMB = (file.size / (1024 * 1024)).toFixed(1);
    setProcessingText(`Uploading ${file.name} (0 / ${totalMB} MB). Keep this screen open until the upload finishes.`);

    const formData = new FormData();
    formData.append('video', file, file.name || 'video.mov');

    const xhr = new XMLHttpRequest();
    // defer=1: return as soon as the file is stored; conversion happens in the job
    const targetUrl = getApiUrl('/api/upload?defer=1');
    xhr.open('POST', targetUrl, true);

    const startTime = Date.now();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.floor((e.loaded / e.total) * 100);
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMBps = elapsedSec > 0.5 ? ((e.loaded / (1024 * 1024)) / elapsedSec).toFixed(1) : '...';
        const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);

        let estMsg = '';
        if (elapsedSec > 2 && e.loaded > 0) {
          const remainingSec = Math.round((e.total - e.loaded) / (e.loaded / elapsedSec));
          const remMin = Math.floor(remainingSec / 60);
          const remSec = remainingSec % 60;
          estMsg = remMin > 0 ? `, about ${remMin}m ${remSec}s left` : `, about ${remSec}s left`;
        }

        setProcessingPercent(pct);
        setProcessingText(`Uploading ${file.name}: ${loadedMB} / ${totalMB} MB at ${speedMBps} MB/s${estMsg}. Keep this screen open.`);
      }
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let data;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (parseErr) {
          failProcessing(new Error('Upload failed: the server sent an invalid response.'));
          return;
        }
        await runProcessingPipeline(data.filePath, null, data.videoUrl);
      } else {
        let errMsg = `Upload failed (${xhr.status})`;
        try {
          const errObj = JSON.parse(xhr.responseText);
          if (errObj.error) errMsg = errObj.error;
        } catch (e) {
          if (xhr.status === 502 || xhr.status === 503) {
            errMsg = 'The server is starting up or busy. Wait 30 seconds and upload again.';
          }
        }
        failProcessing(new Error(errMsg));
      }
    };

    xhr.onerror = () => {
      failProcessing(new Error('Upload stopped because the connection dropped. Keep Safari open on this page during the upload, then try again.'));
    };

    xhr.send(formData);
  };

  // 3. Download URL handler (yt-dlp runs inside the background job)
  const handleDownloadUrl = async (url) => {
    await runProcessingPipeline(null, null, null, url);
  };

  // 4. Select Sample Demo handler
  const handleSelectSample = (sample) => {
    runProcessingPipeline(sample.filePath, sample.vttPath, sample.videoUrl);
  };

  // 5. Open Studio Editor for a clip
  const handleSelectClip = (clip) => {
    setSelectedClip(clip);
    setView('studio');
  };

  // 6. Trigger Render & Export (background job + polling)
  const handleExportClip = async (exportParams) => {
    setIsExportModalOpen(true);
    setIsRendering(true);
    setExportResult(null);
    setExportError(null);
    setRenderProgress({ percent: 0, message: 'Starting render...', aspectRatio: exportParams.aspectRatio });
    acquireWakeLock();

    try {
      const data = await safeFetchJson('/api/jobs/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportParams)
      });
      const result = await pollJob(data.job.id, (job) => {
        setRenderProgress({
          percent: typeof job.percent === 'number' ? job.percent : null,
          message: job.state === 'queued' ? 'Waiting for another job to finish...' : job.message,
          aspectRatio: exportParams.aspectRatio
        });
      });
      setIsRendering(false);
      setExportResult(result);
    } catch (err) {
      setIsRendering(false);
      if (err.message !== 'cancelled') setExportError(err.message);
    } finally {
      releaseWakeLock();
    }
  };

  const handleNewVideo = () => {
    setActiveVideo(null);
    setClips([]);
    setSelectedClip(null);
    setView('ingestion');
    localStorage.removeItem('openclip_active_video');
    localStorage.removeItem('openclip_clips');
    localStorage.removeItem('openclip_selected_clip');
    localStorage.setItem('openclip_view', 'ingestion');
  };

  return (
    <div className="app-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        status={systemStatus}
        view={view}
        onNavigate={setView}
        onNewVideo={handleNewVideo}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main style={{ flex: 1 }}>
        <ErrorBoundary onBack={() => setView('clips')}>
          {view === 'ingestion' && (
            <IngestionZone
              samples={samples}
              onSelectSample={handleSelectSample}
              onUploadFile={handleUploadFile}
              onDownloadUrl={handleDownloadUrl}
              scanMode={scanMode}
              onScanModeChange={setScanMode}
              enableHookScan={enableHookScan}
              onEnableHookScanChange={setEnableHookScan}
              isLoading={false}
              isStaticDemo={isStaticDemo}
              backendUrl={apiKeys.backendUrl}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {view === 'processing' && (
            <ProcessingStatus
              step={processingStep}
              progressText={processingText}
              percent={processingPercent}
              error={processingError}
              onCancel={() => {
                if (pollCancelRef.current) pollCancelRef.current();
                localStorage.removeItem('openclip_process_job');
                releaseWakeLock();
                setProcessingError(null);
                setView('ingestion');
              }}
            />
          )}

          {view === 'clips' && (
            <ClipList
              clips={clips}
              videoMeta={activeVideo?.meta}
              onSelectClip={handleSelectClip}
              onNewVideo={handleNewVideo}
            />
          )}

          {view === 'studio' && selectedClip && (
            <StudioEditor
              clip={selectedClip}
              videoUrl={activeVideo?.videoUrl}
              filePath={activeVideo?.filePath}
              backendUrl={apiKeys.backendUrl}
              onBack={() => setView('clips')}
              onExport={handleExportClip}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Export Rendering Modal */}
      {isExportModalOpen && (
        <ExportModal
          isRendering={isRendering}
          progress={renderProgress}
          exportResult={exportResult}
          error={exportError}
          getApiUrl={getApiUrl}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* API Key Settings Modal */}
      <ApiSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaveKeys={handleSaveKeys}
        initialKeys={apiKeys}
      />
    </div>
  );
}
