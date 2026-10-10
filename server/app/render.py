"""Desenha o painel de informações em 600x400 com a paleta Spectra 6."""
import hashlib
import io
import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageDraw, ImageFont

W, H = 600, 400
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# As 6 cores do ecrã E6 (Spectra 6)
COLORS = {
    "preto": (0, 0, 0),
    "branco": (255, 255, 255),
    "amarelo": (255, 255, 0),
    "vermelho": (255, 0, 0),
    "azul": (0, 0, 255),
    "verde": (0, 255, 0),
}

DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]

# Códigos WMO do Open-Meteo -> texto
WMO = {0: "Céu limpo", 1: "Pouco nublado", 2: "Parcialmente nublado", 3: "Nublado",
       45: "Nevoeiro", 48: "Nevoeiro", 51: "Chuvisco", 53: "Chuvisco", 55: "Chuvisco",
       61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 71: "Neve", 73: "Neve",
       75: "Neve forte", 80: "Aguaceiros", 81: "Aguaceiros", 82: "Aguaceiros fortes",
       95: "Trovoada", 96: "Trovoada", 99: "Trovoada"}

_weather_cache = {"key": None, "at": 0.0, "data": None}


def get_weather(lat: float, lon: float):
    """Temperatura e estado do tempo (Open-Meteo, sem chave). Cache de 15 min."""
    import time
    key = (round(lat, 3), round(lon, 3))
    if _weather_cache["key"] == key and time.time() - _weather_cache["at"] < 900:
        return _weather_cache["data"]
    url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
           "&current=temperature_2m,weather_code&daily=temperature_2m_max,"
           "temperature_2m_min&timezone=auto&forecast_days=1" % key)
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            j = json.load(r)
        data = {
            "temp": round(j["current"]["temperature_2m"]),
            "desc": WMO.get(j["current"]["weather_code"], ""),
            "max": round(j["daily"]["temperature_2m_max"][0]),
            "min": round(j["daily"]["temperature_2m_min"][0]),
        }
    except Exception:
        return _weather_cache["data"]  # mantém o último valor bom
    _weather_cache.update(key=key, at=time.time(), data=data)
    return data


def _font(path, size):
    return ImageFont.truetype(path, size)


def _fit(draw, text, path, size, max_w):
    """Reduz o tamanho da letra até o texto caber na largura."""
    while size > 10 and draw.textlength(text, font=_font(path, size)) > max_w:
        size -= 1
    return _font(path, size)


def aviso_ativo(cfg: dict) -> bool:
    import time
    a = cfg.get("aviso") or {}
    if not a.get("on") or not a.get("text", "").strip():
        return False
    exp = a.get("expires")
    return exp is None or exp > time.time()


def _wrap(d, text, path, size, max_w):
    lines = []
    for par in text.split("\n"):
        cur = ""
        for word in par.split():
            test = (cur + " " + word).strip()
            if d.textlength(test, font=_font(path, size)) <= max_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return lines


def render_aviso(cfg: dict, stamp: bool) -> Image.Image:
    a = cfg["aviso"]
    cor = COLORS.get(a.get("color", "vermelho"), COLORS["vermelho"])
    # texto branco sobre cores escuras; preto sobre amarelo/verde
    on_cor = COLORS["preto"] if a.get("color") in ("amarelo", "verde") else COLORS["branco"]
    img = Image.new("RGB", (W, H), COLORS["branco"])
    d = ImageDraw.Draw(img)
    d.fontmode = "1"

    d.rectangle([0, 0, W, 120], fill=cor)
    titulo = a.get("title", "AVISO").strip() or "AVISO"
    d.text((W // 2, 60), titulo, font=_fit(d, titulo, FONT_BOLD, 72, W - 40), fill=on_cor, anchor="mm")

    # corpo: maior tamanho de letra que cabe na área abaixo da faixa
    top, bottom = 130, H - 24
    for size in range(80, 17, -2):
        lines = _wrap(d, a["text"], FONT_BOLD, size, W - 40)
        if len(lines) * int(size * 1.2) <= bottom - top:
            break
    lh = int(size * 1.2)
    y = top + (bottom - top - lh * len(lines)) // 2
    for ln in lines:
        d.text((W // 2, y), ln, font=_font(FONT_BOLD, size), fill=COLORS["preto"], anchor="mt")
        y += lh
    d.rectangle([0, H - 12, W, H], fill=cor)
    if stamp:
        d.text((W - 10, H - 16), "Atualizado %s" % datetime.now(ZoneInfo(cfg.get("timezone", "Europe/Lisbon"))).strftime("%H:%M"),
               font=_font(FONT, 12), fill=COLORS["preto"], anchor="rb")
    return img


def render(cfg: dict, stamp: bool = False) -> Image.Image:
    if aviso_ativo(cfg):
        return render_aviso(cfg, stamp)
    """Devolve a imagem. Com stamp=False não leva a hora da última atualização,
    para o hash só mudar quando o conteúdo muda."""
    tz = ZoneInfo(cfg.get("timezone", "Europe/Lisbon"))
    now = datetime.now(tz)

    img = Image.new("RGB", (W, H), COLORS["branco"])
    d = ImageDraw.Draw(img)
    d.fontmode = "1"  # sem anti-aliasing: só cores puras da paleta

    # Barra de título
    d.rectangle([0, 0, W, 56], fill=COLORS["azul"])
    d.text((16, 28), cfg.get("title", ""), font=_fit(d, cfg.get("title", ""), FONT_BOLD, 32, W - 32),
           fill=COLORS["branco"], anchor="lm")

    # Data
    data_txt = "%s, %d de %s" % (DIAS[now.weekday()].capitalize(), now.day, MESES[now.month - 1])
    d.text((16, 72), data_txt, font=_font(FONT_BOLD, 26), fill=COLORS["preto"])

    # Meteorologia
    y = 112
    if cfg.get("weather_on"):
        w = get_weather(float(cfg.get("lat", 38.72)), float(cfg.get("lon", -9.14)))
        if w:
            d.text((16, y), "%d°C" % w["temp"], font=_font(FONT_BOLD, 56), fill=COLORS["vermelho"])
            d.text((190, y + 6), w["desc"], font=_font(FONT, 24), fill=COLORS["preto"])
            d.text((190, y + 38), "máx %d°  mín %d°" % (w["max"], w["min"]),
                   font=_font(FONT, 20), fill=COLORS["preto"])
        else:
            d.text((16, y), "Sem dados de meteorologia", font=_font(FONT, 20), fill=COLORS["preto"])
        y += 84
    d.line([16, y, W - 16, y], fill=COLORS["preto"], width=2)
    y += 12

    # Linhas de texto livres
    lines = [l for l in cfg.get("lines", []) if l.get("text", "").strip()]
    avail = H - y - 22
    step = min(40, avail // max(len(lines), 1)) if lines else 0
    for l in lines:
        color = COLORS.get(l.get("color", "preto"), COLORS["preto"])
        f = _fit(d, l["text"], FONT, max(14, step - 10), W - 32)
        d.text((16, y), l["text"], font=f, fill=color)
        y += step

    if stamp:
        d.text((W - 10, H - 6), "Atualizado %s" % now.strftime("%H:%M"),
               font=_font(FONT, 14), fill=COLORS["preto"], anchor="rb")
    return img


def version(img: Image.Image) -> str:
    return hashlib.sha256(img.tobytes()).hexdigest()[:16]


def to_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
