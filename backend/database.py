"""
SQLite database setup — connection, table creation, default admin account.
"""
import sqlite3
import os
import bcrypt
from pathlib import Path

DB_PATH = Path(__file__).parent / "storage" / "youcore.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── Schema ───────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS clients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    birthday   TEXT,
    gender     TEXT,
    weight     REAL,
    height     REAL,
    notes      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    UNIQUE NOT NULL,
    hashed_pw  TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'client',
    client_id  INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analyses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    mode         TEXT    NOT NULL DEFAULT 'balance',
    video_path   TEXT,
    result_json  TEXT,
    duration     REAL,
    fps          REAL,
    total_frames INTEGER,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

# ── Connection ────────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables and seed default admin account."""
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()

    # Seed admin if not exists
    row = conn.execute("SELECT id FROM users WHERE username='james'").fetchone()
    if not row:
        hashed = bcrypt.hashpw(b"youcore2025", bcrypt.gensalt()).decode()
        conn.execute(
            "INSERT INTO users (username, hashed_pw, role) VALUES (?, ?, 'admin')",
            ("james", hashed),
        )
        conn.commit()
    conn.close()
