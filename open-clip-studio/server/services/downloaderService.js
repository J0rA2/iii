const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const localBinYtDlp = path.join(__dirname, '..', 'bin', 'yt-dlp');
const defaultLocalYtDlp = path.join(process.env.HOME || '/home/parag', '.local/bin/yt-dlp');

function resolveYtDlpBin() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }
  if (fs.existsSync(localBinYtDlp)) {
    try { fs.chmodSync(localBinYtDlp, 0o755); } catch (e) {}
    return localBinYtDlp;
  }
  if (fs.existsSync(defaultLocalYtDlp)) {
    return defaultLocalYtDlp;
  }
  try {
    const whichOut = require('child_process').execSync('which yt-dlp 2>/dev/null').toString().trim();
    if (whichOut && fs.existsSync(whichOut)) return whichOut;
  } catch (e) {}
  return 'yt-dlp';
}

let ffmpegStaticPath = '';
try {
  ffmpegStaticPath = require('ffmpeg-static');
} catch (e) {}

/**
 * Downloads a video from URL (YouTube, Vimeo, etc.)
 */
function downloadUrl(url, outputDir, onProgress = null, customCookies = null) {
  return new Promise((resolve, reject) => {
    const fileId = `dl_${Date.now()}`;
    const outputTemplate = path.join(outputDir, `${fileId}.%(ext)s`);

    const isYouTube = /youtu\.?be/i.test(url);
    const cookieFile = path.join(__dirname, '../yt-cookies.txt');
    
    let cookieArgs = ['--no-cookies'];
    let tempCookiePath = null;

    if (customCookies && customCookies.trim()) {
      tempCookiePath = path.join('/tmp', `yt_cookies_${Date.now()}.txt`);
      try {
        fs.writeFileSync(tempCookiePath, customCookies.trim(), 'utf-8');
        cookieArgs = ['--cookies', tempCookiePath];
      } catch (e) {}
    } else if (process.env.YOUTUBE_COOKIES_BASE64) {
      tempCookiePath = path.join('/tmp', 'yt_cookies.txt');
      try {
        fs.writeFileSync(tempCookiePath, Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf-8'));
        cookieArgs = ['--cookies', tempCookiePath];
      } catch (e) {}
    } else if (process.env.YOUTUBE_COOKIES) {
      tempCookiePath = path.join('/tmp', 'yt_cookies.txt');
      try {
        fs.writeFileSync(tempCookiePath, process.env.YOUTUBE_COOKIES);
        cookieArgs = ['--cookies', tempCookiePath];
      } catch (e) {}
    } else if (fs.existsSync(cookieFile)) {
      cookieArgs = ['--cookies', cookieFile];
    }

    const hasCookies = cookieArgs[0] === '--cookies';
    // When no cookies are supplied, VisionOS player client bypasses datacenter IP bot detection
    const extractorArgs = (isYouTube && !hasCookies)
      ? ['--extractor-args', 'youtube:player_client=visionos']
      : [];

    const ffmpegArgs = (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath))
      ? ['--ffmpeg-location', ffmpegStaticPath]
      : [];

    const args = [
      '--format', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      '--merge-output-format', 'mp4',
      ...extractorArgs,
      ...ffmpegArgs,
      '--js-runtimes', 'node',
      '-N', '8',                        // 8 concurrent connection fragments for fast downloads
      '--buffer-size', '16M',           // 16MB download buffer
      '--http-chunk-size', '10M',       // 10MB chunk size
      '-o', outputTemplate,
      '--no-playlist',
      ...cookieArgs,
      url
    ];

    const ytdlpBin = resolveYtDlpBin();
    const proc = spawn(ytdlpBin, args, {
      env: {
        ...process.env,
        PATH: `${path.dirname(localBinYtDlp)}:${ffmpegStaticPath ? path.dirname(ffmpegStaticPath) : ''}:/usr/local/bin:/usr/bin:/bin:${process.env.HOME}/.local/bin:${process.env.PATH || ''}`
      }
    });

    let stderr = '';
    let stdout = '';

    proc.on('error', err => {
      console.error('yt-dlp execution error:', err);
      reject(new Error(`Failed to run yt-dlp (${ytdlpBin}): ${err.message}`));
    });

    proc.stdout.on('data', data => {
      const text = data.toString();
      stdout += text;
      const progressMatch = text.match(/(\d{1,3}\.\d)%/);
      if (progressMatch && onProgress) {
        onProgress(parseFloat(progressMatch[1]));
      }
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        // Find the resulting file
        const expectedFile = path.join(outputDir, `${fileId}.mp4`);
        if (fs.existsSync(expectedFile)) {
          resolve({ filePath: expectedFile, fileId });
        } else {
          // Look for any file with prefix
          const files = fs.readdirSync(outputDir).filter(f => f.startsWith(fileId));
          if (files.length > 0) {
            resolve({ filePath: path.join(outputDir, files[0]), fileId });
          } else {
            reject(new Error('Downloaded file not found on disk'));
          }
        }
      } else {
        reject(new Error(`yt-dlp failed (code ${code}): ${stderr || stdout}`));
      }
    });
  });
}

module.exports = {
  downloadUrl,
  resolveYtDlpBin
};

