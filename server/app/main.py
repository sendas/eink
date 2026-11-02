import html
import json
import os
import secrets
import time
from pathlib import Path

from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from starlette.middleware.sessions import SessionMiddleware

from . import auth
from . import render as R

DATA = Path(os.environ.get("DATA_DIR", "./data"))
DATA.mkdir(parents=True, exist_ok=True)
CFG_FILE = DATA / "config.json"

UI_USER = os.environ.get("UI_USER", "admin")
UI_PASSWORD = os.environ.get("UI_PASSWORD", "")
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "").rstrip("/")
MS_TENANT = os.environ.get("MS_TENANT_ID", "")
MS_CLIENT = os.environ.get("MS_CLIENT_ID", "")
MS_SECRET = os.environ.get("MS_CLIENT_SECRET", "")
MS_ON = bool(MS_TENANT and MS_CLIENT and MS_SECRET and PUBLIC_URL)

if not DEVICE_TOKEN:
    raise SystemExit("Defina DEVICE_TOKEN.")
if not auth.bootstrap(UI_USER, UI_PASSWORD):
    raise SystemExit("Sem utilizadores: defina UI_PASSWORD para criar o primeiro administrador.")


def _session_secret() -> str:
    f = DATA / "session.key"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
        os.chmod(f, 0o600)
    return f.read_text().strip()


N_LINES = 8
DEFAULT = {
    "title": "techpro.pt",
    "timezone": "Europe/Lisbon",
    "weather_on": True,
    "lat": 38.72,
    "lon": -9.14,
    "lines": [{"text": "Olá, mundo!", "color": "preto"}],
    "aviso": {"on": False, "color": "vermelho", "title": "AVISO CTT", "text": "", "expires": None},
}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(SessionMiddleware, secret_key=_session_secret(), max_age=12 * 3600,
                   same_site="lax", https_only=PUBLIC_URL.startswith("https://"), session_cookie="eink_session")

oauth = OAuth()
if MS_ON:
    oauth.register(name="ms", client_id=MS_CLIENT, client_secret=MS_SECRET,
                   server_metadata_url="https://login.microsoftonline.com/%s/v2.0/.well-known/openid-configuration" % MS_TENANT,
                   client_kwargs={"scope": "openid email profile"})


def current_user(request: Request):
    uid = request.session.get("uid", "")
    if uid.startswith("o:"):
        return auth.find_office(uid[2:])
    return auth.get(uid) if uid else None


def require_user(request: Request):
    u = current_user(request)
    if not u:
        raise HTTPException(303, headers={"Location": "/login"})
    return u


def require_admin(request: Request):
    u = require_user(request)
    if u["role"] != "admin":
        raise HTTPException(403, "Só administradores.")
    return u


def csrf(request: Request) -> str:
    if "csrf" not in request.session:
        request.session["csrf"] = secrets.token_urlsafe(24)
    return request.session["csrf"]


def check_csrf(request: Request, token: str):
    if not token or not secrets.compare_digest(token, request.session.get("csrf", "")):
        raise HTTPException(403, "Pedido inválido (CSRF). Recarregue a página.")


def device_auth(token: str = Query("")):
    if not secrets.compare_digest(token, DEVICE_TOKEN):
        raise HTTPException(403)


STYLE = """<style>body{font:16px system-ui;max-width:720px;margin:20px auto;padding:0 16px}
input,select,textarea{font:inherit;padding:6px;margin:3px 0}.row{display:flex;gap:8px}.row input{flex:1}
img{width:100%;border:1px solid #888;margin-top:12px}button{font:inherit;padding:8px 18px;margin-top:10px}
label{display:block;margin-top:10px}nav{display:flex;gap:16px;align-items:center;margin-bottom:8px}
nav form{margin:0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}
.err{background:#fdd;padding:8px;border:1px solid #c00;margin:8px 0}</style>"""


def page(request: Request, title: str, body: str, user=None) -> str:
    nav = ""
    if user:
        who = html.escape(user.get("username") or user.get("email", ""))
        admin = '<a href="/admin">Utilizadores</a>' if user["role"] == "admin" else ""
        nav = (f'<nav><a href="/">Ecrã</a>{admin}<span style="flex:1"></span><small>{who} ({user["role"]})</small>'
               f'<form method="post" action="/logout"><input type="hidden" name="csrf" value="{csrf(request)}">'
               f'<button style="margin:0;padding:4px 10px">Sair</button></form></nav>')
    return (f'<!doctype html><html lang="pt-PT"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title>'
            f'{STYLE}</head><body>{nav}{body}</body></html>')


