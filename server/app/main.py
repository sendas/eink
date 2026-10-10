import html
import json
import os
import secrets
import time
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
    "aviso": {"on": False, "color": "vermelho", "title": "AVISO CTT", "text": "", "expires": None},
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
    av = cfg["aviso"]
    av_on = av.get("on") and R.aviso_ativo(cfg)
    av_chk = " checked" if av_on else ""
    av_cor = "".join("<option%s>%s</option>" % (" selected" if av.get("color") == c else "", c) for c in R.COLORS)
    horas = "".join('<option value="%s"%s>%s</option>' % (v, " selected" if v == "4" else "", t) for v, t in
                    [("1", "1 hora"), ("4", "4 horas"), ("24", "24 horas"), ("72", "3 dias"), ("0", "Sem limite")])
    exp = av.get("expires")
    av_info = ("Termina às %s." % time.strftime("%d/%m %H:%M", time.localtime(exp)) if av_on and exp
               else ("Ativo sem limite." if av_on else "Inativo."))
    return f"""<!doctype html><html lang="pt-PT"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Ecrã e-ink</title>
<style>body{{font:16px system-ui;max-width:680px;margin:20px auto;padding:0 16px}}
input,select{{font:inherit;padding:6px;margin:3px 0}}.row{{display:flex;gap:8px}}.row input{{flex:1}}
img{{width:100%;border:1px solid #888;margin-top:12px}}button{{font:inherit;padding:8px 18px;margin-top:10px}}
label{{display:block;margin-top:10px}}</style></head><body>
<h1>Ecrã e-ink</h1>
<form method="post" action="/save">
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
<p>O ecrã atualiza-se sozinho na próxima verificação do Raspberry Pi (até alguns minutos).</p>
</body></html>"""


@app.post("/save", dependencies=[Depends(ui_auth)])
def save(title: str = Form(""), weather_on: str = Form(""), lat: float = Form(38.72),
         lon: float = Form(-9.14), aviso_on: str = Form(""), aviso_title: str = Form("AVISO"),
         aviso_color: str = Form("vermelho"), aviso_text: str = Form(""), aviso_hours: int = Form(4), text0: str = Form(""), text1: str = Form(""), text2: str = Form(""),
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
    cfg["aviso"] = {"on": bool(aviso_on), "title": aviso_title[:24],
                    "color": aviso_color if aviso_color in R.COLORS else "vermelho",
                    "text": aviso_text[:200],
                    "expires": time.time() + aviso_hours * 3600 if aviso_hours > 0 else None}
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
