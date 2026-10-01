const fs = require('fs');
const path = require('path');

// Built-in emoji dictionary for viral keyword triggers
const EMOJI_MAP = {
  money: '💸',
  dollars: '💰',
  startup: '🚀',
  ai: '🤖',
  systems: '⚙️',
  secret: '🤫',
  people: '👥',
  false: '❌',
  success: '🏆',
  successful: '🏆',
  leverage: '🔥',
  retention: '📈',
  sleep: '😴',
  hours: '⏰',
  truth: '💡',
  growth: '📈',
  fast: '⚡',
  stop: '🛑',
  million: '💎',
  crazy: '🤯',
  fire: '🔥',
  brain: '🧠',
  warning: '⚠️',
  future: '🔮',
  power: '⚡'
};

function enrichWordWithEmoji(word) {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  return EMOJI_MAP[clean] || null;
}

/**
 * Parses WebVTT file into word/phrase segments
 */
function parseVttToWords(vttContent) {
  const lines = vttContent.split('\n');
  const words = [];
  let currentStart = 0;
  let currentEnd = 0;

  const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(timeRegex);
    if (match) {
      const h1 = parseInt(match[1]), m1 = parseInt(match[2]), s1 = parseInt(match[3]), ms1 = parseInt(match[4]);
      const h2 = parseInt(match[5]), m2 = parseInt(match[6]), s2 = parseInt(match[7]), ms2 = parseInt(match[8]);
      currentStart = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;
      currentEnd = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;
    } else if (line && !line.match(/^\d+$/) && !line.startsWith('WEBVTT') && currentEnd > currentStart) {
      // Split phrase into individual words with interpolated timings
      const rawWords = line.split(/\s+/).filter(Boolean);
      if (rawWords.length > 0) {
        const duration = currentEnd - currentStart;
        const wordDuration = duration / rawWords.length;
        rawWords.forEach((w, idx) => {
          const wStart = currentStart + idx * wordDuration;
          const wEnd = currentStart + (idx + 1) * wordDuration;
          const emoji = enrichWordWithEmoji(w);
          words.push({
            word: w,
            start: parseFloat(wStart.toFixed(3)),
            end: parseFloat(wEnd.toFixed(3)),
            emoji: emoji
          });
        });
      }
    }
  }
  return words;
}

/**
 * Generates an ASS (Advanced SubStation Alpha) subtitle file formatted for kinetic short captions
 * @param {Array} words - Array of { word, start, end, emoji }
 * @param {Object} options - style, fontSize, highlightColor, position
 */
function generateAssSubtitles(words, options = {}) {
  const {
    style = 'hormozi',
    fontSize = 58,
    highlightColor = '&H0022FFFF&', // BGR format in ASS: Neon Yellow
    primaryColor = '&H00FFFFFF&',   // White
    outlineColor = '&H00000000&',   // Black outline
    outline = 6,
    alignment = 2,                  // 2 = bottom center, 5 = middle center
    marginV = 160,                  // Pixels from bottom for vertical 9:16
    videoWidth = 1080,
    videoHeight = 1920,
    hookBannerText = null,
    clipDuration = 60
  } = options;

  let fontName = 'Montserrat Black';
  if (style === 'mrbeast') {
    fontName = 'Impact';
  } else if (style === 'clean') {
    fontName = 'Montserrat SemiBold';
  }

  // Ensure highlightColor is properly formatted for ASS BGR: Neon Yellow (#FFE600 -> &H0000E6FF&)
  const assHighlight = highlightColor.startsWith('&H') ? highlightColor : '&H0000E6FF&';
  const strokeWidth = style === 'clean' ? 4 : 8;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${assHighlight},${outlineColor},&H80000000,-1,0,0,0,100,100,1,0,1,${strokeWidth},3,${alignment},40,40,${marginV},1
Style: TopHook,Montserrat ExtraBold,44,&H00FFFFFF&,&H0000E6FF&,&H00000000,&HCC0A0F1D,-1,0,0,0,100,100,2,0,3,14,0,8,60,60,110,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Smart Natural Phrase Chunking: breaks on sentence punctuation, speech pauses >0.35s, or max words
  const maxChunkWords = style === 'hormozi' ? 3 : 4;
  const chunks = [];
  let currentGroup = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentGroup.push(w);

    const raw = (w.word || '').trim();
    const hasTerminal = /[.?!]$/.test(raw);
    const hasComma = /[,;:]$/.test(raw);
    const nextW = words[i + 1];
    const pauseAfter = nextW ? (nextW.start - w.end) : 0;

    const shouldBreak =
      hasTerminal ||
      pauseAfter > 0.35 ||
      currentGroup.length >= maxChunkWords ||
      (hasComma && currentGroup.length >= 2);

    if (shouldBreak || i === words.length - 1) {
      chunks.push(currentGroup);
      currentGroup = [];
    }
  }

  const events = [];

  function formatAssTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  chunks.forEach(group => {
    const chunkStart = group[0].start;
    const chunkEnd = group[group.length - 1].end;

    // For each word in this chunk, create a sub-event highlighting the active word
    group.forEach(activeWord => {
      const wStart = Math.max(chunkStart, activeWord.start);
      const wEnd = Math.min(chunkEnd, activeWord.end);

      if (wEnd <= wStart) return;

      const formattedWords = group.map(w => {
        const displayText = style === 'hormozi' ? w.word.toUpperCase() : w.word;
        if (w === activeWord) {
          // Highlight active word in neon yellow/green with zoom pop
          return `{\\c${assHighlight}\\fscx112\\fscy112}${displayText}{\\r}`;
        } else {
          return `{\\c${primaryColor}\\fscx100\\fscy100}${displayText}`;
        }
      }).join(' ');

      events.push(`Dialogue: 0,${formatAssTime(wStart)},${formatAssTime(wEnd)},Default,,0,0,0,,${formattedWords}`);
    });
  });

  // If Opus Top Hook Banner is provided, add persistent dialogue event at top
  if (hookBannerText && hookBannerText.trim()) {
    // Strip emojis that lack TTF font glyphs in libass to ensure crisp typography
    const cleanBanner = hookBannerText.trim().toUpperCase()
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/'/g, '')
      .trim();
    const endSec = Math.max(5, clipDuration || 60);
    events.unshift(`Dialogue: 1,0:00:00.00,${formatAssTime(endSec)},TopHook,,0,0,0,,  ${cleanBanner}  `);
  }

  return header + events.join('\n') + '\n';
}

module.exports = {
  parseVttToWords,
  generateAssSubtitles,
  enrichWordWithEmoji,
  EMOJI_MAP
};
