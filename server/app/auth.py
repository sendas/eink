"""Utilizadores locais e do Office 365 (guardados em /data/users.json)."""
import hashlib
import json
import os
import secrets
import threading
import time
from pathlib import Path

DATA = Path(os.environ.get("DATA_DIR", "./data"))
USERS_FILE = DATA / "users.json"
ROLES = ("admin", "editor")
_lock = threading.Lock()


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return "scrypt$%s$%s" % (salt.hex(), h.hex())


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return secrets.compare_digest(calc.hex(), h)
    except Exception:
        return False


_DUMMY = hash_password("x")


def _load() -> dict:
    try:
        d = json.loads(USERS_FILE.read_text())
    except Exception:
        d = {}
    d.setdefault("users", [])
    d.setdefault("office_open", False)  # qualquer utilizador do tenant entra como editor
    return d


def _save(d: dict):
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = USERS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2))
    os.chmod(tmp, 0o600)
    tmp.replace(USERS_FILE)


def load() -> dict:
    with _lock:
        return _load()


def bootstrap(username: str, password: str):
    """Cria o primeiro administrador local se ainda não houver utilizadores."""
    with _lock:
        d = _load()
        if d["users"]:
            return True
        if not password:
            return False
        d["users"].append({"id": secrets.token_hex(4), "type": "local", "username": username.strip(),
                           "hash": hash_password(password), "role": "admin"})
        _save(d)
        return True


def get(uid: str):
    return next((u for u in load()["users"] if u["id"] == uid), None)


def _admins(d):
    return [u for u in d["users"] if u["role"] == "admin"]


def add_local(username: str, password: str, role: str) -> str:
    username = username.strip()
    if not username or len(password) < 10 or role not in ROLES:
        return "Utilizador vazio, palavra-passe com menos de 10 caracteres ou perfil inválido."
    with _lock:
        d = _load()
        if any(u["type"] == "local" and u["username"].lower() == username.lower() for u in d["users"]):
            return "Esse utilizador já existe."
        d["users"].append({"id": secrets.token_hex(4), "type": "local", "username": username,
                           "hash": hash_password(password), "role": role})
        _save(d)
    return ""


def add_office(email: str, role: str) -> str:
    email = email.strip().lower()
    if "@" not in email or role not in ROLES:
        return "Email ou perfil inválido."
    with _lock:
        d = _load()
        if any(u["type"] == "office" and u["email"] == email for u in d["users"]):
            return "Esse utilizador já existe."
        d["users"].append({"id": secrets.token_hex(4), "type": "office", "email": email, "role": role})
        _save(d)
    return ""


def set_role(uid: str, role: str) -> str:
    with _lock:
        d = _load()
        u = next((x for x in d["users"] if x["id"] == uid), None)
        if not u or role not in ROLES:
            return "Utilizador ou perfil inválido."
        if u["role"] == "admin" and role != "admin" and len(_admins(d)) <= 1:
            return "Tem de existir pelo menos um administrador."
        u["role"] = role
        _save(d)
    return ""


def set_password(uid: str, password: str) -> str:
    if len(password) < 10:
        return "A palavra-passe tem de ter pelo menos 10 caracteres."
    with _lock:
        d = _load()
        u = next((x for x in d["users"] if x["id"] == uid and x["type"] == "local"), None)
        if not u:
            return "Utilizador local não encontrado."
        u["hash"] = hash_password(password)
        _save(d)
    return ""


def delete(uid: str) -> str:
    with _lock:
        d = _load()
        u = next((x for x in d["users"] if x["id"] == uid), None)
        if not u:
            return ""
        if u["role"] == "admin" and len(_admins(d)) <= 1:
            return "Tem de existir pelo menos um administrador."
        d["users"] = [x for x in d["users"] if x["id"] != uid]
        _save(d)
    return ""


def set_office_open(on: bool):
    with _lock:
        d = _load()
        d["office_open"] = bool(on)
        _save(d)


def check_local(username: str, password: str):
    d = load()
    u = next((x for x in d["users"] if x["type"] == "local" and x["username"].lower() == username.strip().lower()), None)
    ok = verify_password(password, u["hash"] if u else _DUMMY)
    return u if (u and ok) else None


def find_office(email: str):
    """Utilizador do Office 365 autorizado, ou None. Com office_open, qualquer pessoa do tenant é editor."""
    email = (email or "").strip().lower()
    if not email:
        return None
    d = load()
    u = next((x for x in d["users"] if x["type"] == "office" and x["email"] == email), None)
    if u:
        return u
    if d["office_open"]:
        return {"id": "o:" + email, "type": "office", "email": email, "role": "editor", "virtual": True}
    return None


# --- limitação de tentativas de login ---
_fails: dict = {}


def throttled(key: str) -> bool:
    now = time.time()
    _fails[key] = [t for t in _fails.get(key, []) if now - t < 300]
    return len(_fails[key]) >= 5


def register_fail(key: str):
    _fails.setdefault(key, []).append(time.time())
