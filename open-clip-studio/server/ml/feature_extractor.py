import math
import re
import numpy as np

# Optional imports for deep neural transformer and physical acoustic waveform
try:
    from semantic_scorer import score_candidate_semantics
except ImportError:
    score_candidate_semantics = None

try:
    from acoustic_analyzer import analyze_acoustic_slice
except ImportError:
    analyze_acoustic_slice = None

DANGLING_WORDS = {
    'a', 'an', 'the', 'and', 'but', 'or', 'so', 'because', 'like', 'if',
    'that', 'which', 'with', 'to', 'when', 'as', 'then', 'than', 'of', 'in',
    'on', 'at', 'by', 'for', 'about', 'is', 'are', 'was', 'were', 'my', 'your',
    'their', 'his', 'her', 'our', 'its', 'into', 'from', 'up', 'down', 'out',
    'over', 'under', 'just', 'very', 'really', 'also', 'even', 'who', 'whom'
}

FILLER_WORDS = {
    'um', 'uh', 'like', 'you know', 'sort of', 'kind of', 'i mean',
    'basically', 'literally', 'right', 'actually', 'anyway'
}

CURIOSITY_PATTERNS = [
    # Proven advice, actionable hacks & value bombs (Opus-style core takeaways)
    re.compile(r'\b(the best way to|the most important thing|the secret to|the single biggest|the number one|the key to|how to actually|how you can|here is how)\b', re.I),
    # Curiosity gaps & revelation
    re.compile(r'\b(here\'s why|the reason why|nobody talks about|nobody knows|the truth about|the real reason|this is why|what happens when|you have to understand)\b', re.I),
    # Warnings, mistakes & pattern interrupts
    re.compile(r'\b(stop doing|never do|biggest mistake|worst thing|you won\'t believe|you should never|don\'t ever|huge problem)\b', re.I),
    # Contrarian & paradigm shifts
    re.compile(r'\b(people don\'t realize|everyone thinks|what if i told you|what you have to realize|most people don\'t|most people have heard)\b', re.I),
    # High-stakes conditions & hypotheses
    re.compile(r'\b(if you want to|if you are trying to|if you were going to|when you do this|the moment you|if i give you)\b', re.I)
]

BROKEN_CONTEXT_PATTERNS = [
    re.compile(r'^(why do i say this|notice i didn|these are the things|and then be able to|and that is why|so that is why|as i was saying|like i said|that is a great question|that\'s a great question|in fact this is a broader|of calls do this|well as weird as it may sound|not every single day|and so on and so forth|great so let|why did you start)\b', re.I),
    re.compile(r'^(and then|and also|and that|and so|and but|but then|so then|or then|and right now|so if i give)\b', re.I)
]

SHOCK_WORDS = {
    'insane', 'crazy', 'unbelievable', 'impossible', 'shocking', 'omg', 'no way',
    'mind-blowing', 'wild', 'destroyed', 'killed', 'died', 'million', 'billion',
    'arrested', 'guilty', 'exposed', 'scam', 'conspiracy', 'disaster', 'catastrophe',
    'dangerous', 'unshakeable', 'unbreakable', 'elite', 'collapse', 'spike', 'amplify'
}

EMOTION_BANKS = {
    'surprise': {'wow', 'whoa', 'omg', 'insane', 'crazy', 'unbelievable', 'incredible', 'shocking', 'spike', 'peak'},
    'humor': {'funny', 'hilarious', 'lol', 'laugh', 'joke', 'haha', 'lmao', 'bruh', 'clown'},
    'conflict': {'wrong', 'disagree', 'argue', 'fight', 'versus', 'debate', 'lie', 'liar', 'stupid', 'problem', 'mistake'},
    'authority': {'research', 'study', 'proven', 'data', 'fact', 'expert', 'evidence', 'scientist', 'physiology', 'cortisol', 'hormone', 'melatonin', 'principles'},
    'urgency': {'now', 'today', 'immediately', 'stop', 'must', 'need', 'critical', 'warning', 'important', 'first'}
}

PAYOFF_PATTERNS = [
    re.compile(r'\b(that\'s why|that\'s the reason|and that\'s|at the end of the day|bottom line|the point is|essentially is)\b', re.I),
    re.compile(r'\b(exactly|period|solution|guaranteed|remember that|takeaway|optimal|full spectrum|disappear)\b', re.I)
]

QUOTE_REPOST_PATTERNS = [
    re.compile(r'\b(the only way to|the biggest mistake you|if you (want|don\'t|ever|never)|when you realize|you can never|never let|always remember|nobody is going to|the moment you|the hardest truth|in order to|rule number one|truth is)\b', re.I),
    re.compile(r'\b(changes everything|difference between|will ruin your|makes you dangerous|secret to success|the real reason you)\b', re.I)
]

