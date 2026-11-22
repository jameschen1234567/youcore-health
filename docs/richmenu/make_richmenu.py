# 產生 LINE 圖文選單圖片：大型 6 格（2500x1686）與小型 4 格（2500x843）
from PIL import Image, ImageDraw, ImageFont
import os

S = 2  # 先畫 2 倍再縮小，邊緣比較平滑
BG, CARD, INK, SOFT, BRAND, ACCENT, LINE = '#F4F0E8', '#FFFFFF', '#1C2B1A', '#5B6657', '#4A6741', '#C9A96E', '#E2DCCF'
BOLD = 'C:/Windows/Fonts/msjhbd.ttc'
REG = 'C:/Windows/Fonts/msjh.ttc'
OUT = os.path.dirname(os.path.abspath(__file__))

def font(path, px): return ImageFont.truetype(path, px * S)

# ── 圖示（以中心點 cx, cy、尺寸 r 繪製）──────────────────────────
def ic_dumbbell(d, cx, cy, r, c, w):
    d.line([cx - r * .55, cy, cx + r * .55, cy], fill=c, width=w)
    for sx in (-1, 1):
        d.rounded_rectangle([cx + sx * r * .55 - (r * .22 if sx > 0 else 0) - (0 if sx > 0 else 0), cy - r * .5,
                             cx + sx * r * .55 + (0 if sx > 0 else 0) + (r * .22 if sx < 0 else 0) * 0, cy + r * .5], r * .06, fill=c) if False else None
        x_in = cx + sx * r * .45
        d.rounded_rectangle(sorted([x_in, x_in + sx * r * .2]) and [min(x_in, x_in + sx * r * .2), cy - r * .55, max(x_in, x_in + sx * r * .2), cy + r * .55], r * .06, fill=c)
        x2 = cx + sx * r * .7
        d.rounded_rectangle([min(x2, x2 + sx * r * .16), cy - r * .32, max(x2, x2 + sx * r * .16), cy + r * .32], r * .05, fill=c)

def ic_clipboard(d, cx, cy, r, c, w):
    d.rounded_rectangle([cx - r * .6, cy - r * .7, cx + r * .6, cy + r * .8], r * .12, outline=c, width=w)
    d.rounded_rectangle([cx - r * .28, cy - r * .86, cx + r * .28, cy - r * .58], r * .08, fill=c)
    for i, y in enumerate((-.3, .1, .5)):
        yy = cy + r * y
        d.line([cx - r * .38, yy, cx - r * .28, yy + r * .1, cx - r * .12, yy - r * .1], fill=c, width=w, joint='curve')
        d.line([cx + r * .02, yy, cx + r * .4, yy], fill=c, width=w)

