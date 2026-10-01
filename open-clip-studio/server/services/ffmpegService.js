const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getEmojiPngPath } = require('./emojiService');

let staticFfmpeg = null;
try {
  staticFfmpeg = require('ffmpeg-static');
} catch (e) {}

let staticFfprobe = null;
try {
  staticFfprobe = require('@ffprobe-installer/ffprobe').path;
} catch (e) {}

const FFMPEG_BIN = process.env.FFMPEG_PATH || (staticFfmpeg && fs.existsSync(staticFfmpeg) ? staticFfmpeg : 'ffmpeg');
const FFPROBE_BIN = process.env.FFPROBE_PATH || (staticFfprobe && fs.existsSync(staticFfprobe) ? staticFfprobe : 'ffprobe');


/**
 * Probes video file to get duration, width, height, fps
 */
function probeVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const cmd = `${FFPROBE_BIN} -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`FFprobe failed: ${stderr || error.message}`));
      }
      try {
        const info = JSON.parse(stdout);
        const videoStream = info.streams.find(s => s.codec_type === 'video') || {};
        const audioStream = info.streams.find(s => s.codec_type === 'audio') || {};

        let fps = 30;
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/');
          if (parts.length === 2 && parseInt(parts[1]) > 0) {
            fps = Math.round(parseInt(parts[0]) / parseInt(parts[1]));
          }
        }

        const duration = parseFloat(info.format.duration || videoStream.duration || 0);

        // iPhone portrait videos are stored landscape + a rotation flag.
        // Report the dimensions as displayed so framing decisions are correct.
        let rotation = 0;
        const sideData = videoStream.side_data_list || [];
        const rotEntry = sideData.find(sd => typeof sd.rotation === 'number');
        if (rotEntry) rotation = rotEntry.rotation;
        else if (videoStream.tags && videoStream.tags.rotate) rotation = parseInt(videoStream.tags.rotate, 10) || 0;
        const rotated = Math.abs(rotation) % 180 === 90;
        const rawW = parseInt(videoStream.width || 1280);
        const rawH = parseInt(videoStream.height || 720);

        resolve({
          duration,
          width: rotated ? rawH : rawW,
          height: rotated ? rawW : rawH,
          rotation,
          pixFmt: videoStream.pix_fmt || '',
          colorTransfer: videoStream.color_transfer || '',
          hasAudio: Boolean(audioStream.codec_type),
          fps: fps || 30,
          videoCodec: videoStream.codec_name,
          audioCodec: audioStream.codec_name,
          format_name: info.format ? info.format.format_name : '',
          sizeBytes: parseInt(info.format.size || 0)
        });
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
  });
}

let zscaleAvailable = null;
function hasZscale() {
  if (zscaleAvailable !== null) return zscaleAvailable;
  try {
    const out = require('child_process').execFileSync(FFMPEG_BIN, ['-hide_banner', '-filters'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    zscaleAvailable = /\szscale\s/.test(out);
  } catch (e) {
    zscaleAvailable = false;
  }
  return zscaleAvailable;
}

function runFfmpeg(args, durationSec, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderrTail = '';
    proc.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      if (onProgress && durationSec > 0) {
        const m = text.match(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
        if (m) {
          const t = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
          onProgress(Math.max(0, Math.min(99, Math.round((t / durationSec) * 100))));
        }
      }
    });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderrTail.slice(-600)}`));
    });
  });
}

const MAX_WORKING_LONG_EDGE = parseInt(process.env.MAX_WORKING_LONG_EDGE || '1920', 10);

/**
 * Normalizes an uploaded/downloaded video into a web-safe working copy:
 * H.264 8-bit yuv420p + AAC in MP4 with +faststart, at most 1080p.
 *
 * iPhone recordings are usually HEVC, often 10-bit HDR (HLG), often 4K, and
 * carry extra data tracks. Those break stream-copy into MP4, can't be decoded
 * by every browser, and make every later render step very slow on a small
 * cloud CPU. Converting once up front keeps everything downstream fast and
 * playable in Safari.
 */
