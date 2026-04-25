import io
import os
from datetime import datetime

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image, KeepTogether,
)


JOINT_LABELS = {
    'left_elbow':     'Left Elbow',
    'right_elbow':    'Right Elbow',
    'left_shoulder':  'Left Shoulder',
    'right_shoulder': 'Right Shoulder',
    'left_hip':       'Left Hip',
    'right_hip':      'Right Hip',
    'left_knee':      'Left Knee',
    'right_knee':     'Right Knee',
    'left_ankle':     'Left Ankle (shank tilt)',
    'right_ankle':    'Right Ankle (shank tilt)',
}

PAGE_W = A4[0] - 4 * cm   # usable width (2 cm margin each side)


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _stats(values: list) -> dict:
    valid = [v for v in values if v is not None]
    if not valid:
        return {'min': '-', 'max': '-', 'mean': '-', 'range': '-'}
    return {
        'min':   f"{min(valid):.1f}°",
        'max':   f"{max(valid):.1f}°",
        'mean':  f"{np.mean(valid):.1f}°",
        'range': f"{max(valid) - min(valid):.1f}°",
    }


def _safe_series(arr):
    """Return list with None replaced by np.nan for matplotlib."""
    return [np.nan if v is None else v for v in (arr or [])]


def _table_style(has_header=True):
    base = [
        ('FONTSIZE',      (0, 0), (-1, -1), 10),
        ('GRID',          (0, 0), (-1, -1), 0.4, colors.HexColor('#e2e8f0')),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f7ff')]),
    ]
    if has_header:
        base += [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.white),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN',      (1, 0), (-1, -1), 'CENTER'),
        ]
    return TableStyle(base)


# ─────────────────────────────────────────────
#  Chart generators (return ReportLab Image)
# ─────────────────────────────────────────────

def _make_com_chart(data: dict, fig_w_cm=17, fig_h_cm=11) -> Image | None:
    """3-row subplot: COM Y displacement, vertical velocity, vertical accel."""
    kin = data.get('com_kinematics', {})
    com = data.get('com', {})
    if not kin:
        return None

    disp_y  = _safe_series(com.get('y'))
    vel_y   = _safe_series(kin.get('vel_y'))
    acc_y   = _safe_series(kin.get('acc_y'))

    # Use the longest series to derive frame count, then build time axis
    n = max(len(disp_y), len(vel_y), len(acc_y))
    if n == 0:
        return None

    fps = data.get('fps', 30.0) or 30.0
    # Try to get times from frames list if it exists; else build from fps
    frames = data.get('frames', [])
    if frames and len(frames) >= n:
        times = [f['timestamp'] for f in frames[:n]]
    else:
        times = [i / fps for i in range(n)]

    jump_times = []
    jm = data.get('jump_metrics') or {}
    for j in jm.get('jumps', []):
        jump_times.append(j.get('timestamp'))
    # Align lengths (trim/pad with nan)
    def _align(lst):
        lst = list(lst)
        if len(lst) < n:
            lst += [np.nan] * (n - len(lst))
        return lst[:n]

    disp_y = _align(disp_y)
    vel_y  = _align(vel_y)
    acc_y  = _align(acc_y)

    fig = plt.figure(figsize=(fig_w_cm / 2.54, fig_h_cm / 2.54), dpi=130)
    fig.patch.set_facecolor('#0f172a')
    gs = gridspec.GridSpec(3, 1, hspace=0.55)

    series = [
        (disp_y, 'COM Y Displacement (norm)',   '#60a5fa'),
        (vel_y,  'Vertical Velocity (norm/s)',   '#34d399'),
        (acc_y,  'Vertical Acceleration (norm/s²)', '#f87171'),
    ]

    for row, (vals, ylabel, clr) in enumerate(series):
        ax = fig.add_subplot(gs[row])
        ax.set_facecolor('#1e293b')
        ax.plot(times, vals, color=clr, linewidth=1.2)
        for jt in jump_times:
            ax.axvline(x=jt, color='#facc15', linewidth=0.9, linestyle='--', alpha=0.8)
        ax.set_ylabel(ylabel, color='#cbd5e1', fontsize=7)
        ax.set_xlabel('Time (s)' if row == 2 else '', color='#cbd5e1', fontsize=7)
        ax.tick_params(colors='#94a3b8', labelsize=6)
        for spine in ax.spines.values():
            spine.set_edgecolor('#334155')
        ax.grid(True, color='#334155', linewidth=0.4, alpha=0.6)

    if jump_times:
        axes = fig.get_axes()
        axes[0].set_title('COM Kinematics  ·  yellow lines = detected jumps',
                          color='#e2e8f0', fontsize=8, pad=4)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight',
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)

    img_w = fig_w_cm * cm
    img_h = fig_h_cm * cm
    return Image(buf, width=img_w, height=img_h)


