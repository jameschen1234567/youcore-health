"""
足部初篩 A1：用一張 A4 紙量足長、足寬。

流程（對應規格第五節）：
  1. 找出 A4 紙的四個角（亮區最大輪廓 → 凸包 → 四邊形近似）
  2. 透視轉換成 210 × 297 mm 俯視圖（PX_PER_MM 像素 / mm）
  3. 在紙內以「與紙色的差距」分割足部，取最大輪廓
  4. 沿足部主軸量足長；前掌區（距腳跟 50–85%）量最大寬度 → 足寬

任一品質檢查不合格就丟出 FootMeasureError(code)，前端依錯誤碼提示重拍。
API 不保存照片。
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

ALGO_VERSION = "a1-0.1.0"

PAPER_W_MM, PAPER_H_MM = 210.0, 297.0
PX_PER_MM = 2.0
MAX_INPUT_SIDE = 2000          # 先縮圖，加快運算
EDGE_INSET_MM = 3.0            # 紙張邊緣內縮，避開透視轉換時殘留的地板
TOUCH_MM = 1.5                 # 足部輪廓離邊界小於此值視為「碰到邊」
MIN_FOOT_AREA_MM2 = 3000.0
MIN_FOOT_LENGTH_MM = 90.0
OBLIQUE_RATIO_TOL = 0.15       # 長寬比偏離 297:210 的容許比例
OBLIQUE_EDGE_TOL = 0.20        # 對邊長度差的容許比例
FOREFOOT_RANGE = (0.50, 0.85)  # 足寬取樣區：距腳跟的足長比例
ROTATION_WARN_DEG = 20.0

CONFIG_PATH = Path(__file__).parent / "foot_config.json"


class FootMeasureError(Exception):
    """品質檢查不合格。code 對應規格中的錯誤碼。"""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


@dataclass
class FootResult:
    length_mm: float
    width_mm: float
    width_class: str | None
    quality_flags: list[str]
    algo_version: str = ALGO_VERSION

    def to_dict(self) -> dict:
        return {
            "length_mm": self.length_mm,
            "width_mm": self.width_mm,
            "width_class": self.width_class,
            "quality_flags": self.quality_flags,
            "algo_version": self.algo_version,
        }


# ── 設定檔 ────────────────────────────────────────────────────────────────────

def load_config(path: Path = CONFIG_PATH) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def classify_width(length_mm: float, width_mm: float, config: dict) -> str | None:
    """依 足寬／足長 比例分類。門檻由 James 依手量資料寫進設定檔；未設定就回傳 None。"""
    t = (config or {}).get("width_ratio_thresholds")
    if not t or t.get("narrow_below") is None or t.get("wide_above") is None:
        return None
    ratio = width_mm / length_mm
    if ratio < t["narrow_below"]:
        return "narrow"
    if ratio > t["wide_above"]:
        return "wide"
    return "standard"


# ── 主函式 ────────────────────────────────────────────────────────────────────

def decode_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise FootMeasureError("UNREADABLE_IMAGE", "無法解讀圖片")
    return img


def measure_foot(img: np.ndarray, config: dict | None = None) -> FootResult:
    flags: list[str] = []
    img = _downscale(img)

    corners = find_paper(img)
    check_oblique(corners)
    if _short_side_px(corners) < PAPER_W_MM * PX_PER_MM:
        flags.append("LOW_RESOLUTION")

    top = warp_paper(img, corners)
    mask = segment_foot(top)
    length, width, angle = measure_mask(mask)

    if abs(angle) > ROTATION_WARN_DEG:
        flags.append("FOOT_ROTATED")

    length, width = round(length, 1), round(width, 1)
    return FootResult(
        length_mm=length,
        width_mm=width,
        width_class=classify_width(length, width, config if config is not None else load_config()),
        quality_flags=flags,
    )


# ── 1. 找紙 ───────────────────────────────────────────────────────────────────

def _downscale(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    s = MAX_INPUT_SIDE / max(h, w)
    if s < 1:
        img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    return img


def find_paper(img: np.ndarray) -> np.ndarray:
    """回傳四角座標（tl, tr, br, bl），float32 (4, 2)。"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    _, bright = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise FootMeasureError("PAPER_NOT_FOUND", "畫面中沒有亮色區塊")
    c = max(contours, key=cv2.contourArea)
    img_area = img.shape[0] * img.shape[1]
    if cv2.contourArea(c) < 0.05 * img_area:
        raise FootMeasureError("PAPER_NOT_FOUND", "亮色區塊太小")

    # 凸包可補回腿部或陰影遮住紙緣造成的凹口
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    quad = None
    for eps in np.linspace(0.01, 0.08, 15):
        approx = cv2.approxPolyDP(hull, eps * peri, True)
        if len(approx) == 4:
            quad = approx.reshape(4, 2).astype(np.float32)
            break
    if quad is None:
        raise FootMeasureError("PAPER_NOT_FOUND", "找不到四邊形")
    # 四邊形應幾乎填滿凸包，否則可能是紙被切到畫面外
    if cv2.contourArea(quad) < 0.9 * cv2.contourArea(hull):
        raise FootMeasureError("PAPER_NOT_FOUND", "四邊形不完整")
    if _touches_image_border(quad, img.shape):
        raise FootMeasureError("PAPER_NOT_FOUND", "紙張角落超出畫面")
    return order_corners(quad)


