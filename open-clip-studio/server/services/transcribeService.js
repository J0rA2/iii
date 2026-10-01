const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const https = require('https');
const { parseVttToWords, enrichWordWithEmoji } = require('./subtitleService');

const TRANSCRIBE_SCRIPT = path.join(__dirname, 'transcribe_local.py');

/**
 * Runs local Faster-Whisper on CPU with INT8 quantization
 */
function runLocalWhisper(audioPath, options = {}) {
  const { maxDuration = 600, scanMode = 'lightning', language = 'en', model = 'base.en', onProgress = null } = options;

  return new Promise((resolve, reject) => {
    let effectiveAudioPath = audioPath;
    let tempTrimmedAudio = null;

    try {
      // If scanMode is lightning (default for fast results on long videos)
      if (scanMode === 'lightning' && maxDuration) {
        tempTrimmedAudio = path.join(path.dirname(audioPath), `trimmed_${Date.now()}.wav`);
        // Fast trim with FFmpeg in 0.05 seconds
        execSync(`ffmpeg -y -i "${audioPath}" -ss 0 -t ${maxDuration} -c copy "${tempTrimmedAudio}" 2>/dev/null || ffmpeg -y -i "${audioPath}" -ss 0 -t ${maxDuration} "${tempTrimmedAudio}" 2>/dev/null`);
        if (fs.existsSync(tempTrimmedAudio) && fs.statSync(tempTrimmedAudio).size > 1000) {
          effectiveAudioPath = tempTrimmedAudio;
          console.log(`⚡ Lightning Mode active: Pre-trimmed audio to first ${Math.round(maxDuration / 60)} minutes for fast transcription.`);
        }
      }
    } catch (trimErr) {
      console.warn('Trim failed, using full audio:', trimErr.message);
    }

    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const progressFile = `${audioPath}.progress.json`;
    const args = [
      TRANSCRIBE_SCRIPT,
      effectiveAudioPath,
      '--model', model || 'base.en',
      '--language', language || 'en',
      '--progress-file', progressFile
    ];

    const proc = spawn(pythonBin, args);

    // Relay Whisper's per-segment progress to the job status
    const progressTimer = onProgress ? setInterval(() => {
      try {
        const p = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        if (typeof p.percent === 'number') onProgress(p.percent);
      } catch (e) {}
    }, 1500) : null;

    proc.on('error', err => {
      if (progressTimer) clearInterval(progressTimer);
      reject(new Error(`Failed to start ${pythonBin}: ${err.message}`));
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());

    proc.on('close', (code, signal) => {
      if (progressTimer) clearInterval(progressTimer);
      try { fs.unlinkSync(progressFile); } catch (e) {}
      // Clean up temporary trimmed audio
      if (tempTrimmedAudio && fs.existsSync(tempTrimmedAudio)) {
        try { fs.unlinkSync(tempTrimmedAudio); } catch (e) {}
      }

      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        return reject(new Error('Transcription was cancelled.'));
      }

      // Find JSON line in stdout
      const lines = stdout.trim().split('\n');
      let result = null;

      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.success !== undefined || parsed.words !== undefined) {
            result = parsed;
            break;
          }
        } catch (e) {
          // not json
        }
      }

      if (result && result.words && result.words.length > 0) {
        const enrichedWords = result.words.map(w => ({
          word: w.word,
          start: parseFloat(w.start.toFixed(3)),
          end: parseFloat(w.end.toFixed(3)),
          emoji: enrichWordWithEmoji(w.word)
        }));

        resolve({
          text: result.text || enrichedWords.map(w => w.word).join(' '),
          words: enrichedWords,
          language: result.language || 'en'
        });
      } else if (result && result.words && result.words.length === 0) {
        reject(new Error('No clear speech was detected in this video. Please ensure the video has audible speaking.'));
      } else {
        reject(new Error(`Whisper transcription failed (exit code ${code}): ${stderr || stdout}`));
      }
    });
  });
}

/**
 * Transcribes audio using Groq Whisper API (Free Cloud Tier: ~5 seconds for full 80 min)
 */
