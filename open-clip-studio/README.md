<p align="center">
  <img src="https://img.shields.io/badge/100%25-FREE%20%26%20OPEN--SOURCE-00C853?style=for-the-badge&logo=open-source-initiative&logoColor=white" alt="Free & Open Source" />
  <img src="https://img.shields.io/badge/No%20API%20Keys%20Required-local%20AI-7C4DFF?style=for-the-badge&logo=robot&logoColor=white" alt="Local AI" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

<h1 align="center">🎬 OpenClip Studio</h1>
<h3 align="center">Free & Unlimited AI Video Repurposing — Your Open-Source Opus Clip Alternative</h3>

<p align="center">
  Turn any long-form video (podcasts, streams, interviews, debates) into <strong>viral 9:16 vertical shorts</strong> with AI-powered clipping, auto-framing, kinetic captions, and one-click export — <strong>100% free, forever, no watermarks, no limits.</strong>
</p>

---

## ✨ What Is OpenClip Studio?

OpenClip Studio is a fully local, self-hosted video repurposing platform that does everything paid tools like Opus Clip, Vizard, and Descript do — but **completely free**, running on your own hardware. No cloud costs, no API quotas, no watermarks.

**Drop in a video (or paste a YouTube link) → Get 5 ranked viral clips → Customize captions & framing → Export in 1080×1920.**

---

## 🔥 Key Features

