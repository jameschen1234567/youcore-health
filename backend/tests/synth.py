"""
合成測試圖：深色地板上一張 A4 紙，紙上一隻已知尺寸的「腳」，再用單應性矩陣模擬手機拍攝角度。
腳的形狀 = 腳跟橢圓 + 前掌橢圓；足長 = L，最大寬度 W 落在距腳跟 68% 處（前掌區內）。
"""
import cv2
import numpy as np

RES = 4  # 紙面繪製解析度 px/mm
SKIN = (120, 150, 205)  # BGR 膚色


def render_paper(L, W, cx=105.0, toe_y=20.0, angle_deg=0.0, color=SKIN, foot=True):
    """紙面俯視圖（白紙＋腳），單位 RES px/mm。腳尖在上（y 小）。"""
    pw, ph = 210 * RES, 297 * RES
    paper = np.full((ph, pw, 3), 245, np.uint8)
    if not foot:
        return paper
    layer = np.zeros((ph, pw), np.uint8)
    # 以腳尖為原點、沿 +y 往腳跟方向
    heel_c = L - 0.3 * L     # 腳跟橢圓中心距腳尖
    fore_c = L - 0.68 * L
    cv2.ellipse(layer, (round(cx * RES), round((toe_y + heel_c) * RES)),
                (round(0.32 * W * RES), round(0.3 * L * RES)), 0, 0, 360, 255, -1)
    cv2.ellipse(layer, (round(cx * RES), round((toe_y + fore_c) * RES)),
                (round(0.5 * W * RES), round(0.32 * L * RES)), 0, 0, 360, 255, -1)
    if angle_deg:
        center = (cx * RES, (toe_y + L / 2) * RES)
        R = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
        layer = cv2.warpAffine(layer, R, (pw, ph))
    paper[layer > 127] = color
    return paper


def photograph(paper, quad, size=(1500, 2000), floor=(40, 45, 50), noise=4.0, seed=0, gradient=True):
    """把紙面圖投影到照片中的四邊形 quad（tl, tr, br, bl）。"""
    ph, pw = paper.shape[:2]
    src = np.array([[0, 0], [pw - 1, 0], [pw - 1, ph - 1], [0, ph - 1]], np.float32)
    M = cv2.getPerspectiveTransform(src, np.array(quad, np.float32))
    w, h = size
    out = np.full((h, w, 3), floor, np.uint8)
    warped = cv2.warpPerspective(paper, M, (w, h), flags=cv2.INTER_AREA)
    m = cv2.warpPerspective(np.full((ph, pw), 255, np.uint8), M, (w, h)) > 127
    out[m] = warped[m]
    out = out.astype(np.float32)
    if gradient:  # 室內光線不均
        gx = np.linspace(0.88, 1.0, w)[None, :, None]
        out *= gx
    rng = np.random.default_rng(seed)
    out += rng.normal(0, noise, out.shape)
    return np.clip(out, 0, 255).astype(np.uint8)


def upright_quad(x0=300, y0=250, scale=4.0):
    """正上方拍攝：紙張在照片中是正矩形。"""
    w, h = 210 * scale, 297 * scale
    return [(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)]
