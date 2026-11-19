'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const PLANO = require('../lib/plano');
const SERVIDORES = require('../lib/servidores');
const { criar, configuracao } = require('../server');

function disco(ficheiros) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'plateia-'));
  for (const [rel, texto] of Object.entries(ficheiros)) {
    const abs = path.join(raiz, 'media', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, texto);
  }
  return { raiz, media: path.join(raiz, 'media'), diario: path.join(raiz, 'dados', 'diario.json') };
}

function arvore(raiz) {
  const lista = [];
  const andar = (rel) => {
    for (const e of fs.readdirSync(path.join(raiz, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { lista.push(r + '/'); andar(r); } else lista.push(r);
    }
  };
  andar('');
  return lista.sort();
}

const BASE = {
  'downloads/The.Matrix.1999.1080p.mkv': 'matrix',
  'downloads/The.Matrix.1999.1080p.pt.srt': 'legenda',
  'downloads/The.Matrix.1999.1080p.nfo': 'lixo',
  'Breaking.Bad.S01E02.720p.mkv': 'bb2',
  'ferias.mkv': 'ferias',
  'notas.txt': 'texto',
};

test('prever não mexe em nada', async () => {
  const d = disco(BASE);
  const antes = arvore(d.media);
  const itens = await PLANO.construir(d.media, d.media);
  assert.deepEqual(arvore(d.media), antes);
  assert.deepEqual(itens.map((i) => [i.de, i.estado]).sort(), [
    ['Breaking.Bad.S01E02.720p.mkv', 'pronto'],
    ['downloads/The.Matrix.1999.1080p.mkv', 'pronto'],
    ['ferias.mkv', 'rever'],
  ]);
  const matrix = itens.find((i) => i.titulo === 'The Matrix');
  assert.deepEqual(matrix.anexos, [{ de: 'downloads/The.Matrix.1999.1080p.pt.srt', para: 'Filmes/The Matrix (1999)/The Matrix (1999).pt.srt' }]);
});

test('aplicar arruma, leva as legendas e desfazer repõe tudo', async () => {
  const d = disco(BASE);
  const antes = arvore(d.media);
  const itens = await PLANO.construir(d.media, d.media);
  const ids = itens.filter((i) => i.estado === 'pronto').map((i) => i.id);
  const lote = await PLANO.aplicar({ origem: d.media, destino: d.media, ids, diario: d.diario });
  assert.equal(lote.ops.length, 3);
  assert.deepEqual(lote.falhas, []);
  assert.deepEqual(arvore(d.media), [
    'Filmes/', 'Filmes/The Matrix (1999)/', 'Filmes/The Matrix (1999)/The Matrix (1999).mkv',
    'Filmes/The Matrix (1999)/The Matrix (1999).pt.srt',
    'Séries/', 'Séries/Breaking Bad/', 'Séries/Breaking Bad/Season 01/',
    'Séries/Breaking Bad/Season 01/Breaking Bad - S01E02.mkv',
    'downloads/', 'downloads/The.Matrix.1999.1080p.nfo', 'ferias.mkv', 'notas.txt',
  ].sort());
  assert.equal(fs.readFileSync(path.join(d.media, 'Filmes/The Matrix (1999)/The Matrix (1999).mkv'), 'utf8'), 'matrix');

  // Depois de arrumados, aparecem como «certo» e nada mais há a fazer.
  const depois = await PLANO.construir(d.media, d.media);
  assert.equal(depois.filter((i) => i.estado === 'certo').length, 2);
  assert.equal(depois.filter((i) => i.estado === 'pronto').length, 0);

  const desfeito = await PLANO.desfazer({ diario: d.diario });
  assert.equal(desfeito.desfeito.repostos, 3);
  assert.deepEqual(arvore(d.media), antes);
  await assert.rejects(PLANO.desfazer({ diario: d.diario }), /nada para desfazer/);
});

test('nunca substitui um ficheiro que já existe', async () => {
  const d = disco({
    'The.Matrix.1999.mkv': 'novo',
    'Filmes/The Matrix (1999)/The Matrix (1999).mkv': 'antigo',
  });
  const itens = await PLANO.construir(d.media, d.media);
  const novo = itens.find((i) => i.de === 'The.Matrix.1999.mkv');
  assert.equal(novo.estado, 'conflito');
  const lote = await PLANO.aplicar({ origem: d.media, destino: d.media, ids: itens.map((i) => i.id), diario: d.diario });
  assert.equal(lote.ops.length, 0);
  assert.equal(fs.readFileSync(path.join(d.media, 'Filmes/The Matrix (1999)/The Matrix (1999).mkv'), 'utf8'), 'antigo');
  assert.equal(fs.readFileSync(path.join(d.media, 'The.Matrix.1999.mkv'), 'utf8'), 'novo');
});

test('dois ficheiros que dariam o mesmo nome ficam ambos em conflito', async () => {
  const d = disco({ 'a/The.Matrix.1999.720p.mkv': '1', 'b/The.Matrix.1999.1080p.mkv': '2' });
  const itens = await PLANO.construir(d.media, d.media);
  assert.deepEqual(itens.map((i) => i.estado), ['conflito', 'conflito']);
});

test('arruma para outra pasta de destino', async () => {
  const d = disco({ 'Dark.S01E04.mkv': 'dark' });
  const destino = path.join(d.raiz, 'arrumado');
  const itens = await PLANO.construir(d.media, destino);
  await PLANO.aplicar({ origem: d.media, destino, ids: itens.map((i) => i.id), diario: d.diario });
  assert.deepEqual(arvore(destino), ['Séries/', 'Séries/Dark/', 'Séries/Dark/Season 01/', 'Séries/Dark/Season 01/Dark - S01E04.mkv']);
  assert.deepEqual(arvore(d.media), []);
});

test('desfazer não passa por cima de um ficheiro que entretanto apareceu', async () => {
  const d = disco({ 'Dark.S01E04.mkv': 'dark' });
  const itens = await PLANO.construir(d.media, d.media);
  await PLANO.aplicar({ origem: d.media, destino: d.media, ids: itens.map((i) => i.id), diario: d.diario });
  fs.writeFileSync(path.join(d.media, 'Dark.S01E04.mkv'), 'outro');
  const lote = await PLANO.desfazer({ diario: d.diario });
  assert.equal(lote.desfeito.repostos, 0);
  assert.equal(lote.desfeito.falhas.length, 1);
  assert.equal(fs.readFileSync(path.join(d.media, 'Dark.S01E04.mkv'), 'utf8'), 'outro');
});

function ouvir(servidor) {
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${servidor.address().port}`)));
}

test('avisa o Jellyfin, o Emby e o Plex com a chave certa', async (t) => {
  const pedidos = [];
  const falso = http.createServer((req, res) => {
    pedidos.push(`${req.method} ${req.url} ${req.headers['x-emby-token'] || req.headers['x-plex-token']}`);
    res.writeHead(req.url.startsWith('/emby') ? 401 : 204).end();
  });
  const url = await ouvir(falso);
  t.after(() => falso.close());
  const r = await SERVIDORES.atualizar({
    JELLYFIN_URL: url + '/', JELLYFIN_CHAVE: 'j', EMBY_URL: url, EMBY_CHAVE: 'e', PLEX_URL: url, PLEX_TOKEN: 'p',
  });
  assert.deepEqual(pedidos, ['POST /Library/Refresh j', 'POST /emby/Library/Refresh e', 'GET /library/sections/all/refresh p']);
  assert.deepEqual(r.map((s) => [s.nome, s.ok]), [['Jellyfin', true], ['Emby', false], ['Plex', true]]);
  assert.deepEqual(await SERVIDORES.atualizar({}), []);
});

test('servidor: plano, aplicar, histórico, desfazer e recusas', async (t) => {
  const d = disco(BASE);
  const c = configuracao({ PLATEIA_ORIGEM: d.media, PLATEIA_DADOS: path.join(d.raiz, 'dados'), PLATEIA_SENHA: 'segredo' });
  const servidor = criar(c);
  const url = await ouvir(servidor);
  t.after(() => servidor.close());
  const auth = { authorization: 'Basic ' + Buffer.from('eu:segredo').toString('base64') };
  const post = (rota, corpo, extra) => fetch(url + rota, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', ...extra }, body: JSON.stringify(corpo) });

  assert.equal((await fetch(url + '/api/plano')).status, 401);
  assert.equal((await fetch(url + '/api/plano', { headers: { authorization: 'Basic ' + Buffer.from('eu:errada').toString('base64') } })).status, 401);
  assert.equal((await fetch(url + '/', { headers: auth })).status, 200);
  assert.equal((await fetch(url + '/../server.js', { headers: auth })).status, 404);

  const plano = await (await fetch(url + '/api/plano', { headers: auth })).json();
  assert.equal(plano.itens.length, 3);

  assert.equal((await post('/api/aplicar', { ids: ['x'] }, { origin: 'http://outro.example' })).status, 403);
  assert.equal((await post('/api/aplicar', { ids: 'x' })).status, 400);
  // Um caminho inventado não corresponde a nenhum item do plano: nada se move.
  const nada = await (await post('/api/aplicar', { ids: ['../../etc/passwd'] })).json();
  assert.equal(nada.lote.ops.length, 0);

  const r = await (await post('/api/aplicar', { ids: plano.itens.map((i) => i.id) })).json();
  assert.equal(r.lote.ops.length, 4); // 3 vídeos e 1 legenda
  assert.ok(fs.existsSync(path.join(d.media, 'Filmes/Ferias/Ferias.mkv')));

  const h = await (await fetch(url + '/api/historico', { headers: auth })).json();
  assert.equal(h.lotes.length, 2);
  const u = await (await post('/api/desfazer', { lote: r.lote.id })).json();
  assert.equal(u.lote.desfeito.repostos, 4);
  assert.ok(fs.existsSync(path.join(d.media, 'ferias.mkv')));
});

test('não abre à rede sem palavra-passe', () => {
  assert.throws(() => configuracao({ PLATEIA_ORIGEM: '/tmp', HOST: '0.0.0.0' }), /PLATEIA_SENHA/);
  assert.throws(() => configuracao({}), /PLATEIA_ORIGEM/);
});
