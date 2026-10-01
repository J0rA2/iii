"""
Physical Acoustic Waveform Analyzer
Extracts high-resolution audio envelope features directly from the 16kHz WAV file.
Provides grounded physical signals for energy, vocal dynamics, and climax punch.
"""

import os
import numpy as np
from scipy.io import wavfile

_AUDIO_CACHE = {}

def load_audio_memmap(wav_path):
    """
    Loads or caches audio waveform as float32 normalized mono array.
    Uses memory-efficient caching.
    """
    if not wav_path or not os.path.exists(wav_path):
        return None, 16000

    if wav_path in _AUDIO_CACHE:
        return _AUDIO_CACHE[wav_path]

    try:
        sr, data = wavfile.read(wav_path)
        if data.ndim > 1:
            data = data[:, 0]
        
        # Convert to float32 normalized to [-1.0, 1.0]
        max_val = np.max(np.abs(data))
        if max_val > 0:
            norm_data = data.astype(np.float32) / float(max_val)
        else:
            norm_data = data.astype(np.float32)
            
        # Limit cache size to 4 files to prevent memory leak
        if len(_AUDIO_CACHE) >= 4:
            _AUDIO_CACHE.clear()
            
        _AUDIO_CACHE[wav_path] = (norm_data, sr)
        return norm_data, sr
    except Exception as e:
        return None, 16000


def analyze_acoustic_slice(wav_path, start_sec, end_sec):
    """
    Extracts 4 physical acoustic signals from a time slice:
    1. rms_energy: Mean RMS vocal power (0.0 to 1.0)
    2. dynamic_range: Peak-to-RMS ratio (measures vocal punch vs monotone droning)
    3. climax_boost: Relative volume burst in the final 25% of the clip vs initial 75%
    4. silence_ratio: Proportion of quiet frames (dead air)
    """
    data, sr = load_audio_memmap(wav_path)
    if data is None or len(data) == 0:
        return {
            'rms_energy': 0.35,
            'dynamic_range': 3.0,
            'climax_boost': 1.0,
            'silence_ratio': 0.08
        }

    start_idx = max(0, int(start_sec * sr))
    end_idx = min(len(data), int(end_sec * sr))
    
    if start_idx >= end_idx:
        return {
            'rms_energy': 0.35,
            'dynamic_range': 3.0,
            'climax_boost': 1.0,
            'silence_ratio': 0.08
        }

    clip_audio = data[start_idx:end_idx]
    if len(clip_audio) == 0:
        return {
            'rms_energy': 0.35,
            'dynamic_range': 3.0,
            'climax_boost': 1.0,
            'silence_ratio': 0.08
        }

    # 1. RMS Energy
    rms = float(np.sqrt(np.mean(clip_audio ** 2)))
    
    # 2. Dynamic Crest Factor (peak to RMS)
    peak = float(np.max(np.abs(clip_audio)))
    crest_factor = float(peak / (rms + 1e-5))
    crest_factor = min(12.0, max(1.0, crest_factor))

    # 3. Climax Boost (final 25% vs first 75%)
    split_pt = int(len(clip_audio) * 0.75)
    first_part = clip_audio[:split_pt]
    final_part = clip_audio[split_pt:]
    
    rms_first = float(np.sqrt(np.mean(first_part ** 2))) if len(first_part) > 0 else rms
    rms_final = float(np.sqrt(np.mean(final_part ** 2))) if len(final_part) > 0 else rms
    
    climax_boost = float(rms_final / (rms_first + 1e-5))
    climax_boost = min(3.5, max(0.2, climax_boost))

    # 4. Silence Ratio (frames < 8% of max amplitude)
    silence_frames = np.sum(np.abs(clip_audio) < 0.08)
    silence_ratio = float(silence_frames / len(clip_audio))

    # 5. Prosodic Pitch & Vocal Animation (via frame-based Zero-Crossing Rate variance)
    win_size = int(sr * 0.05) # 50ms windows
    if len(clip_audio) >= win_size * 2:
        num_wins = len(clip_audio) // win_size
        zcr_list = []
        for w_idx in range(num_wins):
            w = clip_audio[w_idx * win_size : (w_idx + 1) * win_size]
            zcr = np.sum(np.abs(np.diff(np.signbit(w)))) / (2.0 * len(w))
            zcr_list.append(zcr)
        prosodic_var = float(np.std(zcr_list)) if len(zcr_list) > 1 else 0.035
    else:
        prosodic_var = 0.035

    return {
        'rms_energy': round(rms, 4),
        'dynamic_range': round(crest_factor, 2),
        'climax_boost': round(climax_boost, 3),
        'silence_ratio': round(silence_ratio, 3),
        'prosodic_var': round(prosodic_var, 4)
    }
