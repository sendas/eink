# Plateia

Arruma os filmes e as séries de um disco na estrutura que o Plex, o Jellyfin e o Emby reconhecem. Node 22, sem dependências.

> Esta pasta vive provisoriamente no repositório do Eça Avalia e não tem nada a ver com ele. É para mover para um repositório próprio.

## O que faz

- Lê os nomes dos ficheiros de vídeo e propõe o nome e a pasta certos:
  - `Filmes/Título (Ano)/Título (Ano).mkv`
  - `Séries/Nome/Season 01/Nome - S01E02 - Título.mkv`
- Leva as legendas com o mesmo nome (`Filme.pt.srt`) atrás do vídeo.
- Mostra sempre a pré-visualização. Só mexe no que for escolhido e confirmado.
- Nunca apaga nem substitui ficheiros. Dois ficheiros que dariam o mesmo nome ficam em «conflito» e não são tocados.
- Regista cada arrumação num diário (`dados/diario.json`) e sabe desfazê-la.
- Depois de arrumar, pede ao Plex, ao Jellyfin e ao Emby que voltem a ler a biblioteca (se estiverem configurados).

## O que ainda não faz

- Não vai buscar cartazes, sinopses nem títulos oficiais (não usa o TMDB): o título é o que está no nome do ficheiro.
- Não trata música, fotografias nem documentos; ignora-os.
- Não faz pedidos, transferências nem procura de legendas.
- A ligação ao Plex, ao Jellyfin e ao Emby só foi testada contra um servidor simulado.

## Usar

Primeiro, ver o que mudaria, sem mexer em nada:

```sh
node cli.js prever /caminho/do/disco
```

Depois, a interface no navegador (http://127.0.0.1:8477):

```sh
PLATEIA_ORIGEM=/caminho/do/disco npm start
```

Ou tudo pela linha de comandos (só os ficheiros de leitura segura):

```sh
node cli.js aplicar /caminho/do/disco --confirmo
node cli.js desfazer
```

No Windows (PowerShell): `$env:PLATEIA_ORIGEM = 'E:\'; npm start`.

## Configuração (variáveis de ambiente)

| Variável | Para quê |
| --- | --- |
| `PLATEIA_ORIGEM` | Pasta a arrumar (obrigatória). |
| `PLATEIA_DESTINO` | Onde fica a biblioteca arrumada. Por defeito, a própria origem. |
| `PLATEIA_DADOS` | Onde fica o diário. Por defeito, `./dados`. |
| `PLATEIA_SENHA` | Palavra-passe da interface. Obrigatória se `HOST` não for `127.0.0.1`. |
| `HOST`, `PORT` | Por defeito `127.0.0.1` e `8477`. |
| `PLATEIA_PASTA_FILMES`, `PLATEIA_PASTA_SERIES`, `PLATEIA_PASTA_TEMPORADA` | Nomes das pastas (`Filmes`, `Séries`, `Season`). |
| `JELLYFIN_URL`, `JELLYFIN_CHAVE` | Endereço e chave de API do Jellyfin. |
| `EMBY_URL`, `EMBY_CHAVE` | Endereço e chave de API do Emby. |
| `PLEX_URL`, `PLEX_TOKEN` | Endereço e token do Plex. |

A palavra-passe viaja em HTTP simples: usar só na rede de casa ou atrás de um proxy com HTTPS.

## Docker

```sh
docker build -t plateia .
docker run -p 8477:8477 -e PLATEIA_SENHA=... -v /caminho/do/disco:/media -v plateia-dados:/dados plateia
```

## Testes

```sh
npm test
```
