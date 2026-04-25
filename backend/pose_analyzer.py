"""
Pose analysis using YOLOv8-pose (COCO-17 keypoints).
Handles portrait/landscape video orientation automatically.
"""
import cv2
import numpy as np
import tempfile
import uuid
import subprocess
import json
from pathlib import Path

from biomechanics import (calculate_joint_angles, calculate_com,
                          calculate_com_kinematics, estimate_body_scale,
                          calculate_jump_metrics, calculate_joint_moments,
                          calculate_balance_metrics)

YOLO_MODEL = 'yolov8m-pose.pt'
_model_cache = None
MAX_FRAMES = 900

TMP = Path(tempfile.gettempdir()) / 'motion_analysis'
TMP.mkdir(exist_ok=True)

# COCO-17 skeleton connections (a, b) and side ('left'/'right'/'centre')
_CONNECTIONS = [
    (0,1,'centre'),(0,2,'centre'),(1,3,'centre'),(2,4,'centre'),
    (5,6,'centre'),
    (5,7,'left'),(7,9,'left'),
    (6,8,'right'),(8,10,'right'),
    (5,11,'left'),(6,12,'right'),(11,12,'centre'),
    (11,13,'left'),(13,15,'left'),
    (12,14,'right'),(14,16,'right'),
]
_SIDE_COLOR = {
    'left':   (248,189,56),
    'right':  (153,211,52),
    'centre': (220,220,220),
}


# ─────────────────────────────────────────────────────────────────────────────
#  Orientation helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_tkhd_rotation(path: str) -> int:
    """
    Directly parse the MP4/MOV container binary for the tkhd
    transformation matrix — no external tools needed.

    The tkhd matrix's (a, b) elements reveal the display rotation:
      a≈1, b≈0  →  0°
      a≈0, b>0  →  90°  (iPhone portrait, most common)
      a≈-1,b≈0  →  180°
      a≈0, b<0  →  270°
    """
    import struct

    try:
        file_size = Path(path).stat().st_size
        with open(path, 'rb') as f:
            raw = f.read(min(10 * 1024 * 1024, file_size))   # first 10 MB

        def _iter(data: bytes, start: int, end: int):
            pos = start
            while pos + 8 <= end:
                sz = struct.unpack_from('>I', data, pos)[0]
                bt = data[pos+4:pos+8].decode('latin1', errors='ignore')
                if sz == 0:
                    box_end = end
                elif sz == 1 and pos + 16 <= end:
                    sz = struct.unpack_from('>Q', data, pos+8)[0]
                    box_end = pos + sz
                else:
                    box_end = pos + sz
                if box_end <= pos or box_end > end:
                    break
                yield bt, pos + 8, box_end
                pos = box_end

        def _search(data: bytes, start: int, end: int) -> int:
            for bt, cs, ce in _iter(data, start, end):
                if bt in ('moov', 'trak'):
                    r = _search(data, cs, ce)
                    if r:
                        return r
                elif bt == 'tkhd':
                    blob = data[cs:ce]
                    if not blob:
                        continue
                    v = blob[0]
                    moff = 52 if v == 1 else 40   # byte offset to matrix in content
                    if len(blob) >= moff + 8:
                        a_raw = struct.unpack_from('>i', blob, moff)[0]
                        b_raw = struct.unpack_from('>i', blob, moff + 4)[0]
                        a = a_raw / 65536.0        # 16.16 fixed-point
                        b = b_raw / 65536.0
                        if abs(a) < 0.3:
                            return 90 if b > 0.3 else (270 if b < -0.3 else 0)
                        elif a < -0.3:
                            return 180
            return 0

        return _search(raw, 0, len(raw))
    except Exception:
        return 0


