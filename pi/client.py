#!/usr/bin/env python3
"""Corre no Raspberry Pi: vai buscar a imagem ao NAS e atualiza o ecrã se mudou."""
import json
import os
import sys
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

BASE = os.environ["EINK_URL"].rstrip("/")      # ex.: https://eink.techpro.pt
TOKEN = os.environ["EINK_TOKEN"]
STATE = Path(os.environ.get("EINK_STATE", "/var/lib/eink-state.json"))
MIN_GAP = 300           # nunca atualizar mais do que 1x / 5 min
FORCE_AFTER = 24 * 3600  # atualização completa pelo menos 1x por dia


def get(path):
    with urllib.request.urlopen("%s%s?token=%s" % (BASE, path, TOKEN), timeout=30) as r:
        return r.read()


def main():
    try:
        state = json.loads(STATE.read_text())
    except Exception:
        state = {"version": None, "at": 0}
    now = time.time()
    version = json.loads(get("/api/version"))["version"]
    changed = version != state["version"]
    stale = now - state["at"] > FORCE_AFTER
    if not (changed or stale) or now - state["at"] < MIN_GAP:
        return

    img = Image.open(BytesIO(get("/api/image.png"))).convert("RGB")
    # Biblioteca da Waveshare (ver README): modelo 4inch e-Paper (E)
    from waveshare_epd import epd4in0e
    epd = epd4in0e.EPD()
    try:
        epd.init()
        epd.display(epd.getbuffer(img))
    finally:
        epd.sleep()
    STATE.write_text(json.dumps({"version": version, "at": now}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("erro:", e, file=sys.stderr)
        sys.exit(1)
