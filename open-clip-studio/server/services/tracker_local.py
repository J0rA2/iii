import sys
import os
import json
import subprocess
import numpy as np

try:
    import cv2
except ImportError:
    print("Error: cv2 not found", file=sys.stderr)
    sys.exit(1)

LOCAL_YUNET_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'face_detection_yunet_2023mar.onnx')
CANDIDATE_YUNET_PATHS = [
    LOCAL_YUNET_PATH,
    os.path.expanduser("~/.cache/huggingface/hub/models--opencv--face_detection_yunet/snapshots/3cc26e7f1014a5ee5d74a42acee58bafc9d0a310/face_detection_yunet_2023mar.onnx"),
    "/app/server/services/models/face_detection_yunet_2023mar.onnx"
]

def get_yunet_model_path():
    for p in CANDIDATE_YUNET_PATHS:
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            return p
    try:
        os.makedirs(os.path.dirname(LOCAL_YUNET_PATH), exist_ok=True)
        import urllib.request
        url = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
        urllib.request.urlretrieve(url, LOCAL_YUNET_PATH)
        if os.path.exists(LOCAL_YUNET_PATH):
            return LOCAL_YUNET_PATH
    except Exception as e:
        print(f"Warning: Failed to auto-download YuNet: {e}", file=sys.stderr)
    return None

