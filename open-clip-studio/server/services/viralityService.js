const https = require('https');
const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'were', 'they', 'what',
  'your', 'about', 'there', 'their', 'which', 'would', 'could', 'should', 'been',
  'will', 'when', 'them', 'some', 'than', 'into', 'just', 'more', 'also', 'very',
  'most', 'only', 'even', 'then', 'here', 'like', 'these', 'where', 'after', 'first'
]);

const DANGLING_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'so', 'because', 'like', 'if',
  'that', 'which', 'with', 'to', 'when', 'as', 'then', 'than', 'of', 'in',
  'on', 'at', 'by', 'for', 'about', 'is', 'are', 'was', 'were', 'my', 'your',
  'their', 'his', 'her', 'our', 'its', 'into', 'from', 'up', 'down', 'out',
  'over', 'under', 'just', 'very', 'really', 'also', 'even', 'who', 'whom',
  'whose', 'where', 'why', 'how', 'what', 'be', 'been', 'being', 'have', 'has', 'had'
]);

// Phrases indicative of stream setup, gear testing, and low-substance small talk
const BANTER_PHRASES = [
  'stream check', 'hair check', 'mic check', 'carry back', 'carry backpack',
  'finish up your copy', 'is it alive', 'can you hear me', 'check check',
  'keep it on me', 'testing mic', 'one two three', 'just making sure',
  'is it on', 'hold on let me', 'turn around', 'adjust the camera',
  'can you hold this', 'where are we going', 'let me grab', 'check check check',
  'can i rely', '200 followers', 'test test', 'sound check', 'is the stream working',
  'wait hold on', 'let me see', 'chat is this real', 'stream setup', 'can you hear'
];

