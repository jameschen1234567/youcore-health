import time

import cv2
import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.foot_router as fr
from tests.synth import photograph, render_paper, upright_quad

SECRET = "test-secret-at-least-32-bytes-long!!"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    monkeypatch.delenv("FOOT_DEV_NO_AUTH", raising=False)
    monkeypatch.setattr(fr, "limiter", fr.RateLimiter(10, 60))
    app = FastAPI()
    app.include_router(fr.router)
    return TestClient(app)


def token(sub="user-1", aud="authenticated", exp_in=3600, secret=SECRET):
    return jwt.encode({"sub": sub, "aud": aud, "exp": int(time.time()) + exp_in}, secret, algorithm="HS256")


def jpeg(L=250, W=95):
    ok, buf = cv2.imencode(".jpg", photograph(render_paper(L, W, toe_y=24), upright_quad()))
    return buf.tobytes()


def post(client, tok=None, side="left", data=None, ctype="image/jpeg"):
    headers = {"Authorization": f"Bearer {tok}"} if tok else {}
    return client.post("/foot/measure", headers=headers, data={"side": side},
                       files={"file": ("foot.jpg", data if data is not None else jpeg(), ctype)})


def test_measure_ok(client):
    r = post(client, token())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["side"] == "left"
    assert abs(body["length_mm"] - 250) <= 2
    assert set(body) == {"side", "length_mm", "width_mm", "width_class", "quality_flags", "algo_version"}


@pytest.mark.parametrize("tok", [None, "garbage", "EXPIRED", "WRONG_AUD", "WRONG_SECRET"])
def test_rejects_bad_tokens(client, tok):
    tok = {"EXPIRED": token(exp_in=-10), "WRONG_AUD": token(aud="anon"),
           "WRONG_SECRET": token(secret="x" * 40)}.get(tok, tok)
    assert post(client, tok).status_code == 401


def test_quality_error_code(client):
    blank = photograph(render_paper(0, 0, foot=False), upright_quad())
    ok, buf = cv2.imencode(".jpg", blank)
    r = post(client, token(), data=buf.tobytes())
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "FOOT_NOT_FOUND"


def test_bad_side(client):
    assert post(client, token(), side="middle").status_code == 422


def test_unsupported_format(client):
    r = post(client, token(), data=b"GIF89a", ctype="image/gif")
    assert r.status_code == 415


def test_file_too_large(client):
    r = post(client, token(), data=b"\xff" * (fr.MAX_BYTES + 1))
    assert r.status_code == 413


def test_rate_limit_per_user(client):
    lim = fr.RateLimiter(2, 60)
    assert lim.allow("a", 0) and lim.allow("a", 1)
    assert not lim.allow("a", 2)
    assert lim.allow("b", 2)          # 不同使用者互不影響
    assert lim.allow("a", 61)         # 視窗過了就恢復


def test_rate_limit_through_api(client, monkeypatch):
    monkeypatch.setattr(fr, "limiter", fr.RateLimiter(1, 60))
    tok = token()
    assert post(client, tok, data=b"GIF", ctype="image/gif").status_code == 415
    assert post(client, tok, data=b"GIF", ctype="image/gif").status_code == 429


def test_dev_bypass_ignored_on_render(client, monkeypatch):
    monkeypatch.setenv("FOOT_DEV_NO_AUTH", "1")
    monkeypatch.setenv("RENDER", "true")
    assert post(client, None).status_code == 401