def _touches_image_border(quad: np.ndarray, shape, margin: int = 2) -> bool:
    h, w = shape[:2]
    xs, ys = quad[:, 0], quad[:, 1]
    return bool((xs <= margin).any() or (ys <= margin).any() or (xs >= w - 1 - margin).any() or (ys >= h - 1 - margin).any())


def order_corners(pts: np.ndarray) -> np.ndarray:
    """排成 tl, tr, br, bl（影像座標）。"""
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()  # y - x
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def _edges(c: np.ndarray):
    top = np.linalg.norm(c[1] - c[0])
    right = np.linalg.norm(c[2] - c[1])
    bottom = np.linalg.norm(c[3] - c[2])
    left = np.linalg.norm(c[0] - c[3])
    return top, right, bottom, left


def _short_side_px(c: np.ndarray) -> float:
    top, right, bottom, left = _edges(c)
    return min((top + bottom) / 2, (left + right) / 2)


def check_oblique(c: np.ndarray) -> None:
    top, right, bottom, left = _edges(c)
    for a, b in ((top, bottom), (left, right)):
        if abs(a - b) / max(a, b) > OBLIQUE_EDGE_TOL:
            raise FootMeasureError("TOO_OBLIQUE", "對邊長度差太大")
    h, w = (left + right) / 2, (top + bottom) / 2
    ratio = max(h, w) / min(h, w)
    expected = PAPER_H_MM / PAPER_W_MM
    if abs(ratio - expected) / expected > OBLIQUE_RATIO_TOL:
        raise FootMeasureError("TOO_OBLIQUE", "長寬比不像 A4")


# ── 2. 透視轉換 ───────────────────────────────────────────────────────────────

def warp_paper(img: np.ndarray, c: np.ndarray) -> np.ndarray:
    """轉成直式俯視圖（長邊垂直），寬 210 mm × 高 297 mm。"""
    top, right, bottom, left = _edges(c)
    if (top + bottom) > (left + right):  # 橫放的紙：轉一格讓長邊變成垂直
        c = np.roll(c, -1, axis=0)
    w, h = round(PAPER_W_MM * PX_PER_MM), round(PAPER_H_MM * PX_PER_MM)
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(c, dst)
    return cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LINEAR)


# ── 3. 分割足部 ───────────────────────────────────────────────────────────────