def load_cfg():
    try:
        return {**DEFAULT, **json.loads(CFG_FILE.read_text())}
    except Exception:
        return dict(DEFAULT)


@app.get("/", response_class=HTMLResponse)
def index(request: Request, user=Depends(require_user)):
    cfg = load_cfg()
    rows = []
    lines = cfg["lines"] + [{}] * N_LINES
    for i in range(N_LINES):
        t = html.escape(lines[i].get("text", ""), quote=True)
        opts = "".join('<option%s>%s</option>' % (" selected" if lines[i].get("color", "preto") == c else "", c)
                       for c in R.COLORS)
        rows.append('<div class="row"><input name="text%d" value="%s" placeholder="Linha %d">'
                    '<select name="color%d">%s</select></div>' % (i, t, i + 1, i, opts))
    chk = " checked" if cfg["weather_on"] else ""
    av = cfg["aviso"]
    av_on = av.get("on") and R.aviso_ativo(cfg)
    av_chk = " checked" if av_on else ""
    av_cor = "".join("<option%s>%s</option>" % (" selected" if av.get("color") == c else "", c) for c in R.COLORS)
    horas = "".join('<option value="%s"%s>%s</option>' % (v, " selected" if v == "4" else "", t) for v, t in
                    [("1", "1 hora"), ("4", "4 horas"), ("24", "24 horas"), ("72", "3 dias"), ("0", "Sem limite")])
    exp = av.get("expires")
    av_info = ("Termina às %s." % time.strftime("%d/%m %H:%M", time.localtime(exp)) if av_on and exp
               else ("Ativo sem limite." if av_on else "Inativo."))
    body = f"""<h1>Ecrã e-ink</h1>
<form method="post" action="/save"><input type="hidden" name="csrf" value="{csrf(request)}">
<fieldset style="border:3px solid #c00"><legend><b>Aviso (ocupa o ecrã todo)</b></legend>
<label><input type="checkbox" name="aviso_on"{av_chk}> Ativar aviso &nbsp;<small>{av_info}</small></label>
<label>Título <input name="aviso_title" value="{html.escape(av.get('title',''), quote=True)}" style="width:60%"></label>
<label>Cor da faixa <select name="aviso_color">{av_cor}</select>
 &nbsp;Desaparece ao fim de <select name="aviso_hours">{horas}</select></label>
<label>Texto (letra grande)<textarea name="aviso_text" rows="3" style="width:100%;font:inherit">{html.escape(av.get('text',''))}</textarea></label>
</fieldset>
<label>Título <input name="title" value="{html.escape(cfg['title'], quote=True)}" style="width:100%"></label>
<label><input type="checkbox" name="weather_on"{chk}> Mostrar meteorologia</label>
<label>Latitude <input name="lat" value="{cfg['lat']}" size="8"> Longitude <input name="lon" value="{cfg['lon']}" size="8"></label>
<h3>Linhas de texto</h3>{''.join(rows)}
<button>Guardar</button></form>
<h3>Pré-visualização</h3><img src="/preview.png?{secrets.token_hex(4)}" alt="pré-visualização">
<p>O ecrã atualiza-se sozinho na próxima verificação do Raspberry Pi (até alguns minutos).</p>"""
    return page(request, "Ecrã e-ink", body, user)


@app.post("/save")
def save(request: Request, user=Depends(require_user), csrf_token: str = Form("", alias="csrf"), title: str = Form(""), weather_on: str = Form(""), lat: float = Form(38.72),
         lon: float = Form(-9.14), aviso_on: str = Form(""), aviso_title: str = Form("AVISO"),
         aviso_color: str = Form("vermelho"), aviso_text: str = Form(""), aviso_hours: int = Form(4), text0: str = Form(""), text1: str = Form(""), text2: str = Form(""),
         text3: str = Form(""), text4: str = Form(""), text5: str = Form(""), text6: str = Form(""),
         text7: str = Form(""), color0: str = Form("preto"), color1: str = Form("preto"),
         color2: str = Form("preto"), color3: str = Form("preto"), color4: str = Form("preto"),
         color5: str = Form("preto"), color6: str = Form("preto"), color7: str = Form("preto")):
    check_csrf(request, csrf_token)
    texts = [text0, text1, text2, text3, text4, text5, text6, text7]
    colors = [color0, color1, color2, color3, color4, color5, color6, color7]
    cfg = load_cfg()
    cfg.update(title=title[:60], weather_on=bool(weather_on), lat=lat, lon=lon,
               lines=[{"text": t[:80], "color": c if c in R.COLORS else "preto"}
                      for t, c in zip(texts, colors) if t.strip()])
    cfg["aviso"] = {"on": bool(aviso_on), "title": aviso_title[:24],
                    "color": aviso_color if aviso_color in R.COLORS else "vermelho",
                    "text": aviso_text[:200],
                    "expires": time.time() + aviso_hours * 3600 if aviso_hours > 0 else None}
    CFG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
    return RedirectResponse("/", status_code=303)