| Feature | Details |
|---------|---------|
| **🧠 AI Viral Clip Discovery** | Context-aware algorithm finds the most engaging, complete-narrative moments (30–45s) with hook detection, sentiment scoring, engagement-pause analysis, and speaker-turn tracking |
| **🎙️ Local Whisper Transcription** | Faster-Whisper (INT8 quantized) runs entirely on CPU — no cloud APIs needed. Word-level timestamps for pixel-perfect subtitle sync |
| **🎯 AI Subject Tracking** | YOLOv8n ONNX model detects speakers and tracks their position across frames for intelligent 9:16 reframing |
| **👥 Dual-Speaker Split-Screen** | Opus Clip-style stacked top/bottom layout — automatically crops each speaker into their own panel with a styled divider |
| **✂️ Smart Jump-Cut Engine** | Detects dead air (>0.5s silences), generates jump-cut manifests, and maps SFX cue points (vine boom, whoosh, etc.) |
| **💬 Kinetic Captions** | Multiple subtitle styles (Hormozi, MrBeast, Minimal, Neon, Typewriter) with word-by-word highlight animation and emoji triggers |
| **📥 YouTube/URL Import** | Paste any YouTube, Vimeo, or direct video URL — `yt-dlp` handles the download automatically |
| **🎨 Full Studio Editor** | Real-time preview, caption styling, reframe mode selection, SFX mixing, and export controls in a premium dark-mode UI |
| **📤 One-Click Export** | Renders production-ready 1080×1920 MP4 with burned subtitles, H.264/AAC encoding, and optional SFX overlay |
| **🔓 No Limits** | No watermarks, no video length caps, no monthly quotas. Process as many videos as you want |

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT (React + Vite)                  │
│                                                          │
│  IngestionZone → ProcessingStatus → ClipList → Studio    │
│                                                          │
│  Components:                                             │
│  • IngestionZone.jsx   — Upload / YouTube URL / Samples  │
│  • ProcessingStatus.jsx — Real-time pipeline progress    │
│  • ClipList.jsx        — Ranked viral clips with scores  │
│  • StudioEditor.jsx    — Full editor with live preview   │
│  • ExportModal.jsx     — Render progress & download      │
│  • ApiSettingsModal.jsx — Optional AI key configuration  │
│  • Header.jsx          — App header & navigation         │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP REST API (port 5000)
┌──────────────────────▼───────────────────────────────────┐
│                   SERVER (Express.js)                     │
│                                                          │
│  server.js — API routes & middleware                     │
│                                                          │
│  Services:                                               │
│  ├── ffmpegService.js      — Video probe, normalize,    │
│  │                           crop, render, preview       │
│  ├── transcribeService.js  — Whisper orchestration,     │
│  │                           Groq API fallback           │
│  ├── transcribe_local.py   — Faster-Whisper INT8 on CPU │
│  ├── viralityService.js    — AI clip discovery engine   │
│  ├── subtitleService.js    — ASS subtitle generation    │
│  ├── jumpCutService.js     — Dead-air removal & SFX     │
│  ├── downloaderService.js  — yt-dlp URL downloads       │
│  ├── tracker_local.py      — YOLOv8n ONNX tracking     │
│  └── generate_sfx.py       — Procedural SFX synthesis   │
│                                                          │
│  Config:                                                 │
│  └── hookPhrases.json      — Custom hook phrase config   │
└──────────────────────────────────────────────────────────┘
```

---

## 🧠 How the AI Clipping Engine Works

The core differentiator of OpenClip Studio is its **context-aware viral clip discovery** engine. Here's exactly how it selects engaging moments:

### 1. Transcription (Word-Level Timestamps)

The input video's audio is extracted to 16 kHz WAV and fed to **Faster-Whisper** (CTranslate2 INT8 quantization) running locally on CPU. This produces word-level timestamps with ~50ms accuracy — no cloud APIs required.

```
"What" → 88.12s – 88.34s
"does" → 88.34s – 88.52s  
"your" → 88.52s – 88.71s
"sign" → 88.71s – 88.95s
"mean?" → 88.95s – 89.20s
```

### 2. Sentence Boundary Detection

Words are grouped into **complete grammatical thoughts** using:
- Terminal punctuation (`.` `?` `!`)
- Natural pause boundaries (>0.85s gap between words)
- Dangling-word protection — never breaks on connectors like "and", "but", "the"

### 3. Engagement Scoring

Each candidate clip window (30–45 seconds) is scored on multiple axes:

| Signal | Weight | Description |
|--------|--------|-------------|
| **Hook Type** | +12 to +18 | Question hooks, bold statements, personal stories, thought-provoking topics |
| **Speaker Turns** | +1 to +5 | Dialogue exchanges (pronoun detection: "you", "I", "we") indicate conversation |
| **Pause Emphasis** | +2 per pause | Pauses >0.8s suggest dramatic emphasis or turn-taking |
| **Sentiment** | ±2 per word | Positive words (amazing, love, wow) boost; negative words (hate, terrible) add intensity |
| **Payoff Quality** | +6 to +12 | Does the clip end with a resolution? ("believe", "peace", "solution", period/question mark) |
| **Dialogue Completeness** | +10 | Contains both a question AND an answer/explanation |
| **Pacing (WPM)** | +6 | Optimal speech rate: 115–180 words per minute |
| **Banter Penalty** | –20 to skip | Stream setup, mic checks, small talk ("check check", "can you hear me") are discarded |
| **Generic Intro Penalty** | –20 | "What's up everybody", "welcome back" in first 60 seconds |

### 4. Context Expansion

After identifying a strong clip, the engine attempts to **expand** it by adding one sentence before (for better hook setup) or after (for payoff/conclusion) — as long as the result stays within the 30–45s target window.

### 5. Deduplication

Overlapping candidates (>30% time overlap) are merged, keeping only the highest-scoring version.

### 6. Optional LLM Enhancement

If a Groq or Gemini API key is provided, the engine can alternatively use **Llama-3.3 70B** or **Gemini 1.5 Flash** for even smarter clip selection — but the local algorithm produces great results without any API keys.

---

## 🎬 Reframing Modes

OpenClip Studio supports four reframing modes for converting 16:9 source video into 9:16 vertical shorts:

| Mode | Description |
|------|-------------|
| **🎯 Smart Track** | AI tracks the primary speaker's horizontal position and dynamically crops a 1080px-wide window around them |
| **👥 Split Stacked** | Opus Clip-style dual-speaker layout: two 1080×960 panels stacked vertically with a styled divider |
| **📐 Center Crop** | Simple center crop — fast and reliable for talking-head content |
| **🌫️ Blur Fill** | Frosted glass background (10x downscale + boxblur) with the original video overlaid in the center |

---

## 💬 Caption Styles

| Style | Look |
|-------|------|
| **Hormozi** | Bold white text with yellow keyword highlights and black outline — the Alex Hormozi signature look |
| **MrBeast** | Heavy impact font with colored word-by-word pop animations |
| **Minimal** | Clean, thin white text — modern and unobtrusive |
| **Neon** | Glowing colored text with soft shadow — eye-catching on dark backgrounds |
| **Typewriter** | Monospaced font with character-by-character reveal animation |

All styles support **emoji triggers** — when specific keywords appear (money 💸, AI 🤖, fire 🔥, brain 🧠, etc.), the corresponding emoji is automatically inserted.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Required | Install |
|------|----------|---------|
| **Node.js** | v18+ | [nodejs.org](https://nodejs.org/) |
| **Python 3** | 3.9+ | Usually pre-installed on Linux/macOS |
| **FFmpeg** | Latest | `sudo apt install ffmpeg` or `brew install ffmpeg` |
| **yt-dlp** | Latest | `pip install yt-dlp` (for YouTube URL imports) |

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/paragbml/open-clip-studio.git
cd open-clip-studio

# 2. Install server dependencies
npm install

# 3. Install client dependencies
npm --prefix client install

# 4. Install Python AI dependencies
pip install faster-whisper onnxruntime numpy

# 5. (Optional) Download YOLOv8n model for subject tracking
python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download('s1777/yolo-v8n-onnx', 'yolov8n.onnx')
"

# 6. Start development servers (client + server)
npm run dev
```