def _detect_rotation(video_path: str) -> int:
    """
    Return the clockwise degrees needed to correct video orientation.
    Possible values: 0, 90, 180, 270.

    Strategy (most → least reliable for iPhone/Android MOV/MP4):
      1. MP4 tkhd matrix  (binary parser, no deps, handles iPhone perfectly)
      2. cv2.CAP_PROP_ORIENTATION_META  (OpenCV 4.5+)
      3. ffprobe JSON (fallback)
    """
    # ── Method 1: Parse MP4/MOV tkhd box directly ───────────────────────────
    rot = _parse_tkhd_rotation(video_path)
    if rot:
        print(f'[pose_analyzer] rotation from tkhd matrix = {rot}°')
        return rot

    # ── Method 2: OpenCV metadata flag ──────────────────────────────────────
    try:
        cap = cv2.VideoCapture(video_path)
        raw = cap.get(cv2.CAP_PROP_ORIENTATION_META)
        cap.release()
        if raw is not None:
            rot = int(raw) % 360
            if rot in (90, 180, 270):
                print(f'[pose_analyzer] rotation from CAP_PROP_ORIENTATION_META = {rot}°')
                return rot
    except Exception:
        pass

    # ── Method 3: ffprobe (if installed) ────────────────────────────────────
    try:
        r = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json',
             '-show_streams', video_path],
            capture_output=True, text=True, timeout=10
        )
        for s in json.loads(r.stdout).get('streams', []):
            if s.get('codec_type') != 'video':
                continue
            for sd in s.get('side_data_list', []):
                rot = abs(int(sd.get('rotation', 0))) % 360
                if rot in (90, 180, 270):
                    print(f'[pose_analyzer] rotation from ffprobe side_data = {rot}°')
                    return rot
            rot = int(s.get('tags', {}).get('rotate', 0)) % 360
            if rot in (90, 180, 270):
                print(f'[pose_analyzer] rotation from ffprobe tags = {rot}°')
                return rot
    except Exception:
        pass

    return 0


def _rotate_frame(frame: np.ndarray, rotation: int) -> np.ndarray:
    """Rotate a frame clockwise by `rotation` degrees."""
    if rotation == 90:
        return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    elif rotation == 180:
        return cv2.rotate(frame, cv2.ROTATE_180)
    elif rotation == 270:
        return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return frame


# ─────────────────────────────────────────────────────────────────────────────
#  Model
# ─────────────────────────────────────────────────────────────────────────────

def _get_model():
    global _model_cache
    if _model_cache is None:
        from ultralytics import YOLO
        print(f'Loading YOLO model: {YOLO_MODEL}')
        _model_cache = YOLO(YOLO_MODEL)
        print('YOLO model ready')
    return _model_cache


# ─────────────────────────────────────────────────────────────────────────────
#  Keypoint extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_landmarks(result, width: int, height: int):
    """
    Extract COCO-17 keypoints from a YOLO result, normalised 0-1.
    Picks the detection box with highest confidence (= the main subject).
    """
    if result.keypoints is None or len(result.keypoints) == 0:
        return None
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return None
    best_idx = int(boxes.conf.argmax()) if len(boxes) > 1 else 0
    kp   = result.keypoints[best_idx]
    xy   = kp.xy.cpu().numpy()[0]
    conf = kp.conf.cpu().numpy()[0]
    return [{'x': float(xy[i,0]/width), 'y': float(xy[i,1]/height),
              'z': 0.0, 'conf': float(conf[i])} for i in range(17)]


# ─────────────────────────────────────────────────────────────────────────────
#  Snapshot drawing
# ─────────────────────────────────────────────────────────────────────────────

