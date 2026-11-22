import hashlib
import hmac
import os
import secrets
import time
import uuid
from typing import Optional, Dict, Any
from . import db

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hashes a password using PBKDF2-HMAC-SHA256 with a unique random salt."""
    if not salt:
        salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100_000
    ).hex()
    return pw_hash, salt

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    """Verifies that the provided password matches the stored hash."""
    pw_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(pw_hash, expected_hash)

def register_user(email: str, password: str, full_name: str = "") -> Dict[str, Any]:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise ValueError("Please provide a valid email address.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    
    conn = db.get_connection()
    c = conn.cursor()
    existing = c.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        raise ValueError("An account with this email already exists.")
    
    user_id = uuid.uuid4().hex
    pw_hash, salt = hash_password(password)
    now = time.time()
    c.execute(
        "INSERT INTO users (id, email, password_hash, salt, full_name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, email, pw_hash, salt, full_name.strip(), now)
    )
    conn.commit()
    conn.close()
    
    token = create_session(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": email,
            "full_name": full_name.strip(),
            "created_at": now
        }
    }

def login_user(email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    conn = db.get_connection()
    c = conn.cursor()
    user = c.execute("SELECT id, email, password_hash, salt, full_name, created_at FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        raise ValueError("Invalid email or password.")
    
    if not verify_password(password, user["salt"], user["password_hash"]):
        conn.close()
        raise ValueError("Invalid email or password.")
    
    conn.close()
    token = create_session(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "created_at": user["created_at"]
        }
    }

def create_session(user_id: str, duration_days: int = 30) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    expires_at = now + (duration_days * 86400)
    conn = db.get_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now, expires_at)
    )
    conn.commit()
    conn.close()
    return token

def get_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    conn = db.get_connection()
    c = conn.cursor()
    now = time.time()
    row = c.execute("""
        SELECT u.id, u.email, u.full_name, u.created_at, s.expires_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?
    """, (token, now)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "created_at": row["created_at"]
    }

def logout_session(token: str):
    if not token:
        return
    conn = db.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