@app.get("/preview.png")
def preview(user=Depends(require_user)):
    return Response(R.to_png(R.render(load_cfg(), stamp=True)), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


# --- Autenticação ---
def _login_page(request: Request, err: str = "") -> str:
    ms = '<p><a href="/login/microsoft"><button type="button">Entrar com Office 365</button></a></p>' if MS_ON else ""
    e = f'<div class="err">{html.escape(err)}</div>' if err else ""
    return page(request, "Entrar", f"""<h1>Entrar</h1>{e}{ms}
<form method="post" action="/login"><input type="hidden" name="csrf" value="{csrf(request)}">
<label>Utilizador <input name="username" autocomplete="username" required></label>
<label>Palavra-passe <input name="password" type="password" autocomplete="current-password" required></label>
<button>Entrar</button></form>""")


@app.get("/login", response_class=HTMLResponse)
def login_form(request: Request, err: str = ""):
    return _login_page(request, err)


@app.post("/login")
def login(request: Request, csrf_token: str = Form("", alias="csrf"), username: str = Form(""), password: str = Form("")):
    check_csrf(request, csrf_token)
    key = username.strip().lower()
    if auth.throttled(key):
        return HTMLResponse(_login_page(request, "Demasiadas tentativas. Aguarde alguns minutos."), status_code=429)
    u = auth.check_local(username, password)
    if not u:
        auth.register_fail(key)
        return HTMLResponse(_login_page(request, "Utilizador ou palavra-passe incorretos."), status_code=401)
    request.session.clear()
    request.session["uid"] = u["id"]
    return RedirectResponse("/", status_code=303)


@app.post("/logout")
def logout(request: Request, csrf_token: str = Form("", alias="csrf")):
    check_csrf(request, csrf_token)
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@app.get("/login/microsoft")
async def login_microsoft(request: Request):
    if not MS_ON:
        raise HTTPException(404)
    return await oauth.ms.authorize_redirect(request, PUBLIC_URL + "/auth/microsoft")


def office_login(request: Request, claims: dict):
    """Aceita o utilizador do Office 365 só se estiver autorizado (ou se 'office_open' estiver ativo)."""
    email = (claims.get("email") or claims.get("preferred_username") or "").lower()
    u = auth.find_office(email)
    if not u:
        return HTMLResponse(_login_page(request, "A conta %s não está autorizada. Peça a um administrador." % email),
                            status_code=403)
    request.session.clear()
    request.session["uid"] = u["id"] if not u.get("virtual") else "o:" + email
    return RedirectResponse("/", status_code=303)


@app.get("/auth/microsoft")
async def auth_microsoft(request: Request):
    if not MS_ON:
        raise HTTPException(404)
    try:
        token = await oauth.ms.authorize_access_token(request)
    except Exception:
        return HTMLResponse(_login_page(request, "Falha no início de sessão com o Office 365."), status_code=400)
    return office_login(request, dict(token.get("userinfo") or {}))


# --- Administração de utilizadores ---
@app.get("/admin", response_class=HTMLResponse)
def admin(request: Request, user=Depends(require_admin), err: str = ""):
    d = auth.load()
    c = csrf(request)
    rows = []
    for u in d["users"]:
        nome = html.escape(u.get("username") or u.get("email", ""))
        tipo = "Local" if u["type"] == "local" else "Office 365"
        roles = "".join('<option%s>%s</option>' % (" selected" if u["role"] == r else "", r) for r in auth.ROLES)
        pw = (f'<form method="post" action="/admin/password" style="display:inline"><input type="hidden" name="csrf" value="{c}">'
              f'<input type="hidden" name="id" value="{u["id"]}"><input name="password" type="password" placeholder="nova palavra-passe" size="14">'
              f'<button style="margin:0">Mudar</button></form>') if u["type"] == "local" else ""
        rows.append(
            f'<tr><td>{nome}</td><td>{tipo}</td>'
            f'<td><form method="post" action="/admin/role"><input type="hidden" name="csrf" value="{c}">'
            f'<input type="hidden" name="id" value="{u["id"]}"><select name="role" onchange="this.form.submit()">{roles}</select></form></td>'
            f'<td>{pw}</td><td><form method="post" action="/admin/delete" onsubmit="return confirm(\'Apagar?\')">'
            f'<input type="hidden" name="csrf" value="{c}"><input type="hidden" name="id" value="{u["id"]}">'
            f'<button style="margin:0">Apagar</button></form></td></tr>')
    ro = "".join("<option>%s</option>" % r for r in auth.ROLES)
    e = f'<div class="err">{html.escape(err)}</div>' if err else ""
    ms_note = "" if MS_ON else "<p><small>Office 365 ainda não está configurado (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, PUBLIC_URL).</small></p>"
    chk = " checked" if d["office_open"] else ""
    body = f"""<h1>Utilizadores</h1>{e}
<table><tr><th>Nome</th><th>Tipo</th><th>Perfil</th><th>Palavra-passe</th><th></th></tr>{''.join(rows)}</table>
<h3>Adicionar utilizador local</h3>
<form method="post" action="/admin/add-local"><input type="hidden" name="csrf" value="{c}">
<input name="username" placeholder="utilizador" required> <input name="password" type="password" placeholder="palavra-passe (10+)" required>
<select name="role">{ro}</select> <button>Adicionar</button></form>
<h3>Autorizar utilizador Office 365</h3>{ms_note}
<form method="post" action="/admin/add-office"><input type="hidden" name="csrf" value="{c}">
<input name="email" type="email" placeholder="nome@techpro.pt" required> <select name="role">{ro}</select> <button>Autorizar</button></form>
<form method="post" action="/admin/office-open"><input type="hidden" name="csrf" value="{c}">
<label><input type="checkbox" name="on" onchange="this.form.submit()"{chk}> Permitir <b>qualquer</b> utilizador do tenant Office 365 como editor</label>
<noscript><button>Guardar</button></noscript></form>
<p><small>Perfis: <b>admin</b> gere utilizadores e o ecrã; <b>editor</b> só o ecrã.</small></p>"""
    return page(request, "Utilizadores", body, user)


def _back(err: str):
    from urllib.parse import quote
    return RedirectResponse("/admin" + ("?err=" + quote(err) if err else ""), status_code=303)


@app.post("/admin/add-local")
def admin_add_local(request: Request, user=Depends(require_admin), csrf_token: str = Form("", alias="csrf"),
                    username: str = Form(""), password: str = Form(""), role: str = Form("editor")):
    check_csrf(request, csrf_token)
    return _back(auth.add_local(username, password, role))


@app.post("/admin/add-office")
def admin_add_office(request: Request, user=Depends(require_admin), csrf_token: str = Form("", alias="csrf"),
                     email: str = Form(""), role: str = Form("editor")):
    check_csrf(request, csrf_token)
    return _back(auth.add_office(email, role))


@app.post("/admin/role")
def admin_role(request: Request, user=Depends(require_admin), csrf_token: str = Form("", alias="csrf"),
               id: str = Form(""), role: str = Form("")):
    check_csrf(request, csrf_token)
    return _back(auth.set_role(id, role))


@app.post("/admin/password")
def admin_password(request: Request, user=Depends(require_admin), csrf_token: str = Form("", alias="csrf"),
                   id: str = Form(""), password: str = Form("")):
    check_csrf(request, csrf_token)
    return _back(auth.set_password(id, password))


@app.post("/admin/delete")
def admin_delete(request: Request, user=Depends(require_admin), csrf_token: str = Form("", alias="csrf"),
                 id: str = Form("")):
    check_csrf(request, csrf_token)
    if id == user["id"]:
        return _back("Não pode apagar a sua própria conta.")
    return _back(auth.delete(id))


@app.post("/admin/office-open")
def admin_office_open(request: Request, user=Depends(require_admin), csrf_token: str = Form("", alias="csrf"),
                      on: str = Form("")):
    check_csrf(request, csrf_token)
    auth.set_office_open(bool(on))
    return _back("")


# --- API usada pelo Raspberry Pi ---
@app.get("/api/version", dependencies=[Depends(device_auth)])
def api_version():
    return {"version": R.version(R.render(load_cfg()))}


@app.get("/api/image.png", dependencies=[Depends(device_auth)])
def api_image():
    return Response(R.to_png(R.render(load_cfg(), stamp=True)), media_type="image/png",
                    headers={"Cache-Control": "no-store"})