def ic_book(d, cx, cy, r, c, w):
    d.line([cx, cy - r * .5, cx, cy + r * .65], fill=c, width=w)
    d.polygon([(cx - r * .05, cy - r * .5), (cx - r * .8, cy - r * .62), (cx - r * .8, cy + r * .55), (cx - r * .05, cy + r * .65)], outline=c, width=w)
    d.polygon([(cx + r * .05, cy - r * .5), (cx + r * .8, cy - r * .62), (cx + r * .8, cy + r * .55), (cx + r * .05, cy + r * .65)], outline=c, width=w)
    for y in (-.25, .05, .35):
        d.line([cx - r * .62, cy + r * y - r * .03, cx - r * .22, cy + r * y + r * .02], fill=c, width=max(1, w * 2 // 3))
        d.line([cx + r * .22, cy + r * y + r * .02, cx + r * .62, cy + r * y - r * .03], fill=c, width=max(1, w * 2 // 3))

def ic_calendar(d, cx, cy, r, c, w):
    d.rounded_rectangle([cx - r * .75, cy - r * .6, cx + r * .75, cy + r * .75], r * .14, outline=c, width=w)
    d.line([cx - r * .75, cy - r * .22, cx + r * .75, cy - r * .22], fill=c, width=w)
    for sx in (-.38, .38):
        d.line([cx + r * sx, cy - r * .82, cx + r * sx, cy - r * .42], fill=c, width=w)
    d.line([cx - r * .3, cy + r * .25, cx - r * .05, cy + r * .48, cx + r * .38, cy + r * .02], fill=c, width=w, joint='curve')

def ic_foot(d, cx, cy, r, c, w):
    d.ellipse([cx - r * .42, cy - r * .35, cx + r * .32, cy + r * .9], outline=c, width=w)
    for (dx, dy, rr) in ((-.28, -.62, .15), (.0, -.75, .12), (.22, -.7, .1), (.38, -.56, .085), (.5, -.38, .075)):
        d.ellipse([cx + r * (dx - rr), cy + r * (dy - rr), cx + r * (dx + rr), cy + r * (dy + rr)], fill=c)

def ic_person(d, cx, cy, r, c, w):
    d.ellipse([cx - r * .32, cy - r * .78, cx + r * .32, cy - r * .14], outline=c, width=w)
    d.arc([cx - r * .72, cy + r * .02, cx + r * .72, cy + r * 1.3], 180, 360, fill=c, width=w)
    d.line([cx - r * .72, cy + r * .66, cx + r * .72, cy + r * .66], fill=c, width=w)

BUTTONS = {
    'training': ('我的訓練', '身體組成・肌力進步', ic_dumbbell),
    'screen':   ('初步篩檢', '疼痛與功能量表', ic_clipboard),
    'article':  ('健康文章', '運動科學衛教', ic_book),
    'foot':     ('足部檢測', '手機拍照量足型', ic_foot),
    'me':       ('會員資料', '基本資料・紀錄', ic_person),
    'booking':  ('立即預約', '檢測・訓練・按摩', ic_calendar),
}

def render(name, W, H, layout, title_px, sub_px, icon_r):
    W2, H2 = W * S, H * S
    img = Image.new('RGB', (W2, H2), BG)
    d = ImageDraw.Draw(img)
    rows = len(layout)
    gap, pad = 22 * S, 26 * S
    for ri, row in enumerate(layout):
        cols = len(row)
        cw = (W2 - pad * 2 - gap * (cols - 1)) / cols
        ch = (H2 - pad * 2 - gap * (rows - 1)) / rows
        for ci, key in enumerate(row):
            x0 = pad + ci * (cw + gap); y0 = pad + ri * (ch + gap)
            title, sub, icon = BUTTONS[key]
            hot = key == 'booking'
            fill, tc, sc, icc = (BRAND, '#FFFFFF', '#E9E2D0', '#FFFFFF') if hot else (CARD, INK, SOFT, BRAND)
            d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], 36 * S, fill=fill, outline=None if hot else LINE, width=3 * S)
            cx = x0 + cw / 2
            ft, fs = font(BOLD, title_px), font(REG, sub_px)
            th = ft.getbbox('預')[3]; sh = fs.getbbox('預')[3]
            circ = icon_r * 1.45 * S
            block = circ * 2 + 44 * S + th + 26 * S + sh
            top = y0 + (ch - block) / 2
            icy = top + circ
            d.ellipse([cx - circ, icy - circ, cx + circ, icy + circ], fill=ACCENT if hot else '#EDF1E9')
            icon(d, cx, icy, icon_r * S, '#FFFFFF' if hot else icc, max(6, int(icon_r * S * .13)))
            ty = icy + circ + 44 * S
            d.text((cx, ty), title, font=ft, fill=tc, anchor='mt')
            d.text((cx, ty + th + 26 * S), sub, font=fs, fill=sc, anchor='mt')
            if hot:
                d.rounded_rectangle([x0 + cw - 210 * S, y0 + 30 * S, x0 + cw - 30 * S, y0 + 100 * S], 35 * S, fill=ACCENT)
                d.text((x0 + cw - 120 * S, y0 + 65 * S), 'LINE 預約', font=font(BOLD, 38), fill='#FFFFFF', anchor='mm')
    img = img.resize((W, H), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, 'PNG', optimize=True)
    if os.path.getsize(path) > 1_000_000:
        path = path.replace('.png', '.jpg'); img.save(path, 'JPEG', quality=90)
    print(path, os.path.getsize(path))

render('richmenu-large-6.png', 2500, 1686, [['training', 'screen', 'article'], ['foot', 'me', 'booking']], 108, 54, 120)
render('richmenu-compact-4.png', 2500, 843, [['training', 'screen', 'article', 'booking']], 92, 46, 92)
