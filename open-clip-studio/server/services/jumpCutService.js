/**
 * Smart Jump-Cut & Streamer Dynamic Pacing Engine
 * Detects dead air (>0.85s gaps), preserves speech cadence with natural padding,
 * and handles transcript-directed word cuts without stutter.
 */

/**
 * Calculates smooth speech segments from word timestamps, eliminating awkward dead air.
 * @param {Array} words - Array of word objects { word, start, end, deleted }
 * @param {number} clipStart - Starting second of the clip in original video
 * @param {number} clipEnd - Ending second of the clip in original video
 * @param {number|string} silenceThresholdOrMode - Pause duration in seconds (or 'natural'|'balanced'|'snappy')
 * @param {Array} deletedIndices - Optional array of word indices deleted by user
 */
function calculateJumpCuts(words = [], clipStart = 0, clipEnd = 30, silenceThresholdOrMode = 0.85, deletedIndices = []) {
  const originalDuration = Math.max(0.5, clipEnd - clipStart);

  // Configure pacing profile
  let silenceThreshold = 0.85;
  let preRoll = 0.18;  // 180ms before word
  let postRoll = 0.20; // 200ms after word
  let minSegmentDur = 0.80; // 800ms minimum speech segment to avoid choppy stutter

  if (typeof silenceThresholdOrMode === 'string') {
    if (silenceThresholdOrMode === 'natural') {
      silenceThreshold = 1.20;
      preRoll = 0.24;
      postRoll = 0.26;
      minSegmentDur = 1.0;
    } else if (silenceThresholdOrMode === 'snappy') {
      silenceThreshold = 0.65;
      preRoll = 0.14;
      postRoll = 0.16;
      minSegmentDur = 0.6;
    } else { // balanced
      silenceThreshold = 0.85;
      preRoll = 0.18;
      postRoll = 0.20;
      minSegmentDur = 0.8;
    }
  } else if (typeof silenceThresholdOrMode === 'number') {
    silenceThreshold = Math.max(0.4, silenceThresholdOrMode);
  }

  const deletedSet = new Set(deletedIndices || []);

  if (!words || words.length === 0) {
    return {
      hasJumpCuts: false,
      originalDuration: parseFloat(originalDuration.toFixed(2)),
      condensedDuration: parseFloat(originalDuration.toFixed(2)),
      timeSaved: 0,
      segments: [{ start: clipStart, end: clipEnd, duration: parseFloat(originalDuration.toFixed(2)) }],
      sfxEvents: []
    };
  }

  // Filter valid words within clip boundaries that are not marked deleted
  const activeWords = [];
  words.forEach((w, idx) => {
    const isDeleted = deletedSet.has(idx) || w.deleted === true;
    if (!isDeleted && w.end >= clipStart && w.start <= clipEnd) {
      activeWords.push({ ...w, origIndex: idx });
    }
  });

  if (activeWords.length === 0) {
    return {
      hasJumpCuts: false,
      originalDuration: parseFloat(originalDuration.toFixed(2)),
      condensedDuration: parseFloat(originalDuration.toFixed(2)),
      timeSaved: 0,
      segments: [{ start: clipStart, end: clipEnd, duration: parseFloat(originalDuration.toFixed(2)) }],
      sfxEvents: []
    };
  }

  const rawSegments = [];
  let segStart = Math.max(clipStart, activeWords[0].start - preRoll);
  let prevWordEnd = activeWords[0].end;

  for (let i = 1; i < activeWords.length; i++) {
    const currentWord = activeWords[i];
    const gap = currentWord.start - prevWordEnd;

    // Check if the previous word and current word have a natural pause or deleted gap
    if (gap > silenceThreshold || (currentWord.origIndex - activeWords[i - 1].origIndex > 1)) {
      const segEnd = Math.min(clipEnd, prevWordEnd + postRoll);
      if (segEnd > segStart + 0.15) {
        rawSegments.push({
          start: parseFloat(segStart.toFixed(2)),
          end: parseFloat(segEnd.toFixed(2)),
          duration: parseFloat((segEnd - segStart).toFixed(2))
        });
      }
      segStart = Math.max(clipStart, currentWord.start - preRoll);
    }
    prevWordEnd = currentWord.end;
  }

  // Final segment
  const finalEnd = Math.min(clipEnd, prevWordEnd + postRoll);
  if (finalEnd > segStart + 0.15) {
    rawSegments.push({
      start: parseFloat(segStart.toFixed(2)),
      end: parseFloat(finalEnd.toFixed(2)),
      duration: parseFloat((finalEnd - segStart).toFixed(2))
    });
  }

  // Smoothing step: Merge consecutive segments if the gap between them is tiny (< 0.35s)
  // or if keeping them separated would create an unnatural, choppy micro-jump
  const mergedSegments = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    if (mergedSegments.length === 0) {
      mergedSegments.push(seg);
    } else {
      const prevSeg = mergedSegments[mergedSegments.length - 1];
      const gapBetween = seg.start - prevSeg.end;
      // If gap is smaller than silence threshold, do NOT cut; merge for smooth natural audio!
      if (gapBetween < silenceThreshold) {
        prevSeg.end = seg.end;
        prevSeg.duration = parseFloat((prevSeg.end - prevSeg.start).toFixed(2));
      } else {
        mergedSegments.push(seg);
      }
    }
  }

  // If after smoothing there's only 1 segment covering practically the whole clip, keep full range
  const hasJumpCuts = mergedSegments.length > 1;
  const segments = hasJumpCuts ? mergedSegments : [{
    start: clipStart,
    end: clipEnd,
    duration: parseFloat(originalDuration.toFixed(2))
  }];

  const condensedDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const timeSaved = Math.max(0, originalDuration - condensedDuration);

  // Generate Streamer Meme SFX Cues (Vine Boom, Bruh, Ding, Whoosh, Record Scratch, Huh, Wow)
  const sfxEvents = [];
  const minInterval = 2.2; // Minimum seconds between consecutive SFX
  const minVineBoomInterval = 5.0; // Strict spacing between heavy bass drops

  // 1. Whoosh transition on jump cuts (at most 1 per clip)
  let accumWhoosh = 0;
  let whooshCount = 0;
  for (let i = 1; i < segments.length; i++) {
    accumWhoosh += segments[i - 1].duration;
    const gap = segments[i].start - segments[i - 1].end;
    if (gap > 0.45 && whooshCount < 1) {
      sfxEvents.push({
        type: 'whoosh',
        time: parseFloat(accumWhoosh.toFixed(2)),
        label: '💨 Fast Whoosh',
        trigger: 'Jump-Cut Transition'
      });
      whooshCount++;
    }
  }

  // 2. EXPANDED keyword detection — covers casual conversations, not just drama
  const vineBoomKeywords = new Set([
    'insane', 'unbelievable', 'impossible', 'shocking', 'destroyed', 'exposed',
    'guilty', 'arrested', 'catastrophe', 'disaster', 'scam', 'conspiracy',
    'million', 'billion', 'died', 'killed', 'disqualified', 'banned',
    // Conversational emphasis that deserves bass drop
    'absolutely', 'literally', 'exactly', 'completely', 'actually', 'basically',
    'ridiculous', 'incredible', 'massive', 'insanely', 'genuinely', 'obsessed',
    'addicted', 'toxic', 'delusional', 'psycho', 'legend', 'goated', 'goat'
  ]);

  const bruhKeywords = new Set([
    'bruh', 'man', 'cmon', 'seriously', 'stupid', 'dumb', 'foolish', 'nah', 'cringe',
    'joke', 'trash', 'horrible', 'sike', 'dude', 'tired', 'acting', 'weird', 'clown',
    // Everyday conversational reactions
    'really', 'bro', 'dawg', 'homie', 'whatever', 'anyways', 'obviously', 'clearly',
    'honestly', 'lowkey', 'highkey', 'deadass', 'straight', 'cap', 'nocap', 'sus',
    'ayo', 'yikes', 'sheesh', 'broo', 'wack', 'wild', 'crazy', 'mad', 'sick',
    'lame', 'basic', 'mid', 'ratio', 'bet', 'facts', 'fr', 'ong', 'istg',
    'imagine', 'embarrassing', 'awkward', 'nasty', 'gross', 'wrong', 'nope', 'nah'
  ]);

  const dingKeywords = new Set([
    'key', 'solution', 'rule', 'learn', 'free', 'win', 'smart', 'best', 'success',
    'answer', 'remember', 'fact', 'first', 'tip', 'proven', 'secret', 'number',
    // Everyday insight / emphasis words
    'important', 'essential', 'critical', 'must', 'need', 'should', 'always', 'never',
    'perfect', 'great', 'amazing', 'beautiful', 'favorite', 'recommend', 'better',
    'money', 'price', 'expensive', 'cheap', 'worth', 'buy', 'sell', 'cost',
    'recipe', 'fresh', 'organic', 'healthy', 'delicious', 'quality', 'premium',
    'special', 'rare', 'unique', 'exclusive', 'limited', 'deal', 'discount',
    'point', 'reason', 'because', 'specifically', 'difference', 'advantage', 'benefit'
  ]);

  const scratchKeywords = new Set([
    'wait', 'hold', 'what', 'huh', 'pause', 'hang',
    // Surprise / confusion reactions
    'excuse', 'sorry', 'whoa', 'woah', 'wow', 'oh', 'ooh', 'umm', 'hmm',
    'wait', 'sec', 'second', 'minute', 'actually', 'no', 'stop', 'hold'
  ]);

  const maxVineBooms = condensedDuration > 45 ? 2 : 1;

  // Scan active words for SFX triggers
  for (let i = 0; i < activeWords.length; i++) {
    const w = activeWords[i];
    const clean = (w.word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const relTime = parseFloat((w.start - clipStart).toFixed(2));

    if (relTime < 0.8 || relTime > condensedDuration - 0.8) continue;

    // Check minimum distance from any already scheduled SFX
    const hasRecent = sfxEvents.some(e => Math.abs(e.time - relTime) < minInterval);
    if (hasRecent) continue;

    const existingVineBooms = sfxEvents.filter(e => e.type === 'vine_boom');
    const hasRecentVineBoom = existingVineBooms.some(e => Math.abs(e.time - relTime) < minVineBoomInterval);

    // Check Bruh for deadpan / facepalm moments
    if (bruhKeywords.has(clean) && sfxEvents.filter(e => e.type === 'bruh').length < 2) {
      sfxEvents.push({
        type: 'bruh',
        time: relTime,
        label: `🗿 Bruh: "${w.word}"`,
        trigger: `Deadpan: "${w.word}"`
      });
    }
    // Check Vine Boom strictly for genuine shock words with cooldown and cap
    else if (vineBoomKeywords.has(clean) && existingVineBooms.length < maxVineBooms && !hasRecentVineBoom) {
      sfxEvents.push({
        type: 'vine_boom',
        time: relTime,
        label: `💥 Vine Boom: "${w.word}"`,
        trigger: `Punchline: "${w.word}"`
      });
    }
    // Check Ding for key insights
    else if (dingKeywords.has(clean) && sfxEvents.filter(e => e.type === 'ding').length < 2) {
      sfxEvents.push({
        type: 'ding',
        time: relTime,
        label: `🔔 Insight: "${w.word}"`,
        trigger: `Insight: "${w.word}"`
      });
    }
    // Check Record Scratch for sudden pauses
    else if (scratchKeywords.has(clean) && sfxEvents.filter(e => e.type === 'record_scratch').length < 1) {
      sfxEvents.push({
        type: 'record_scratch',
        time: relTime,
        label: `💿 Scratch: "${w.word}"`,
        trigger: `Sudden Pause: "${w.word}"`
      });
    }
  }

  // 3. PROSODIC SFX Triggers — detect emphasis via speech rhythm, not just keywords
  if (sfxEvents.length < 3 && activeWords.length > 6) {
    for (let i = 2; i < activeWords.length - 2; i++) {
      if (sfxEvents.length >= 4) break;
      const w = activeWords[i];
      const relTime = parseFloat((w.start - clipStart).toFixed(2));
      if (relTime < 1.0 || relTime > condensedDuration - 1.0) continue;
      const hasRecent = sfxEvents.some(e => Math.abs(e.time - relTime) < minInterval);
      if (hasRecent) continue;

      // Detect dramatic pauses: rapid speech → long pause → speech resumes
      const pauseAfter = (i < activeWords.length - 1) ? (activeWords[i + 1].start - w.end) : 0;
      const pauseBefore = (i > 0) ? (w.start - activeWords[i - 1].end) : 0;
      const wordDur = w.end - w.start;

      // Pattern A: Word followed by dramatic pause (>0.6s) after fast speech
      if (pauseAfter > 0.6 && pauseBefore < 0.25 && wordDur < 0.5) {
        sfxEvents.push({
          type: 'vine_boom',
          time: relTime,
          label: `💥 Dramatic Pause: "${w.word}"`,
          trigger: `Speech pause after "${w.word}"`
        });
        continue;
      }

      // Pattern B: Emphatic stressed word (longer than neighbors + followed by brief pause)
      const prevDur = (i > 0) ? (activeWords[i - 1].end - activeWords[i - 1].start) : 0.3;
      const nextDur = (i < activeWords.length - 1) ? (activeWords[i + 1].end - activeWords[i + 1].start) : 0.3;
      const cleanWordText = (w.word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (wordDur > 1.3 * prevDur && wordDur > 1.3 * nextDur && pauseAfter > 0.3 && cleanWordText.length > 3) {
        sfxEvents.push({
          type: 'ding',
          time: relTime,
          label: `🔔 Emphasis: "${w.word}"`,
          trigger: `Stressed word: "${w.word}"`
        });
      }
    }
  }

  // 4. Guarantee at least 2 SFX per clip if it has enough speech
  if (sfxEvents.length < 2 && activeWords.length > 8) {
    // Place a ding at ~30% and a bruh at ~70% through the clip
    const positions = [0.30, 0.70];
    const types = ['ding', 'bruh'];
    const labels = ['🔔 Accent', '🗿 Moment'];
    for (let p = 0; p < positions.length && sfxEvents.length < 3; p++) {
      const targetIdx = Math.floor(activeWords.length * positions[p]);
      const targetWord = activeWords[targetIdx];
      if (!targetWord) continue;
      const relTime = parseFloat((targetWord.start - clipStart).toFixed(2));
      if (relTime > 1.0 && relTime < condensedDuration - 1.0) {
        const hasRecent = sfxEvents.some(e => Math.abs(e.time - relTime) < minInterval);
        if (!hasRecent) {
          sfxEvents.push({
            type: types[p],
            time: relTime,
            label: `${labels[p]}: "${targetWord.word}"`,
            trigger: `Auto-accent: "${targetWord.word}"`
          });
        }
      }
    }
  }

  return {
    hasJumpCuts,
    originalDuration: parseFloat(originalDuration.toFixed(2)),
    condensedDuration: parseFloat(condensedDuration.toFixed(2)),
    timeSaved: parseFloat(timeSaved.toFixed(2)),
    segments,
    sfxEvents,
    pacingMode: typeof silenceThresholdOrMode === 'string' ? silenceThresholdOrMode : 'balanced'
  };
}

module.exports = {
  calculateJumpCuts
};
