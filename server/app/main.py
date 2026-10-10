import html
import json
import os
import secrets
from pathlib import Path

from fastapi import Depends, FastAPI, Form, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from . import render as R

DATA = Path(os.environ.get("DATA_DIR", "./data"))
DATA.mkdir(parents=True, exist_ok=True)
CFG_FILE = DATA / "config.json"

UI_USER = os.environ.get("UI_USER", "admin")
UI_PASSWORD = os.environ.get("UI_PASSWORD", "")
DEVICE_TOKEN = os.environ.get("DEVICE_TOKEN", "")
if not UI_PASSWORD or not DEVICE_TOKEN:
    raise SystemExit("Defina UI_PASSWORD e DEVICE_TOKEN.")

N_LINES = 8
DEFAULT = {
    "title": "techpro.pt",
    "timezone": "Europe/Lisbon",
    "weather_on": True,
    "lat": 38.72,
    "lon": -9.14,
    "lines": [{"text": "Olá, mundo!", "color": "preto"}],
}

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
basic = HTTPBasic()


def ui_auth(c: HTTPBasicCredentials = Depends(basic)):
    ok = secrets.compare_digest(c.username, UI_USER) & secrets.compare_digest(c.password, UI_PASSWORD)
    if not ok:
        raise HTTPException(401, headers={"WWW-Authenticate": "Basic"})


def device_auth(token: str = Query("")):
    if not secrets.compare_digest(token, DEVICE_TOKEN):
        raise HTTPException(403)


def load_cfg():
    try:
        return {**DEFAULT, **json.loads(CFG_FILE.read_text())}
    except Exception:
        return dict(DEFAULT)


@app.get("/", response_class=HTMLResponse, dependencies=[Depends(ui_auth)])
def index():
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
    return f"""<!doctype html><html lang="pt-PT"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ecrã e-ink</title>
<style>body{{font:16px system-ui;max-width:680px;margin:20px auto;padding:0 16px}}
input,select{{font:inherit;padding:6px;margin:3px 0}}.row{{display:flex;gap:8px}}.row input{{flex:1}}
img{{width:100%;border:1px solid #888;margin-top:12px}}button{{font:inherit;padding:8px 18px;margin-top:10px}}
label{{display:block;margin-top:10px}}</style></head><body>
<h1>Ecrã e-ink</h1>
<form method="post" action="/save">
<label>Título <input name="title" value="{html.escape(cfg['title'], quote=True)}" style="width:100%"></label>
<label><input type="checkbox" name="weather_on"{chk}> Mostrar meteorologia</label>
<label>Latitude <input name="lat" value="{cfg['lat']}" size="8"> Longitude <input name="lon" value="{cfg['lon']}" size="8"></label>
<h3>Linhas de texto</h3>{''.join(rows)}
<button>Guardar</button></form>
<h3>Pré-visualização</h3><img src="/preview.png?{secrets.token_hex(4)}" alt="pré-visualização">
<p>O ecrã atualiza-se sozinho na próxima verificação do Raspberry Pi (até alguns minutos).</p>
</body></html>"""


@app.post("/save", dependencies=[Depends(ui_auth)])
def save(title: str = Form(""), weather_on: str = Form(""), lat: float = Form(38.72),
         lon: float = Form(-9.14), text0: str = Form(""), text1: str = Form(""), text2: str = Form(""),
         text3: str = Form(""), text4: str = Form(""), text5: str = Form(""), text6: str = Form(""),
         text7: str = Form(""), color0: str = Form("preto"), color1: str = Form("preto"),
         color2: str = Form("preto"), color3: str = Form("preto"), color4: str = Form("preto"),
         color5: str = Form("preto"), color6: str = Form("preto"), color7: str = Form("preto")):
    texts = [text0, text1, text2, text3, text4, text5, text6, text7]
    colors = [color0, color1, color2, color3, color4, color5, color6, color7]
    cfg = load_cfg()
    cfg.update(title=title[:60], weather_on=bool(weather_on), lat=lat, lon=lon,
               lines=[{"text": t[:80], "color": c if c in R.COLORS else "preto"}
                      for t, c in zip(texts, colors) if t.strip()])
    CFG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
    return RedirectResponse("/", status_code=303)


@app.get("/preview.png", dependencies=[Depends(ui_auth)])
def preview():
    return Response(R.to_png(R.render(load_cfg(), stamp=True)), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


# --- API usada pelo Raspberry Pi ---
@app.get("/api/version", dependencies=[Depends(device_auth)])
def api_version():
    return {"version": R.version(R.render(load_cfg()))}


@app.get("/api/image.png", dependencies=[Depends(device_auth)])
def api_image():
    return Response(R.to_png(R.render(load_cfg(), stamp=True)), media_type="image/png",
                    headers={"Cache-Control": "no-store"})