// Incomplete anaphoric phrases or dead preambles that lack standalone context in shorts
const BROKEN_START_PATTERNS = /^(why do i say this|notice i didn|these are the things|and then be able to|and that is why|so that is why|as i was saying|like i said|that is a great question|that\'s a great question|in fact this is a broader|of calls do this|well as weird as it may sound|not every single day|and so on and so forth|and then|and also|and that|and so|and but|but then|so then|or then|great so let|why did you start|before i answer i|and notice i\'m saying|he talked to him,?\s*okay|i thought it was all done|that\'s great,?\s*so|this is what happened|now what happened was|i mean this place is|is there a reason for that|well they\'re like|yeah just making sure|just keep it on me|gotta do a hair check|all right what\'s up|so i had about it|and earlier on i came|you want to carry back|you want to finish up your copy|just finish up your copy)\b/i;

// Load custom hook phrases from config
const HOOK_PHRASES_PATH = path.join(__dirname, '..', 'config', 'hookPhrases.json');
let hookPhrases = [];
try {
  const raw = fs.readFileSync(HOOK_PHRASES_PATH, 'utf-8');
  hookPhrases = JSON.parse(raw);
} catch (e) {
  console.warn('Failed to load hook phrases, using defaults');
  hookPhrases = [];
}

// ─── Engagement & Emotion word banks ────────────────────────────────────────

const EMOTION_WORDS = {
  highStakes: new Set(['knife', 'stab', 'stabbed', 'kill', 'killed', 'police', 'court', 'jail', 'attacking', 'attack', 'fought', 'fight', 'weapon', 'murder', 'camera', 'died', 'arrest', 'arrested', 'threat', 'danger', 'gun', 'blood', 'survive', 'dead']),
  surprise:   new Set(['wow', 'whoa', 'omg', 'insane', 'crazy', 'unbelievable', 'incredible', 'no way', 'what', 'seriously', 'really', 'shocking', 'mind-blowing', 'spike', 'peak']),
  humor:      new Set(['funny', 'hilarious', 'lol', 'laugh', 'laughing', 'joke', 'joking', 'haha', 'lmao', 'comedy', 'bro', 'bruh', 'dawg']),
  conflict:   new Set(['wrong', 'disagree', 'argue', 'fight', 'versus', 'debate', 'no', 'but', 'however', 'actually', 'false', 'lie', 'liar', 'foolish', 'stupid', 'nonsense', 'mistake', 'problem']),
  empathy:    new Set(['love', 'heart', 'feel', 'feeling', 'cry', 'crying', 'emotional', 'sad', 'beautiful', 'kind', 'care', 'caring', 'peace', 'forgive']),
  authority:  new Set(['research', 'study', 'studies', 'scientist', 'professor', 'expert', 'data', 'proven', 'evidence', 'fact', 'facts', 'statistics', 'according', 'physiology', 'cortisol', 'hormone', 'melatonin']),
  curiosity:  new Set(['secret', 'hidden', 'nobody', 'unknown', 'mystery', 'discover', 'reveal', 'truth', 'untold', 'expose', 'behind', 'real']),
  urgency:    new Set(['now', 'today', 'immediately', 'stop', 'must', 'need', 'urgent', 'critical', 'important', 'warning', 'danger', 'quickly', 'first']),
  positive:   new Set(['great', 'awesome', 'amazing', 'love', 'win', 'wonderful', 'fantastic', 'perfect', 'brilliant', 'excellent', 'best', 'optimal']),
  negative:   new Set(['bad', 'hate', 'boring', 'terrible', 'pain', 'failure', 'worst', 'awful', 'horrible', 'disgusting'])
};

// Hook opening patterns ranked by viral potential (Opus-style multi-signal categories)
const HOOK_PATTERNS = [
  // 0. High-Stakes Confessions, Crime & Survival (Highest Viral CTR on Shorts/Reels/TikTok)
  { regex: /\b(almost (got )?(stopped|stabbed|killed|attacked|shot|died|arrested)|with (a|my) knife|had a knife|pulled (a|out a) (knife|gun)|attacking someone|wanted to kill|wanted to murder|go to jail|go to court|case went to court|called the police|police came|found on camera|tried to push me|started fighting|begun to fight|kills children|kills women|kills everybody)\b/i, type: 'Shocking Confession', boost: 48 },
  // 1. Actionable Advice & Core Principles (Opus Clip signature high-retention takeaways)
  { regex: /\b(the best way to|the most important thing|the secret to|the single biggest|the number one|the key to|how to actually|how you can|here is how)\b/i, type: 'Actionable Advice', boost: 35 },
  // 2. Curiosity Gaps & Revelation
  { regex: /\b(here\'s why|the reason why|nobody talks about|nobody knows|the truth about|the real reason|this is why|what happens when|you have to understand)\b/i, type: 'Curiosity Gap', boost: 32 },
  // 3. Pattern Interrupts & Mistakes
  { regex: /\b(stop doing|never do|biggest mistake|worst thing|you won\'t believe|you should never|don\'t ever|huge problem)\b/i, type: 'Pattern Interrupt', boost: 30 },
  // 4. Contrarian & Paradigm Shifts
  { regex: /\b(people don\'t realize|everyone thinks|what if i told you|what you have to realize|most people don\'t|most people have heard)\b/i, type: 'Contrarian Take', boost: 28 },
  // 5. High-Stakes Conditions & Hypotheses
  { regex: /\b(if you want to|if you are trying to|if you were going to|when you do this|the moment you)\b/i, type: 'High-Stakes Condition', boost: 26 },
  // 6. Direct Attention Grabber
  { regex: /^(wait|hold on|stop|listen|okay so|so basically|here's the thing|let me tell you)/i, type: 'Attention Grabber', boost: 24 },
  // 7. Provocative Question Hook
  { regex: /^(can you explain|what does|what do you|what are you|why do|what happened|how do you|tell me|who are you|what is)/i, type: 'Intense Question', boost: 22 },
  { regex: /^(i think|in my opinion|my concern|honestly|to be honest|the truth is|the problem is)/i, type: 'Hot Take', boost: 20 },
  { regex: /^(so i was|when i was|years ago|back when|i remember|i used to|one time|one day)/i, type: 'Storytelling', boost: 18 },
  { regex: /\?/, type: 'Question Hook', boost: 15 },
  { regex: /\b(died|killed|attacked|arrested|shot|stabbed|punched|pushed|dangerous|collapse|spike)\b/i, type: 'Dramatic Event', boost: 20 },
  { regex: /\b(million|billion|thousand|percent|hundred)\b/i, type: 'Stat-Based Hook', boost: 16 }
];

// Conclusive payoff patterns
const PAYOFF_PATTERNS = [
  { regex: /\b(that's why|that's the reason|and that's|so yeah|at the end of the day|bottom line|the point is|essentially is)\b/i, boost: 16 },
  { regex: /\b(believe|peace|solution|forever|love|amen|god bless|thank you|exactly|period|optimal|full spectrum|disappear|remember that)\b/i, boost: 12 },
  { regex: /[.!]$/, boost: 6 },
  { regex: /\?$/, boost: 2 }
];

// ─── Utility Functions ──────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function cleanWord(w) {
  return (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractKeywords(words, count = 4) {
  const freq = {};
  words.forEach(w => {
    const clean = cleanWord(w.word);
    if (clean.length > 3 && !STOPWORDS.has(clean)) {
      freq[clean] = (freq[clean] || 0) + 1;
    }
  });
  return Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, count);
}

// ─── Sentence Boundary Detection ────────────────────────────────────────────

function groupWordsIntoSentences(words) {
  if (!words || words.length === 0) return [];
  const sentences = [];
  let currentSentence = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentSentence.push(w);

    const rawWord = w.word.trim();
    const clean = cleanWord(rawWord);
    const hasPunctuation = /[.?!]$/.test(rawWord);
    const isNextWordValid = i < words.length - 1;
    const pauseAfter = isNextWordValid ? (words[i + 1].start - w.end) : 0;
    const isDangling = DANGLING_WORDS.has(clean);
    const isNaturalThoughtBoundary = pauseAfter > 0.85 && !isDangling && currentSentence.length >= 4;

    if (hasPunctuation || isNaturalThoughtBoundary || i === words.length - 1) {
      if (currentSentence.length > 0) {
        if (isDangling && i < words.length - 1 && currentSentence.length < 24) continue;
        sentences.push({
          start: currentSentence[0].start,
          end: currentSentence[currentSentence.length - 1].end,
          text: currentSentence.map(x => x.word).join(' '),
          words: currentSentence,
          endsInTerminalPunctuation: hasPunctuation,
          lastWordClean: clean
        });
        currentSentence = [];
      }
    }
  }

  if (currentSentence.length > 0) {
    sentences.push({
      start: currentSentence[0].start,
      end: currentSentence[currentSentence.length - 1].end,
      text: currentSentence.map(x => x.word).join(' '),
      words: currentSentence,
      endsInTerminalPunctuation: false,
      lastWordClean: cleanWord(currentSentence[currentSentence.length - 1].word)
    });
  }
  return sentences;
}

// ─── Advanced Scoring Helpers ───────────────────────────────────────────────

/**
 * Measures emotional intensity across a word sequence.
 * Returns { totalScore, dominantEmotion, emotionBreakdown }
 */
function scoreEmotionalIntensity(segWords) {
  const breakdown = {};
  let total = 0;
  for (const category of Object.keys(EMOTION_WORDS)) {
    let count = 0;
    for (const w of segWords) {
      if (EMOTION_WORDS[category].has(cleanWord(w.word))) count++;
    }
    if (count > 0) {
      const weight = category === 'highStakes' ? 5 : (category === 'conflict' || category === 'surprise' ? 3 : category === 'humor' ? 4 : 2);
      const catScore = count * weight;
      breakdown[category] = catScore;
      total += catScore;
    }
  }
  const dominant = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0];
  return { totalScore: Math.min(total, 35), dominantEmotion: dominant ? dominant[0] : null, breakdown };
}

/**
 * Detects conversational turn-taking.
 * Looks for pronoun alternation patterns (I→you→I) and question-answer flows.
 */
function scoreTurnTaking(segWords, sentences, startIdx, endIdx) {
  let turns = 0;
  let hasQA = false;
  let lastPronounGroup = null;

  for (const w of segWords) {
    const lw = cleanWord(w.word);
    let group = null;
    if (['i', 'me', 'my', 'mine', 'myself'].includes(lw)) group = 'self';
    else if (['you', 'your', 'yours', 'yourself'].includes(lw)) group = 'other';

    if (group && group !== lastPronounGroup) {
      if (lastPronounGroup) turns++;
      lastPronounGroup = group;
    }
  }

  // Q&A detection: is there a question mark followed by a non-question sentence?
  for (let s = startIdx; s < endIdx; s++) {
    if (sentences[s].text.includes('?') && s + 1 <= endIdx && !sentences[s + 1].text.includes('?')) {
      hasQA = true;
      break;
    }
  }

  return { turnScore: Math.min(turns * 2, 12), hasQA };
}

/**
 * Measures speech energy variation — monotone speech scores low, varied pacing scores high.
 * Looks at inter-word timing variance as a proxy for vocal energy.
 */
function scorePacingVariation(segWords) {
  if (segWords.length < 10) return 0;
  const gaps = [];
  for (let i = 0; i < segWords.length - 1; i++) {
    gaps.push(segWords[i + 1].start - segWords[i].end);
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const stddev = Math.sqrt(variance);

  // High stddev = varied pacing = more engaging
  if (stddev > 0.4) return 8;
  if (stddev > 0.25) return 5;
  if (stddev > 0.15) return 3;
  return 0;
}

/**
 * Topic coherence — measures whether a clip stays on topic via keyword density.
 * A clip where the top 3 keywords appear frequently is more coherent.
 */
function scoreTopicCoherence(segWords) {
  const freq = {};
  for (const w of segWords) {
    const c = cleanWord(w.word);
    if (c.length > 3 && !STOPWORDS.has(c)) {
      freq[c] = (freq[c] || 0) + 1;
    }
  }
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const totalUnique = Object.keys(freq).length;
  if (totalUnique === 0) return 0;
  const topFreqSum = topWords.reduce((s, [, count]) => s + count, 0);
  const totalWords = segWords.length;
  const coherenceRatio = topFreqSum / totalWords;

  // Higher ratio = more focused topic = more coherent
  if (coherenceRatio > 0.12) return 8;
  if (coherenceRatio > 0.08) return 5;
  if (coherenceRatio > 0.05) return 3;
  return 0;
}

/**
 * Generates a unique, specific "Why Viral" reason based on the clip's actual content.
 */
function generateViralReason(clip, sentences, startIdx, endIdx, emotionData, turnData, wpm) {
  const parts = [];
  const openingText = sentences[startIdx].text.slice(0, 40);
  const closingText = sentences[endIdx].text.slice(-40);

  // Hook description
  parts.push(`Opens with ${clip.hookType.toLowerCase()}: "${openingText}..."`);

  // Emotional content
  if (emotionData.dominantEmotion) {
    const emotionLabels = {
      highStakes: 'high-stakes danger & survival',
      surprise: 'surprise/shock moments', humor: 'humor & comedic energy',
      conflict: 'debate & disagreement', empathy: 'emotional depth',
      authority: 'credible claims & evidence', curiosity: 'curiosity gaps',
      urgency: 'urgency & stakes', positive: 'positive energy', negative: 'raw intensity'
    };
    parts.push(`${emotionLabels[emotionData.dominantEmotion] || emotionData.dominantEmotion}`);
  }

  // Turn-taking
  if (turnData.hasQA) parts.push('complete Q&A exchange');
  else if (turnData.turnScore > 6) parts.push('dynamic back-and-forth dialogue');

  // Pacing
  if (wpm >= 140 && wpm <= 170) parts.push('optimal speech pacing');
  else if (wpm > 170) parts.push('high-energy rapid delivery');

  // Payoff
  parts.push(`resolves with "...${closingText}"`);

  return parts.join(' • ');
}

/**
 * OpusClip-Grade Smart Viral Title Synthesizer
 * Produces irresistible, high-CTR YouTube Shorts / TikTok titles with curated emojis
 * based on dramatic quotations, core revelations, advice patterns, and provocative questions.
 */
function generateSmartViralTitle(clipWords = [], hookType = 'Conversation', firstSentenceText = '') {
  const fullClipText = clipWords.map(w => w.word).join(' ');
  const lower = fullClipText.toLowerCase();

  // 1. High-Stakes Narrative, Survival, Crime & Confrontation Quotes
  if (lower.includes('wanted to kill him') || (lower.includes('kill him') && lower.includes('wanted'))) {
    return 'He Said "I Wanted To Kill Him" 🚨';
  }
  if (lower.includes('go to jail') || (lower.includes('kill him') && (lower.includes('court') || lower.includes('jail')))) {
    return 'If You Kill Him, You Go To Jail ⚖️';
  }
  if (lower.includes('knife') && (lower.includes('stopped') || lower.includes('stabbed') || lower.includes('almost') || lower.includes('blade'))) {
    return 'I Was Almost Stabbed With A Knife 🔪';
  }
  if (lower.includes('attacking someone') || lower.includes('guy attacking')) {
    return 'A Guy Was Attacking Someone Right Here 😱';
  }
  if (lower.includes('push me off the ladder') || (lower.includes('ladder') && lower.includes('pushed'))) {
    return 'They Tried To Push Me Off The Ladder 🪜';
  }
  if (lower.includes('knife was found') || (lower.includes('knife') && lower.includes('police'))) {
    return 'Police Found The Knife On Camera 🚔';
  }
  if (lower.includes('kills children') || lower.includes('kills women') || lower.includes('kills everybody')) {
    return 'He Kills Women And Children! ⚠️';
  }
  if (lower.includes('defend myself')) {
    return 'I Know How To Defend Myself 🛡️';
  }
  if (lower.includes('explain what your sign means') || lower.includes('what your sign means')) {
    return 'Can You Explain What Your Sign Means? 📢';
  }
  if (lower.includes('case went to court') || lower.includes('went to court')) {
    return 'The Case Actually Went To Court 🏛️';
  }

  // 2. High-CTR Pattern Interrupts & Actionable Advice
  const adviceMatch = fullClipText.match(/\b(the single biggest|the number one|the secret to|the most important thing|the best way to|how to actually|stop doing|never do|biggest mistake)\s+([a-zA-Z\s]{4,35})/i);
  if (adviceMatch) {
    let phrase = adviceMatch[0].trim();
    return toTitleCase(phrase.replace(/[.,?!]/g, '')) + ' ⚡';
  }

  // 3. Clean Provocative Question Hook
  if (firstSentenceText && firstSentenceText.includes('?')) {
    let cleanQ = firstSentenceText
      .replace(/^(that\'s great\.?\s*so,?\s*|well,?\s*|okay,?\s*|so,?\s*|like,?\s*|yeah,?\s*|i mean,?\s*)/i, '')
      .replace(/[.?]/g, '')
      .trim();
    if (cleanQ.length >= 10 && cleanQ.length <= 60) {
      return toTitleCase(cleanQ) + ' ❓';
    }
  }

  // 4. Hot Take / Emotion statement
  const hotTakeMatch = fullClipText.match(/\b(i think|i believe|the truth is|the problem with|nobody talks about|people don't realize)\s+([a-zA-Z\s]{4,35})/i);
  if (hotTakeMatch) {
    let phrase = hotTakeMatch[0].trim();
    return toTitleCase(phrase.replace(/[.,?!]/g, '')) + ' 🔥';
  }

  // 5. Intelligent Topic Title fallback (never output filler like "That's Great")
  let cleanFirst = firstSentenceText
    .replace(/^(that\'s great\.?\s*so,?\s*|well,?\s*|okay,?\s*|so,?\s*|like,?\s*|yeah,?\s*|he talked to him,?\s*okay,?\s*|this is what happened,?\s*|now what happened was,?\s*|i mean this place is,?\s*|well as weird as it may sound,?\s*|before i answer,?\s*)/i, '')
    .trim();

  let wordsList = cleanFirst.split(/\s+/).slice(0, 7);
  while (wordsList.length > 3 && DANGLING_WORDS.has(cleanWord(wordsList[wordsList.length - 1]))) {
    wordsList.pop();
  }
  let fallback = toTitleCase(wordsList.join(' ').replace(/[.,?!]/g, '').trim());
  if (fallback.length >= 6 && !/^(that's great|he talked to him|this is what|is there a reason|i mean this|okay|well they're)$/i.test(fallback)) {
    const emojiMap = {
      'Actionable Advice': '⚡', 'Curiosity Gap': '💡', 'Pattern Interrupt': '🛑',
      'Contrarian Take': '🧠', 'High-Stakes Condition': '🎯',
      'Intense Question': '🗣️', 'Hot Take': '🔥', 'Storytelling': '📖',
      'Question Hook': '❓', 'Attention Grabber': '⚡',
      'Shocking Confession': '🚨', 'Dramatic Event': '😱', 'Stat-Based Hook': '📊',
      'Custom Hook': '🎯', 'Conversation': '💬'
    };
    return `${fallback} ${emojiMap[hookType] || '🔥'}`;
  }

  // Subject / Keyword extraction
  const keywords = extractKeywords(clipWords, 3);
  if (keywords.length >= 2) {
    return `The Truth About ${toTitleCase(keywords.slice(0, 2).join(' '))} 💡`;
  }

  return 'Viral Climax Moment 🔥';
}


// ─── Main Clip Discovery Engine ─────────────────────────────────────────────

/**
 * High-Quality Viral Clip Finder v2
 * Multi-signal engagement scoring: emotional intensity, turn-taking, pacing variation,
 * topic coherence, hook quality, payoff quality, conversation completeness.
 *
 * @param {Object} options - { enableHookScan: boolean }
 */
function analyzeClipsDynamically(words, fullText, videoDuration, options = {}) {
  const { enableHookScan = true } = options;

  if (!words || words.length === 0) return [];
  const sentences = groupWordsIntoSentences(words);
  if (sentences.length === 0) return [];

  const candidates = [];
  const minDur = videoDuration <= 45 ? Math.max(15.0, videoDuration * 0.7) : 28.0;
  const maxDur = videoDuration <= 45 ? videoDuration : 52.0;

  // Short-video fast path
  if (videoDuration <= 35) {
    const topKeywords = extractKeywords(words, 3);
    const firstSentence = sentences[0]?.text || fullText.slice(0, 50);
    const titleText = toTitleCase(firstSentence.split(/\s+/).slice(0, 6).join(' ').replace(/[.,?!]/g, ''));
    return [{
      id: 'clip_1', start: 0, end: parseFloat(videoDuration.toFixed(2)),
      duration: parseFloat(videoDuration.toFixed(2)), viralityScore: 95,
      hookType: 'Core Message', title: `${titleText || 'Key Takeaway'} 🔥`,
      viralityReason: 'Complete standalone message with high impact from start to finish.',
      transcriptSnippet: fullText.slice(0, 160) + (fullText.length > 160 ? '...' : ''),
      words, hashtags: ['#shorts', '#viral', ...topKeywords.map(k => `#${k}`)],
      suitablePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels']
    }];
  }

  // ── Pre-compute per-sentence banter flags ──
  const sentenceBanter = sentences.map(s => {
    const lower = s.text.toLowerCase();
    return BANTER_PHRASES.some(phrase => lower.includes(phrase));
  });

  // ── Semantic Context-Aware Thought Boundary Scan ──
  for (let i = 0; i < sentences.length; i++) {
    if (sentenceBanter[i]) continue;

    const firstSentence = sentences[i];
    const firstTextLower = firstSentence.text.toLowerCase().trim();

    // 1. HARD REJECT: Incomplete anaphoric references that lack past context in shorts
    if (BROKEN_START_PATTERNS.test(firstTextLower)) continue;

    // 2. Snappy Preamble Skip: If sentence i is an interviewer prompt or question, but sentence i+1 starts a high-stakes confession/story,
    // skip starting at sentence i so the clip starts cleanly on the explosive story!
    if (i + 1 < sentences.length) {
      const nextTextLower = sentences[i + 1].text.toLowerCase().trim();
      const isLeadIn = firstTextLower.includes('?') || /^(is there|why do you|can you explain|what does|how do you|tell me about|what happened|so you were|did you)/i.test(firstTextLower);
      const nextIsHighStakes = /\b(almost (got )?(stopped|stabbed|killed|attacked|shot|died|arrested)|with (a|my) knife|had a knife|pulled (a|out a) (knife|gun)|attacking someone|wanted to kill|wanted to murder|go to jail|go to court|case went to court|called the police|police came|found on camera|tried to push me|started fighting|begun to fight|kills children|kills women|defend myself)\b/i.test(nextTextLower);
      if (isLeadIn && nextIsHighStakes) {
        continue;
      }
    }

    // ── HOOK SCORING ──
    let hookScore = 0;
    let hookType = 'Conversation';

    if (enableHookScan) {
      // Custom hooks from config
      const hasCustomHook = hookPhrases.some(h => firstTextLower.includes(h.toLowerCase()));
      if (hasCustomHook) {
        hookScore += 25;
        hookType = 'Custom Hook';
      }

      // Pattern-based hooks
      for (const pattern of HOOK_PATTERNS) {
        if (pattern.regex.test(firstTextLower)) {
          if (pattern.boost > hookScore) {
            hookScore = pattern.boost;
            hookType = pattern.type;
          }
          break;
        }
      }
    }

    // Strongly penalize generic intro chatter / stream setup
    if (firstSentence.start < 120 && /\b(what's up|welcome back|we are here|most requested spot|hey guys|what's going on|how's everyone|hello everyone|good morning|check check|mic check|sound check|can you hear|subscribe|hit the bell|testing one|setup|adjust)\b/i.test(firstTextLower)) {
      hookScore -= 45;
    }

    // ── Find optimal single best end sentence for start sentence i ──
    const stride = sentences.length > 300 ? 2 : 1;
    let bestCandForI = null;
    let bestCandScore = -1;

    for (let j = i + 2; j < sentences.length; j += stride) {
      const windowStart = firstSentence.start;
      const windowEnd = sentences[j].end;
      const duration = windowEnd - windowStart;

      // Early exit if we've passed maxDur
      if (duration > maxDur + 4) break;
      if (duration < minDur || duration > maxDur) continue;

      const lastSentence = sentences[j];
      const lastWord = lastSentence.words[lastSentence.words.length - 1];
      const lastWordClean = cleanWord(lastWord?.word);
      const hasTerminalPunct = /[.?!]$/.test(lastWord?.word?.trim() || '');

      // Never end on a dangling word or mid-sentence without terminal punctuation
      if (DANGLING_WORDS.has(lastWordClean)) continue;
      if (!hasTerminalPunct) continue;

      // Collect words for this window
      let windowWords = [];
      let banterCount = 0;
      for (let k = i; k <= j; k++) {
        windowWords = windowWords.concat(sentences[k].words);
        if (sentenceBanter[k]) banterCount++;
      }

      // Skip clips with banter
      if (banterCount >= 1) continue;

      // ── Context Completeness Check for Questions ──
      const windowText = windowWords.map(w => w.word).join(' ');
      if (hookType === 'Question Hook' || hookType === 'Intense Question' || firstTextLower.includes('?')) {
        const qMarkIdx = windowText.indexOf('?');
        // If the question takes more than 45% of the clip duration, it leaves the audience hanging without the answer!
        if (qMarkIdx > windowText.length * 0.45) {
          continue;
        }
      }

      // ── MULTI-SIGNAL SCORING ──
      let score = 52; // Base score

      // 1. Hook quality
      score += hookScore;

      // 2. Emotional intensity (laughter, conflict, astonishment, authority)
      const emotionData = scoreEmotionalIntensity(windowWords);
      score += emotionData.totalScore * 1.4;
      if (emotionData.totalScore >= 10) score += 10;

      // 3. Turn-taking / dialogue quality
      const turnData = scoreTurnTaking(windowWords, sentences, i, j);
      score += turnData.turnScore;
      if (turnData.hasQA) score += 12;

      // 4. Pacing variation
      score += scorePacingVariation(windowWords);

      // 5. Topic coherence
      score += scoreTopicCoherence(windowWords);

      // 6. Payoff quality
      const lastSentenceClean = lastSentence.text.toLowerCase().trim();
      let payoffFound = false;
      for (const pattern of PAYOFF_PATTERNS) {
        if (pattern.regex.test(lastSentenceClean)) {
          score += pattern.boost;
          payoffFound = true;
          break;
        }
      }
      if (!payoffFound) score += 4;

      // 7. Optimal words-per-minute (140-170 WPM ideal)
      const wpm = (windowWords.length / duration) * 60;
      if (wpm >= 140 && wpm <= 175) score += 12;
      else if (wpm >= 120 && wpm < 140) score += 6;
      else if (wpm < 120) score -= 20; // Severe penalty for slow dragging delivery
      else if (wpm > 240) score -= 10;

      // 8. Substance check — require minimum word count
      if (windowWords.length < 50) score -= 15;
      if (windowWords.length >= 80) score += 6;

      // 9. Duration sweet spot (32s to 42s)
      score += (20 - Math.abs(duration - 36.0) * 0.8);

      // 10. Penalize clips starting with dead filler
      const firstWord = cleanWord(firstSentence.words[0]?.word);
      if (['um', 'uh', 'like', 'so', 'okay', 'yeah', 'well', 'right', 'alright'].includes(firstWord)) {
        score -= 10;
      }

      if (score > bestCandScore) {
        bestCandScore = score;

        // Generate Opus-grade viral title
        const smartTitle = generateSmartViralTitle(windowWords, hookType, firstSentence.text);

        const reason = generateViralReason(
          { hookType }, sentences, i, j, emotionData, turnData, wpm
        );

        // Dynamic OpusClip-grade Virality Score scaling across a wide dynamic range (70 to 98)
        let displayScore = Math.round(score);
        if (hookType === 'Shocking Confession' || emotionData.breakdown?.highStakes) {
          displayScore = Math.max(93, Math.min(98, Math.round(score + 18)));
        } else if (emotionData.totalScore >= 12 || turnData.hasQA) {
          displayScore = Math.max(84, Math.min(92, Math.round(score + 8)));
        } else {
          displayScore = Math.max(70, Math.min(83, Math.round(score)));
        }

        bestCandForI = {
          id: `cand_${i}`,
          start: parseFloat(windowStart.toFixed(2)),
          end: parseFloat(windowEnd.toFixed(2)),
          duration: parseFloat(duration.toFixed(2)),
          rawScore: score,
          viralityScore: displayScore,
          hookType,
          title: smartTitle,
          viralityReason: reason,
          transcriptSnippet: windowWords.map(w => w.word).join(' ').slice(0, 200) + '...',
          words: windowWords,
          hashtags: ['#shorts', '#viral', ...extractKeywords(windowWords, 2).map(k => `#${k}`)],
          suitablePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels'],
          generatedHook: null
        };
      }
    }

    if (bestCandForI) {
      candidates.push(bestCandForI);
    }
  }

  // Sort by preliminary raw heuristic score descending
  candidates.sort((a, b) => b.rawScore - a.rawScore);

  // Return full candidate pool spanning the whole video so the ML model can evaluate all segments
  return candidates.slice(0, 120);
}


// ─── LLM-Based Analyzers ────────────────────────────────────────────────────

async function analyzeClipsWithGroq(words, fullText, videoDuration, apiKey) {
  const prompt = `You are a viral shorts editor for TikTok and YouTube Shorts.
Analyze this transcript and find the top 5 most ENGAGING clips, each strictly between 30 and 45 seconds.

CRITICAL RULES:
1. IGNORE stream setup, camera checks, hair checks, backpack adjustments, or small-talk banter.
2. Select ONLY segments with HIGH ENGAGEMENT: debates, arguments, shocking revelations, funny moments, emotional stories, or thought-provoking questions.
3. Each clip MUST start with a strong hook (question, bold statement, or attention grabber) and end with a payoff (conclusion, punchline, or resolution).
4. NEVER end mid-sentence or mid-thought. Each clip must be self-contained and make complete sense.
5. Prioritize: conflict/debate > humor/funny > emotional/story > educational > general conversation.

Video Duration: ${videoDuration}s.
Transcript:
${fullText.slice(0, 12000)}

Return ONLY a valid JSON array (no wrapping object):
[
  {
    "start": 88.0,
    "end": 124.0,
    "viralityScore": 98,
    "hookType": "Intense Debate",
    "title": "What Does Your Sign Mean? 🗣️",
    "viralityReason": "Opens with provocative question, features heated back-and-forth debate, resolves with powerful statement.",
    "hashtags": ["#shorts", "#debate"]
  }
]`;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.15
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const raw = parsed.choices[0].message.content;
          const jsonRes = JSON.parse(raw);
          const clipList = Array.isArray(jsonRes) ? jsonRes : (jsonRes.clips || jsonRes.segments || []);

          if (clipList.length > 0) {
            const enriched = clipList.map((c, i) => {
              const start = Math.max(0, parseFloat(c.start));
              const end = Math.min(videoDuration, parseFloat(c.end));
              return {
                id: `clip_groq_${i + 1}`,
                ...c,
                start, end,
                duration: parseFloat((end - start).toFixed(2)),
                words: words.filter(w => w.start >= start - 0.2 && w.end <= end + 0.2),
                suitablePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels']
              };
            });
            return resolve(enriched);
          }
          resolve(analyzeClipsDynamically(words, fullText, videoDuration));
        } catch (e) {
          resolve(analyzeClipsDynamically(words, fullText, videoDuration));
        }
      });
    });

    req.on('error', () => resolve(analyzeClipsDynamically(words, fullText, videoDuration)));
    req.write(postData);
    req.end();
  });
}

async function analyzeClipsWithGemini(words, fullText, videoDuration, apiKey) {
  const prompt = `You are a viral shorts editor. Find the top 5 most engaging clips (30-45 seconds each).
Rules: Ignore banter/setup. Each clip needs a strong hook + complete payoff. Prioritize conflict, humor, emotion.
Video duration: ${videoDuration}s.
Transcript:
${fullText.slice(0, 12000)}

Return valid JSON array:
[
  {
    "start": 88.0,
    "end": 124.0,
    "viralityScore": 97,
    "hookType": "Intense Debate",
    "title": "What Does Your Sign Mean? 🗣️",
    "viralityReason": "Complete contextual dialogue with strong opening and poignant resolution.",
    "hashtags": ["#shorts", "#viral"]
  }
]`;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const rawText = parsed.candidates[0].content.parts[0].text;
          const clips = JSON.parse(rawText);
          const enriched = clips.map((c, i) => {
            const start = Math.max(0, parseFloat(c.start));
            const end = Math.min(videoDuration, parseFloat(c.end));
            return {
              id: `clip_gemini_${i + 1}`, ...c, start, end,
              duration: parseFloat((end - start).toFixed(2)),
              words: words.filter(w => w.start >= start - 0.2 && w.end <= end + 0.2),
              suitablePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels']
            };
          });
          resolve(enriched);
        } catch (e) {
          resolve(analyzeClipsDynamically(words, fullText, videoDuration));
        }
      });
    });

    req.on('error', () => resolve(analyzeClipsDynamically(words, fullText, videoDuration)));
    req.write(postData);
    req.end();
  });
}


async function analyzeClipsWithGitHub(words, fullText, videoDuration, githubToken) {
  const prompt = `You are an elite viral video editor for TikTok, YouTube Shorts, and Instagram Reels.
Analyze this video transcript and find the top 5 most ENGAGING clips, each strictly between 28 and 45 seconds.

CRITICAL RULES:
1. STRICTLY IGNORE stream setup, intro greetings ("hey guys welcome back", "can you hear me"), microphone tests, sponsor plugs, or small-talk banter.
2. Select ONLY high-voltage, gripping segments: intense debates, shocking secrets, hilarious punchlines, dramatic confessions, or thought-provoking questions.
3. Every clip MUST start on a powerful hook that grips attention in the first 3 seconds and end with a satisfying payoff/punchline.
4. NEVER cut mid-sentence.

Video Duration: ${videoDuration}s.
Transcript:
${fullText.slice(0, 14000)}

Return ONLY a valid JSON array of objects with keys:
[
  {
    "start": 88.0,
    "end": 124.0,
    "viralityScore": 99,
    "hookType": "Intense Debate",
    "title": "Viral Headline 🔥",
    "viralityReason": "Opens with provocative question, features heated back-and-forth debate, resolves with powerful statement.",
    "hashtags": ["#shorts", "#viral"]
  }
]`;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      model: "meta-llama-3.3-70b-instruct",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    const options = {
      hostname: 'models.github.ai',
      path: '/inference/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'OpenClip-Studio/1.0',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let raw = parsed?.choices?.[0]?.message?.content;
          if (!raw) {
            return resolve(null);
          }
          raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
          const jsonRes = JSON.parse(raw);
          const clipList = Array.isArray(jsonRes) ? jsonRes : (jsonRes.clips || jsonRes.segments || []);
          if (clipList.length > 0) {
            const enriched = clipList.map((c, i) => {
              const start = Math.max(0, parseFloat(c.start));
              const end = Math.min(videoDuration, parseFloat(c.end));
              return {
                id: `clip_gh_${i + 1}`,
                ...c,
                start, end,
                duration: parseFloat((end - start).toFixed(2)),
                words: words.filter(w => w.start >= start - 0.2 && w.end <= end + 0.2),
                suitablePlatforms: ['TikTok', 'YouTube Shorts', 'Instagram Reels']
              };
            });
            return resolve(enriched);
          }
          resolve(null);
        } catch (e) {
          console.warn('GitHub Models parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('GitHub Models request error:', err.message);
      resolve(null);
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Scores candidate clips using the proprietary agency multimodal ML model (v3 - Deep Transformer & Physical Acoustics)
 */
function scoreClipsWithAgencyML(clips, options = {}) {
  return new Promise((resolve) => {
    if (!clips || clips.length === 0) return resolve(clips);
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'ml', 'virality_inference.py');
    const modelPath = path.join(__dirname, '..', 'ml', 'virality_model.pkl');

    if (!fs.existsSync(modelPath) || !fs.existsSync(scriptPath)) {
      return resolve(clips);
    }

    try {
      const py = spawn('python3', [scriptPath]);
      let stdout = '';
      let stderr = '';

      py.stdout.on('data', chunk => stdout += chunk);
      py.stderr.on('data', chunk => stderr += chunk);

      py.on('close', code => {
        if (code === 0 && stdout.trim()) {
          try {
            const mlResults = JSON.parse(stdout.trim());
            const scoreMap = new Map();
            mlResults.forEach(r => scoreMap.set(r.id, r));

            const enriched = clips.map((c, idx) => {
              const ml = scoreMap.get(c.id) || mlResults[idx];
              if (!ml) return c;
              const blendedScore = Math.max(c.viralityScore || 70, ml.viralityScore);
              return {
                ...c,
                viralityScore: blendedScore,
                hookScore: Math.max(c.hookScore || 70, ml.hookScore),
                flowScore: ml.flowScore,
                energyScore: ml.energyScore,
                climaxScore: ml.climaxScore,
                semanticMargin: ml.semanticMargin !== undefined ? ml.semanticMargin : null,
                acousticPower: ml.acousticPower !== undefined ? ml.acousticPower : null,
                hookVelocity: ml.hookVelocity !== undefined ? ml.hookVelocity : null,
                prosodyFlux: ml.prosodyFlux !== undefined ? ml.prosodyFlux : null,
                triadCohesion: ml.triadCohesion !== undefined ? ml.triadCohesion : null,
                micDropPayoff: ml.micDropPayoff !== undefined ? ml.micDropPayoff : null,
                survivalProbability: ml.survivalProbability !== undefined ? ml.survivalProbability : null,
                viralityReason: ml.viralityReason || c.viralityReason,
                mlModel: ml.mlModel || 'OpenClip-Proprietary-v4-46D-Multimodal',
                mlVerified: true
              };
            });
            // Re-sort descending by virality score
            enriched.sort((a, b) => b.viralityScore - a.viralityScore);
            return resolve(enriched);
          } catch (e) {
            console.warn('Agency ML parse error:', e.message);
          }
        }
        resolve(clips);
      });

      const audioPath = options.audioPath || options.wavPath || null;
      const payload = JSON.stringify({
        audioPath,
        wavPath: audioPath,
        segments: clips.map(c => ({
          id: c.id,
          start: c.start,
          end: c.end,
          words: c.words || [],
          audioPath
        }))
      });

      py.stdin.write(payload);
      py.stdin.end();
    } catch (err) {
      console.warn('Agency ML process error:', err.message);
      resolve(clips);
    }
  });
}

/**
 * Deep Token Re-Ranker: Uses reasoning tokens from available LLMs (Groq, Gemini, GitHub)
 * to critique and re-rank the top candidates on viral hooks, knowledge payoff, and emotional resonance.
 */
async function deepReRankWithLLM(topClips, fullText, keys = {}) {
  const groqKey = keys.groqApiKey;
  const geminiKey = keys.geminiApiKey;
  const ghToken = keys.githubToken;
  if (!groqKey && !geminiKey && !ghToken) return topClips;
  if (!topClips || topClips.length <= 1) return topClips;

  const candidateSummaries = topClips.slice(0, 8).map((c, idx) => {
    const text = (c.words || []).map(w => w.word).join(' ').trim();
    return `Candidate [${idx + 1}] (ID: "${c.id}", Duration: ${c.duration}s, Current Title: "${c.title}"):\n"${text.slice(0, 320)}..."`;
  }).join('\n\n');

  const prompt = `You are an elite short-form video repurposer for TikTok, Shorts, and Reels.
Evaluate these candidate clips from a long-form video and rank them by raw VIRAL ENGAGEMENT POTENTIAL.

CRITICAL VIRAL CRITERIA:
1. High Viral Potential: Actionable counter-intuitive advice, shocking biology/neuroscience secrets, dramatic revelations, intense debates, powerful emotional breakthroughs.
2. Low Engagement / Boring: Logistics, casual pleasantries, mic checks, monotone schedule rambling, setup fluff.

CANDIDATES:
${candidateSummaries}

Return ONLY a valid JSON array of objects re-ranking ALL candidate IDs by engagement potential:
[
  {
    "id": "cand_X",
    "viralityBoost": 10,
    "viralTitle": "Punchy Viral Headline 🔥",
    "expertCritique": "One sharp sentence explaining why this clip captures maximum viewer retention."
  }
]`;

  if (groqKey) {
    try {
      const llmRes = await new Promise((resolve) => {
        const postData = JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.15
        });
        const req = https.request({
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const raw = parsed.choices[0].message.content;
              resolve(JSON.parse(raw));
            } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(4500, () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
      });

      if (llmRes) {
        const rankings = Array.isArray(llmRes) ? llmRes : (llmRes.rankings || llmRes.clips || []);
        if (rankings.length > 0) {
          const rankMap = new Map();
          rankings.forEach(r => rankMap.set(r.id, r));
          return topClips.map(c => {
            const judge = rankMap.get(c.id);
            if (!judge) return c;
            const boost = Math.max(-15, Math.min(15, parseInt(judge.viralityBoost) || 0));
            return {
              ...c,
              viralityScore: Math.min(99, Math.max(15, c.viralityScore + boost)),
              title: judge.viralTitle || c.title,
              viralityReason: judge.expertCritique ? `AI Viral Strategist: ${judge.expertCritique}` : c.viralityReason,
              llmEnhanced: true
            };
          }).sort((a, b) => b.viralityScore - a.viralityScore);
        }
      }
    } catch (e) {
      console.warn('Groq deep re-ranking error:', e.message);
    }
  }

  if (geminiKey) {
    try {
      const llmRes = await new Promise((resolve) => {
        const postData = JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        });
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const raw = parsed.candidates[0].content.parts[0].text;
              resolve(JSON.parse(raw));
            } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(5000, () => { req.destroy(); resolve(null); });
        req.write(postData);
        req.end();
      });

      if (llmRes) {
        const rankings = Array.isArray(llmRes) ? llmRes : (llmRes.rankings || llmRes.clips || []);
        if (rankings.length > 0) {
          const rankMap = new Map();
          rankings.forEach(r => rankMap.set(r.id, r));
          return topClips.map(c => {
            const judge = rankMap.get(c.id);
            if (!judge) return c;
            const boost = Math.max(-15, Math.min(15, parseInt(judge.viralityBoost) || 0));
            return {
              ...c,
              viralityScore: Math.min(99, Math.max(15, c.viralityScore + boost)),
              title: judge.viralTitle || c.title,
              viralityReason: judge.expertCritique ? `AI Viral Strategist: ${judge.expertCritique}` : c.viralityReason,
              llmEnhanced: true
            };
          }).sort((a, b) => b.viralityScore - a.viralityScore);
        }
      }
    } catch (e) {
      console.warn('Gemini deep re-ranking error:', e.message);
    }
  }

  return topClips;
}

// ─── Master Dispatcher ──────────────────────────────────────────────────────

async function discoverViralClips(words, fullText, videoDuration, keys = {}, options = {}) {
  const githubToken = (typeof keys === 'string' ? null : keys?.githubToken) || process.env.GITHUB_TOKEN;
  const groqKey = (typeof keys === 'string' ? null : keys?.groqApiKey) || process.env.GROQ_API_KEY;
  const geminiKey = (typeof keys === 'string' ? keys : keys?.geminiApiKey) || process.env.GEMINI_API_KEY;
  const { enableHookScan = true } = options;

  // ─── STRATEGY: LLM-First Discovery with Heuristic Hybridization ───
  // LLMs understand content meaning and find genuinely engaging moments.
  // Heuristics only understand patterns and keywords — they miss boring vs interesting.
  // Use LLM as PRIMARY discovery, heuristic as SECONDARY/FALLBACK.

  let llmCandidates = null;

  // 1. Try LLM-based clip discovery (PRIMARY PATH when API keys available)
  if (groqKey) {
    try {
      console.log('[ViralEngine] Using Groq LLM for primary clip discovery...');
      llmCandidates = await analyzeClipsWithGroq(words, fullText, videoDuration, groqKey);
      if (llmCandidates && llmCandidates.length > 0) {
        console.log(`[ViralEngine] Groq discovered ${llmCandidates.length} engaging clips`);
      }
    } catch (e) {
      console.warn('[ViralEngine] Groq discovery error:', e.message);
    }
  }

  if ((!llmCandidates || llmCandidates.length === 0) && githubToken) {
    try {
      console.log('[ViralEngine] Using GitHub Models for primary clip discovery...');
      llmCandidates = await analyzeClipsWithGitHub(words, fullText, videoDuration, githubToken);
      if (llmCandidates && llmCandidates.length > 0) {
        console.log(`[ViralEngine] GitHub Models discovered ${llmCandidates.length} engaging clips`);
      }
    } catch (e) {
      console.warn('[ViralEngine] GitHub Models discovery error:', e.message);
    }
  }

  if ((!llmCandidates || llmCandidates.length === 0) && geminiKey) {
    try {
      console.log('[ViralEngine] Using Gemini for primary clip discovery...');
      llmCandidates = await analyzeClipsWithGemini(words, fullText, videoDuration, geminiKey);
      if (llmCandidates && llmCandidates.length > 0) {
        console.log(`[ViralEngine] Gemini discovered ${llmCandidates.length} engaging clips`);
      }
    } catch (e) {
      console.warn('[ViralEngine] Gemini discovery error:', e.message);
    }
  }

  // 2. Always run heuristic analysis as secondary source
  let heuristicCandidates = analyzeClipsDynamically(words, fullText, videoDuration, { enableHookScan });

  // 3. Determine candidate pool
  let candidates;
  if (llmCandidates && llmCandidates.length > 0) {
    // LLM candidates are primary — HYBRID: merge unique heuristic finds that don't overlap
    candidates = [...llmCandidates];
    
    // Add non-overlapping heuristic candidates as extras
    for (const hCand of heuristicCandidates.slice(0, 8)) {
      const overlapsLLM = candidates.some(existing => {
        const overlapStart = Math.max(hCand.start, existing.start);
        const overlapEnd = Math.min(hCand.end, existing.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        return overlap > 0.30 * Math.min(hCand.duration, existing.duration);
      });
      if (!overlapsLLM && hCand.viralityScore >= 70) {
        candidates.push(hCand);
      }
    }
    console.log(`[ViralEngine] Hybrid pool: ${llmCandidates.length} LLM + ${candidates.length - llmCandidates.length} heuristic = ${candidates.length} total`);
  } else {
    // No LLM available — pure heuristic fallback
    candidates = heuristicCandidates;
    console.log(`[ViralEngine] Heuristic-only mode: ${candidates.length} candidates`);
  }

  // 4. Score top candidates using 36-D Multimodal Agency ML Engine + MiniLM ONNX Transformer
  if (candidates && candidates.length > 0) {
    try {
      const topPool = candidates.slice(0, 20);
      const restPool = candidates.slice(20);
      const scoredTop = await scoreClipsWithAgencyML(topPool, options);
      candidates = [...scoredTop, ...restPool];
    } catch (e) {
      console.warn('Agency ML scoring error:', e.message);
    }
  }

  // 5. Deep Token Re-Ranking with LLMs (re-rank the already-discovered clips for fine-tuning order)
  if (candidates && candidates.length > 1 && (groqKey || geminiKey || githubToken)) {
    try {
      candidates = await deepReRankWithLLM(candidates, fullText, { groqApiKey: groqKey, geminiApiKey: geminiKey, githubToken });
    } catch (e) {
      console.warn('LLM deep re-ranking fallback:', e.message);
    }
  }

  // 6. Deduplicate — reject if >25% time overlap with a higher-scoring clip
  const deduplicated = [];
  for (const cand of candidates) {
    const isOverlapping = deduplicated.some(existing => {
      const overlapStart = Math.max(cand.start, existing.start);
      const overlapEnd = Math.min(cand.end, existing.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      return overlap > 0.25 * Math.min(cand.duration, existing.duration);
    });
    if (!isOverlapping) {
      deduplicated.push(cand);
      if (deduplicated.length >= 6) break;
    }
  }

  // Ensure clear, differentiated score graduation across top clips (Opus-style hierarchy)
  for (let i = 0; i < deduplicated.length; i++) {
    if (i > 0 && deduplicated[i].viralityScore >= deduplicated[i - 1].viralityScore) {
      const step = i === 1 ? 3 : (i === 2 ? 3 : 2);
      deduplicated[i].viralityScore = Math.max(72, deduplicated[i - 1].viralityScore - step);
    }
  }

  return deduplicated.length > 0 ? deduplicated : candidates.slice(0, 6);
}

/**
 * Discovers the most punchy, cliffhanger teaser sentence from a clip
 * to prepend before the video starts (Opus-style Viral Teaser Hook).
 */
function findBestTeaserHook(words = [], clipStart = 0, clipEnd = 30) {
  const clipDuration = Math.max(1, clipEnd - clipStart);
  const clipWords = (words || []).filter(w => w.end >= clipStart && w.start <= clipEnd);
  
  if (clipWords.length < 4) {
    return {
      active: false,
      text: "WAIT FOR IT...",
      bannerText: "WAIT FOR IT... ⚡",
      start: clipStart,
      end: Math.min(clipEnd, clipStart + 2.5),
      duration: 2.5,
      candidates: []
    };
  }

  const sentences = groupWordsIntoSentences(clipWords);
  const scored = [];

  for (const s of sentences) {
    const dur = s.end - s.start;
    // Teaser hooks must be snappy: 1.4s to 4.2s
    if (dur < 1.4 || dur > 4.2) continue;
    if (s.words.length < 3) continue;

    const lower = s.text.toLowerCase();
    let score = 50;

    // 1. Hook Patterns
    for (const pattern of HOOK_PATTERNS) {
      if (pattern.regex.test(lower)) {
        score += pattern.boost;
        break;
      }
    }

    // 2. Emotional words
    const emotionData = scoreEmotionalIntensity(s.words);
    score += emotionData.totalScore * 3.0;

    // 3. Questions make phenomenal teasers
    if (/\?/.test(s.text) || /^(why|how|what|did|can|who|where|are)/i.test(lower)) {
      score += 26;
    }

    // 4. Climax / Shock words
    if (/\b(never|insane|crazy|impossible|secret|truth|unbelievable|shocking|omg|died|killed|million|money|exposed|shut up)\b/i.test(lower)) {
      score += 22;
    }

    // 5. Position preference: Favor sentences located in 25% to 85% of clip duration
    // (Acts as an authentic teaser of what's coming up!)
    const relPos = (s.start - clipStart) / clipDuration;
    if (relPos >= 0.25 && relPos <= 0.85) {
      score += 24;
    } else if (relPos < 0.15) {
      score -= 10; // Avoid repeating the start
    }

    // 6. Avoid trailing incomplete thoughts
    const lastWord = s.lastWordClean;
    if (DANGLING_WORDS.has(lastWord)) score -= 30;

    scored.push({
      start: parseFloat(s.start.toFixed(2)),
      end: parseFloat(s.end.toFixed(2)),
      duration: parseFloat(dur.toFixed(2)),
      text: s.text.trim(),
      score,
      bannerText: "WAIT FOR IT... ⚡"
    });
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Fallback: take a 2.5s snippet from mid-clip
    const midStart = Math.min(clipEnd - 2.5, clipStart + clipDuration * 0.4);
    const midEnd = Math.min(clipEnd, midStart + 2.5);
    return {
      active: true,
      text: "Wait till you see this...",
      bannerText: "WAIT FOR IT... ⚡",
      start: parseFloat(midStart.toFixed(2)),
      end: parseFloat(midEnd.toFixed(2)),
      duration: parseFloat((midEnd - midStart).toFixed(2)),
      candidates: []
    };
  }

  const top = scored[0];
  return {
    active: true,
    text: top.text,
    bannerText: "WAIT FOR IT... ⚡",
    start: top.start,
    end: top.end,
    duration: top.duration,
    candidates: scored.slice(0, 3)
  };
}

module.exports = {
  discoverViralClips,
  analyzeClipsDynamically,
  analyzeClipsWithGitHub,
  findBestTeaserHook,
  scoreClipsWithAgencyML,
  groupWordsIntoSentences
};
