#!/usr/bin/env python3
"""
Bake the AI model weights into the Docker image at build time.

Without this, every cold start on Render (ephemeral disk) would re-download
~230 MB from Hugging Face during the user's first request, and the downloader
prints progress to stdout, which the Node side parses as JSON.

Fails the build loudly if anything can't be fetched or loaded.
"""
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MINILM_DIR = os.path.join(ROOT, "server", "ml", "models", "miniLM")
MINILM_ONNX = os.path.join(MINILM_DIR, "model.onnx")
MINILM_URL = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx"
YUNET = os.path.join(ROOT, "server", "services", "models", "face_detection_yunet_2023mar.onnx")


def fetch_minilm():
    os.makedirs(MINILM_DIR, exist_ok=True)
    if not os.path.exists(MINILM_ONNX) or os.path.getsize(MINILM_ONNX) < 1_000_000:
        print(f"Downloading MiniLM ONNX -> {MINILM_ONNX}", flush=True)
        tmp = MINILM_ONNX + ".part"
        urllib.request.urlretrieve(MINILM_URL, tmp)
        os.replace(tmp, MINILM_ONNX)
    import onnxruntime as ort
    ort.InferenceSession(MINILM_ONNX, providers=["CPUExecutionProvider"])
    print(f"MiniLM OK ({os.path.getsize(MINILM_ONNX) // 1024 // 1024} MB)", flush=True)


def fetch_whisper():
    from faster_whisper import WhisperModel
    from faster_whisper.utils import download_model

    model = os.environ.get("WHISPER_MODEL", "base.en")
    # transcribe_local.py maps "tiny"/"base.en" to base.en for English
    if model == "tiny":
        model = "base.en"
    print(f"Downloading faster-whisper model '{model}' into {os.environ.get('HF_HOME', '~/.cache/huggingface')}", flush=True)
    path = download_model(model)
    WhisperModel(path, device="cpu", compute_type="int8", cpu_threads=1)
    print(f"Whisper '{model}' OK at {path}", flush=True)


def check_yunet():
    if not os.path.exists(YUNET):
        sys.exit(f"Missing face detector model: {YUNET}")
    import cv2
    cv2.FaceDetectorYN.create(YUNET, "", (320, 320))
    print(f"YuNet face detector OK (OpenCV {cv2.__version__})", flush=True)


if __name__ == "__main__":
    fetch_minilm()
    fetch_whisper()
    check_yunet()