def segment_foot(top: np.ndarray) -> np.ndarray:
    """回傳足部遮罩（與俯視圖同大小，uint8 0/255）。"""
    inset = round(EDGE_INSET_MM * PX_PER_MM)
    h, w = top.shape[:2]

    lab = cv2.cvtColor(cv2.GaussianBlur(top, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    # 紙色參考：內縮帶（邊緣往內 3–10 mm）的中位數，那裡幾乎都是紙
    band = np.zeros((h, w), bool)
    band[inset:h - inset, inset:w - inset] = True
    inner = round(10 * PX_PER_MM)
    band[inner:h - inner, inner:w - inner] = False
    ref = np.median(lab[band], axis=0)

    dL = (lab[..., 0] - ref[0]) * 0.6  # 亮度權重較低，減少陰影誤判
    dist = np.sqrt(dL ** 2 + (lab[..., 1] - ref[1]) ** 2 + (lab[..., 2] - ref[2]) ** 2)
    dist = np.clip(dist, 0, 255).astype(np.uint8)
    t, _ = cv2.threshold(dist[inset:h - inset, inset:w - inset], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = (dist > max(t, 15)).astype(np.uint8) * 255

    mask[:inset, :] = 0
    mask[h - inset:, :] = 0
    mask[:, :inset] = 0
    mask[:, w - inset:] = 0
    k = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        raise FootMeasureError("FOOT_NOT_FOUND")
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < MIN_FOOT_AREA_MM2 * PX_PER_MM ** 2:
        raise FootMeasureError("FOOT_NOT_FOUND", "足部輪廓太小")

    x, y, bw, bh = cv2.boundingRect(c)
    touch = inset + round(TOUCH_MM * PX_PER_MM)
    if x <= touch or y <= touch or x + bw >= w - touch or y + bh >= h - touch:
        raise FootMeasureError("FOOT_OUT_OF_PAPER")

    out = np.zeros_like(mask)
    cv2.drawContours(out, [c], -1, 255, thickness=cv2.FILLED)
    return out


# ── 4. 量測 ───────────────────────────────────────────────────────────────────

def measure_mask(mask: np.ndarray) -> tuple[float, float, float]:
    """回傳（足長 mm、足寬 mm、足部主軸與紙長軸的夾角 deg）。"""
    ys, xs = np.nonzero(mask)
    pts = np.column_stack([xs, ys]).astype(np.float64) / PX_PER_MM  # 單位：mm
    center = pts.mean(axis=0)
    cov = np.cov((pts - center).T)
    vals, vecs = np.linalg.eigh(cov)
    axis = vecs[:, np.argmax(vals)]
    perp = np.array([-axis[1], axis[0]])

    along = (pts - center) @ axis
    across = (pts - center) @ perp
    # 像素中心到邊緣差半格，補回 1 px
    lo, hi = along.min(), along.max()
    length = hi - lo + 1 / PX_PER_MM
    if length < MIN_FOOT_LENGTH_MM:
        raise FootMeasureError("FOOT_NOT_FOUND", "足長太短")

    # 前掌較寬：比較兩半的寬度決定腳跟在哪一端
    mid = (lo + hi) / 2
    def span(sel):
        return across[sel].max() - across[sel].min() if sel.any() else 0.0
    heel_at_lo = span(along > mid) >= span(along <= mid)
    rel = (along - lo) / (hi - lo)
    if not heel_at_lo:
        rel = 1 - rel

    # 前掌區逐段（1 mm）取寬度最大值
    a, b = FOREFOOT_RANGE
    width = 0.0
    sel_all = (rel >= a) & (rel <= b)
    if sel_all.any():
        bins = np.floor(along[sel_all]).astype(int)
        acr = across[sel_all]
        for k in np.unique(bins):
            s = acr[bins == k]
            width = max(width, s.max() - s.min() + 1 / PX_PER_MM)

    angle = np.degrees(np.arctan2(axis[0], axis[1]))  # 與垂直（紙長軸）夾角
    angle = (angle + 90) % 180 - 90
    return float(length), float(width), float(angle)
