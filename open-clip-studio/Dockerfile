# syntax=docker/dockerfile:1
#
# OpenClip Studio: production image (Render.com / any Docker host)
#
#   Stage 1 (client-build): builds the React/Vite frontend -> client/dist
#   Stage 2 (runtime):      Node 22 API server + FFmpeg + Python 3 venv with
#                           faster-whisper, OpenCV, ONNX Runtime, yt-dlp, with
#                           the AI model weights baked into the image.
#
# Why the root `postinstall` is not used here: it builds the client and pip-installs
# the Python stack in one go, which is convenient for local `npm install` but
# runs before the client source is in the image. Those steps are done below as
# separate cached layers instead, and OPENCLIP_DOCKER_BUILD=1 tells
# scripts/postinstall.js to stand aside.

############################
# Stage 1: frontend build
############################
FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build && test -f dist/index.html


############################
# Stage 2: runtime
############################
FROM node:22-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
# ffmpeg (Debian build: libx264, libass, fontconfig, zimg for HDR tonemapping)
# noto emoji + dejavu are caption fallbacks; curl fetches Montserrat below
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      fontconfig \
      fonts-dejavu-core \
      fonts-noto-color-emoji \
      python3 \
      python3-venv \
      tini \
 && rm -rf /var/lib/apt/lists/*

# Montserrat is the caption typeface ("Montserrat Black/ExtraBold/SemiBold" in the
# ASS styles). Debian 12 has no package for it, so install the official OFL TTFs
# from the upstream release tag.
ARG MONTSERRAT_VERSION=v7.222
RUN mkdir -p /usr/share/fonts/truetype/montserrat \
 && for w in Black ExtraBold Bold SemiBold Regular; do \
      curl -fsSL -o "/usr/share/fonts/truetype/montserrat/Montserrat-$w.ttf" \
        "https://raw.githubusercontent.com/JulietaUla/Montserrat/${MONTSERRAT_VERSION}/fonts/ttf/Montserrat-$w.ttf"; \
    done \
 && fc-cache -f \
 && test -n "$(fc-list Montserrat family)"

# Python AI stack in an isolated venv (Debian 12 forbids system-wide pip installs)
ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    HF_HOME=/opt/models/huggingface \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python3 -m venv /opt/venv

WORKDIR /app

COPY server/requirements.txt server/requirements.txt
RUN pip install -r server/requirements.txt

# Node server dependencies (production only)
COPY package.json package-lock.json ./
COPY scripts/postinstall.js scripts/postinstall.js
RUN OPENCLIP_DOCKER_BUILD=1 npm ci --omit=dev \
 && npm cache clean --force

# Application source + the built frontend from stage 1
COPY . .
COPY --from=client-build /app/client/dist ./client/dist

# Sound effects + demo sample into the server's runtime folders
RUN sh scripts/prepare-runtime-assets.sh

# Bake Whisper + MiniLM weights so cold starts don't download ~230 MB
ARG WHISPER_MODEL=base.en
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python scripts/prefetch_models.py

# Writable runtime folders, owned by the unprivileged "node" user
RUN mkdir -p server/uploads/previews server/exports server/samples \
 && chown -R node:node server/uploads server/exports server/samples /opt/models

# Fail the build if any runtime tool is missing
RUN ffmpeg -hide_banner -filters > /tmp/ffmpeg-filters.txt \
 && grep -qE '^ [.A-Z|]{3} ass ' /tmp/ffmpeg-filters.txt \
 && grep -qE '^ [.A-Z|]{3} zscale ' /tmp/ffmpeg-filters.txt \
 && rm /tmp/ffmpeg-filters.txt \
 && ffprobe -hide_banner -version > /dev/null \
 && python --version \
 && python -c "import faster_whisper, cv2, onnxruntime, sklearn, scipy, tokenizers, joblib, numpy; print('python AI stack OK')" \
 && yt-dlp --version \
 && node -e "require('express'); require('multer'); require('./server/services/ffmpegService'); console.log('node deps OK')"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    YTDLP_PATH=/opt/venv/bin/yt-dlp \
    PYTHON_BIN=/opt/venv/bin/python3

USER node
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||10000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# tini reaps the FFmpeg/Python child processes and forwards SIGTERM on redeploys
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/server.js"]