def _make_foot_pressure_chart(balance_metrics: dict,
                               fig_w_cm=17, fig_h_cm=10) -> 'Image | None':
    """
    Two-panel figure:
      Left  — top-view foot shapes coloured by weight %, body centreline,
               COM marker showing lateral deviation.
      Right — horizontal bar gauge showing L/R split.
    """
    if not balance_metrics:
        return None
    summary = balance_metrics.get('summary', {})
    r_data  = summary.get('foot_weight_right_pct', {})
    cdev    = summary.get('body_centerline_dev', {})

    r_mean = r_data.get('mean')
    if r_mean is None:
        return None

    r_pct  = float(np.clip(r_mean, 0, 100))
    l_pct  = 100.0 - r_pct
    c_dev  = float(cdev.get('mean') or 0.0)   # ±1 = one half-shoulder-width

    # ── Foot shape vertices (anatomical LEFT foot, top view, toe pointing up) ──
    _LF = np.array([
        [ 0.00, -0.50],
        [-0.12, -0.48], [-0.20, -0.38], [-0.26, -0.18],
        [-0.28,  0.08], [-0.30,  0.32], [-0.28,  0.46],
        [-0.32,  0.58],  # pinky toe tip
        [-0.22,  0.64], [-0.10,  0.68],  # 4th & middle toe
        [ 0.04,  0.66], [ 0.16,  0.60],  # 2nd & big-toe base
        [ 0.24,  0.48],  # big toe
        [ 0.28,  0.32], [ 0.26,  0.08],
        [ 0.20, -0.18], [ 0.14, -0.38], [ 0.08, -0.48],
        [ 0.00, -0.50],  # close
    ])
    _RF = _LF.copy()
    _RF[:, 0] = -_LF[:, 0]   # mirror → RIGHT foot

    def _foot_color(pct):
        """0 % → blue,  50 % → green,  100 % → orange."""
        t = np.clip(pct / 100.0, 0, 1)
        if t < 0.5:
            t2 = t * 2
            return ((59  + (52  - 59 ) * t2) / 255,
                    (130 + (211 - 130) * t2) / 255,
                    (246 + (153 - 246) * t2) / 255)
        else:
            t2 = (t - 0.5) * 2
            return ((52  + (249 - 52 ) * t2) / 255,
                    (211 + (115 - 211) * t2) / 255,
                    (153 + (22  - 153) * t2) / 255)

    # ── Font: prefer CJK-capable fonts, fall back to ASCII labels ───────
    from matplotlib.patches import Polygon as MplPolygon
    import matplotlib.font_manager as _fm
    _cjk_candidates = ['Microsoft YaHei', 'SimHei', 'Noto Sans CJK TC',
                        'Arial Unicode MS', 'DejaVu Sans']
    _avail = {f.name for f in _fm.fontManager.ttflist}
    _cjk_font = next((f for f in _cjk_candidates if f in _avail), 'DejaVu Sans')
    plt.rcParams['font.family'] = _cjk_font

    fig, (ax1, ax2) = plt.subplots(
        1, 2,
        figsize=(fig_w_cm / 2.54, fig_h_cm / 2.54),
        gridspec_kw={'width_ratios': [2, 1]},
        dpi=130,
    )
    fig.patch.set_facecolor('#0f172a')

    # ── Left panel: foot diagram ──────────────────────────────────────────
    ax1.set_facecolor('#1e293b')
    ax1.set_xlim(-1.05, 1.05)
    ax1.set_ylim(-0.92, 1.05)
    ax1.set_aspect('equal')
    ax1.axis('off')

    SCALE  = 0.55
    LCX, RCX = -0.46, 0.46   # foot centre X (person's left / right)
    CY = 0.05                  # foot centre Y

    for verts_n, cx, pct, label in [
        (_LF, LCX, l_pct, '左腳 L'),
        (_RF, RCX, r_pct, '右腳 R'),
    ]:
        verts  = verts_n * SCALE + np.array([cx, CY])
        alpha  = 0.45 + 0.55 * (pct / 100)
        poly   = MplPolygon(verts, closed=True,
                             facecolor=_foot_color(pct),
                             edgecolor='#cbd5e1', linewidth=1.2,
                             alpha=np.clip(alpha, 0.4, 1.0), zorder=2)
        ax1.add_patch(poly)
        ax1.text(cx, CY + 0.06, f'{pct:.0f}%',
                 color='white', ha='center', va='center',
                 fontsize=13, fontweight='bold', zorder=3)
        ax1.text(cx, CY - SCALE * 0.63, label,
                 color='#94a3b8', ha='center', va='top', fontsize=8, zorder=3)

    # Body centreline (vertical dashed line)
    ax1.plot([0, 0], [-0.75, 0.92],
             color='#e2e8f0', linewidth=1.3, linestyle='--', alpha=0.55, zorder=1)
    ax1.text(0, 0.94, '體幹中線', color='#e2e8f0',
             ha='center', va='center', fontsize=7, alpha=0.8)

    # COM marker — mapped from c_dev (±1 half-shoulder-width → ±0.28 plot units)
    com_x = float(np.clip(c_dev * 0.28, -0.90, 0.90))
    com_y = CY + SCALE * 0.60
    ax1.plot(com_x, com_y, 'o', color='#facc15', markersize=11, zorder=5,
             markeredgecolor='white', markeredgewidth=1.2)
    ax1.text(com_x, com_y + 0.13, 'COM',
             color='#facc15', ha='center', va='bottom',
             fontsize=7, fontweight='bold')
    # Dotted line from centreline to COM
    if abs(com_x) > 0.01:
        ax1.annotate('', xy=(com_x, com_y), xytext=(0, com_y),
                     arrowprops=dict(arrowstyle='->', color='#facc15',
                                     lw=1.2, linestyle='dashed'))

    # Deviation caption
    if abs(c_dev) > 0.1:
        side = '→ 右偏' if c_dev > 0 else '← 左偏'
        ax1.text(0, -0.85, f'體幹中線偏移 {side}  {abs(c_dev):.2f}',
                 color='#fb923c', ha='center', fontsize=8, fontweight='bold')
    else:
        ax1.text(0, -0.85, '體幹中線置中 ✓',
                 color='#34d399', ha='center', fontsize=8, fontweight='bold')

    ax1.set_title('足底壓力分佈（俯視圖）', color='#e2e8f0', fontsize=9, pad=6)

    # ── Right panel: horizontal bar gauge ────────────────────────────────
    ax2.set_facecolor('#1e293b')
    labels = ['右腳 R', '左腳 L']
    values = [r_pct,   l_pct  ]
    colors_ = [_foot_color(r_pct), _foot_color(l_pct)]

    bars = ax2.barh(labels, values, color=colors_, height=0.45,
                    edgecolor='#475569', linewidth=0.8)
    ax2.axvline(50, color='#94a3b8', linewidth=1.0, linestyle='--', alpha=0.7)
    ax2.text(50, 1.32, '50%', color='#94a3b8',
             ha='center', va='bottom', fontsize=7)
    for bar, val in zip(bars, values):
        ax2.text(min(val + 2, 96), bar.get_y() + bar.get_height() / 2,
                 f'{val:.1f}%', color='white', va='center',
                 fontsize=10, fontweight='bold')

    ax2.set_xlim(0, 110)
    ax2.set_xlabel('體重比例 (%)', color='#cbd5e1', fontsize=8)
    ax2.set_title('左右重心分佈', color='#e2e8f0', fontsize=9, pad=6)
    ax2.tick_params(colors='#94a3b8', labelsize=8)
    for sp in ax2.spines.values():
        sp.set_edgecolor('#334155')

    plt.tight_layout(pad=1.0)

    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight',
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return Image(buf, width=fig_w_cm * cm, height=fig_h_cm * cm)


