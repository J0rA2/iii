import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
import os

sfx_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
os.makedirs(sfx_dir, exist_ok=True)
sr = 44100

def write_wav(filename, audio):
    audio = audio / np.max(np.abs(audio) + 1e-8)
    filepath = os.path.join(sfx_dir, filename)
    wavfile.write(filepath, sr, (audio * 32767).astype(np.int16))
    print(f"Generated: {filename} ({len(audio)/sr:.2f}s)")

# 1. Vine Boom: 85Hz -> 32Hz drop, heavy saturation, sub-bass sustain
t_boom = np.linspace(0, 1.4, int(sr * 1.4), endpoint=False)
f_boom = 85.0 * np.exp(-t_boom * 2.8) + 32.0
phase_boom = 2 * np.pi * np.cumsum(f_boom) / sr
boom = np.sin(phase_boom) * np.exp(-t_boom * 2.0)
# Sub-harmonic rumble
boom += 0.4 * np.sin(phase_boom * 0.5) * np.exp(-t_boom * 1.8)
# Saturation distortion
boom = np.tanh(boom * 2.8) * 0.9
# Hard transient thump
t_click = t_boom[:int(sr * 0.06)]
thump = np.sin(2 * np.pi * 140 * t_click) * np.exp(-t_click * 50)
boom[:len(thump)] += thump * 0.6
write_wav("vine_boom.wav", boom)

# 2. Whoosh Transition: Air rush sweep with bandpass filter
t_whoosh = np.linspace(0, 0.45, int(sr * 0.45), endpoint=False)
noise = np.random.normal(0, 1, len(t_whoosh))
env = np.sin(np.pi * t_whoosh / t_whoosh[-1]) ** 2
# Swept bandpass center frequency
b, a = butter(2, [0.03, 0.35], btype='band')
filtered_noise = lfilter(b, a, noise) * env
whoosh = filtered_noise + 0.3 * np.roll(filtered_noise, int(sr * 0.015))
write_wav("whoosh.wav", whoosh)

# 3. Ding: Crystal bell chime (2093Hz C7 with harmonics)
t_ding = np.linspace(0, 0.8, int(sr * 0.8), endpoint=False)
f0 = 2093.0
ding = (
    1.0 * np.sin(2 * np.pi * f0 * t_ding) * np.exp(-t_ding * 6.0) +
    0.5 * np.sin(2 * np.pi * f0 * 2.0 * t_ding) * np.exp(-t_ding * 10.0) +
    0.25 * np.sin(2 * np.pi * f0 * 3.0 * t_ding) * np.exp(-t_ding * 16.0)
)
write_wav("ding.wav", ding)

# 4. Record Scratch: Modulated pitch jitter and abrasive vinyl sweep
t_scratch = np.linspace(0, 0.35, int(sr * 0.35), endpoint=False)
f_scratch = 1200.0 * np.sin(2 * np.pi * 7.0 * t_scratch) + 600.0
phase_scratch = 2 * np.pi * np.cumsum(np.abs(f_scratch)) / sr
carrier = np.sign(np.sin(phase_scratch)) * (np.random.normal(0, 0.4, len(t_scratch)))
env_scratch = np.sin(np.pi * t_scratch / t_scratch[-1]) ** 1.5
scratch = np.tanh(carrier * 2.0) * env_scratch
write_wav("record_scratch.wav", scratch)

print("All streamer SFX synthesized successfully!")
