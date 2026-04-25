"""
Biomechanics calculations using COCO-17 keypoint indices (YOLOv8-pose).

COCO-17 landmarks:
 0:nose  1:left_eye  2:right_eye  3:left_ear  4:right_ear
 5:left_shoulder  6:right_shoulder
 7:left_elbow     8:right_elbow
 9:left_wrist    10:right_wrist
11:left_hip      12:right_hip
13:left_knee     14:right_knee
15:left_ankle    16:right_ankle
"""
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks
from typing import List, Dict, Optional

# ── Joint angle definitions ────────────────────────────────────
# (point_a, vertex, point_b) — angle measured at vertex
JOINT_DEFS = {
    'left_elbow':     ( 5,  7,  9),
    'right_elbow':    ( 6,  8, 10),
    'left_shoulder':  ( 7,  5, 11),
    'right_shoulder': ( 8,  6, 12),
    'left_hip':       ( 5, 11, 13),
    'right_hip':      ( 6, 12, 14),
    'left_knee':      (11, 13, 15),
    'right_knee':     (12, 14, 16),
}

# Ankle: shank inclination from vertical (no toe landmark in COCO-17).
# Angle = deviation of knee→ankle vector from downward vertical (0°=vertical shank).
# (knee_idx, ankle_idx)
ANKLE_DEFS = {
    'left_ankle':  (13, 15),
    'right_ankle': (14, 16),
}

# de Leva (1996) male — (proximal_idx, distal_idx, com_ratio, mass_ratio)
SEGMENTS = {
    'head':            (-1, -1, 0.500, 0.0694),
    'trunk':           (-1, -1, 0.449, 0.4346),
    'left_upper_arm':  ( 5,  7, 0.575, 0.0271),
    'right_upper_arm': ( 6,  8, 0.575, 0.0271),
    'left_forearm':    ( 7,  9, 0.456, 0.0162),
    'right_forearm':   ( 8, 10, 0.456, 0.0162),
    'left_hand':       ( 9,  9, 0.747, 0.0061),
    'right_hand':      (10, 10, 0.747, 0.0061),
    'left_thigh':      (11, 13, 0.372, 0.1416),
    'right_thigh':     (12, 14, 0.372, 0.1416),
    'left_shank':      (13, 15, 0.371, 0.0433),
    'right_shank':     (14, 16, 0.371, 0.0433),
    'left_foot':       (15, 15, 0.401, 0.0137),
    'right_foot':      (16, 16, 0.401, 0.0137),
}

# Distal segments used when computing quasi-static joint moments
JOINT_DISTAL_SEGS = {
    'left_hip':      ['left_thigh',      'left_shank',    'left_foot'],
    'right_hip':     ['right_thigh',     'right_shank',   'right_foot'],
    'left_knee':     ['left_shank',      'left_foot'],
    'right_knee':    ['right_shank',     'right_foot'],
    'left_ankle':    ['left_foot'],
    'right_ankle':   ['right_foot'],
    'left_shoulder': ['left_upper_arm',  'left_forearm',  'left_hand'],
    'right_shoulder':['right_upper_arm', 'right_forearm', 'right_hand'],
    'left_elbow':    ['left_forearm',    'left_hand'],
    'right_elbow':   ['right_forearm',   'right_hand'],
}

# COCO-17 keypoint index for each joint centre
JOINT_KP_IDX = {
    'left_hip': 11,      'right_hip': 12,
    'left_knee': 13,     'right_knee': 14,
    'left_ankle': 15,    'right_ankle': 16,
    'left_shoulder': 5,  'right_shoulder': 6,
    'left_elbow': 7,     'right_elbow': 8,
}


# ── Low-level helpers ──────────────────────────────────────────

def _vec(lm: list, idx: int) -> np.ndarray:
    return np.array([lm[idx]['x'], lm[idx]['y'], lm[idx]['z']])


