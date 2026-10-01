# 🚀 Clipso Studio / OpenClip Studio Production Hosting Guide

This guide explains how to host **Clipso Studio** for your website (`clipso.fun`) with full native performance, YouTube URL ingestion, 1080×1920 exports, and AI face tracking.

---

## 🛑 Why the "In-Browser (Client-Only)" Approach Fails

GPT Astra attempted to convert the studio into an in-browser WASM application because it assumed Hugging Face or serverless hosts couldn't run a backend. Here is why purely client-side video processing cannot work for a production OpusClip alternative:

1. **Memory Exhaustion (Browser Tab Crashes)**:
   - A compressed 500MB MP4 expands to **8.3 MB per uncompressed frame** in RAM. A 10–30 minute video decompresses into hundreds of gigabytes of frame data. Browser tabs have a strict 2GB–4GB memory limit, causing immediate browser tab crashes (OOM killer) on laptops and phones.
2. **YouTube Security & CORS Blocking**:
   - Web browsers enforce the **Same-Origin Policy (CORS)**. A browser cannot download YouTube video streams directly without a backend proxy.
3. **Slow Single-Threaded WASM AI**:
   - Running Whisper and sentence transformers inside browser WASM on CPU is single-threaded, taking 10–20 minutes to transcribe a 5-minute video and overheating mobile devices.
4. **Warped Resolution & Missing Features**:
   - WASM canvas export was limited to **606×1080**, missing true vertical 1080×1920 resolution, OpenCV YuNet face tracking, dynamic deadband camera framing, and meme SFX mixing.

> **Every real video repurposing SaaS (Opus Clip, Vizard, Munch, CapCut) runs a dedicated backend server for video decoding, AI tracking, and FFmpeg encoding.**

---

## 🛠️ Deployment Options for `clipso.fun`

We have configured the repository with a universal **`Dockerfile`** and **`docker-compose.yml`** that packages both the frontend React client and the backend Node.js + Python + FFmpeg service into a single container running on port `7860` (or your custom port).

---

### Method 1: 100% Free Hosting on Hugging Face Docker Spaces (Recommended)

Hugging Face Spaces provides **FREE Docker Spaces with 16 GB RAM, 2 vCPUs, and 50 GB storage**!

1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) and click **"Create new Space"**.
2. Space Name: `clipso-studio` (or your preferred name).
3. Select **Space SDK**: **Docker** -> **Blank**.
4. Space Hardware: Select **Free (2 vCPU, 16 GB RAM)**.
5. In your repository on GitHub:
   - Push our updated code (`Dockerfile`, `server/requirements.txt`, etc.).
   - In your Hugging Face Space settings, connect your GitHub repo (or push directly to the HF Space git remote).
6. Hugging Face will automatically build the Dockerfile and launch the app at:
   `https://<your-username>-clipso-studio.hf.space`
7. **Connect to `clipso.fun`**:
   - In Cloudflare or your DNS provider for `clipso.fun`, add a CNAME record:
     - Name: `studio` (so the URL is `studio.clipso.fun`)
     - Target: `<your-username>-clipso-studio.hf.space`
   - Or embed it directly into your `clipso.fun` homepage via an iframe.

---

### Method 2: Dedicated Cloud VPS ($4–$6/month on Hetzner or DigitalOcean)

For the absolute highest speed (sub-second downloads, instant AI face tracking, and zero rate limits), a cheap Linux VPS is ideal:

1. **Spin up an Ubuntu 22.04 / 24.04 VPS**:
   - **Hetzner Cloud** (CX22 / CPX21: ~€4–€7/mo for 4GB–8GB RAM) or **DigitalOcean Droplet** ($6/mo).
2. **SSH into your server and install Docker**:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose git
   ```
3. **Clone the repository**:
   ```bash
   git clone https://github.com/paragbml/open-clip-studio.git
   cd open-clip-studio
   ```
4. **Launch with Docker Compose**:
   ```bash
   sudo docker compose up -d --build
   ```
   The application is now running locally on port `5000`.
5. **Set up Nginx & SSL for `clipso.fun`**:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```
   Create `/etc/nginx/sites-available/clipso.fun`:
   ```nginx
   server {
       server_name clipso.fun studio.clipso.fun;

       client_max_body_size 2000M;

       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 600s;
           proxy_send_timeout 600s;
       }
   }
   ```
   Enable site and get free SSL certificate:
   ```bash
   sudo ln -s /etc/nginx/sites-available/clipso.fun /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d clipso.fun -d studio.clipso.fun
   ```

---

### Method 3: One-Click Cloud Deploy (Render / Railway / Fly.io)

1. **Render.com** (uses `render.yaml`):
   - New -> **Blueprint** -> select this repository. Render reads `render.yaml`
     (Docker runtime, health check `/healthz`).
   - Plan: **Standard (2 GB)**. Whisper + FFmpeg peak around 450 MB during a render,
     so 512 MB plans (Free / Starter) are likely to run out of memory.
   - `PORT` is injected by Render; the server binds `0.0.0.0:$PORT`.
   - Optional env vars: `GROQ_API_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `YOUTUBE_COOKIES_BASE64`.
   - Open `https://<service-name>.onrender.com` (works on iPhone Safari).
2. **Railway.app**:
   - New Project -> **Deploy from GitHub repo**.
   - Railway detects the `Dockerfile` and deploys automatically.
   - In Settings -> Domains, attach `studio.clipso.fun`.

---

## ⚡ Summary of Changes Made to Fix Hosting
- Created production **`Dockerfile`** with bundled Python 3.11, OpenCV C++, Faster-Whisper, FFmpeg, and yt-dlp.
- Updated **`server/server.js`** to automatically serve the built React frontend when in production.
- Added **`docker-compose.yml`** for 1-command deployment.
- Fixed **`isServerAvailable`** in `StudioEditor.jsx` so self-hosted domains (like `clipso.fun`) automatically connect to the backend without requiring manual configuration.
- Made **`tracker_local.py`** and **`downloaderService.js`** auto-resolve paths and auto-download model weights on fresh containers.
