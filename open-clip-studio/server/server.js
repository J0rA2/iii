const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Auto-detect GitHub Student Plan token from local gh CLI
let autoGithubToken = '';
try {
  const { execSync } = require('child_process');
  autoGithubToken = execSync('gh auth token', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  if (autoGithubToken) {
    process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || autoGithubToken;
    console.log('✨ Automatically detected GitHub Student Plan authentication from gh CLI!');
  }
} catch (e) {}

const {
  probeVideo,
  normalizeWebVideo,
  generateClipPreview,
  trackSubject,
  extractAudio,
  generateThumbnail,
  renderShortClip,
  getOutputGeometry
} = require('./services/ffmpegService');
const { transcribeAudio } = require('./services/transcribeService');
const { discoverViralClips, findBestTeaserHook } = require('./services/viralityService');
const { generateAssSubtitles } = require('./services/subtitleService');
const { downloadUrl, resolveYtDlpBin } = require('./services/downloaderService');
const { calculateJumpCuts } = require('./services/jumpCutService');
const { createJob, getJob } = require('./services/jobService');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Render (and most PaaS) terminate HTTPS at a proxy in front of the container
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(cors());
// Transcripts with word timings for long videos easily exceed the 100kb default
app.use(express.json({ limit: '25mb' }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PREVIEW_DIR = path.join(UPLOAD_DIR, 'previews');
const EXPORT_DIR = path.join(__dirname, 'exports');
const SAMPLES_DIR = path.join(__dirname, 'samples');
const SFX_DIR = path.join(__dirname, 'assets', 'sfx');

[UPLOAD_DIR, PREVIEW_DIR, EXPORT_DIR, SAMPLES_DIR, SFX_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Clients pass server-side file paths back to the API (filePath/vttPath/path).
 * On a public deployment those must never reach outside the media folders,
 * otherwise /api/stream?path=/proc/self/environ would leak API keys.
 */
const MEDIA_ROOTS = [UPLOAD_DIR, EXPORT_DIR, SAMPLES_DIR].map(d => path.resolve(d));
function resolveMediaPath(p) {
  if (!p || typeof p !== 'string') return null;
  const abs = path.resolve(p);
  const inside = MEDIA_ROOTS.some(root => abs === root || abs.startsWith(root + path.sep));
  if (!inside) return null;
  try {
    return fs.statSync(abs).isFile() ? abs : null;
  } catch (e) {
    return null;
  }
}

const VIDEO_MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };

function streamFileWithRange(req, res, filePath) {
  const fileSize = fs.statSync(filePath).size;
  const contentType = VIDEO_MIME[path.extname(filePath).toLowerCase()] || 'video/mp4';
  const range = req.headers.range;

  if (range && fileSize > 0) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parts[0] ? parseInt(parts[0], 10) : NaN;
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (isNaN(start)) { // suffix range: bytes=-500
      start = Math.max(0, fileSize - (parseInt(parts[1], 10) || 0));
      end = fileSize - 1;
    }
    end = Math.min(isNaN(end) ? fileSize - 1 : end, fileSize - 1);
    if (start > end || start >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': (end - start) + 1,
      'Content-Type': contentType
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// Configure Multer storage for high-capacity video uploads (up to 4GB)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    // Filenames end up in FFmpeg shell commands: only allow a plain extension
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const ext = /^\.[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : '.mp4';
    cb(null, `upload_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 } // 4GB max
});

// Serve static exports, samples & streamer SFX
// ?download=1 forces a "Save file" response (used by the Download button on iPhone)
app.use('/exports', (req, res, next) => {
  if (req.query.download) {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.path).replace(/[^\w.\-]/g, '_')}"`);
  }
  next();
}, express.static(EXPORT_DIR));
app.use('/samples', express.static(SAMPLES_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/sfx', express.static(SFX_DIR));

/**
 * Fast Dedicated Clip Preview Endpoint
 * Generates and streams lightweight, browser-optimized, frame-accurate clip MP4s in ~0.1s
 * Eliminates 2GB streaming lag and browser decoding errors
 */
app.get('/api/clip-preview', async (req, res) => {
  const filePath = resolveMediaPath(req.query.filePath || req.query.path);
  const startTime = Math.max(0, parseFloat(req.query.startTime || req.query.start || 0));
  const duration = Math.max(0.5, parseFloat(req.query.duration || 30));

  if (!filePath) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  try {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5')
      .update(`${filePath}_${startTime.toFixed(2)}_${duration.toFixed(2)}`)
      .digest('hex').slice(0, 14);
    const previewPath = path.join(PREVIEW_DIR, `preview_${hash}.mp4`);

    await generateClipPreview(filePath, startTime, duration, previewPath);
    streamFileWithRange(req, res, previewPath);
  } catch (err) {
    console.error('Clip preview error:', err);
    res.status(500).json({ error: `Clip preview generation failed: ${err.message}` });
  }
});

/**
 * HTTP 206 Partial Content Video Streaming Endpoint
 * Enables smooth HTML5 video scrubbing and prevents browser playback errors on large files
 */
app.get('/api/stream', (req, res) => {
  const filePath = resolveMediaPath(req.query.path);
  if (!filePath) {
    return res.status(404).send('Video file not found');
  }
  streamFileWithRange(req, res, filePath);
});

// Lightweight liveness probe for Render's health check
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

/**
 * Health & Capabilities Check
 */
app.get('/api/status', (req, res) => {
  const ghTok = process.env.GITHUB_TOKEN || autoGithubToken || '';
  let ytdlpResolved = 'unknown';
  try {
    ytdlpResolved = resolveYtDlpBin ? resolveYtDlpBin() : 'not-imported';
  } catch (e) {
    ytdlpResolved = e.message;
  }

  let pythonCv2Status = 'unknown';
  try {
    const py = require('child_process').execSync(`${process.env.PYTHON_BIN || 'python3'} -c "import cv2; print(cv2.__version__)" 2>&1`).toString().trim();
    pythonCv2Status = `cv2 ${py}`;
  } catch (e) {
    pythonCv2Status = `error: ${e.message}`;
  }

  res.json({
    status: 'ok',
    version: '1.0.1',
    platform: 'OpenClip Studio',
    pricing: '100% Free & Open-Source',
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasGithubToken: Boolean(ghTok),
    ffmpegReady: true,
    ytdlpReady: Boolean(ytdlpResolved),
    ytdlpPath: ytdlpResolved,
    pythonCv2Status
  });
});

/**
 * Get Built-in Sample Videos for instant testing
 */
app.get('/api/samples', (req, res) => {
  const sampleMp4 = path.join(SAMPLES_DIR, 'sample_podcast.mp4');
  const sampleVtt = path.join(SAMPLES_DIR, 'sample_podcast.vtt');
  const samples = [];

  if (fs.existsSync(sampleMp4)) {
    samples.push({
      id: 'sample_podcast_ai',
      title: 'AI Leverage & The Future of Work (Podcast)',
      duration: 30.3,
      videoUrl: '/samples/sample_podcast.mp4',
      filePath: sampleMp4,
      vttPath: fs.existsSync(sampleVtt) ? sampleVtt : null,
      thumbnail: null,
      description: 'Studio demo podcast discussion on automation and asymmetric leverage.'
    });
  }

  const hydeParkMp4 = path.join(UPLOAD_DIR, 'upload_1789150429519_y64pxm.mp4');
  if (fs.existsSync(hydeParkMp4)) {
    samples.push({
      id: 'sample_hyde_park_debate',
      title: 'Debate & Street Interview (Hyde Park)',
      duration: 38.0,
      videoUrl: `/api/stream?path=${encodeURIComponent(hydeParkMp4)}`,
      filePath: hydeParkMp4,
      vttPath: null,
      thumbnail: null,
      description: 'Street debate at Speakers Corner. Demonstrates dual-speaker split-screen framing & 30-40s clips.'
    });
  }

  res.json({ samples });
});

/**
 * Upload Video Endpoint with robust Multer error catching
 */
app.post('/api/upload', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'The uploaded file exceeds the 4GB limit. Please choose a smaller video or use a public URL link.'
        });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No video file provided' });
    }

    try {
      let filePath = req.file.path;
      // ?defer=1: return immediately and normalize inside the background job
      // (converting a 4K HEVC iPhone video can take minutes on a small instance)
      if (!req.query.defer) {
        filePath = await normalizeWebVideo(filePath);
      }
      const meta = await probeVideo(filePath);

      res.json({
        success: true,
        videoId: path.basename(filePath, path.extname(filePath)),
        filePath,
        fileName: req.file.originalname,
        videoUrl: `/api/stream?path=${encodeURIComponent(filePath)}`,
        meta
      });
    } catch (probeErr) {
      console.error('Upload probe error:', probeErr);
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(415).json({ success: false, error: `"${req.file.originalname}" could not be read as a video. Choose an MP4 or MOV video and try again.` });
    }
  });
});