async function normalizeWebVideo(inputPath, onProgress = null) {
  const meta = await probeVideo(inputPath);
  const isMp4Family = (meta.format_name || '').includes('mp4');
  const longEdge = Math.max(meta.width, meta.height);
  const is8bit420 = meta.pixFmt === 'yuv420p' || meta.pixFmt === 'yuvj420p';
  const isHdr = meta.colorTransfer === 'arib-std-b67' || meta.colorTransfer === 'smpte2084';
  const videoOk = meta.videoCodec === 'h264' && is8bit420 && !isHdr && longEdge <= MAX_WORKING_LONG_EDGE;
  const audioOk = !meta.hasAudio || meta.audioCodec === 'aac';

  if (videoOk && audioOk && isMp4Family) {
    return inputPath;
  }

  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${base}_web.mp4`);

  const args = ['-y', '-hide_banner', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn'];

  if (videoOk) {
    console.log(`Remuxing ${path.basename(inputPath)} (${meta.videoCodec}/${meta.audioCodec}) to MP4...`);
    args.push('-c:v', 'copy');
  } else {
    console.log(`Transcoding ${path.basename(inputPath)} (${meta.videoCodec} ${meta.width}x${meta.height} ${meta.pixFmt}${isHdr ? ' HDR' : ''}) to H.264 <=1080p...`);
    const filters = [];
    // Downscale first: tonemapping at 1080p is ~2x faster than at 4K
    if (longEdge > MAX_WORKING_LONG_EDGE) {
      const shortEdge = Math.round(MAX_WORKING_LONG_EDGE * 9 / 16);
      // After autorotation the frame is in display orientation; shrink the short edge to 1080
      filters.push(`scale='if(gte(iw,ih),-2,${shortEdge})':'if(gte(iw,ih),${shortEdge},-2)'`);
    }
    if (isHdr && hasZscale()) {
      // HLG/PQ -> SDR BT.709 tonemap so iPhone HDR footage doesn't look washed out
      filters.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv');
    }
    filters.push('format=yuv420p');
    args.push(
      '-vf', filters.join(','),
      '-c:v', 'libx264',
      '-preset', process.env.NORMALIZE_PRESET || 'veryfast',
      '-crf', '20',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'
    );
  }

  if (meta.hasAudio) {
    if (meta.audioCodec === 'aac') args.push('-c:a', 'copy');
    else args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2');
  }
  args.push('-movflags', '+faststart', outputPath);

  await runFfmpeg(args, meta.duration, onProgress);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error('Video normalization produced an empty file');
  }
  if (path.resolve(outputPath) !== path.resolve(inputPath)) {
    try { fs.unlinkSync(inputPath); } catch (e) {}
  }
  return outputPath;
}

/**
 * Generates an ultra-fast, lightweight MP4 clip snippet for the Studio Player
 * Runs in ~0.05s via FFmpeg stream copy with +faststart
 */
function generateClipPreview(inputPath, startTime, duration, outputPreviewPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(outputPreviewPath) && fs.statSync(outputPreviewPath).size > 1000) {
      return resolve(outputPreviewPath);
    }

    const args = [
      '-y',
      '-ss', String(startTime),
      '-t', String(duration),
      '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPreviewPath
    ];

    const proc = spawn(FFMPEG_BIN, args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());

    proc.on('close', code => {
      if (code === 0 && fs.existsSync(outputPreviewPath) && fs.statSync(outputPreviewPath).size > 1000) {
        resolve(outputPreviewPath);
      } else {
        // Fallback to ultrafast re-encode for strict keyframe cuts if needed
        const fbArgs = [
          '-y',
          '-ss', String(startTime),
          '-t', String(duration),
          '-i', inputPath,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '24',
          '-c:a', 'aac',
          '-movflags', '+faststart',
          outputPreviewPath
        ];
        const fbProc = spawn(FFMPEG_BIN, fbArgs);
        let fbStderr = '';
        fbProc.stderr.on('data', d => fbStderr += d.toString());
        fbProc.on('close', fbCode => {
          if (fbCode === 0 && fs.existsSync(outputPreviewPath)) {
            resolve(outputPreviewPath);
          } else {
            reject(new Error(`Clip preview generation failed: ${fbStderr || stderr}`));
          }
        });
      }
    });
  });
}

/**
 * Extracts 16kHz mono audio for transcription
 */
function extractAudio(videoPath, audioOutputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-threads', '4',
      '-loglevel', 'warning',
      '-i', videoPath,
      '-vn',
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      audioOutputPath
    ];

    const proc = spawn(FFMPEG_BIN, args);
    let stderr = '';

    proc.stderr.on('data', data => stderr += data.toString());
    proc.on('close', code => {
      if (code === 0) {
        resolve(audioOutputPath);
      } else {
        reject(new Error(`FFmpeg audio extraction failed (code ${code}): ${stderr}`));
      }
    });
  });
}

/**
 * Generates video preview thumbnail
 */
function generateThumbnail(videoPath, timeSec, thumbOutputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(timeSec),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      thumbOutputPath
    ];

    const proc = spawn(FFMPEG_BIN, args);
    proc.on('close', code => {
      if (code === 0) resolve(thumbOutputPath);
      else reject(new Error(`Thumbnail generation failed with code ${code}`));
    });
  });
}

const trackingCache = new Map();
const inflightTracking = new Map();

/**
 * Runs Python YOLOv8n ONNX subject tracker to determine optimal 9:16 crop panning
 */
function trackSubject(videoPath, startTime, duration) {
  const cacheKey = `${videoPath}_${parseFloat(startTime).toFixed(1)}_${parseFloat(duration).toFixed(1)}`;
  if (trackingCache.has(cacheKey)) {
    return Promise.resolve(trackingCache.get(cacheKey));
  }
  if (inflightTracking.has(cacheKey)) {
    return inflightTracking.get(cacheKey);
  }

  const p = new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'tracker_local.py');
    const crypto = require('crypto');
    const hash = crypto.createHash('md5')
      .update(`${videoPath}_${parseFloat(startTime).toFixed(2)}_${parseFloat(duration).toFixed(2)}`)
      .digest('hex').slice(0, 14);
    const previewPath = path.join(__dirname, '..', 'uploads', 'previews', `preview_${hash}.mp4`);

    const hasPreview = fs.existsSync(previewPath) && fs.statSync(previewPath).size > 1000;
    const targetPath = hasPreview ? previewPath : videoPath;
    const targetStart = hasPreview ? 0 : startTime;

    const cmd = `python3 "${scriptPath}" "${targetPath}" ${targetStart} ${duration}`;
    exec(cmd, {
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        FFMPEG_PATH: FFMPEG_BIN
      }
    }, (err, stdout, stderr) => {
      inflightTracking.delete(cacheKey);
      if (err) {
        console.warn('Subject tracking fallback to center (50%):', stderr || err.message);
        return resolve({ avgXPercent: 50.0, trajectory: [] });
      }
      try {
        const data = JSON.parse(stdout.trim());
        trackingCache.set(cacheKey, data);
        resolve(data);
      } catch (e) {
        resolve({ avgXPercent: 50.0, trajectory: [] });
      }
    });
  });

  inflightTracking.set(cacheKey, p);
  return p;
}

/**
 * Builds a smooth time-continuous piecewise linear camera pan expression for FFmpeg
 */
function generateDynamicCropExpression(trajectory, defaultXPercent = 50.0) {
  if (!trajectory || trajectory.length < 2) {
    const xFrac = Math.max(0.18, Math.min(0.82, (defaultXPercent || 50.0) / 100)).toFixed(3);
    return `min(max(0\\,in_w*${xFrac}-540)\\,in_w-1080)`;
  }

  // Extract horizontal coordinate fractions
  const xs = trajectory.map(pt => pt.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spread = maxX - minX;

  // If camera motion span is tiny (under 4% frame width), lock camera smoothly on the median
  if (spread < 0.04) {
    const sorted = [...xs].sort((a, b) => a - b);
    const medianX = sorted[Math.floor(sorted.length / 2)];
    const xFrac = Math.max(0.20, Math.min(0.80, medianX)).toFixed(3);
    return `min(max(0\\,in_w*${xFrac}-540)\\,in_w-1080)`;
  }

  // Build clean, evenly spaced keyframes (at least every 1s or on 3% motion shift)
  const keyframes = [trajectory[0]];
  for (let i = 1; i < trajectory.length; i++) {
    const curr = trajectory[i];
    const prev = keyframes[keyframes.length - 1];
    const dx = Math.abs(curr.x - prev.x);
    const dt = curr.t - prev.t;

    // Register a keyframe on moderate motion (> 3%) or time interval >= 1.0s
    if (dx >= 0.03 || dt >= 1.0 || i === trajectory.length - 1) {
      keyframes.push(curr);
    }
  }

  if (keyframes.length <= 1) {
    const xFrac = Math.max(0.20, Math.min(0.80, keyframes[0].x)).toFixed(3);
    return `min(max(0\\,in_w*${xFrac}-540)\\,in_w-1080)`;
  }

  // Ensure anchor at t=0
  if (keyframes[0].t > 0) {
    keyframes.unshift({ t: 0, x: keyframes[0].x });
  }

  // Build fluid continuous smoothstep camera interpolation chain
  // Smoothstep S(u) = u * u * (3 - 2 * u) guarantees 0 acceleration at keyframe boundaries
  let expr = `${keyframes[keyframes.length - 1].x.toFixed(3)}`;
  for (let i = keyframes.length - 2; i >= 0; i--) {
    const k0 = keyframes[i];
    const k1 = keyframes[i + 1];
    const duration = Math.max(0.25, k1.t - k0.t);
    const dt = duration.toFixed(2);
    const u = `((t-${k0.t.toFixed(2)})/${dt})`;
    const smoothU = `(${u}*${u}*(3-2*${u}))`;
    const lerp = `(${k0.x.toFixed(3)}+(${k1.x.toFixed(3)}-${k0.x.toFixed(3)})*${smoothU})`;
    expr = `if(lt(t\\,${k1.t.toFixed(2)})\\,${lerp}\\,${expr})`;
  }

  return `min(max(0\\,(${expr})*in_w-540)\\,in_w-1080)`;
}

/**
 * Output canvas + caption layout for each supported aspect ratio.
 * Captions (ASS PlayRes), emoji overlays and the teaser banner all use these.
 */
function getOutputGeometry(aspectRatio = '9:16', baseFontSize = 58) {
  if (aspectRatio === '16:9') {
    const fontSize = Math.round(baseFontSize * 0.9);
    return { width: 1920, height: 1080, fontSize, marginV: 70, emojiSize: 96, emojiY: 1080 - 70 - Math.round(fontSize * 1.3) - 96 - 12, bannerY: 200 };
  }
  if (aspectRatio === '1:1') {
    const fontSize = Math.round(baseFontSize * 0.85);
    return { width: 1080, height: 1080, fontSize, marginV: 100, emojiSize: 110, emojiY: 1080 - 100 - Math.round(fontSize * 1.3) - 110 - 12, bannerY: 200 };
  }
  return { width: 1080, height: 1920, fontSize: baseFontSize, marginV: 160, emojiSize: 140, emojiY: 1530, bannerY: 130 };
}

/**
 * Renders short vertical clip with auto-reframing, AI subject tracking, burned subtitles, and streamer SFX
 */
function renderShortClip({
  inputPath,
  outputPath,
  startTime,
  duration,
  aspectRatio = '9:16',
  reframeMode = 'smart_track', // 'smart_track' | 'split_stacked' | 'crop_center' | 'blur_fill'
  targetXPercent = 50.0,
  speakerLeftPercent = 30.0,
  speakerRightPercent = 70.0,
  trajectory = [],
  segments = [],
  subtitlesAssPath = null,
  sfxEvents = [],
  sfxVolume = 0.40,
  enablePunchInZoom = true,
  words = [],
  enableSpotlight = false,
  teaserHook = null,
  onProgress = null,
  sourceWidth = null,
  sourceHeight = null
}) {
  return new Promise((resolve, reject) => {
    const geo = getOutputGeometry(aspectRatio);
    const OW = geo.width;
    const OH = geo.height;
    const hasTeaser = teaserHook && teaserHook.active && typeof teaserHook.start === 'number';
    const teaserStart = hasTeaser ? Math.max(0, teaserHook.start) : 0;
    const teaserDur = hasTeaser ? Math.max(1.2, Math.min(4.5, (teaserHook.end || (teaserStart + 2.5)) - teaserStart)) : 0;

    const args = [
      '-y',
      '-ss', String(startTime),
      '-t', String(duration),
      '-i', inputPath
    ];

    if (hasTeaser) {
      args.push('-ss', String(teaserStart), '-t', String(teaserDur), '-i', inputPath);
    }

    const SFX_DIR = path.join(__dirname, '..', 'assets', 'sfx');

    // Build final SFX list: if hasTeaser, offset main SFX by teaserDur and add transition whoosh
    let effectiveSfx = (sfxEvents || []).map(e => ({
      ...e,
      time: hasTeaser ? e.time + teaserDur : e.time
    }));

    if (hasTeaser) {
      effectiveSfx.push({
        type: 'whoosh',
        time: Math.max(0, parseFloat((teaserDur - 0.12).toFixed(2))),
        label: '💨 Hook Transition Whoosh',
        trigger: 'Teaser Transition'
      });
    }

    const validSfx = effectiveSfx.filter(e => {
      const p = path.join(SFX_DIR, `${e.type}.wav`);
      return fs.existsSync(p);
    });

    // Add SFX inputs
    validSfx.forEach(e => {
      args.push('-i', path.join(SFX_DIR, `${e.type}.wav`));
    });

    const sfxBaseInputIdx = hasTeaser ? 2 : 1;
    let nextAvailableInputIdx = sfxBaseInputIdx + validSfx.length;

    // Collect active words with emojis and map unique emoji PNG paths
    const emojiMap = new Map(); // emojiStr -> inputIndex
    const validEmojiEvents = [];

    (words || []).filter(w => !w.deleted && w.emoji).forEach(w => {
      const png = getEmojiPngPath(w.emoji);
      if (png && fs.existsSync(png)) {
        if (!emojiMap.has(w.emoji)) {
          args.push('-i', png);
          emojiMap.set(w.emoji, nextAvailableInputIdx++);
        }
        validEmojiEvents.push({
          emoji: w.emoji,
          inputIdx: emojiMap.get(w.emoji),
          start: Math.max(0, (w.start - startTime) + (hasTeaser ? teaserDur : 0)),
          end: Math.max(0.1, (w.end - startTime) + (hasTeaser ? teaserDur : 0))
        });
      }
    });

    // Check if timeline slicing / jump cuts should be physically applied to main clip
    let baseVideoStream = '[0:v]';
    let baseAudioStream = '[0:a]';
    const preFilterParts = [];

    if (segments && segments.length > 1) {
      const relSegments = segments
        .map(s => ({
          start: Math.max(0, s.start - startTime),
          end: Math.min(duration, s.end - startTime)
        }))
        .filter(s => s.end > s.start + 0.1);

      if (relSegments.length > 1) {
        const selV = relSegments.map(s => `between(t\\,${s.start.toFixed(2)}\\,${s.end.toFixed(2)})`).join('+');
        const selA = relSegments.map(s => `between(t\\,${s.start.toFixed(2)}\\,${s.end.toFixed(2)})`).join('+');
        preFilterParts.push(`[0:v]select='${selV}',setpts=N/FRAME_RATE/TB[cutv]`);
        preFilterParts.push(`[0:a]aselect='${selA}',asetpts=N/SR/TB[cuta]`);
        baseVideoStream = '[cutv]';
        baseAudioStream = '[cuta]';
      }
    }

    let mainVideoFilter = '';
    const spotFilter = enableSpotlight ? ',vignette=angle=PI/3.5' : '';

    // Step A: Framing filter (reframe to the requested aspect ratio)
    const punchSfx = effectiveSfx.filter(e => e.type === 'vine_boom' || e.type === 'record_scratch');
    const hasPunchZoom = enablePunchInZoom && punchSfx.length > 0;
    const reframeTarget = hasPunchZoom ? '[reframe_v]' : (hasTeaser ? '[main_v]' : '[base_v]');

    if (aspectRatio === '9:16') {
      if (reframeMode === 'split_stacked') {
        const leftFrac = Math.max(0.12, Math.min(0.88, (speakerLeftPercent || 30.0) / 100)).toFixed(3);
        const rightFrac = Math.max(0.12, Math.min(0.88, (speakerRightPercent || 70.0) / 100)).toFixed(3);
        const cropTop = `min(max(0\\,in_w*${leftFrac}-540)\\,in_w-1080)`;
        const cropBot = `min(max(0\\,in_w*${rightFrac}-540)\\,in_w-1080)`;
        const divider = ',drawbox=x=0:y=958:w=1080:h=4:color=#6366f1:t=fill';

        mainVideoFilter = `${baseVideoStream}scale=-2:960,split=2[s1][s2];[s1]crop=1080:960:${cropTop}:0[top];[s2]crop=1080:960:${cropBot}:0[bot];[top][bot]vstack${divider}${spotFilter}${reframeTarget}`;
      } else if (reframeMode === 'smart_track') {
        const dynamicCropExp = generateDynamicCropExpression(trajectory, targetXPercent);
        mainVideoFilter = `${baseVideoStream}scale=-2:1920,crop=1080:1920:${dynamicCropExp}:0${spotFilter}${reframeTarget}`;
      } else if (reframeMode === 'crop_center') {
        const xFrac = Math.max(0.18, Math.min(0.82, (targetXPercent || 50.0) / 100)).toFixed(3);
        const cropExp = `min(max(0\\,in_w*${xFrac}-540)\\,in_w-1080)`;
        mainVideoFilter = `${baseVideoStream}scale=-2:1920,crop=1080:1920:${cropExp}:0${spotFilter}${reframeTarget}`;
      } else if (reframeMode === 'blur_fill') {
        mainVideoFilter = `${baseVideoStream}scale=270:480:force_original_aspect_ratio=increase,boxblur=8:2,scale=1080:1920[bg];${baseVideoStream}scale=1080:-1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${spotFilter}${reframeTarget}`;
      } else {
        mainVideoFilter = `${baseVideoStream}scale=1080:1920${spotFilter}${reframeTarget}`;
      }
    } else {
      // 16:9 landscape (1920x1080) and 1:1 square (1080x1080)
      const srcAR = (sourceWidth && sourceHeight) ? sourceWidth / sourceHeight : 16 / 9;
      const outAR = OW / OH;
      const xFrac = Math.max(0.0, Math.min(1.0, (targetXPercent || 50.0) / 100)).toFixed(3);
      // A portrait phone video cropped to landscape would lose most of the frame,
      // so mismatched sources get a blurred backdrop with the full video on top.
      const aspectMismatch = srcAR < outAR * 0.8;

      if (reframeMode === 'split_stacked' && !aspectMismatch) {
        const leftFrac = Math.max(0.12, Math.min(0.88, (speakerLeftPercent || 30.0) / 100)).toFixed(3);
        const rightFrac = Math.max(0.12, Math.min(0.88, (speakerRightPercent || 70.0) / 100)).toFixed(3);
        if (aspectRatio === '16:9') {
          // Two speakers side by side, each in a 960x1080 panel
          const half = OW / 2;
          const cropL = `min(max(0\\,in_w*${leftFrac}-${half / 2})\\,in_w-${half})`;
          const cropR = `min(max(0\\,in_w*${rightFrac}-${half / 2})\\,in_w-${half})`;
          mainVideoFilter = `${baseVideoStream}scale=-2:${OH},split=2[s1][s2];[s1]crop=${half}:${OH}:${cropL}:0[left];[s2]crop=${half}:${OH}:${cropR}:0[right];[left][right]hstack,drawbox=x=${half - 2}:y=0:w=4:h=${OH}:color=#6366f1:t=fill${spotFilter}${reframeTarget}`;
        } else {
          // Square: two stacked 1080x540 panels, each a 2:1 window around one speaker
          const halfH = OH / 2;
          const win = (frac) => `crop=in_w/2:in_w/4:min(max(0\\,in_w*${frac}-in_w/4)\\,in_w/2):(in_h-in_w/4)/2,scale=${OW}:${halfH},setsar=1`;
          mainVideoFilter = `${baseVideoStream}split=2[s1][s2];[s1]${win(leftFrac)}[top];[s2]${win(rightFrac)}[bot];[top][bot]vstack,drawbox=x=0:y=${halfH - 2}:w=${OW}:h=4:color=#6366f1:t=fill${spotFilter}${reframeTarget}`;
        }
      } else if (reframeMode === 'blur_fill' || aspectMismatch) {
        mainVideoFilter = `${baseVideoStream}split=2[bgsrc][fgsrc];[bgsrc]scale=${OW / 4}:${OH / 4}:force_original_aspect_ratio=increase,crop=${OW / 4}:${OH / 4},boxblur=8:2,scale=${OW}:${OH},setsar=1[bg];[fgsrc]scale=${OW}:${OH}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${spotFilter}${reframeTarget}`;
      } else if (reframeMode === 'smart_track' && aspectRatio === '1:1') {
        // Same tracking expression as 9:16 (it targets a 1080px-wide window)
        const cropExp = generateDynamicCropExpression(trajectory, targetXPercent);
        mainVideoFilter = `${baseVideoStream}scale=-2:${OH},crop=${OW}:${OH}:${cropExp}:0${spotFilter}${reframeTarget}`;
      } else {
        // Cover-crop to the canvas, panning horizontally toward the subject
        mainVideoFilter = `${baseVideoStream}scale=${OW}:${OH}:force_original_aspect_ratio=increase,crop=${OW}:${OH}:(in_w-${OW})*${xFrac}:(in_h-${OH})/2${spotFilter}${reframeTarget}`;
      }
    }

    const filterParts = [...preFilterParts, mainVideoFilter];

    // Step B: Apply Punch-in Zoom & Camera Shake if triggered by Vine Boom or Scratch
    if (hasPunchZoom) {
      const punchCond = punchSfx.map(e => {
        const s = Math.max(0, e.time);
        const dur = (e.type === 'vine_boom') ? 0.95 : 0.75;
        return `between(t\\,${s.toFixed(2)}\\,${(s + dur).toFixed(2)})`;
      }).join('+');

      const punchTarget = hasTeaser ? '[main_v]' : '[base_v]';
      const zoomW = Math.round(OW * 0.878 / 2) * 2;
      const zoomH = Math.round(OH * 0.877 / 2) * 2;
      filterParts.push(`[reframe_v]crop=w='if(${punchCond}\\,${zoomW}\\,${OW})':h='if(${punchCond}\\,${zoomH}\\,${OH})':x='(in_w-out_w)/2+if(${punchCond}\\,sin(t*45)*5\\,0)':y='(in_h-out_h)/2+if(${punchCond}\\,cos(t*40)*4\\,0)',scale=${OW}:${OH}${punchTarget}`);
    }

    let curVisualStream = hasTeaser ? '[catv]' : '[base_v]';
    let finalAudioStream = hasTeaser ? '[cata]' : baseAudioStream;

    // Step C: Process Teaser Hook if enabled
    if (hasTeaser) {
      const cleanBanner = (teaserHook.bannerText || 'WAIT FOR IT... ⚡').replace(/[:\']/g, '').trim() || 'WAIT FOR IT...';
      const by = geo.bannerY;
      const teaserFilter = `[1:v]scale=${OW}:${OH}:force_original_aspect_ratio=increase,crop=${OW}:${OH},setsar=1,drawbox=x=60:y=${by}:w=${OW - 120}:h=96:color=black@0.78:t=fill,drawbox=x=60:y=${by}:w=${OW - 120}:h=96:color=#6366f1:t=4,drawtext=text='${cleanBanner}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=${by + 28}[hook_v];[1:a]asetpts=PTS-STARTPTS[hook_a];[main_v]setsar=1[main_vs];[hook_v][hook_a][main_vs]${baseAudioStream}concat=n=2:v=1:a=1[catv][cata]`;
      filterParts.push(teaserFilter);
    }

    // Step D: Apply ASS Subtitles
    if (subtitlesAssPath && fs.existsSync(subtitlesAssPath)) {
      const escapedSubPath = subtitlesAssPath.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      filterParts.push(`${curVisualStream}ass='${escapedSubPath}'[sub_v]`);
      curVisualStream = '[sub_v]';
    }

    // Step E: Apply Full-Color Emoji Overlays floating centered above active caption keywords
    if (validEmojiEvents.length > 0) {
      const emojiY = geo.emojiY; // Positioned cleanly above the bottom caption for this aspect ratio
      validEmojiEvents.forEach((ev, idx) => {
        const nextLabel = (idx === validEmojiEvents.length - 1) ? '[outv]' : `[em_v${idx}]`;
        const emojiSrc = geo.emojiSize === 140 ? `[${ev.inputIdx}:v]` : `[em_s${idx}]`;
        if (geo.emojiSize !== 140) filterParts.push(`[${ev.inputIdx}:v]scale=${geo.emojiSize}:-1${emojiSrc}`);
        filterParts.push(`${curVisualStream}${emojiSrc}overlay=x=(W-w)/2:y=${emojiY}:enable='between(t\\,${ev.start.toFixed(2)}\\,${ev.end.toFixed(2)})'${nextLabel}`);
        curVisualStream = nextLabel;
      });
    }

    if (curVisualStream !== '[outv]') {
      filterParts.push(`${curVisualStream}copy[outv]`);
    }

    let audioMap = `${finalAudioStream}?`;

    // Step F: Mix SFX into audio stream with user volume scaling (default 40%)
    if (validSfx.length > 0) {
      const sfxFilterParts = [];
      const userSfxVol = (typeof sfxVolume === 'number') ? sfxVolume : 0.40;

      validSfx.forEach((e, idx) => {
        const inputIdx = sfxBaseInputIdx + idx;
        const delayMs = Math.max(0, Math.round(e.time * 1000));
        const baseVol = (e.type === 'vine_boom') ? 1.0 : 0.85;
        const vol = (baseVol * userSfxVol).toFixed(2);
        sfxFilterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${vol}[sfx${idx}]`);
      });

      const mixInputs = [`${finalAudioStream}`, ...validSfx.map((_, idx) => `[sfx${idx}]`)].join('');
      sfxFilterParts.push(`${mixInputs}amix=inputs=${validSfx.length + 1}:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11:linear=true[outa]`);
      
      filterParts.push(sfxFilterParts.join(';'));
      audioMap = '[outa]';
    } else {
      filterParts.push(`${finalAudioStream}loudnorm=I=-16:TP=-1.5:LRA=11:linear=true[outa]`);
      audioMap = '[outa]';
    }

    const fullFilter = filterParts.join(';');
    args.push('-filter_complex', fullFilter, '-map', '[outv]', '-map', audioMap);

    args.push(
      '-c:v', 'libx264',
      '-preset', process.env.RENDER_PRESET || 'superfast',
      '-threads', '0',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    );

    const proc = spawn(FFMPEG_BIN, args);
    let stderr = '';

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-8000);
      const m = chunk.toString().match(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (m && onProgress) {
        const t = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
        const total = duration + teaserDur;
        onProgress(Math.max(0, Math.min(99, Math.round((t / Math.max(total, 0.1)) * 100))));
      }
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg render failed with code ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

module.exports = {
  probeVideo,
  normalizeWebVideo,
  generateClipPreview,
  trackSubject,
  extractAudio,
  generateThumbnail,
  renderShortClip,
  getOutputGeometry
};
