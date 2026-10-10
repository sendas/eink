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


def render(cfg: dict, stamp: bool = False) -> Image.Image:
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