/**
 * Download URL (YouTube, Vimeo, etc.)
 */
app.post('/api/download-url', async (req, res) => {
  const { url, cookies } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const result = await downloadUrl(url, UPLOAD_DIR, null, cookies);
    let filePath = result.filePath;
    filePath = await normalizeWebVideo(filePath);
    const meta = await probeVideo(filePath);

    res.json({
      success: true,
      videoId: result.fileId,
      filePath,
      videoUrl: `/api/stream?path=${encodeURIComponent(filePath)}`,
      meta
    });
  } catch (err) {
    console.error('Download URL error:', err);
    res.status(500).json({ error: `Download failed: ${err.message}` });
  }
});

/**
 * Master Pipeline: (Download) -> Normalize -> Probe -> Transcribe -> Viral Clip Detection
 * `report` receives { step, message, percent } updates for the job status endpoint.
 */
async function runProcessPipeline(params, report = () => {}) {
  const { url, cookies, vttPath, geminiApiKey, groqApiKey, githubToken, scanMode = 'lightning', enableHookScan = true } = params;
  let filePath = params.filePath ? resolveMediaPath(params.filePath) : null;

  if (!filePath && url) {
    report({ step: 1, percent: 0, message: 'Downloading video with yt-dlp...' });
    const dl = await downloadUrl(url, UPLOAD_DIR, (pct) => {
      report({ step: 1, percent: Math.round(pct), message: `Downloading video with yt-dlp... ${Math.round(pct)}%` });
    }, cookies);
    filePath = dl.filePath;
  }
  if (!filePath) {
    const err = new Error('Valid filePath is required');
    err.status = 400;
    throw err;
  }

  report({ step: 1, percent: 0, message: 'Preparing video (converting iPhone HEVC/HDR to web-safe H.264 if needed)...' });
  filePath = await normalizeWebVideo(filePath, (pct) => {
    report({ step: 1, percent: pct, message: `Preparing video... ${pct}%` });
  });

  // 1+2. Probe video metadata AND extract audio in parallel for speed
  report({ step: 1, percent: 100, message: 'Extracting 16kHz audio stream via FFmpeg...' });
  const audioPath = path.join(UPLOAD_DIR, `${path.basename(filePath, path.extname(filePath))}_audio.wav`);
  const [meta] = await Promise.all([
    probeVideo(filePath),
    extractAudio(filePath, audioPath)
  ]);

  // 3. Transcription (Lightning mode pre-trims long files for fast processing on CPU)
  const safeVtt = vttPath ? resolveMediaPath(vttPath) : null;
  report({ step: 2, percent: 0, message: 'Transcribing speech with Whisper...' });
  const transcript = await transcribeAudio(audioPath, {
    groqApiKey,
    existingVttPath: safeVtt,
    estimatedDuration: meta.duration,
    scanMode,
    onProgress: (pct) => report({ step: 2, percent: Math.round(pct), message: `Transcribing speech with Whisper... ${Math.round(pct)}%` })
  });

  // 4. AI Virality Scoring & Complete Narrative Clip Discovery
  report({ step: 3, percent: 0, message: 'Scoring virality and finding the best clips...' });
  const clips = await discoverViralClips(
    transcript.words,
    transcript.text,
    meta.duration,
    { geminiApiKey, groqApiKey, githubToken: githubToken || process.env.GITHUB_TOKEN },
    { enableHookScan, audioPath, filePath }
  );

  report({ step: 5, percent: 100, message: 'Packaging clips and captions...' });
  return {
    success: true,
    filePath,
    videoUrl: `/api/stream?path=${encodeURIComponent(filePath)}`,
    meta,
    transcript,
    clips
  };
}