def _mid(lm: list, i: int, j: int) -> np.ndarray:
    return (_vec(lm, i) + _vec(lm, j)) / 2.0


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    cos = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return float(np.degrees(np.arccos(np.clip(cos, -1.0, 1.0))))


def _shank_inclination(knee: np.ndarray, ankle: np.ndarray) -> Optional[float]:
    """Angle of shank (knee→ankle) from vertical downward direction (0°=vertical)."""
    vec = ankle[:2] - knee[:2]
    norm = np.linalg.norm(vec)
    if norm < 1e-8:
        return None
    cos_a = np.clip(np.dot(vec, np.array([0.0, 1.0])) / norm, -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_a)))


def _butter_lowpass(data: np.ndarray, cutoff: float, fs: float) -> np.ndarray:
    nyq = fs / 2.0
    b, a = butter(4, min(cutoff / nyq, 0.99), btype='low')
    return filtfilt(b, a, data) if len(data) > 13 else data


def _smooth_series(series: list, fps: float) -> list:
    """Butterworth low-pass filter on a list that may contain None values."""
    idx = [i for i, v in enumerate(series) if v is not None]
    if len(idx) > 13:
        smoothed = _butter_lowpass(np.array([series[i] for i in idx]), 6.0, fps)
        for k, i in enumerate(idx):
            v = float(smoothed[k])
            series[i] = round(v, 4) if np.isfinite(v) else None
    return series


def _segment_com_xy(lm: list, seg_name: str) -> Optional[np.ndarray]:
    """Segment centre-of-mass (x, y) in normalised image coordinates."""
    pi, di, ratio, _ = SEGMENTS[seg_name]
    try:
        if seg_name == 'head':
            p = d = _vec(lm, 0)
        elif seg_name == 'trunk':
            p = _mid(lm, 5, 6)
            d = _mid(lm, 11, 12)
        else:
            p = _vec(lm, pi)
            d = _vec(lm, di)
        return (p + ratio * (d - p))[:2]
    except (IndexError, KeyError):
        return None


# ── Joint angles ───────────────────────────────────────────────

def calculate_joint_angles(frames: List[dict], fps: float = 30.0) -> Dict[str, list]:
    """Compute joint angles for all 10 joints (hip/knee/ankle/shoulder/elbow)."""
    all_joints = list(JOINT_DEFS.keys()) + list(ANKLE_DEFS.keys())
    angles: Dict[str, list] = {j: [] for j in all_joints}

    for frame in frames:
        lm = frame['landmarks']
        if lm is None:
            for j in all_joints:
                angles[j].append(None)
            continue

        # 3-point angle joints
        for joint, (ai, bi, ci) in JOINT_DEFS.items():
            try:
                vis = min(lm[ai]['conf'], lm[bi]['conf'], lm[ci]['conf'])
                if vis < 0.3:
                    angles[joint].append(None)
                else:
                    angles[joint].append(
                        round(_angle(_vec(lm, ai), _vec(lm, bi), _vec(lm, ci)), 2))
            except (IndexError, KeyError):
                angles[joint].append(None)

        # Ankle: shank inclination from vertical
        for joint, (ki, ai) in ANKLE_DEFS.items():
            try:
                vis = min(lm[ki]['conf'], lm[ai]['conf'])
                if vis < 0.3:
                    angles[joint].append(None)
                else:
                    val = _shank_inclination(_vec(lm, ki), _vec(lm, ai))
                    angles[joint].append(round(val, 2) if val is not None else None)
            except (IndexError, KeyError):
                angles[joint].append(None)

    for joint in angles:
        angles[joint] = _smooth_series(angles[joint], fps)

    return angles


# ── Centre of mass ─────────────────────────────────────────────

