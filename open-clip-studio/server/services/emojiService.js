const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EMOJI_DIR = path.join(__dirname, '..', 'assets', 'emojis');

// Ensure emojis directory exists
if (!fs.existsSync(EMOJI_DIR)) {
  fs.mkdirSync(EMOJI_DIR, { recursive: true });
}

/**
 * Converts emoji string into a standardized filename code point sequence
 */
function getEmojiCode(emojiStr) {
  if (!emojiStr) return null;
  const clean = emojiStr.trim();
  if (!clean) return null;
  return Array.from(clean).map(c => c.codePointAt(0).toString(16)).join('-');
}

/**
 * Returns the absolute path to a rendered RGBA PNG for the emoji.
 * If not already cached, renders it via Python PIL with Noto Color Emoji font.
 */
function getEmojiPngPath(emojiStr) {
  if (!emojiStr) return null;
  const code = getEmojiCode(emojiStr);
  if (!code) return null;

  const pngPath = path.join(EMOJI_DIR, `${code}.png`);
  if (fs.existsSync(pngPath)) {
    return pngPath;
  }

  try {
    const pyScript = `
import os
from PIL import Image, ImageDraw, ImageFont

font_path = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
try:
    font = ImageFont.truetype(font_path, 109)
    img = Image.new('RGBA', (140, 140), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((10, 10), '${emojiStr.trim()}', font=font, embedded_color=True)
    img.save('${pngPath}')
except Exception as e:
    pass
`;
    execSync(`python3 -c "${pyScript.replace(/\n/g, ' ')}"`, { timeout: 3000 });
    if (fs.existsSync(pngPath)) {
      return pngPath;
    }
  } catch (err) {
    console.warn(`[EmojiService] Failed to render emoji PNG for ${emojiStr}:`, err.message);
  }

  return null;
}

module.exports = {
  getEmojiCode,
  getEmojiPngPath
};
