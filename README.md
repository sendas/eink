# Ecrã e-ink controlado por interface web

Painel de informações e avisos num Waveshare 4" e-Paper (E6 / Spectra 6, 600×400), editado numa página web alojada no NAS.

```
Browser ──HTTPS──> NAS (Docker, eink.techpro.pt) <──pede a imagem── Raspberry Pi + HAT ──fita── painel
                                                                     (dentro de casa)      (exterior)
```

## 1. Material
- Raspberry Pi Zero 2 **WH** (com pinos soldados) e fonte USB 5 V / 2,5 A (micro-USB).
- Cartão microSD de 16 GB ou mais ("high endurance").
- Para o exterior: caixa estanque IP65 com tampa transparente e **interior de pelo menos 120×85×40 mm** (a placa HAT mede 101×68 mm; o painel 99×66 mm), silicone, saquinho de sílica.
- Alternativa sem furo: colar o ecrã por dentro de um vidro da porta ou janela.

## 2. Ligações
O painel liga-se à placa HAT por uma **fita flexível**. A placa HAT encaixa diretamente nos 40 pinos do Raspberry Pi (dentro de casa) e só o painel, com o pequeno adaptador da fita, fica no exterior. A fita passa por uma fenda fina na porta. Não são precisos fios dupont.

Antes de furar, meça o comprimento da fita incluída: tem de ir do painel, atravessar a porta (cerca de 4 cm) e chegar à placa HAT. Se for curta, pode ser preciso uma extensão FFC com os mesmos contactos e passo.

## 2b. Moldura slim impressa em 3D (`case/`)
Duas peças (`slim_bezel.stl` e `slim_back.stl`, geradas por `case/eink_case_slim.scad`), cerca de 10 mm de espessura e 118×85 mm. Só o painel e o adaptador da fita ficam no exterior.
- Material: **ASA** (melhor) ou PETG, cor clara. Evitar PLA (deforma ao sol).
- Vidro: lâmina de **acrílico ou policarbonato de 1,5 mm**, 103×70 mm, colada à moldura com silicone.
- Os 4 parafusos (3 mm, com 25 a 30 mm) prendem a moldura à porta; vedar com silicone entre as peças e à volta da fenda.
- Fenda de 18×2,4 mm na porta para a fita (furos em fila com broca de 3 mm e limar), vedada com silicone depois de passar a fita.
- As medidas do adaptador e a posição da fenda são estimativas: imprima primeiro e confira com o ecrã real. Há também uma caixa mais grossa (`eink_case.scad`, 26 mm) para a placa no exterior.

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