def _draw_annotated_snapshot(frame_bgr, landmarks, width, height,
                              balance_summary=None):
    """Draw skeleton overlay + asymmetry annotations. Returns annotated BGR image."""
    img = frame_bgr.copy()

    def px(lm): return (int(lm['x'] * width), int(lm['y'] * height))

    # Skeleton connections
    for a, b, side in _CONNECTIONS:
        la, lb = landmarks[a], landmarks[b]
        if la['conf'] > 0.25 and lb['conf'] > 0.25:
            cv2.line(img, px(la), px(lb), _SIDE_COLOR[side], 3, cv2.LINE_AA)

    # Joint dots
    for i, lm in enumerate(landmarks):
        if lm['conf'] > 0.3:
            c = _SIDE_COLOR['left']   if i in [5,7,9,11,13,15] else \
                _SIDE_COLOR['right']  if i in [6,8,10,12,14,16] else (200,200,200)
            cv2.circle(img, px(lm), 7, c, -1, cv2.LINE_AA)
            cv2.circle(img, px(lm), 3, (255,255,255), -1, cv2.LINE_AA)

    # Asymmetry overlays
    if balance_summary:
        font   = cv2.FONT_HERSHEY_SIMPLEX
        alerts = []

        sho = balance_summary.get('shoulder_tilt_deg', {})
        if sho.get('max_abs') and abs(sho['max_abs']) > 3:
            ls, rs = landmarks[5], landmarks[6]
            if ls['conf'] > 0.3 and rs['conf'] > 0.3:
                cv2.line(img, px(ls), px(rs), (0,0,255), 4, cv2.LINE_AA)
            alerts.append(f"肩歪 {sho['max_abs']:.1f}°")

        pel = balance_summary.get('pelvis_tilt_deg', {})
        if pel.get('max_abs') and abs(pel['max_abs']) > 3:
            lh, rh = landmarks[11], landmarks[12]
            if lh['conf'] > 0.3 and rh['conf'] > 0.3:
                cv2.line(img, px(lh), px(rh), (0,128,255), 4, cv2.LINE_AA)
            alerts.append(f"骨盆歪 {pel['max_abs']:.1f}°")

        kn = balance_summary.get('knee_asymmetry_pct', {})
        if kn.get('max_abs') and kn['max_abs'] > 10:
            for ki in [13, 14]:
                lm = landmarks[ki]
                if lm['conf'] > 0.3:
                    cv2.circle(img, px(lm), 14, (0,0,255), 3, cv2.LINE_AA)
            alerts.append(f"膝不對稱 {kn['max_abs']:.1f}%")

        com_b = balance_summary.get('com_lateral_bias', {})
        if com_b.get('mean') and abs(com_b['mean']) > 0.05:
            direction = '→右' if com_b['mean'] > 0 else '←左'
            alerts.append(f"重心偏移 {direction} {abs(com_b['mean'])*100:.1f}%")

        y_offset = 36
        for text in alerts:
            (tw, th), _ = cv2.getTextSize(text, font, 0.9, 2)
            cv2.rectangle(img, (8, y_offset - th - 6),
                          (8 + tw + 10, y_offset + 6), (0,0,0), -1)
            cv2.putText(img, text, (14, y_offset), font, 0.9, (0,60,255), 2, cv2.LINE_AA)
            y_offset += th + 20

    # Watermark
    cv2.putText(img, 'YouCore Health Advisors',
                (10, height - 12), cv2.FONT_HERSHEY_SIMPLEX,
                0.55, (200,200,200), 1, cv2.LINE_AA)

    return img


