# Ecrã e-ink controlado por interface web

Painel de informações num Waveshare 4" e-Paper (E6 / Spectra 6, 600×400), editado numa página web alojada no NAS.

```
Browser ──HTTPS──> NAS (Docker, eink.techpro.pt) <──pede a imagem── Raspberry Pi + ecrã
```

## 1. Hardware
- Raspberry Pi Zero 2 **WH** (já com pinos) + cartão microSD + fonte 5 V.
- Encaixar o HAT nos 40 pinos.

## 2. NAS
1. Copiar este repositório para o NAS.
2. Editar `UI_PASSWORD` e `DEVICE_TOKEN` em `docker-compose.yml` (valores longos e aleatórios).
3. `docker compose up -d --build`
4. No proxy inverso do NAS, apontar `eink.techpro.pt` → porta 8000, com certificado HTTPS.
   **Não exponha sem HTTPS**: a palavra-passe viaja em Basic Auth.

## 3. Raspberry Pi
1. Raspberry Pi OS Lite; ativar SPI: `sudo raspi-config` → Interface Options → SPI.
2. ```
   sudo mkdir -p /opt/eink && sudo chown $USER /opt/eink
   python3 -m venv --system-site-packages /opt/eink/venv
   /opt/eink/venv/bin/pip install pillow spidev gpiozero lgpio
   ```
3. Instalar a biblioteca da Waveshare (pasta `RaspberryPi_JetsonNano/python/lib/waveshare_epd`
   do repositório `waveshare/e-Paper`) e confirmar que existe `epd4in0e.py`:
   `cp -r waveshare_epd /opt/eink/venv/lib/python3*/site-packages/`
4. ```
   cp pi/client.py /opt/eink/
   sudo cp pi/eink.service pi/eink.timer /etc/systemd/system/
   echo -e "EINK_URL=https://eink.techpro.pt\nEINK_TOKEN=o-teu-device-token" | sudo tee /etc/eink.env
   sudo chmod 600 /etc/eink.env
   sudo systemctl enable --now eink.timer
   ```

## Notas
- Só 6 cores: preto, branco, amarelo, vermelho, azul, verde.
- Cada atualização demora ~15–30 s. O cliente não atualiza mais de 1x/5 min e força uma atualização por dia.
- O Pi só faz pedidos de saída para o NAS; não precisa de portas abertas.
