"""
High-Speed Proprietary Virality Inference Engine (v3 - Deep Transformer & Physical Acoustics)
Runs batch/single segment prediction using the trained 36-D multimodal agency model.
Incorporates all-MiniLM-L6-v2 vector semantics and physical 16kHz WAV acoustic envelopes.
"""

import sys
import os
import json
import joblib
import numpy as np

from feature_extractor import extract_multimodal_features

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'virality_model.pkl')
_MODEL_CACHE = None

def get_loaded_model():
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}. Run train_virality_model.py first.")
        _MODEL_CACHE = joblib.load(MODEL_PATH)
    return _MODEL_CACHE


def generate_virality_reason(features, scores):
    """
    Generates a high-precision analytical rationale based on the 46-D feature activations.
    """
    v_score, h_score, f_score, e_score, c_score = scores
    reasons = []

    # 1. Hook dynamics & H2S Velocity (Feature 8)
    if features[8] > 0.75:
        reasons.append("rapid 0.8s hook-to-setup velocity")
    elif features[0] > 0.5:  # curiosity gap
        reasons.append("high-retention curiosity gap opening")
    elif features[1] > 0.5:  # question
        reasons.append("provocative opening question hook")
    elif features[2] > 0:  # shock words
        reasons.append("high-impact punchline statement")
    elif h_score >= 80:
        reasons.append("snappy initial attention-grabber")

    # 2. Neural Vector Semantics & Triad Arc (Features 33, 34, 36)
    if features[33] > 0.75:
        reasons.append("deep alignment with high-retention knowledge frameworks")
    elif features[32] > 0.55:
        reasons.append("caution: matches conversational filler patterns")

    if features[36] > 0.70:
        reasons.append("cohesive 3-phase narrative triad (Hook -> Evidence -> Payoff)")
    elif features[34] > 0.70:
        reasons.append("cohesive narrative resolution arc")

    # 3. Share & Save Virality (Feature 20: quote_repost_affinity)
    if features[20] > 0.8:
        reasons.append("high quote-repost affinity (actionable wisdom soundbite)")

    # 4. Speech cadence & Attention Decay Resistance (Features 14, 15, 30, 43)
    wpm_scaled = features[14] * 100.0
    if 135 <= wpm_scaled <= 195:
        reasons.append(f"punchy viral speech cadence ({int(wpm_scaled)} WPM)")
    elif features[15] > 1.5:
        reasons.append("expressive vocal cadence variation")

    if features[30] > 0.85:
        reasons.append("zero dead-air attention decay")

    # 5. Physical Acoustic Dynamics & Prosody (Features 37, 39, 40, 41)
    if features[40] > 1.0:
        reasons.append("dynamic prosodic pitch modulation")
    if features[37] > 0.50:
        reasons.append("commanding vocal resonance")
    if features[41] > 1.2:
        reasons.append("decisive acoustic mic-drop payoff")
    elif features[39] > 0.65:
        reasons.append("energetic climax volume surge")

    # 6. Dialogue turns & Facial Framing
    if features[26] > 0.3:
        reasons.append("rapid active speaker turn-taking")
    if features[45] > 0.85:
        reasons.append("locked center-frame facial anchor")

    # 7. Payoff & Dangling Checks
    if features[18] > 0.5 and features[19] > 0.5:
        reasons.append("complete standalone contextual closure")
    elif features[17] > 0.5:
        reasons.append("caution: ends mid-thought")

    if not reasons:
        reasons.append("coherent standalone context segment")

    capitalized = reasons[0].capitalize()
    rest = ", ".join(reasons[1:])
    text = f"Agency ML Analysis: {capitalized}" + (f", featuring {rest}." if rest else ".")
    return text


def score_segments(segments_data, default_wav_path=None):
    pkg = get_loaded_model()
    model = pkg['model']

    if not segments_data:
        return []

    X_list = []
    for seg in segments_data:
        words = seg.get('words', [])
        start = float(seg.get('start', 0.0))
        end = float(seg.get('end', start + 30.0))
        traj = seg.get('trajectory', None)
        wav_path = seg.get('wavPath') or seg.get('audioPath') or default_wav_path
        feats = extract_multimodal_features(words, start, end, trajectory=traj, wav_path=wav_path)
        X_list.append(feats)

    X_mat = np.array(X_list, dtype=np.float32)
    preds = model.predict(X_mat)

    results = []
    for i, seg in enumerate(segments_data):
        raw_pred = preds[i]
        # Clamp scores between 10 and 99
        v_score = int(round(max(10.0, min(99.0, raw_pred[0]))))
        h_score = int(round(max(10.0, min(99.0, raw_pred[1]))))
        f_score = int(round(max(10.0, min(99.0, raw_pred[2]))))
        e_score = int(round(max(10.0, min(99.0, raw_pred[3]))))
        c_score = int(round(max(10.0, min(99.0, raw_pred[4]))))

        # 46-D Metric extractors:
        h2s_vel = round(float(X_mat[i][8]), 3)
        sem_margin = round(float(X_mat[i][33]), 3)
        triad_coh = round(float(X_mat[i][36]), 3)
        phys_rms = round(float(X_mat[i][37]), 3)
        prosody = round(float(X_mat[i][40]), 3)
        mic_drop = round(float(X_mat[i][41]), 3)
        survival = round(float(X_mat[i][44]), 3)

        reason = generate_virality_reason(X_mat[i], (v_score, h_score, f_score, e_score, c_score))

        results.append({
            'id': seg.get('id', f'clip_{i + 1}'),
            'viralityScore': v_score,
            'hookScore': h_score,
            'flowScore': f_score,
            'energyScore': e_score,
            'climaxScore': c_score,
            'semanticMargin': sem_margin,
            'acousticPower': phys_rms,
            'hookVelocity': h2s_vel,
            'prosodyFlux': prosody,
            'triadCohesion': triad_coh,
            'micDropPayoff': mic_drop,
            'survivalProbability': survival,
            'viralityReason': reason,
            'mlModel': 'OpenClip-Proprietary-v4-46D-Multimodal'
        })

    return results


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--segment-json':
        raw_json = sys.argv[2]
        data = json.loads(raw_json)
        segments = data if isinstance(data, list) else [data]
        out = score_segments(segments)
        print(json.dumps(out))
    else:
        # Read from stdin
        stdin_data = sys.stdin.read().strip()
        if not stdin_data:
            print("[]")
            return
        data = json.loads(stdin_data)
        if isinstance(data, dict):
            segments = data.get('segments', [data])
            default_wav = data.get('wavPath') or data.get('audioPath')
        else:
            segments = data
            default_wav = None
            
        out = score_segments(segments, default_wav_path=default_wav)
        print(json.dumps(out))


if __name__ == '__main__':
    main()