app.post('/api/process', async (req, res) => {
  try {
    res.json(await runProcessPipeline(req.body || {}));
  } catch (err) {
    console.error('Process error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * AI Entity / Subject Motion Tracking Endpoint
 * Runs YOLOv8n ONNX to detect speaker's horizontal center coordinates across the clip
 */
app.get('/api/clip-tracking', async (req, res) => {
  const filePath = resolveMediaPath(req.query.filePath || req.query.path);
  const startTime = Math.max(0, parseFloat(req.query.startTime || req.query.start || 0));
  const duration = Math.max(0.5, parseFloat(req.query.duration || 30));

  if (!filePath) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  try {
    const trackingData = await trackSubject(filePath, startTime, duration);
    res.json(trackingData);
  } catch (err) {
    console.warn('Tracking endpoint error:', err);
    res.json({ avgXPercent: 50.0, trajectory: [] });
  }
});

/**
 * Smart Jump-Cut & Dead-Air Removal Calculation Endpoint
 */
app.post('/api/jump-cuts', (req, res) => {
  const { words = [], startTime = 0, duration = 30, silenceThreshold = 'balanced', deletedIndices = [] } = req.body;
  const clipEnd = startTime + duration;
  const result = calculateJumpCuts(words, startTime, clipEnd, silenceThreshold, deletedIndices);
  const teaserHook = findBestTeaserHook(words, startTime, clipEnd);
  res.json({ ...result, teaserHook });
});

/**
 * Endpoint to discover or refresh candidate viral teaser hooks for a clip
 */
app.post('/api/find-hook', (req, res) => {
  const { words = [], startTime = 0, duration = 30 } = req.body;
  const clipEnd = startTime + duration;
  const hook = findBestTeaserHook(words, startTime, clipEnd);
  res.json(hook);
});

/**
 * Render High-Res Clip (9:16 / 1:1 / 16:9) with Auto-Crop, Subject Tracking, Burned Subtitles & SFX
 */
async function runRenderClip(params, report = () => {}) {
  const {
    clipId = 'clip',
    startTime = 0,
    duration = 30,
    aspectRatio = '9:16',
    reframeMode = 'smart_track', // 'smart_track' | 'split_stacked' | 'crop_center' | 'blur_fill'
    targetXPercent = 50.0,
    speakerLeftPercent = 30.0,
    speakerRightPercent = 70.0,
    trajectory = [],
    sfxEvents = [],
    sfxVolume = 0.40,
    enablePunchInZoom = true,
    style = 'hormozi',
    fontSize = 58,
    words = [],
    segments = [],
    burnSubtitles = true,
    enableSpotlight = false,
    hookBannerText = null,
    showHookBanner = true,
    teaserHook = null
  } = params;

  const filePath = resolveMediaPath(params.filePath);
  if (!filePath) {
    const err = new Error('Valid filePath required');
    err.status = 400;
    throw err;
  }
  const safeClipId = String(clipId).replace(/[^\w\-]/g, '_').slice(0, 60) || 'clip';
  const ratio = ['9:16', '1:1', '16:9'].includes(aspectRatio) ? aspectRatio : '9:16';
  const geo = getOutputGeometry(ratio, fontSize);
  const sourceMeta = await probeVideo(filePath);

  let effectiveTrajectory = trajectory || [];
  if (reframeMode === 'smart_track' && effectiveTrajectory.length < 2) {
    report({ step: 1, percent: 0, message: 'Tracking the speaker for smart framing...' });
    try {
      console.log(`[Render] Computing dynamic subject tracking trajectory for ${safeClipId}...`);
      const tracking = await trackSubject(filePath, startTime, duration);
      if (tracking && tracking.trajectory && tracking.trajectory.length >= 2) {
        effectiveTrajectory = tracking.trajectory;
        console.log(`[Render] Auto-computed ${effectiveTrajectory.length} trajectory points.`);
      }
    } catch (trackErr) {
      console.warn('[Render] Auto-tracking error:', trackErr.message);
    }
  }

  let assPath = null;
  const hasTeaser = teaserHook && teaserHook.active && typeof teaserHook.start === 'number';
  const teaserStart = hasTeaser ? Math.max(0, teaserHook.start) : 0;
  const teaserDur = hasTeaser ? Math.max(1.2, Math.min(4.5, (teaserHook.end || (teaserStart + 2.5)) - teaserStart)) : 0;

  const nonDeletedWords = (words || []).filter(w => !w.deleted);

  if (burnSubtitles && nonDeletedWords.length > 0) {
    // Adjust word timings relative to clip start (and offset by teaserDur if teaser hook is prepended)
    const relativeWords = nonDeletedWords.map(w => ({
      ...w,
      start: Math.max(0, (w.start - startTime) + (hasTeaser ? teaserDur : 0)),
      end: Math.max(0.1, (w.end - startTime) + (hasTeaser ? teaserDur : 0))
    })).filter(w => w.end > 0);

    const assContent = generateAssSubtitles(relativeWords, {
      style,
      fontSize: geo.fontSize,
      marginV: geo.marginV,
      videoWidth: geo.width,
      videoHeight: geo.height,
      hookBannerText: showHookBanner ? hookBannerText : null,
      clipDuration: duration + (hasTeaser ? teaserDur : 0)
    });

    assPath = path.join(EXPORT_DIR, `sub_${Date.now()}_${safeClipId}.ass`);
    fs.writeFileSync(assPath, assContent, 'utf8');
  }

  const outputFileName = `openclip_${Date.now()}_${safeClipId}_${ratio.replace(':', 'x')}.mp4`;
  const outputPath = path.join(EXPORT_DIR, outputFileName);

  report({ step: 2, percent: 0, message: `Rendering ${geo.width}x${geo.height} video with captions...` });
  try {
    await renderShortClip({
      inputPath: filePath,
      outputPath,
      startTime,
      duration,
      aspectRatio: ratio,
      reframeMode,
      targetXPercent,
      speakerLeftPercent,
      speakerRightPercent,
      trajectory: effectiveTrajectory,
      segments,
      sfxEvents,
      sfxVolume,
      enablePunchInZoom,
      words: nonDeletedWords,
      subtitlesAssPath: assPath,
      enableSpotlight,
      teaserHook,
      sourceWidth: sourceMeta.width,
      sourceHeight: sourceMeta.height,
      onProgress: (pct) => report({ step: 2, percent: pct, message: `Rendering ${geo.width}x${geo.height} video with captions... ${pct}%` })
    });
  } finally {
    if (assPath) { try { fs.unlinkSync(assPath); } catch (e) {} }
  }

  return {
    success: true,
    fileName: outputFileName,
    aspectRatio: ratio,
    width: geo.width,
    height: geo.height,
    downloadUrl: `/exports/${outputFileName}`
  };
}

app.post('/api/render-clip', async (req, res) => {
  try {
    res.json(await runRenderClip(req.body || {}));
  } catch (err) {
    console.error('Render clip error:', err);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * Background jobs: start long work, then poll GET /api/jobs/:id.
 * Survives the phone locking or Safari switching tabs mid-processing.
 */
app.post('/api/jobs/process', (req, res) => {
  const body = req.body || {};
  if (!body.url && !resolveMediaPath(body.filePath)) {
    return res.status(400).json({ success: false, error: 'Upload a video (filePath) or give a video URL first.' });
  }
  const job = createJob('process', (update) => runProcessPipeline(body, update));
  res.status(202).json({ success: true, job });
});

app.post('/api/jobs/render', (req, res) => {
  const body = req.body || {};
  if (!resolveMediaPath(body.filePath)) {
    return res.status(400).json({ success: false, error: 'The source video is no longer on the server. Upload it again.' });
  }
  const job = createJob('render', (update) => runRenderClip(body, update));
  res.status(202).json({ success: true, job });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found. The server may have restarted; please start again.' });
  }
  res.json({ success: true, job });
});

// Global Error Handler to guarantee JSON responses
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal server error'
    });
  }
});

// Serve static frontend in production if built
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      // Always revalidate the HTML shell so iPhone Safari picks up new deploys;
      // hashed JS/CSS bundles can be cached forever.
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/exports') || req.path.startsWith('/samples') || req.path.startsWith('/sfx')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

/**
 * Disk housekeeping: cloud disks are small and ephemeral, so remove uploads,
 * previews and exports older than FILE_TTL_HOURS (default 12h).
 */
const FILE_TTL_MS = Math.max(1, parseFloat(process.env.FILE_TTL_HOURS || '12')) * 3600 * 1000;
function cleanupOldFiles() {
  const cutoff = Date.now() - FILE_TTL_MS;
  for (const dir of [UPLOAD_DIR, PREVIEW_DIR, EXPORT_DIR]) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch (e) {}
    }
  }
}
setInterval(cleanupOldFiles, 30 * 60 * 1000).unref();

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 OpenClip Studio API Server running on http://${HOST}:${PORT}`);
});
server.requestTimeout = 0; // large iPhone uploads can take a long time on mobile networks
server.setTimeout(0);
server.keepAliveTimeout = 300000;
server.headersTimeout = 305000;