def calculate_com(frames: List[dict]) -> Dict[str, list]:
    com_x, com_y, com_z = [], [], []

    for frame in frames:
        lm = frame['landmarks']
        if lm is None:
            com_x.append(None); com_y.append(None); com_z.append(None)
            continue

        cx = cy = cz = total = 0.0
        try:
            for seg, (pi, di, ratio, mass_r) in SEGMENTS.items():
                if seg == 'head':
                    p = d = _vec(lm, 0)
                elif seg == 'trunk':
                    p = _mid(lm, 5, 6)
                    d = _mid(lm, 11, 12)
                else:
                    p = _vec(lm, pi)
                    d = _vec(lm, di)
                sc = p + ratio * (d - p)
                cx += mass_r * sc[0]
                cy += mass_r * sc[1]
                cz += mass_r * sc[2]
                total += mass_r

            if total > 0:
                com_x.append(round(cx / total, 4))
                com_y.append(round(cy / total, 4))
                com_z.append(round(cz / total, 4))
            else:
                com_x.append(None); com_y.append(None); com_z.append(None)
        except (IndexError, KeyError):
            com_x.append(None); com_y.append(None); com_z.append(None)

    return {'x': com_x, 'y': com_y, 'z': com_z}


def calculate_com_kinematics(com: Dict[str, list], fps: float) -> Dict[str, list]:
    """COM velocity and acceleration via finite differences."""
    dt = 1.0 / fps
    result = {}
    for axis in ('x', 'y', 'z'):
        vals = com[axis]
        n = len(vals)
        vel_s = [None] * n
        acc_s = [None] * n
        idx = [i for i, v in enumerate(vals) if v is not None]
        if len(idx) >= 3:
            pos = np.array([vals[i] for i in idx])
            vel = np.gradient(pos, dt)
            acc = np.gradient(vel, dt)
            for k, i in enumerate(idx):
                vv = float(vel[k])
                va = float(acc[k])
                vel_s[i] = round(vv, 4) if np.isfinite(vv) else None
                acc_s[i] = round(va, 4) if np.isfinite(va) else None
        result[f'vel_{axis}'] = vel_s
        result[f'acc_{axis}'] = acc_s
    return result


# ── Body scale estimation ──────────────────────────────────────

def estimate_body_scale(frames: List[dict]) -> Optional[float]:
    """
    Estimate person apparent height in normalised frame units (0-1).
    Returns median of (ankle_midpoint_y - nose_y) across valid frames.
    Used as the denominator to convert normalised → real-world distances:
        scale_m = real_height_m / body_scale_norm
    """
    heights = []
    for frame in frames:
        lm = frame.get('landmarks')
        if lm is None:
            continue
        try:
            if lm[0]['conf'] < 0.3:
                continue
            if min(lm[15]['conf'], lm[16]['conf']) < 0.3:
                continue
            nose_y  = lm[0]['y']
            ankle_y = (lm[15]['y'] + lm[16]['y']) / 2.0
            h = ankle_y - nose_y
            if h > 0.05:
                heights.append(h)
        except (IndexError, KeyError):
            continue
    if len(heights) < 5:
        return None
    return round(float(np.median(heights)), 4)


# ── Jump metrics ───────────────────────────────────────────────

