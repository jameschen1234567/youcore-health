import cv2
import numpy as np
import pytest

from foot_measure import (
    FootMeasureError, classify_width, decode_image, measure_foot, order_corners,
)
from tests.synth import photograph, render_paper, upright_quad

TOL = 2.0  # 合成圖容許誤差 mm（實拍驗收標準是 5 mm）
NO_CLASS = {"width_ratio_thresholds": {"narrow_below": None, "wide_above": None}}


def measure(img, config=NO_CLASS):
    return measure_foot(img, config)


@pytest.mark.parametrize("L,W", [(250, 95), (225, 88), (275, 105), (180, 72)])
def test_upright_photo_measures_known_size(L, W):
    img = photograph(render_paper(L, W, toe_y=(297 - L) / 2), upright_quad())
    r = measure(img)
    assert r.length_mm == pytest.approx(L, abs=TOL)
    assert r.width_mm == pytest.approx(W, abs=TOL)
    assert r.quality_flags == []
    assert r.width_class is None


def test_mild_perspective_still_accurate():
    # 手機稍微傾斜：上緣較短（約 8%）
    quad = [(360, 260), (1110, 280), (1170, 1460), (300, 1440)]
    img = photograph(render_paper(250, 95, toe_y=24), quad)
    r = measure(img)
    assert r.length_mm == pytest.approx(250, abs=TOL)
    assert r.width_mm == pytest.approx(95, abs=TOL)


def test_landscape_and_rotated_photo():
    # 整張照片轉 90 度（紙橫放），腳跟方向也反過來
    img = photograph(render_paper(240, 92, toe_y=28), upright_quad())
    img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    r = measure(img)
    assert r.length_mm == pytest.approx(240, abs=TOL)
    assert r.width_mm == pytest.approx(92, abs=TOL)


def test_paper_rotated_in_frame():
    base = photograph(render_paper(250, 95, toe_y=24), upright_quad(x0=330, y0=360, scale=3.6))
    M = cv2.getRotationMatrix2D((750, 1000), 25, 1.0)
    img = cv2.warpAffine(base, M, (1500, 2000), borderValue=(40, 45, 50))
    r = measure(img)
    assert r.length_mm == pytest.approx(250, abs=TOL)
    assert r.width_mm == pytest.approx(95, abs=TOL)


def test_foot_rotated_on_paper_is_measured_along_foot_axis():
    img = photograph(render_paper(240, 92, toe_y=28, angle_deg=12), upright_quad())
    r = measure(img)
    assert r.length_mm == pytest.approx(240, abs=TOL)
    assert r.width_mm == pytest.approx(92, abs=TOL)
    assert "FOOT_ROTATED" not in r.quality_flags


def test_strongly_rotated_foot_is_flagged():
    img = photograph(render_paper(200, 80, toe_y=48, angle_deg=28), upright_quad())
    r = measure(img)
    assert "FOOT_ROTATED" in r.quality_flags


def test_dark_sock():
    img = photograph(render_paper(250, 95, toe_y=24, color=(60, 60, 60)), upright_quad())
    r = measure(img)
    assert r.length_mm == pytest.approx(250, abs=TOL)


def test_low_resolution_flag():
    img = photograph(render_paper(250, 95, toe_y=24), upright_quad(x0=100, y0=100, scale=1.8), size=(600, 800))
    r = measure(img)
    assert "LOW_RESOLUTION" in r.quality_flags


def test_paper_not_found_on_empty_floor():
    img = np.full((2000, 1500, 3), 40, np.uint8)
    with pytest.raises(FootMeasureError) as e:
        measure(img)
    assert e.value.code == "PAPER_NOT_FOUND"


def test_paper_cut_off_by_frame():
    img = photograph(render_paper(250, 95, toe_y=24), upright_quad(x0=-200, y0=250))
    with pytest.raises(FootMeasureError) as e:
        measure(img)
    assert e.value.code == "PAPER_NOT_FOUND"


def test_too_oblique():
    quad = [(550, 300), (950, 300), (1350, 1500), (150, 1500)]  # 強烈梯形
    img = photograph(render_paper(250, 95, toe_y=24), quad)
    with pytest.raises(FootMeasureError) as e:
        measure(img)
    assert e.value.code == "TOO_OBLIQUE"


def test_foot_out_of_paper():
    img = photograph(render_paper(300, 110, toe_y=2), upright_quad())
    with pytest.raises(FootMeasureError) as e:
        measure(img)
    assert e.value.code == "FOOT_OUT_OF_PAPER"


def test_foot_not_found_on_blank_paper():
    img = photograph(render_paper(0, 0, foot=False), upright_quad())
    with pytest.raises(FootMeasureError) as e:
        measure(img)
    assert e.value.code == "FOOT_NOT_FOUND"


def test_decode_rejects_garbage():
    with pytest.raises(FootMeasureError) as e:
        decode_image(b"not an image")
    assert e.value.code == "UNREADABLE_IMAGE"


def test_jpeg_roundtrip():
    img = photograph(render_paper(250, 95, toe_y=24), upright_quad())
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    r = measure(decode_image(buf.tobytes()))
    assert r.length_mm == pytest.approx(250, abs=TOL)


def test_order_corners():
    pts = np.array([[10, 90], [90, 10], [10, 10], [90, 90]], np.float32)
    assert order_corners(pts).tolist() == [[10, 10], [90, 10], [90, 90], [10, 90]]


def test_classify_width():
    cfg = {"width_ratio_thresholds": {"narrow_below": 0.36, "wide_above": 0.40}}
    assert classify_width(250, 85, cfg) == "narrow"
    assert classify_width(250, 95, cfg) == "standard"
    assert classify_width(250, 105, cfg) == "wide"
    assert classify_width(250, 95, NO_CLASS) is None
    assert classify_width(250, 95, {}) is None