BANTER_PHRASES = [
    'stream check', 'hair check', 'mic check', 'carry back', 'carry backpack',
    'finish up your copy', 'is it alive', 'can you hear me', 'check check',
    'keep it on me', 'testing mic', 'one two three', 'just making sure',
    'is it on', 'hold on let me', 'turn around', 'adjust the camera',
    'test test', 'sound check', 'chat is this real', 'stream setup', 'can you hear'
]

FEATURE_NAMES = [
    # 1. Hook dynamics & velocity (0-8)
    'hook_curiosity_gap',
    'hook_question_density',
    'hook_shock_words',
    'hook_opening_wpm',
    'hook_first_word_is_filler',
    'hook_pronoun_directness',
    'hook_duration',
    'hook_contrarian_marker',
    'hook_velocity_h2s',               # 8: Hook-to-Setup Velocity (time to core thesis predicate)
    # 2. Lexical, Emotion & Aphorism (9-20)
    'lexical_emotion_surprise',
    'lexical_emotion_humor',
    'lexical_emotion_conflict',
    'lexical_emotion_authority',
    'lexical_emotion_urgency',
    'lexical_total_wpm',
    'lexical_wpm_variance',
    'lexical_filler_ratio',
    'lexical_dangling_end',
    'lexical_terminal_payoff',
    'lexical_payoff_phrase',
    'quote_repost_affinity',           # 20: Transferable aphorism / shareable soundbite density
    # 3. Acoustic Heuristics, Retention & Visual (21-30)
    'acoustic_rms_energy_mean',
    'acoustic_rms_energy_var',
    'acoustic_energy_climax_delta',
    'acoustic_silence_ratio',
    'acoustic_turn_count',
    'visual_speaker_switch_rate',
    'visual_speaker_motion_var',
    'narrative_climax_position',
    'duration_optimality',
    'attention_decay_resistance',      # 30: Resilience against flat monotone stretches
    # 4. Deep Neural Semantic Transformer Features (31-36)
    'neural_semantic_viral_sim',
    'neural_semantic_boring_sim',
    'neural_semantic_margin',
    'neural_discourse_arc',
    'neural_lexical_entropy',
    'neural_semantic_triad_cohesion',  # 36: 3-phase Hook -> Body -> Payoff vector progression
    # 5. Physical Audio Waveform Envelope (37-41)
    'physical_rms_energy',
    'physical_dynamic_range',
    'physical_climax_boost',
    'prosodic_pitch_variation',        # 40: Zero-crossing spectral flux / vocal inflection
    'climax_mic_drop_ratio',           # 41: Terminal sentence acoustic punch vs clip mean
    # 6. Safety Shields, Density & Computer Vision (42-45)
    'stream_banter_shield',            # 42: Stream housekeeping & mic check defense
    'pacing_density_efficiency',       # 43: Content lemma throughput per second
    'viewer_retention_survival_prob',  # 44: Algorithmic 30s viewer survival curve
    'visual_gaze_stability_ratio'      # 45: Spatial facial anchor & centered framing confidence
]


def clean_word(w):
    return re.sub(r'[^a-zA-Z0-9]', '', (w or '').lower())


