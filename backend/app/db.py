import json
import sqlite3
import uuid
import time
from pathlib import Path
from . import config

DB_PATH = config.DATA_DIR / "studio.db"

def get_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        folder TEXT DEFAULT 'General',
        video_id TEXT,
        video_name TEXT,
        video_duration REAL DEFAULT 0,
        thumbnail_url TEXT,
        status TEXT DEFAULT 'draft',
        settings_json TEXT DEFAULT '{}',
        created_at REAL,
        updated_at REAL
    );

    CREATE TABLE IF NOT EXISTS project_folders (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        folder_id TEXT,
        name TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        sort_order INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ready',
        job_id TEXT,
        output_file TEXT,
        created_at REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        language TEXT DEFAULT 'en',
        full_text TEXT,
        segments_json TEXT DEFAULT '[]',
        created_at REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_analyses (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        summary TEXT,
        topics_json TEXT DEFAULT '[]',
        moments_json TEXT DEFAULT '[]',
        viral_hooks_json TEXT DEFAULT '[]',
        created_at REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        duration_target INTEGER DEFAULT 60,
        style TEXT DEFAULT 'educational',
        scenes_json TEXT DEFAULT '[]',
        created_at REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS music_tracks (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT NOT NULL,
        mood TEXT,
        genre TEXT,
        duration REAL,
        filename TEXT NOT NULL,
        is_preset INTEGER DEFAULT 0,
        created_at REAL
    );

    CREATE TABLE IF NOT EXISTS exports (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        export_type TEXT NOT NULL,
        format TEXT DEFAULT 'mp4',
        resolution TEXT DEFAULT '1080p',
        file_path TEXT,
        file_size INTEGER DEFAULT 0,
        duration REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at REAL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gdrive_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS auto_shorts_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        youtube_url TEXT NOT NULL,
        template_id TEXT DEFAULT 'acharya_prashant_classic',
        status TEXT DEFAULT 'pending',
        stage TEXT DEFAULT 'ingest',
        progress REAL DEFAULT 0.0,
        num_clips INTEGER DEFAULT 5,
        clips_json TEXT DEFAULT '[]',
        renders_json TEXT DEFAULT '[]',
        step_detail TEXT DEFAULT '',
        transcript_json TEXT DEFAULT '[]',
        script_content TEXT DEFAULT '',
        error TEXT,
        created_at REAL,
        updated_at REAL
    );

    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT DEFAULT '',
        created_at REAL
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at REAL,
        expires_at REAL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Schema migration: Add user_id column to projects if it doesn't exist
    try:
        c.execute("ALTER TABLE projects ADD COLUMN user_id TEXT;")
    except sqlite3.OperationalError:
        pass # Column already exists

    conn.commit()
    conn.close()

# Initialize upon module import
init_db()