def calculate_jump_metrics(com: Dict, com_kinematics: Dict,
                           fps: float = 30.0) -> Dict:
    """
    Detect vertical jump events and compute peak metrics.

    All displacement / velocity values are in normalised frame units (0-1).
    To convert to real-world SI units multiply by scale_m:
        scale_m = real_height_m / body_scale_norm          [m per frame-unit]
        v_real  = |peak_velocity_norm| × scale_m           [m/s]
        h_real  = height_norm × scale_m                    [m]
        P_real  = mass_kg × 9.81 × scale_m² × power_index [W]

    Sign convention (image y increases downward):
        upward motion → negative vy_norm
        peak_velocity_norm is therefore negative (stored as-is, abs for display)
    """
    y   = np.array([v if v is not None else np.nan for v in com['y']])
    vy  = np.array([v if v is not None else np.nan for v in com_kinematics['vel_y']])
    ay  = np.array([v if v is not None else np.nan for v in com_kinematics['acc_y']])
    n   = len(y)

    valid_y = np.where(~np.isnan(y))[0]
    if len(valid_y) < int(fps * 0.3):
        return {'jumps': [], 'peak_velocity_norm': None,
                'max_height_norm': None, 'peak_power_index': None,
                'baseline_y': None}

    y_filled  = np.interp(np.arange(n), valid_y, y[valid_y])
    baseline_y = float(np.nanmedian(y))

    # Peaks in -y → highest COM positions (smallest y = highest in space)
    peak_idxs, _ = find_peaks(
        -y_filled,
        prominence=0.015,
        distance=max(1, int(fps * 0.3))
    )

    jumps = []
    for pidx in peak_idxs:
        ws = max(0, pidx - int(fps * 1.2))
        we = min(n - 1, pidx + int(fps * 0.8))

        height_norm = max(0.0, baseline_y - float(y_filled[pidx]))
        if height_norm < 0.008:
            continue

        vy_seg  = vy[ws:we]
        valid_v = vy_seg[~np.isnan(vy_seg)]
        peak_vy = round(float(np.min(valid_v)), 4) if len(valid_v) > 0 else None

        # Power index: (upward accel) × (upward vel) in image coords
        # upward → both ay and vy are negative, product is positive
        ay_seg    = ay[ws:we]
        ay_base   = float(np.nanmedian(ay_seg)) if not np.all(np.isnan(ay_seg)) else 0.0
        net_ay    = ay_seg - ay_base
        pow_series = net_ay * vy_seg  # positive when both upward
        valid_p   = pow_series[~np.isnan(pow_series)]
        peak_p    = round(float(np.max(valid_p)), 6) if len(valid_p) > 0 else None

        jumps.append({
            'frame_idx':          int(pidx),
            'timestamp':          round(float(pidx) / fps, 3),
            'height_norm':        round(height_norm, 4),
            'peak_velocity_norm': peak_vy,
            'peak_power_index':   peak_p,
        })

    all_vy = vy[~np.isnan(vy)]
    all_ay = ay[~np.isnan(ay)]
    global_peak_vy = round(float(np.min(all_vy)), 4) if len(all_vy) > 0 else None
    max_h = round(max((j['height_norm'] for j in jumps), default=0.0), 4)

    # Global peak power index
    if len(all_vy) > 0 and len(all_ay) > 0:
        ay_med = float(np.nanmedian(all_ay))
        nav    = min(len(all_ay), len(all_vy))
        net_g  = all_ay[:nav] - ay_med
        ps     = net_g * all_vy[:nav]
        vps    = ps[~np.isnan(ps) & (ps > 0)]
        global_peak_power = round(float(np.max(vps)), 6) if len(vps) > 0 else None
    else:
        global_peak_power = None

    return {
        'jumps':              jumps,
        'peak_velocity_norm': global_peak_vy,
        'max_height_norm':    max_h,
        'peak_power_index':   global_peak_power,
        'baseline_y':         round(baseline_y, 4),
    }


# ── Joint moments ──────────────────────────────────────────────