def _make_snapshot_image(snapshot_path: str,
                          max_w_cm=14, max_h_cm=18) -> Image | None:
    """Load annotated JPEG snapshot and return scaled ReportLab Image."""
    if not snapshot_path or not os.path.isfile(snapshot_path):
        return None
    try:
        from PIL import Image as PILImage
        with PILImage.open(snapshot_path) as pil:
            orig_w, orig_h = pil.size
        ratio  = orig_w / orig_h
        img_w  = min(max_w_cm * cm, max_h_cm * cm * ratio)
        img_h  = img_w / ratio
        if img_h > max_h_cm * cm:
            img_h = max_h_cm * cm
            img_w = img_h * ratio
        return Image(snapshot_path, width=img_w, height=img_h)
    except Exception:
        return None


# ─────────────────────────────────────────────
#  Balance summary helper
# ─────────────────────────────────────────────

def _fmt(v, unit='', decimals=2):
    if v is None or (isinstance(v, float) and not np.isfinite(v)):
        return '—'
    return f"{v:.{decimals}f}{unit}"


def _balance_rows(balance_metrics: dict) -> list:
    """Return rows for balance summary table."""
    s = balance_metrics.get('summary', {})
    rows = []

    def _add(label, key, unit):
        d = s.get(key, {})
        rows.append([
            label,
            _fmt(d.get('mean'), unit),
            _fmt(d.get('std'),  unit),
            _fmt(d.get('max_abs'), unit),
        ])

    _add('Body Centreline Deviation',  'body_centerline_dev',    '')
    _add('Left Foot Weight (%)',        'foot_weight_left_pct',   '%')
    _add('Right Foot Weight (%)',       'foot_weight_right_pct',  '%')
    _add('COM Lateral Bias',           'com_lateral_bias',        '')
    _add('Shoulder Tilt (°)',          'shoulder_tilt_deg',       '°')
    _add('Pelvis Tilt (°)',            'pelvis_tilt_deg',         '°')
    _add('Knee Angle Diff L-R (°)',   'knee_angle_diff_deg',     '°')
    _add('Knee Asymmetry (%)',         'knee_asymmetry_pct',      '%')
    return rows


