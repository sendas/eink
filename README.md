# Ecrã e-ink controlado por interface web

Painel de informações e avisos num Waveshare 4" e-Paper (E6 / Spectra 6, 600×400), editado numa página web alojada no NAS.

```
Browser ──HTTPS──> NAS (Docker, eink.techpro.pt) <──pede a imagem── Raspberry Pi ──8 fios── ecrã (HAT)
                                                                     (dentro de casa)      (exterior)
```

## 1. Material
- Raspberry Pi Zero 2 **WH** (com pinos soldados) e fonte USB 5 V / 2,5 A (micro-USB).
- Cartão microSD de 16 GB ou mais ("high endurance").
- Cabos fêmea-fêmea de 30 a 50 cm (8 fios) ou o cabo PH2.0 incluído com o ecrã.
- Para o exterior: caixa estanque IP65 com janela transparente, silicone, saquinho de sílica.
- Alternativa sem furo: colar o ecrã por dentro de um vidro da porta ou janela.

## 2. Ligações (ecrã → Raspberry Pi)
O ecrã e a placa HAT ficam juntos no exterior. O Pi fica dentro de casa, ligado por 8 fios. Mantenha o cabo o mais curto possível (SPI com cabos longos é pouco fiável).

| Ecrã | Pi (pino) |
|---|---|
| VCC | 3,3 V (pino 1) |
| GND | GND (pino 6) |
| DIN | GPIO10 / MOSI (pino 19) |
| CLK | GPIO11 / SCLK (pino 23) |
| CS | GPIO8 / CE0 (pino 24) |
| DC | GPIO25 (pino 22) |
| RST | GPIO17 (pino 11) |
| BUSY | GPIO24 (pino 18) |

Este é o mapeamento padrão da Waveshare; confirme na wiki do produto ("Hardware connection").

## 3. NAS
1. Copiar este repositório para o NAS.
2. Editar `UI_PASSWORD` e `DEVICE_TOKEN` em `docker-compose.yml` (valores longos e aleatórios).
3. `docker compose up -d --build`
4. No proxy inverso do NAS, apontar `eink.techpro.pt` → porta 8000, com certificado HTTPS.
   **Não exponha sem HTTPS**: a palavra-passe viaja em Basic Auth.

## 4. Raspberry Pi
1. **Cartão SD:** no *Raspberry Pi Imager*, escolher "Raspberry Pi OS Lite (64-bit)" e, nas definições, indicar nome `eink`, utilizador/palavra-passe, Wi-Fi, SSH ativo e fuso `Europe/Lisbon`.
2. Ligar o Pi e entrar: `ssh utilizador@eink.local`.
3. Preparar o sistema:
   ```
   sudo raspi-config nonint do_spi 0
   sudo apt update && sudo apt full-upgrade -y
   sudo apt install -y git python3-venv python3-pil python3-spidev python3-gpiozero python3-lgpio
   sudo reboot
   ```
4. Testar o ecrã com o exemplo da Waveshare (os nomes podem variar):
   ```
   git clone https://github.com/waveshare/e-Paper
   cd e-Paper/RaspberryPi_JetsonNano/python/examples
   python3 epd_4in0e_test.py
   ```
5. Instalar o cliente:
   ```
   cd ~
   git clone https://github.com/sendas/eink
   sudo mkdir -p /opt/eink
   sudo python3 -m venv --system-site-packages /opt/eink/venv
   sudo cp -r ~/e-Paper/RaspberryPi_JetsonNano/python/lib/waveshare_epd /opt/eink/
   sudo cp ~/eink/pi/client.py /opt/eink/
   sudo cp ~/eink/pi/eink.service ~/eink/pi/eink.timer /etc/systemd/system/
   printf 'EINK_URL=https://eink.techpro.pt\nEINK_TOKEN=o-teu-DEVICE_TOKEN\nPYTHONPATH=/opt/eink\n' | sudo tee /etc/eink.env
   sudo chmod 600 /etc/eink.env
   sudo systemctl enable --now eink.timer
   ```
6. Verificar: `sudo systemctl start eink.service && journalctl -u eink.service -n 20`.
   Para forçar uma atualização: `sudo rm -f /var/lib/eink-state.json`.

## 5. Avisos
Na interface web, a caixa "Aviso" ocupa o ecrã todo: título (ex.: "AVISO CTT"), cor da faixa, texto em letra grande e validade (1 h a 3 dias). Quando expira, o ecrã volta ao painel normal. Use códigos de uso único: o ecrã é visível da rua.

## Notas
- Só 6 cores: preto, branco, amarelo, vermelho, azul, verde.
- Cada atualização demora ~15–30 s. O cliente verifica o NAS a cada 5 min, não atualiza mais de 1x/5 min e força uma atualização por dia.
- O Pi só faz pedidos de saída para o NAS; não precisa de portas abertas.
- No exterior: sombra (evitar mais de 40 °C), vedar bem contra condensação, não alongar a fita do ecrã.