The app will be available at **http://localhost:5173** (client) with the API server on **http://localhost:5000**.

### Optional: AI API Keys

Create a `.env` file in the project root for enhanced clip discovery:

```env
# Optional — local AI works great without these
GROQ_API_KEY=gsk_your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
```

---

## 📁 Project Structure

```
open-clip-studio/
├── package.json              # Root package with dev scripts
├── .gitignore
├── .env                      # (Optional) API keys
│
├── client/                   # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx          # App entry point
│       ├── App.jsx           # Root component & view routing
│       ├── App.css           # App-level styles
│       ├── index.css         # Global design system
│       └── components/
│           ├── Header.jsx          # Top navigation bar
│           ├── IngestionZone.jsx   # Video upload / URL paste
│           ├── ProcessingStatus.jsx # Pipeline progress UI
│           ├── ClipList.jsx        # Ranked clip cards
│           ├── StudioEditor.jsx    # Full clip editor
│           ├── ExportModal.jsx     # Render & download dialog
│           └── ApiSettingsModal.jsx # API key configuration
│
└── server/                   # Express.js backend
    ├── server.js             # API routes & middleware
    ├── config/
    │   └── hookPhrases.json  # Customizable hook phrases
    ├── services/
    │   ├── ffmpegService.js       # Video processing pipeline
    │   ├── transcribeService.js   # Transcription orchestrator
    │   ├── transcribe_local.py    # Faster-Whisper engine
    │   ├── viralityService.js     # AI clip discovery engine
    │   ├── subtitleService.js     # ASS subtitle generator
    │   ├── jumpCutService.js      # Dead-air & SFX engine
    │   ├── downloaderService.js   # yt-dlp URL downloader
    │   ├── tracker_local.py       # YOLOv8n subject tracker
    │   └── generate_sfx.py        # Procedural SFX synthesis
    ├── uploads/              # (gitignored) Uploaded videos
    ├── exports/              # (gitignored) Rendered clips
    ├── samples/              # (gitignored) Sample videos
    └── assets/
        └── sfx/              # Sound effect WAV files
```

---

## 🔌 API Reference

All endpoints are served from `http://localhost:5000`.

### Core Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload a video file (up to 4GB) |
| `POST` | `/api/download-url` | Download from YouTube/Vimeo URL |
| `POST` | `/api/process` | Run full pipeline: probe → transcribe → discover clips |
| `POST` | `/api/render-clip` | Render a final 1080×1920 short with captions & SFX |

### Utilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Health check & capability report |
| `GET` | `/api/samples` | List available sample videos |
| `GET` | `/api/stream?path=...` | HTTP 206 range-request video streaming |
| `GET` | `/api/clip-preview?filePath=...&startTime=...&duration=...` | Generate lightweight clip preview MP4 |
| `GET` | `/api/clip-tracking?filePath=...&startTime=...&duration=...` | Run YOLOv8n subject tracking |
| `POST` | `/api/jump-cuts` | Calculate jump-cut segments & SFX events |

### Example: Full Pipeline

```bash
# 1. Upload a video
curl -X POST http://localhost:5000/api/upload \
  -F "video=@my_podcast.mp4"

# Response: { "success": true, "filePath": "/path/to/upload.mp4", ... }

# 2. Process (transcribe + find viral clips)
curl -X POST http://localhost:5000/api/process \
  -H "Content-Type: application/json" \
  -d '{ "filePath": "/path/to/upload.mp4" }'

# Response: { "clips": [{ "start": 88.0, "end": 124.0, "viralityScore": 98, ... }] }

# 3. Render a clip
curl -X POST http://localhost:5000/api/render-clip \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/path/to/upload.mp4",
    "startTime": 88.0,
    "duration": 36.0,
    "reframeMode": "smart_track",
    "burnSubtitles": true,
    "words": [...]
  }'

# Response: { "downloadUrl": "/exports/openclip_xxx.mp4" }
```

---

## ⚙️ Configuration

### Hook Phrases (`server/config/hookPhrases.json`)

Customize which phrases the AI considers as strong hooks. Clips starting with these phrases get a +12 virality score boost:

```json
[
  "can you explain",
  "what does",
  "the truth is",
  "here's the thing",
  "nobody talks about",
  "let me tell you"
]
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | API server port |
| `GROQ_API_KEY` | — | Optional Groq API key for Llama-3 clip analysis |
| `GEMINI_API_KEY` | — | Optional Gemini API key for enhanced analysis |
| `FFMPEG_PATH` | `ffmpeg` | Custom FFmpeg binary path |
| `FFPROBE_PATH` | `ffprobe` | Custom FFprobe binary path |
| `YTDLP_PATH` | `~/.local/bin/yt-dlp` | Custom yt-dlp binary path |

---

## 🤝 vs. Opus Clip (Comparison)

| Feature | Opus Clip (Pro $19/mo) | OpenClip Studio (Free) |
|---------|----------------------|----------------------|
| Clip Discovery | AI (cloud) | AI (local + optional LLM) |
| Virality Scoring | ✅ | ✅ Context + sentiment + engagement |
| Dual-Speaker Split | ✅ | ✅ Stacked top/bottom |
| Subject Tracking | ✅ (cloud GPU) | ✅ YOLOv8n on CPU |
| Kinetic Captions | ✅ | ✅ 5 styles + emoji triggers |
| YouTube Import | ✅ | ✅ via yt-dlp |
| Monthly Limit | 100–300 mins | **Unlimited** |
| Watermark | On free plan | **Never** |
| Data Privacy | Cloud upload | **100% local** |
| Price | $19–$39/month | **$0 forever** |

---

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite 8, Lucide React icons, Canvas Confetti
- **Backend:** Node.js, Express 4, Multer
- **Video Processing:** FFmpeg (probe, crop, render, subtitle burn)
- **Transcription:** Faster-Whisper (CTranslate2 INT8 on CPU)
- **Object Detection:** YOLOv8n via ONNX Runtime
- **URL Downloads:** yt-dlp
- **Optional LLMs:** Groq (Llama-3.3 70B), Google Gemini 1.5 Flash

---

## 📜 License

MIT License — do whatever you want with it. Free forever.

---

<p align="center">
  <strong>Built with ❤️ as a free alternative to expensive video clipping tools.</strong>
  <br />
  <em>If this helped you, consider giving it a ⭐ on GitHub!</em>
</p>