# ─────────────────────────────────────────────
#  Main entry point
# ─────────────────────────────────────────────

def generate_pdf_report(data: dict, output_path: str, client_name: str = ''):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2*cm,   bottomMargin=2*cm,
    )
    styles = getSampleStyleSheet()
    story  = []

    # ── Paragraph styles ────────────────────────────────────────────────
    accent = ParagraphStyle('accent', parent=styles['Title'],
                            fontSize=22, textColor=colors.HexColor('#1e3a5f'), spaceAfter=4)
    sub    = ParagraphStyle('sub', parent=styles['Normal'],
                            fontSize=10, textColor=colors.HexColor('#64748b'), spaceAfter=2)
    h2     = ParagraphStyle('h2', parent=styles['Heading2'],
                            fontSize=13, textColor=colors.HexColor('#1e3a5f'),
                            spaceBefore=14, spaceAfter=6)
    caption = ParagraphStyle('caption', parent=styles['Normal'],
                             fontSize=8, textColor=colors.HexColor('#94a3b8'),
                             spaceAfter=4, alignment=1)   # centered

    # ── Header ──────────────────────────────────────────────────────────
    story.append(Paragraph("Motion Analysis Report", accent))
    story.append(Paragraph("宥芯健康顧問｜YouCore Health Advisors", sub))
    if client_name:
        story.append(Paragraph(f"Client: {client_name}", sub))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d  %H:%M')}", sub))
    story.append(HRFlowable(width='100%', thickness=1,
                             color=colors.HexColor('#3b82f6'), spaceAfter=10))

    # ── Video Info ───────────────────────────────────────────────────────
    story.append(Paragraph("Video Information", h2))
    info_rows = [
        ['Duration',     f"{data.get('duration', 0):.1f} sec"],
        ['Frame Rate',   f"{data.get('fps', 30):.0f} fps"],
        ['Total Frames', str(data.get('total_frames', 0))],
        ['Resolution',   f"{data.get('width', 0)} × {data.get('height', 0)} px"],
    ]
    if data.get('weight'):
        info_rows.append(['Body Weight', f"{data['weight']} kg"])
    if data.get('height_cm'):
        info_rows.append(['Height', f"{data['height_cm']} cm"])
    if data.get('client_name'):
        info_rows.insert(0, ['Client', data['client_name']])

    t = Table(info_rows, colWidths=[5*cm, 11*cm])
    t.setStyle(TableStyle([
        ('FONTNAME',        (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE',        (0, 0), (-1, -1), 10),
        ('GRID',            (0, 0), (-1, -1), 0.4, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',  (0, 0), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
        ('TOPPADDING',      (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',   (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.4*cm))

    # ── Body Snapshot ────────────────────────────────────────────────────
    snap_path = data.get('snapshot_path')
    snap_img  = _make_snapshot_image(snap_path)
    if snap_img:
        story.append(Paragraph("姿態截圖與不對稱標示", h2))
        story.append(Paragraph(
            "Best-confidence frame from video with skeleton overlay and asymmetry highlights. "
            "Red lines = shoulder/pelvis tilt > 3°, red circles = knee asymmetry > 10%.",
            caption
        ))
        # Centre the image
        img_table = Table([[snap_img]], colWidths=[PAGE_W])
        img_table.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
        story.append(KeepTogether([img_table]))
        story.append(Spacer(1, 0.3*cm))

    # ── Balance Metrics ──────────────────────────────────────────────────
    balance = data.get('balance_metrics')
    if balance:
        story.append(Paragraph("Balance & Symmetry Analysis", h2))
        header = [['Metric', 'Mean', 'Std Dev', 'Max Offset']]
        brows  = _balance_rows(balance)
        if brows:
            bt = Table(header + brows,
                       colWidths=[7.5*cm, 2.8*cm, 2.8*cm, 3.1*cm])
            bt.setStyle(_table_style())
            story.append(bt)
            story.append(Spacer(1, 0.2*cm))
            story.append(Paragraph(
                "Body Centreline Dev: 0 = COM on anatomical midline; "
                "+ = shifted image-right; − = image-left (units: half shoulder-width).  "
                "Foot Weight: lever-law estimate from ankle positions and COM.  "
                "Shoulder/Pelvis tilt: + = right side lower.  "
                "Knee Asymmetry < 5% = symmetric.",
                caption
            ))

        # ── Foot pressure visualisation ──────────────────────
        foot_chart = _make_foot_pressure_chart(balance)
        if foot_chart:
            story.append(Spacer(1, 0.3*cm))
            ft = Table([[foot_chart]], colWidths=[PAGE_W])
            ft.setStyle(TableStyle([('ALIGN', (0,0),(-1,-1), 'CENTER')]))
            story.append(KeepTogether([ft]))
            story.append(Spacer(1, 0.2*cm))

    # ── Joint Angle Stats ────────────────────────────────────────────────
    if data.get('joint_angles'):
        story.append(Paragraph("Joint Angle Statistics", h2))
        header = [['Joint', 'Min', 'Max', 'Mean', 'ROM']]
        rows   = []
        for key, label in JOINT_LABELS.items():
            vals = data['joint_angles'].get(key, [])
            if not any(v is not None for v in vals):
                continue
            s = _stats(vals)
            rows.append([label, s['min'], s['max'], s['mean'], s['range']])

        if rows:
            at = Table(header + rows,
                       colWidths=[5.2*cm, 2.7*cm, 2.7*cm, 2.7*cm, 2.9*cm])
            at.setStyle(_table_style())
            story.append(at)

    # ── COM Summary ──────────────────────────────────────────────────────
    com = data.get('com', {})
    kin = data.get('com_kinematics', {})
    if com.get('x'):
        story.append(Paragraph("Centre of Mass Summary", h2))
        valid_x  = [v for v in com['x'] if v is not None]
        valid_vy = [v for v in kin.get('vel_y', []) if v is not None]
        valid_ay = [v for v in kin.get('acc_y', []) if v is not None]

        com_rows = []
        if valid_x:
            com_rows.append(['COM X displacement (norm)',
                             f"{min(valid_x):.3f}", f"{max(valid_x):.3f}",
                             f"{np.mean(valid_x):.3f}"])
        if valid_vy:
            com_rows.append(['COM Vertical Velocity (norm/s)',
                             f"{min(valid_vy):.3f}", f"{max(valid_vy):.3f}",
                             f"{np.mean(valid_vy):.3f}"])
        if valid_ay:
            com_rows.append(['COM Vertical Accel (norm/s²)',
                             f"{min(valid_ay):.3f}", f"{max(valid_ay):.3f}",
                             f"{np.mean(valid_ay):.3f}"])

        if com_rows:
            ch = [['Metric', 'Min', 'Max', 'Mean']]
            ct = Table(ch + com_rows, colWidths=[7*cm, 3*cm, 3*cm, 3*cm])
            ct.setStyle(_table_style())
            story.append(ct)

    # ── COM Kinematics Chart ─────────────────────────────────────────────
    if kin:
        story.append(Spacer(1, 0.4*cm))
        com_chart = _make_com_chart(data)
        if com_chart:
            story.append(Paragraph("COM Kinematics — Time Series", h2))
            story.append(Paragraph(
                "Vertical displacement, velocity and acceleration of the body's centre of mass. "
                "Yellow dashed lines mark detected jump events.",
                caption
            ))
            chart_table = Table([[com_chart]], colWidths=[PAGE_W])
            chart_table.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
            story.append(KeepTogether([chart_table]))
            story.append(Spacer(1, 0.3*cm))

    # ── Jump Metrics ─────────────────────────────────────────────────────
    jm = data.get('jump_metrics')
    if jm and jm.get('jumps'):
        story.append(Paragraph("Jump Analysis", h2))

        # Global summary
        g_rows = [
            ['Jumps detected',        str(len(jm['jumps']))],
            ['Peak takeoff velocity', _fmt(jm.get('peak_velocity_norm'), ' norm/s', 3)],
            ['Max jump height',       _fmt(jm.get('max_height_norm'),    ' norm',   3)],
            ['Peak power index',      _fmt(jm.get('peak_power_index'),   ' norm',   3)],
        ]
        gt = Table(g_rows, colWidths=[7*cm, 9*cm])
        gt.setStyle(TableStyle([
            ('FONTNAME',       (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE',       (0, 0), (-1, -1), 10),
            ('GRID',           (0, 0), (-1, -1), 0.4, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1),
             [colors.HexColor('#f8fafc'), colors.white]),
            ('TOPPADDING',     (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING',  (0, 0), (-1, -1), 5),
        ]))
        story.append(gt)
        story.append(Spacer(1, 0.3*cm))

        # Per-jump table
        jh = [['#', 'Time (s)', 'Height (norm)', 'Takeoff vel (norm/s)', 'Power index']]
        jrows = []
        for i, j in enumerate(jm['jumps']):
            jrows.append([
                str(i + 1),
                _fmt(j.get('timestamp'),          '', 2),
                _fmt(j.get('height_norm'),        '', 3),
                _fmt(j.get('peak_velocity_norm'), '', 3),
                _fmt(j.get('peak_power_index'),   '', 3),
            ])
        if jrows:
            jt = Table(jh + jrows,
                       colWidths=[1*cm, 2.5*cm, 3.5*cm, 4.5*cm, 4.7*cm])
            jt.setStyle(_table_style())
            story.append(jt)

    # ── Footer ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width='100%', thickness=0.5,
                             color=colors.HexColor('#e2e8f0')))
    footer_style = ParagraphStyle('footer', parent=styles['Normal'],
                                  fontSize=8, textColor=colors.HexColor('#94a3b8'))
    story.append(Paragraph(
        "宥芯健康顧問有限公司  ·  youcore.press  ·  (02)2653-9433  ·  youcore.healthadvisors@gmail.com",
        footer_style
    ))

    doc.build(story)