def calculate_joint_moments(frames: List[dict], fps: float = 30.0) -> Dict[str, list]:
    """
    Quasi-static gravitational joint moment coefficients (dimensionless).

    M_coeff[joint][frame] = Σ_distal (mass_ratio × (x_segCOM - x_joint))

    Real moment in N·m:
        M_Nm = |M_coeff| × BW_kg × 9.81 × scale_m
    where scale_m = real_height_m / body_scale_norm.

    Positive values = distal segments' COM is to the right of the joint.
    Use |M_coeff| for loading magnitude independent of body facing direction.
    """
    moments: Dict[str, list] = {j: [] for j in JOINT_KP_IDX}

    for frame in frames:
        lm = frame['landmarks']
        if lm is None:
            for j in moments:
                moments[j].append(None)
            continue

        fm = {}
        for joint, kp_idx in JOINT_KP_IDX.items():
            try:
                if lm[kp_idx]['conf'] < 0.3:
                    fm[joint] = None
                    continue
                joint_x = lm[kp_idx]['x']
                m_total = 0.0
                ok = True
                for seg_name in JOINT_DISTAL_SEGS[joint]:
                    com_xy = _segment_com_xy(lm, seg_name)
                    if com_xy is None:
                        ok = False
                        break
                    m_total += SEGMENTS[seg_name][3] * (com_xy[0] - joint_x)
                fm[joint] = round(m_total, 5) if ok else None
            except (IndexError, KeyError):
                fm[joint] = None

        for j in moments:
            moments[j].append(fm.get(j))

    for joint in moments:
        moments[joint] = _smooth_series(moments[joint], fps)

    return moments


# ── Balance metrics ────────────────────────────────────────────