def _save_snapshot(video_path: str, target_frame_idx: int,
                   landmarks: list, width: int, height: int,
                   balance_summary: dict = None,
                   rotation: int = 0) -> str:
    """
    Re-open video, grab target frame, apply orientation correction,
    draw annotated skeleton, save JPEG. Returns file path string.
    """
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame_idx)
    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        return None

    # Apply same rotation used during analysis
    if rotation:
        frame = _rotate_frame(frame, rotation)

    annotated = _draw_annotated_snapshot(frame, landmarks, width, height,
                                          balance_summary)
    snap_path = TMP / f'snapshot_{uuid.uuid4().hex[:8]}.jpg'
    cv2.imwrite(str(snap_path), annotated, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return str(snap_path)


# ─────────────────────────────────────────────────────────────────────────────
#  Main analysis entry point
# ─────────────────────────────────────────────────────────────────────────────

def analyze_video_file(video_path: str, progress_cb=None,
                       mode: str = 'balance') -> dict:
    """
    mode: 'balance' = 站立平衡分析（跳過跳躍偵測）
          'jump'    = 跳躍分析（完整計算）
    progress_cb(pct: int) called with 0-100 during processing.
    """
    model = _get_model()

    # ── 1. Detect orientation BEFORE opening the main capture ────────────────
    rotation = _detect_rotation(video_path)
    print(f'[pose_analyzer] video rotation metadata = {rotation}°')

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError('Cannot open video file')

    fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Raw dimensions from container
    raw_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    raw_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # After rotation, effective dimensions may swap (90° / 270° = portrait ↔ landscape)
    if rotation in (90, 270):
        width, height = raw_h, raw_w   # swapped
    else:
        width, height = raw_w, raw_h

    print(f'[pose_analyzer] raw={raw_w}×{raw_h}  effective={width}×{height}  '
          f'rotation={rotation}°')

    step           = max(1, total // MAX_FRAMES)
    frames_to_proc = max(1, total // step)

    frames_data = []
    frame_idx   = 0
    processed   = 0

    best_snap_score = -1.0
    best_snap_fidx  = 0
    best_snap_lm    = None

    if progress_cb:
        progress_cb(5)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % step != 0:
            frame_idx += 1
            continue

        # ── Correct orientation before inference ─────────────────────────
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if rotation:
            frame_rgb = _rotate_frame(frame_rgb, rotation)

        results   = model(frame_rgb, verbose=False)

        landmarks = None
        if results and len(results) > 0:
            landmarks = _extract_landmarks(results[0], width, height)

        if landmarks is not None:
            score = sum(lm['conf'] for lm in landmarks) / len(landmarks)
            if score > best_snap_score:
                best_snap_score = score
                best_snap_fidx  = frame_idx
                best_snap_lm    = landmarks

        frames_data.append({
            'frame_idx': frame_idx,
            'timestamp': round(frame_idx / fps, 3),
            'landmarks': landmarks,
        })
        processed += 1
        frame_idx += 1

        if progress_cb and processed % 10 == 0:
            pct = 5 + int(processed / frames_to_proc * 85)
            progress_cb(min(pct, 90))

    cap.release()

    if progress_cb:
        progress_cb(92)

    # ── Biomechanics ─────────────────────────────────────────────────────────
    effective_fps  = fps / step
    joint_angles   = calculate_joint_angles(frames_data, fps=effective_fps)
    com            = calculate_com(frames_data)
    com_kinematics = calculate_com_kinematics(com, fps=effective_fps)
    body_scale     = estimate_body_scale(frames_data)

    if mode == 'jump':
        jump_metrics  = calculate_jump_metrics(com, com_kinematics, fps=effective_fps)
        joint_moments = calculate_joint_moments(frames_data, fps=effective_fps)
    else:
        jump_metrics  = None
        joint_moments = None

    balance_metrics = calculate_balance_metrics(frames_data, joint_angles,
                                                com, fps=effective_fps)

    # ── Annotated snapshot ───────────────────────────────────────────────────
    snapshot_path = None
    if best_snap_lm is not None:
        bal_sum = balance_metrics.get('summary') if balance_metrics else None
        snapshot_path = _save_snapshot(
            video_path, best_snap_fidx, best_snap_lm,
            width, height, bal_sum, rotation=rotation)

    if progress_cb:
        progress_cb(100)

    return {
        'mode':            mode,
        'fps':             effective_fps,
        'original_fps':    fps,
        'total_frames':    len(frames_data),
        'width':           width,
        'height':          height,
        'duration':        round((frame_idx - 1) / fps, 2),
        'frames':          frames_data,
        'joint_angles':    joint_angles,
        'com':             com,
        'com_kinematics':  com_kinematics,
        'body_scale':      body_scale,
        'jump_metrics':    jump_metrics,
        'joint_moments':   joint_moments,
        'balance_metrics': balance_metrics,
        'snapshot_path':   snapshot_path,
    }