async function transcribeWithGroq(audioPath, apiKey) {
  return new Promise((resolve, reject) => {
    // If audio is huge (> 25MB), compress to 32kbps mono MP3 for Groq in 1 second
    let sendPath = audioPath;
    let tempMp3 = null;

    if (fs.statSync(audioPath).size > 24 * 1024 * 1024) {
      tempMp3 = path.join(path.dirname(audioPath), `groq_send_${Date.now()}.mp3`);
      try {
        execSync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -b:a 32k "${tempMp3}" 2>/dev/null`);
        if (fs.existsSync(tempMp3)) sendPath = tempMp3;
      } catch (e) {
        console.warn('Groq mp3 compression failed, using original wav');
      }
    }

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const audioData = fs.readFileSync(sendPath);
    const fileName = path.basename(sendPath);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`;

    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`;

    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nword\r\n`;

    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    body += `Content-Type: ${fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'}\r\n\r\n`;

    const payloadHeader = Buffer.from(body, 'utf-8');
    const payloadFooter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const fullPayload = Buffer.concat([payloadHeader, audioData, payloadFooter]);

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullPayload.length
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (tempMp3 && fs.existsSync(tempMp3)) {
          try { fs.unlinkSync(tempMp3); } catch (e) {}
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.words && parsed.words.length > 0) {
            const enriched = parsed.words.map(w => ({
              word: w.word.trim(),
              start: parseFloat(w.start.toFixed(3)),
              end: parseFloat(w.end.toFixed(3)),
              emoji: enrichWordWithEmoji(w.word)
            }));
            resolve({
              text: parsed.text,
              words: enriched
            });
          } else {
            reject(new Error(parsed.error?.message || 'Invalid Groq response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      if (tempMp3 && fs.existsSync(tempMp3)) {
        try { fs.unlinkSync(tempMp3); } catch (e) {}
      }
      reject(err);
    });

    req.write(fullPayload);
    req.end();
  });
}

/**
 * Master transcribe function:
 * 1. If sample clip with existing VTT, loads that for instant zero-latency test
 * 2. If user has Groq API key, uses cloud Whisper (~5 seconds for full 80 min)
 * 3. Otherwise, runs local Faster-Whisper on CPU with Lightning Mode (first 10 min)
 */
async function transcribeAudio(audioPath, options = {}) {
  const { groqApiKey, existingVttPath, scanMode = 'lightning' } = options;

  // 1. If explicit pre-computed VTT provided (for 1-click built-in demo)
  if (existingVttPath && fs.existsSync(existingVttPath)) {
    const vttContent = fs.readFileSync(existingVttPath, 'utf8');
    const words = parseVttToWords(vttContent);
    const fullText = words.map(w => w.word).join(' ');
    return { text: fullText, words };
  }

  // 2. If Groq API key is configured, use blazing-fast Groq Whisper (~5s for full 80 min!)
  const apiKey = groqApiKey || process.env.GROQ_API_KEY;
  if (apiKey) {
    try {
      console.log('⚡ Transcribing via Groq Whisper Large-v3 (Turbo Cloud Mode)...');
      return await transcribeWithGroq(audioPath, apiKey);
    } catch (err) {
      console.warn('Groq API failed, falling back to local Faster-Whisper:', err.message);
    }
  }

  // Check disk cache first for instant reloads
  const cachePath = audioPath.replace(/\.wav$/, '_transcript.json');
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached && cached.words && cached.words.length > 0) {
        // If cached transcript is non-English when user requested English or default, bypass and re-transcribe cleanly!
        const reqLang = options.language || 'en';
        if (cached.language && cached.language !== reqLang && reqLang === 'en') {
          console.log(`⚠️ Invalidating foreign hallucination cache (${cached.language}) for ${path.basename(audioPath)}`);
        } else {
          console.log(`⚡ Instant Cache Hit: Loaded cached transcription for ${path.basename(audioPath)}`);
          return cached;
        }
      }
    } catch (e) {}
  }

  // 3. Run local Faster-Whisper on CPU
  const whisperModel = options.model || process.env.WHISPER_MODEL || 'base.en';
  console.log(`Transcribing ${audioPath} with local Faster-Whisper (mode: ${scanMode}, model: ${whisperModel})...`);
  const result = await runLocalWhisper(audioPath, {
    scanMode,
    onProgress: options.onProgress,
    model: whisperModel,
    language: options.language || 'en',
    maxDuration: scanMode === 'lightning' ? 600 : null // 10 minutes for lightning mode
  });

  // Save to cache for instant future loads
  try {
    fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
  } catch (e) {}

  return result;
}

module.exports = {
  transcribeAudio,
  runLocalWhisper
};