def resolve_ffmpeg_bin():
    if os.environ.get('FFMPEG_PATH') and os.path.exists(os.environ.get('FFMPEG_PATH')):
        return os.environ.get('FFMPEG_PATH')
    # Try finding ffmpeg-static from project root or server dir
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
        os.path.join(script_dir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
        '/opt/render/project/src/node_modules/ffmpeg-static/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/usr/bin/ffmpeg'
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return 'ffmpeg'

def track_subject(video_path, start_time, duration, sample_fps=4):
    """
    Cinema-Grade High-Fidelity Active Speaker Tracking:
    - Runs at 4 FPS sampling rate for responsive, lag-free motion capture.
    - Preserves native 16:9 aspect ratio (640x360) so face proportions are not distorted.
    - Employs Gaussian Moving Average & Cinema Deadband for butter-smooth camera panning.
    """
    abs_video_path = os.path.abspath(video_path)
    if not os.path.exists(abs_video_path):
        return {
            "duration": duration,
            "sampleCount": 0,
            "avgX": 0.5,
            "avgXPercent": 50.0,
            "primarySpeakerXPercent": 50.0,
            "hasTwoSpeakers": False,
            "speakerLeftPercent": 30.0,
            "speakerRightPercent": 70.0,
            "trajectory": []
        }

    yunet_path = get_yunet_model_path()
    if not yunet_path:
        print("Warning: Face model not found, falling back to center (50%)", file=sys.stderr)
        return {
            "duration": duration,
            "sampleCount": 0,
            "avgX": 0.5,
            "avgXPercent": 50.0,
            "primarySpeakerXPercent": 50.0,
            "hasTwoSpeakers": False,
            "speakerLeftPercent": 30.0,
            "speakerRightPercent": 70.0,
            "trajectory": []
        }

    # Initialize OpenCV C++ FaceDetectorYN with native 16:9 proportional dimensions (640x360)
    frame_w = 640
    frame_h = 360
    detector = cv2.FaceDetectorYN.create(
        yunet_path,
        '',
        (frame_w, frame_h),
        0.30,  # Score threshold
        0.25,  # NMS threshold
        5000
    )

    ffmpeg_bin = resolve_ffmpeg_bin()

    # Stream frames scaled to 640x360 BGR via fast FFmpeg seeking (preserving 16:9 aspect ratio)
    cmd = [
        ffmpeg_bin,
        '-v', 'quiet',
        '-ss', str(start_time),
        '-t', str(duration),
        '-i', abs_video_path,
        '-vf', f'fps={sample_fps},scale={frame_w}:{frame_h}',
        '-f', 'image2pipe',
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'bgr24',
        '-'
    ]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"Failed to spawn FFmpeg ({ffmpeg_bin}): {e}", file=sys.stderr)
        return {
            "duration": duration,
            "sampleCount": 0,
            "avgX": 0.5,
            "avgXPercent": 50.0,
            "primarySpeakerXPercent": 50.0,
            "hasTwoSpeakers": False,
            "speakerLeftPercent": 30.0,
            "speakerRightPercent": 70.0,
            "trajectory": []
        }

    frame_size = frame_w * frame_h * 3
    time_step = 1.0 / sample_fps

    frame_detections = []
    current_t = 0.0

    while True:
        raw_frame = proc.stdout.read(frame_size)
        if not raw_frame or len(raw_frame) < frame_size:
            break

        img = np.frombuffer(raw_frame, dtype=np.uint8).reshape((frame_h, frame_w, 3))
        detector.setInputSize((frame_w, frame_h))
        _, raw_faces = detector.detect(img)

        faces = []
        if raw_faces is not None and len(raw_faces) > 0:
            for f in raw_faces:
                box = f[0:4]
                conf = float(f[-1])
                if conf < 0.28:
                    continue
                w_frac = float(box[2] / float(frame_w))
                h_frac = float(box[3] / float(frame_h))
                cx = float((box[0] + box[2] / 2.0) / float(frame_w))
                cy = float((box[1] + box[3] / 2.0) / float(frame_h))
                area = w_frac * h_frac
                faces.append({
                    'cx': cx,
                    'cy': cy,
                    'area': area,
                    'conf': conf
                })

        frame_detections.append({'t': current_t, 'faces': faces})
        current_t += time_step

    proc.stdout.close()
    proc.wait()

    # Step 2: Extract all valid face centers
    all_face_centers = []
    for fd in frame_detections:
        for fc in fd['faces']:
            if 0.06 <= fc['cx'] <= 0.94:
                all_face_centers.append(fc['cx'])

    if not all_face_centers:
        default_x = 0.50
        traj = [{"t": round(fd['t'], 2), "x": default_x, "xPercent": 50.0, "activeSpeaker": "center"} for fd in frame_detections]
        return {
            "duration": duration,
            "sampleCount": len(traj),
            "avgX": default_x,
            "avgXPercent": 50.0,
            "primarySpeakerXPercent": 50.0,
            "hasTwoSpeakers": False,
            "speakerLeftPercent": 30.0,
            "speakerRightPercent": 70.0,
            "trajectory": traj
        }

    # Step 3: Spatial Cluster Analysis (Dual-speaker vs Single speaker)
    left_cluster = [x for x in all_face_centers if x < 0.44]
    right_cluster = [x for x in all_face_centers if x > 0.56]
    center_cluster = [x for x in all_face_centers if 0.44 <= x <= 0.56]

    has_two_speakers = (len(left_cluster) >= 6 and len(right_cluster) >= 6 and (len(left_cluster) + len(right_cluster)) > len(center_cluster))

    avg_left = float(np.mean(left_cluster)) if left_cluster else 0.32
    avg_right = float(np.mean(right_cluster)) if right_cluster else 0.68

    if has_two_speakers:
        primary_anchor = avg_left if len(left_cluster) >= len(right_cluster) else avg_right
    else:
        primary_anchor = float(np.median(all_face_centers))

    # Step 4: Cinematic Damped Camera Tracking with Deadband & Gaussian Filter
    # 1. Determine raw target X for each frame
    raw_targets = []
    last_known_x = primary_anchor

    for fd in frame_detections:
        faces = fd['faces']
        if faces:
            # Pick dominant speaker face weighted by area * confidence
            dominant = max(faces, key=lambda f: f['area'] * (f['conf'] ** 1.5))
            last_known_x = dominant['cx']
            raw_targets.append(last_known_x)
        else:
            # If face momentarily hidden, gently hold last known target
            raw_targets.append(last_known_x)

    # 2. Outlier rejection filter (ignore 1-frame spikes)
    cleaned_targets = []
    for i in range(len(raw_targets)):
        window = raw_targets[max(0, i - 1):min(len(raw_targets), i + 2)]
        cleaned_targets.append(float(np.median(window)))

    # 3. Cinematic Exponential Moving Average (EMA) with Gentle Deadband
    # Damping factor alpha = 0.16 gives buttery-smooth, fluid Steadicam motion without lag
    alpha = 0.16
    deadband = 0.035  # 3.5% deadband prevents micro head bobbing from causing camera jitter

    smoothed_camera_x = []
    curr_cam_x = primary_anchor

    for target in cleaned_targets:
        delta = target - curr_cam_x
        if abs(delta) > deadband:
            # Smoothly track target
            effective_target = target - np.sign(delta) * (deadband * 0.5)
            curr_cam_x = curr_cam_x + alpha * (effective_target - curr_cam_x)
        else:
            # Very slow drift to center on the subject
            curr_cam_x = curr_cam_x + 0.02 * delta
        
        # Clamp camera center to avoid black bars in 9:16 vertical crop
        clamped = max(0.20, min(0.80, curr_cam_x))
        smoothed_camera_x.append(clamped)

    # 4. Final 3-tap Gaussian blur pass over camera coordinates to eliminate any residual jerkiness
    kernel = np.array([0.25, 0.5, 0.25])
    padded = np.pad(smoothed_camera_x, (1, 1), mode='edge')
    final_coords = np.convolve(padded, kernel, mode='valid')

    # Construct clean trajectory payload
    trajectory = []
    for i, fd in enumerate(frame_detections):
        t = fd['t']
        x_val = float(final_coords[i])
        speaker_label = "left" if x_val < 0.44 else ("right" if x_val > 0.56 else "center")
        trajectory.append({
            "t": round(t, 2),
            "x": round(x_val, 3),
            "xPercent": round(x_val * 100.0, 1),
            "activeSpeaker": speaker_label
        })

    avg_x = float(np.mean([pt['x'] for pt in trajectory]))

    return {
        "duration": duration,
        "sampleCount": len(trajectory),
        "avgX": round(avg_x, 3),
        "avgXPercent": round(avg_x * 100.0, 1),
        "primarySpeakerXPercent": round(primary_anchor * 100.0, 1),
        "hasTwoSpeakers": bool(has_two_speakers),
        "speakerLeftPercent": round(avg_left * 100.0, 1),
        "speakerRightPercent": round(avg_right * 100.0, 1),
        "trajectory": trajectory
    }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 tracker_local.py <video_path> <start_time> <duration> [out_json]")
        sys.exit(1)

    video = sys.argv[1]
    start = float(sys.argv[2])
    dur = float(sys.argv[3])
    out_json = sys.argv[4] if len(sys.argv) > 4 else None

    result = track_subject(video, start, dur)
    
    if out_json:
        with open(out_json, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Tracking data saved to {out_json}")
    else:
        print(json.dumps(result))