def extract_multimodal_features(words, clip_start, clip_end, trajectory=None, audio_envelope=None, wav_path=None):
    """
    Extracts the 36-dimensional multimodal feature vector for a video segment.
    Combines lexical hooks, emotional tokens, physical audio waveform, and deep neural vector semantics.
    """
    duration = max(0.5, clip_end - clip_start)
    seg_words = [w for w in (words or []) if w.get('end', 0) >= clip_start and w.get('start', 0) <= clip_end]
    
    if not seg_words:
        return np.zeros(len(FEATURE_NAMES), dtype=np.float32)

    full_text = " ".join([w.get('word', '') for w in seg_words])
    full_text_lower = full_text.lower()
    total_words = len(seg_words)

    # ── 1. Hook Features (First 3.5 seconds) ─────────────────────────────
    hook_limit = clip_start + 3.5
    hook_words = [w for w in seg_words if w.get('start', 0) <= hook_limit]
    hook_text = " ".join([w.get('word', '') for w in hook_words]).lower()
    hook_dur = max(0.4, (hook_words[-1].get('end', hook_limit) - clip_start) if hook_words else 1.0)

    # Expanded Curiosity / Value Thesis detection
    hook_curiosity = 1.0 if any(p.search(hook_text) for p in CURIOSITY_PATTERNS) else 0.0
    
    # Check for question hook - but verify it is NOT an unanswered question that ends right away
    has_opening_q = bool('?' in hook_text or re.match(r'^(why|how|what|did|can|who|where|if)\b', hook_text.strip()))
    has_unanswered_hanging_q = False
    if total_words > 10:
        tail_text = " ".join([w.get('word', '') for w in seg_words[-int(total_words * 0.25):]])
        if '?' in tail_text and ('?' in hook_text or duration < 35.0):
            has_unanswered_hanging_q = True

    # Check for question hook - but verify it is NOT an unanswered question that ends right away
    has_opening_q = bool('?' in hook_text or re.match(r'^(why|how|what|did|can|who|where|if)\b', hook_text.strip()))
    has_unanswered_hanging_q = False
    if total_words > 10:
        tail_text = " ".join([w.get('word', '') for w in seg_words[-int(total_words * 0.25):]])
        if '?' in tail_text and ('?' in hook_text or duration < 35.0):
            has_unanswered_hanging_q = True

    hook_questions = 1.0 if (has_opening_q and not has_unanswered_hanging_q) else (0.2 if has_opening_q else 0.0)
    hook_shock = min(4.0, float(sum(1.0 for w in hook_words if clean_word(w.get('word', '')) in SHOCK_WORDS)))
    raw_hook_wpm = (len(hook_words) / (hook_dur / 60.0)) if hook_dur > 0 else 140.0
    hook_wpm_scaled = min(3.0, max(0.5, raw_hook_wpm / 100.0))

    # Broken anaphoric context check ("Why do I say this", "Notice I didn't say", "And then be able to")
    is_broken_context = any(p.search(full_text_lower[:50]) for p in BROKEN_CONTEXT_PATTERNS)
    hook_first_clean = clean_word(seg_words[0].get('word', ''))
    hook_first_is_filler = 1.0 if (hook_first_clean in {'um', 'uh', 'like', 'so', 'okay', 'yeah', 'well', 'right'} or is_broken_context) else 0.0

    hook_pronoun = 1.0 if re.search(r'\b(you|your|you\'re|we|us|our)\b', hook_text) else 0.0
    hook_contrarian = 1.0 if re.search(r'\b(wrong|lie|myth|actually|disagree|never|nobody|mistake)\b', hook_text) else 0.0

    # 8. Hook-to-Setup Velocity (H2S): Time to first substantive content predicate in opening 2.5s
    h2s_time = None
    for w in hook_words:
        cw = clean_word(w.get('word', ''))
        if len(cw) >= 4 and cw not in DANGLING_WORDS and cw not in FILLER_WORDS and cw not in {'yeah', 'okay', 'well', 'just', 'right'}:
            h2s_time = max(0.0, w.get('start', clip_start) - clip_start)
            break
    if h2s_time is not None:
        hook_velocity_h2s = max(0.0, min(1.0, 1.0 - (h2s_time / 2.5)))
    else:
        hook_velocity_h2s = 0.20

    # ── 2. Lexical & Emotion Features ────────────────────────────────────
    clean_tokens = [clean_word(w.get('word', '')) for w in seg_words]
    
    em_surprise = min(2.5, sum(1.0 for t in clean_tokens if t in EMOTION_BANKS['surprise']) / max(1, total_words) * 20.0)
    em_humor = min(2.5, sum(1.0 for t in clean_tokens if t in EMOTION_BANKS['humor']) / max(1, total_words) * 20.0)
    em_conflict = min(2.5, sum(1.0 for t in clean_tokens if t in EMOTION_BANKS['conflict']) / max(1, total_words) * 20.0)
    em_authority = min(2.5, sum(1.0 for t in clean_tokens if t in EMOTION_BANKS['authority']) / max(1, total_words) * 20.0)
    em_urgency = min(2.5, sum(1.0 for t in clean_tokens if t in EMOTION_BANKS['urgency']) / max(1, total_words) * 20.0)

    raw_total_wpm = (total_words / (duration / 60.0)) if duration > 0 else 140.0
    total_wpm_scaled = min(3.0, max(0.5, raw_total_wpm / 100.0))

    # Pacing variance across sentence blocks
    chunk_wpms = []
    chunk_size = max(4, total_words // 4)
    for i in range(0, total_words, chunk_size):
        chunk = seg_words[i:i + chunk_size]
        if len(chunk) >= 3:
            c_dur = max(0.5, chunk[-1].get('end', 0) - chunk[0].get('start', 0))
            chunk_wpms.append((len(chunk) / (c_dur / 60.0)))
    raw_wpm_var = float(np.std(chunk_wpms)) if len(chunk_wpms) > 1 else 15.0
    wpm_variance_scaled = min(3.0, raw_wpm_var / 25.0)

    filler_count = sum(1.0 for t in clean_tokens if t in FILLER_WORDS)
    filler_ratio_scaled = min(2.0, (filler_count / max(1, total_words)) * 15.0)

    # ── 3. Narrative, Payoff & Aphorism Features ─────────────────────────
    last_word_raw = seg_words[-1].get('word', '').strip()
    last_word_clean = clean_word(last_word_raw)
    dangling_end = 1.0 if last_word_clean in DANGLING_WORDS else 0.0
    terminal_payoff = 1.0 if bool(re.search(r'[.?!]$', last_word_raw)) else 0.0
    payoff_phrase = 1.0 if any(p.search(full_text_lower) for p in PAYOFF_PATTERNS) else 0.0

    # 20. Quote / Aphorism Repost Affinity (Save & Share signal)
    quote_hits = sum(1.0 for p in QUOTE_REPOST_PATTERNS if p.search(full_text_lower))
    quote_repost_affinity = min(2.5, quote_hits * 0.85 + (0.4 if hook_pronoun else 0.0))

    # Payoff text for semantic arc
    payoff_text = " ".join([w.get('word', '') for w in seg_words[-int(max(4, total_words * 0.25)):]])

    # Optimal short duration sweet spot: 28s to 42s
    if 26.0 <= duration <= 45.0:
        duration_optimality = 1.0
    elif 18.0 <= duration < 26.0 or 45.0 < duration <= 55.0:
        duration_optimality = 0.75
    else:
        duration_optimality = 0.4

    # ── 4. Acoustic & Prosodic Features ──────────────────────────────────
    pauses = []
    for i in range(len(seg_words) - 1):
        gap = seg_words[i + 1].get('start', 0) - seg_words[i].get('end', 0)
        if gap > 0:
            pauses.append(gap)
    
    dead_air_pauses = [p for p in pauses if p > 0.45]
    silence_time = sum(dead_air_pauses)
    silence_ratio = min(1.0, silence_time / duration) if duration > 0 else 0.0
    pause_freq = (len(dead_air_pauses) / duration) * 10.0 if duration > 0 else 0.0

    # 30. Attention Decay Resistance: Resilience against dead pauses & flat cadence
    max_dead_gap = max([0.0] + [p for p in pauses if p > 0.6])
    attention_decay_resistance = max(0.1, min(1.0, 1.0 - (max_dead_gap / 6.0)))

    if audio_envelope and len(audio_envelope) > 10:
        rms_mean = float(np.mean(audio_envelope))
        rms_var = float(np.var(audio_envelope))
        climax_start_idx = int(len(audio_envelope) * 0.70)
        climax_end_idx = int(len(audio_envelope) * 0.90)
        climax_rms = float(np.mean(audio_envelope[climax_start_idx:climax_end_idx]))
        mid_rms = float(np.mean(audio_envelope[:climax_start_idx]))
        energy_climax_delta = max(0.0, climax_rms - mid_rms)
    else:
        rms_mean = 0.72
        rms_var = 0.18
        energy_climax_delta = 0.15

    # ── 5. Visual & Active Speaker Features ──────────────────────────────
    if trajectory and len(trajectory) > 2:
        seg_traj = [pt for pt in trajectory if pt.get('t', 0) >= clip_start and pt.get('t', 0) <= clip_end]
        if seg_traj:
            speakers = [pt.get('activeSpeaker', 'center') for pt in seg_traj]
            switches = sum(1.0 for i in range(1, len(speakers)) if speakers[i] != speakers[i - 1])
            switch_rate = (switches / duration) * 10.0 if duration > 0 else 0.0
            mouth_vars = [pt.get('mouthVar', 1.0) for pt in seg_traj]
            motion_var = float(np.mean(mouth_vars)) if mouth_vars else 1.0
            centered_pts = sum(1.0 for pt in seg_traj if 0.28 <= pt.get('x', 0.5) <= 0.72)
            gaze_stability = float(centered_pts / max(1, len(seg_traj)))
        else:
            switch_rate = 0.2
            motion_var = 1.0
            gaze_stability = 0.85
    else:
        switch_rate = 0.25
        motion_var = 1.2
        gaze_stability = 0.85

    climax_position = 0.75

    # ── 6. Deep Neural Semantic Vector Features ──────────────────────────
    # Middle body text (15% to 80% duration) for 3-phase narrative progression
    mid_start_idx = int(max(1, total_words * 0.15))
    mid_end_idx = int(max(mid_start_idx + 1, total_words * 0.80))
    body_text = " ".join([w.get('word', '') for w in seg_words[mid_start_idx:mid_end_idx]])

    if score_candidate_semantics is not None:
        sem = score_candidate_semantics(full_text, hook_text, payoff_text, body_text)
        viral_sim = float(sem['viral_similarity'])
        boring_sim = float(sem['boring_similarity'])
        semantic_margin = float(sem['semantic_margin'])
        discourse_arc = float(sem['discourse_arc'])
        lexical_entropy = float(sem['lexical_density'])
        triad_cohesion = float(sem.get('triad_cohesion', 0.65))
    else:
        viral_sim = 0.5
        boring_sim = 0.2
        semantic_margin = 0.65
        discourse_arc = 0.5
        lexical_entropy = 0.7
        triad_cohesion = 0.65

    # ── 7. Physical Audio Waveform Envelope Features ─────────────────────
    if analyze_acoustic_slice is not None and wav_path:
        ac = analyze_acoustic_slice(wav_path, clip_start, clip_end)
        phys_rms = float(ac['rms_energy'])
        phys_crest = float(ac['dynamic_range'] / 10.0) # scale to ~0-1
        phys_climax = float(ac['climax_boost'] / 2.0)
        prosodic_pitch_var = float(min(2.0, ac.get('prosodic_var', 0.035) * 25.0))
    else:
        phys_rms = 0.35
        phys_crest = 0.30
        phys_climax = 0.50
        prosodic_pitch_var = 0.80

    # 41. Climax Mic Drop Ratio: Terminal sentence acoustic punch vs clip mean
    climax_mic_drop_ratio = min(2.5, (1.2 * terminal_payoff + 0.8 * payoff_phrase) * (phys_climax * 1.5))

    # 42. Stream Banter Shield: Defends against live stream housekeeping
    banter_hits = sum(1.0 for phrase in BANTER_PHRASES if phrase in full_text_lower)
    stream_banter_shield = max(0.0, 1.0 - (banter_hits * 0.45) - (0.35 if is_broken_context else 0.0))

    # 43. Pacing Density Efficiency: Content lemma throughput per second
    content_words_count = sum(1.0 for t in clean_tokens if len(t) >= 4 and t not in DANGLING_WORDS and t not in FILLER_WORDS)
    content_wps = (content_words_count / duration) if duration > 0 else 1.5
    pacing_density_efficiency = min(2.5, max(0.2, content_wps / 1.3))

    # 44. Viewer Retention Survival Probability: Simulated 30-second retention curve
    survival_prob = float(np.clip(
        0.30 * hook_curiosity +
        0.25 * hook_velocity_h2s +
        0.20 * attention_decay_resistance +
        0.15 * (1.0 - silence_ratio) +
        0.10 * stream_banter_shield,
        0.10, 0.99
    ))

    # 45. Visual Gaze Stability Ratio
    visual_gaze_stability = gaze_stability

    features = [
        # 1. Hook dynamics & velocity (0-8)
        hook_curiosity,
        hook_questions,
        hook_shock,
        hook_wpm_scaled,
        hook_first_is_filler,
        hook_pronoun,
        min(8.0, hook_dur),
        hook_contrarian,
        hook_velocity_h2s,
        # 2. Lexical, Emotion & Aphorism (9-20)
        em_surprise,
        em_humor,
        em_conflict,
        em_authority,
        em_urgency,
        total_wpm_scaled,
        wpm_variance_scaled,
        filler_ratio_scaled,
        dangling_end,
        terminal_payoff,
        payoff_phrase,
        quote_repost_affinity,
        # 3. Acoustic Heuristics, Retention & Visual (21-30)
        rms_mean,
        rms_var,
        energy_climax_delta,
        silence_ratio,
        pause_freq,
        switch_rate,
        motion_var,
        climax_position,
        duration_optimality,
        attention_decay_resistance,
        # 4. Deep Neural Semantic Transformer Features (31-36)
        viral_sim,
        boring_sim,
        semantic_margin,
        discourse_arc,
        lexical_entropy,
        triad_cohesion,
        # 5. Physical Audio Waveform Envelope (37-41)
        phys_rms,
        phys_crest,
        phys_climax,
        prosodic_pitch_var,
        climax_mic_drop_ratio,
        # 6. Safety Shields, Density & Computer Vision (42-45)
        stream_banter_shield,
        pacing_density_efficiency,
        survival_prob,
        visual_gaze_stability
    ]

    return np.array(features, dtype=np.float32)
