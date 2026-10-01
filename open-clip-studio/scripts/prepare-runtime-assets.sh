#!/bin/sh
# Puts the media assets the server expects at runtime into place.
#  - server/assets/sfx/*.wav : sound effects mixed into rendered clips
#    (the .wav files are gitignored under server/, the repo ships them in client/public/sfx)
#  - server/samples/          : the built-in demo podcast (+ VTT) served by /api/samples
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SFX_DIR="$ROOT/server/assets/sfx"
SAMPLES_DIR="$ROOT/server/samples"
mkdir -p "$SFX_DIR" "$SAMPLES_DIR"

cp "$ROOT"/client/public/sfx/*.wav "$SFX_DIR"/

# Any effect that only exists as .mp3 (e.g. airhorn) gets a .wav twin
for mp3 in "$SFX_DIR"/*.mp3; do
  [ -e "$mp3" ] || continue
  wav="${mp3%.mp3}.wav"
  if [ ! -e "$wav" ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$mp3" -ar 44100 -ac 2 "$wav"
  fi
done

for required in vine_boom whoosh ding record_scratch bruh; do
  if [ ! -s "$SFX_DIR/$required.wav" ]; then
    echo "Missing required sound effect: $SFX_DIR/$required.wav" >&2
    exit 1
  fi
done

cp "$ROOT"/client/public/samples/* "$SAMPLES_DIR"/
echo "Runtime assets ready: $(ls "$SFX_DIR" | wc -l) sfx files, $(ls "$SAMPLES_DIR" | wc -l) sample files"