def calculate_balance_metrics(frames: List[dict],
                               joint_angles: Dict[str, list],
                               com: Dict[str, list],
                               fps: float = 30.0) -> Dict:
    """
    Per-frame body balance / symmetry metrics.

    com_lateral_bias        — COM offset from ankle midpoint / stance width.
                              Positive = image-right.
    body_centerline_dev     — COM offset from shoulder midpoint, normalised by
                              half shoulder width. 0=centred, ±1=one half-width
                              offset. Positive = image-right.
                              This is the anatomical vertical centreline.
    foot_weight_right_pct   — Estimated % of body weight on person's RIGHT foot
                              (lever principle: COM between ankles).
    foot_weight_left_pct    — 100 − right (always consistent pair).
    shoulder_tilt_deg       — angle of shoulder line from horizontal (°).
    pelvis_tilt_deg         — angle of hip line from horizontal (°).
    knee_angle_diff_deg     — left_knee − right_knee angle (°).
    knee_asymmetry_pct      — |diff| / avg × 100 (%).
    """
    n = len(frames)
    com_bias      = [None] * n
    centerline    = [None] * n   # NEW: body vertical centerline deviation
    foot_r_pct    = [None] * n   # NEW: right-foot weight %
    foot_l_pct    = [None] * n   # NEW: left-foot weight %
    sho_tilt      = [None] * n
    pel_tilt      = [None] * n
    knee_diff     = [None] * n
    knee_asym     = [None] * n

    lk = joint_angles.get('left_knee',  [None] * n)
    rk = joint_angles.get('right_knee', [None] * n)

    for i, frame in enumerate(frames):
        lm = frame.get('landmarks')
        if lm is None:
            continue

        cx = com['x'][i] if com.get('x') and i < len(com['x']) else None

        try:
            # ── COM lateral bias (vs ankle midpoint) ──────────
            la_conf = lm[15]['conf']
            ra_conf = lm[16]['conf']
            if la_conf > 0.3 and ra_conf > 0.3 and cx is not None:
                lax = lm[15]['x']   # person's LEFT ankle
                rax = lm[16]['x']   # person's RIGHT ankle
                mid   = (lax + rax) / 2.0
                width = abs(rax - lax)
                if width > 0.02:
                    com_bias[i] = round((cx - mid) / width, 4)

                    # ── Foot weight ratio (lever principle) ────
                    # right_pct = (COM_x − x_L_ankle) / (x_R_ankle − x_L_ankle)
                    # Works regardless of camera direction because the sign of the
                    # numerator and denominator cancel correctly.
                    foot_span = rax - lax        # signed: negative if facing cam
                    if abs(foot_span) > 0.02:
                        r_pct = (cx - lax) / foot_span * 100.0
                        r_pct = max(0.0, min(100.0, r_pct))
                        foot_r_pct[i] = round(r_pct, 2)
                        foot_l_pct[i] = round(100.0 - r_pct, 2)

            # ── Body anatomical centreline deviation ──────────
            # Reference: midpoint of two shoulders (body's vertical axis)
            ls_conf = lm[5]['conf']
            rs_conf = lm[6]['conf']
            if ls_conf > 0.3 and rs_conf > 0.3 and cx is not None:
                sho_mid = (lm[5]['x'] + lm[6]['x']) / 2.0
                sho_w   = abs(lm[6]['x'] - lm[5]['x'])
                if sho_w > 0.05:     # shoulders must be visible & apart
                    # Normalise by half shoulder-width → intuitive ±1 scale
                    centerline[i] = round((cx - sho_mid) / (sho_w / 2.0), 4)

                # ── Shoulder tilt ──────────────────────────────
                dx = lm[6]['x'] - lm[5]['x']
                dy = lm[6]['y'] - lm[5]['y']
                if abs(dx) > 0.02:
                    sho_tilt[i] = round(float(np.degrees(np.arctan2(dy, dx))), 2)

            # ── Pelvis tilt ────────────────────────────────────
            lh_conf = lm[11]['conf']
            rh_conf = lm[12]['conf']
            if lh_conf > 0.3 and rh_conf > 0.3:
                dx = lm[12]['x'] - lm[11]['x']
                dy = lm[12]['y'] - lm[11]['y']
                if abs(dx) > 0.01:
                    pel_tilt[i] = round(float(np.degrees(np.arctan2(dy, dx))), 2)

            # ── Knee angle asymmetry ───────────────────────────
            lkv = lk[i]
            rkv = rk[i]
            if lkv is not None and rkv is not None:
                diff = round(lkv - rkv, 2)
                avg  = (lkv + rkv) / 2.0
                knee_diff[i] = diff
                knee_asym[i] = round(abs(diff) / avg * 100, 2) if avg > 5 else 0.0

        except (IndexError, KeyError):
            continue

    # ── Smooth all series ──────────────────────────────────────
    com_bias   = _smooth_series(com_bias,   fps)
    centerline = _smooth_series(centerline, fps)
    foot_r_pct = _smooth_series(foot_r_pct, fps)
    foot_l_pct = _smooth_series(foot_l_pct, fps)
    sho_tilt   = _smooth_series(sho_tilt,   fps)
    pel_tilt   = _smooth_series(pel_tilt,   fps)
    knee_diff  = _smooth_series(knee_diff,  fps)
    knee_asym  = _smooth_series(knee_asym,  fps)

    # ── Summary statistics ─────────────────────────────────────
    def _summary(series):
        v = [x for x in series if x is not None and np.isfinite(x)]
        if not v:
            return {'mean': None, 'std': None, 'max_abs': None}
        arr = np.array(v)
        return {
            'mean':    round(float(np.mean(arr)), 4),
            'std':     round(float(np.std(arr)), 4),
            'max_abs': round(float(np.max(np.abs(arr))), 4),
        }

    return {
        'com_lateral_bias':        com_bias,
        'body_centerline_dev':     centerline,
        'foot_weight_right_pct':   foot_r_pct,
        'foot_weight_left_pct':    foot_l_pct,
        'shoulder_tilt_deg':       sho_tilt,
        'pelvis_tilt_deg':         pel_tilt,
        'knee_angle_diff_deg':     knee_diff,
        'knee_asymmetry_pct':      knee_asym,
        'summary': {
            'com_lateral_bias':       _summary(com_bias),
            'body_centerline_dev':    _summary(centerline),
            'foot_weight_right_pct':  _summary(foot_r_pct),
            'foot_weight_left_pct':   _summary(foot_l_pct),
            'shoulder_tilt_deg':      _summary(sho_tilt),
            'pelvis_tilt_deg':        _summary(pel_tilt),
            'knee_angle_diff_deg':    _summary(knee_diff),
            'knee_asymmetry_pct':     _summary(knee_asym),
        }
    }
