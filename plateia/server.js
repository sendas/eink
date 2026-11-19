'use strict';
// Plateia: servidor da interface. Sem dependências.

const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const PLANO = require('./lib/plano');
const SERVIDORES = require('./lib/servidores');
const { version } = require('./package.json');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const LOCAIS = new Set(['127.0.0.1', '::1', 'localhost']);

function configuracao(env = process.env) {
  const c = {
    origem: env.PLATEIA_ORIGEM || '',
    destino: env.PLATEIA_DESTINO || '',
    dados: env.PLATEIA_DADOS || path.join(__dirname, 'dados'),
    senha: env.PLATEIA_SENHA || '',
    host: env.HOST || '127.0.0.1',
    porta: Number(env.PORT || 8477),
    opcoes: {},
    env,
  };
  if (env.PLATEIA_PASTA_FILMES) c.opcoes.filmes = env.PLATEIA_PASTA_FILMES;
  if (env.PLATEIA_PASTA_SERIES) c.opcoes.series = env.PLATEIA_PASTA_SERIES;
  if (env.PLATEIA_PASTA_TEMPORADA) c.opcoes.temporada = env.PLATEIA_PASTA_TEMPORADA;
  if (!c.origem) throw new Error('Falta PLATEIA_ORIGEM (a pasta com os filmes e as séries).');
  if (!c.destino) c.destino = c.origem;
  c.origem = path.resolve(c.origem);
  c.destino = path.resolve(c.destino);
  c.diario = path.join(c.dados, 'diario.json');
  if (!LOCAIS.has(c.host) && !c.senha) {
    throw new Error('Para abrir a Plateia a outros aparelhos (HOST diferente de 127.0.0.1) é obrigatório definir PLATEIA_SENHA.');
  }
  return c;
}

function iguais(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function autorizado(req, c) {
  if (!c.senha) return true;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const texto = Buffer.from(m[1], 'base64').toString('utf8');
  return iguais(texto.slice(texto.indexOf(':') + 1), c.senha);
}

function json(res, estado, corpo) {
  res.writeHead(estado, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function corpo(req) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw Object.assign(new Error('pedido inválido'), { estado: 415 });
  const partes = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > 8 * 1024 * 1024) throw Object.assign(new Error('pedido demasiado grande'), { estado: 413 });
    partes.push(p);
  }
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('JSON inválido'), { estado: 400 }); }
}

// Um pedido de escrita vindo de outro sítio (outra página aberta no navegador) é recusado.
function mesmaOrigem(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

function criar(c) {
  let ocupado = false;
  async function exclusivo(fn) {
    if (ocupado) throw Object.assign(new Error('já há uma arrumação a decorrer'), { estado: 409 });
    ocupado = true;
    try { return await fn(); } finally { ocupado = false; }
  }

  async function api(req, res, rota) {
    if (req.method === 'GET' && rota === '/api/estado') {
      return json(res, 200, {
        versao: version, origem: c.origem, destino: c.destino,
        servidores: SERVIDORES.configurados(c.env).map((s) => s.nome),
      });
    }
    if (req.method === 'GET' && rota === '/api/plano') {
      return json(res, 200, { itens: await PLANO.construir(c.origem, c.destino, c.opcoes) });
    }
    if (req.method === 'GET' && rota === '/api/historico') {
      const lotes = await PLANO.lerDiario(c.diario);
      return json(res, 200, { lotes: lotes.reverse() });
    }
    if (req.method !== 'POST') return json(res, 404, { erro: 'não existe' });
    if (!mesmaOrigem(req)) return json(res, 403, { erro: 'pedido recusado' });
    const dados = await corpo(req);
    if (rota === '/api/aplicar') {
      if (!Array.isArray(dados.ids) || !dados.ids.every((i) => typeof i === 'string')) return json(res, 400, { erro: 'faltam os ficheiros a arrumar' });
      const lote = await exclusivo(() => PLANO.aplicar({ origem: c.origem, destino: c.destino, ids: dados.ids, diario: c.diario, opcoes: c.opcoes }));
      const servidores = lote.ops.length ? await SERVIDORES.atualizar(c.env) : [];
      return json(res, 200, { lote, servidores });
    }
    if (rota === '/api/desfazer') {
      const lote = await exclusivo(() => PLANO.desfazer({ diario: c.diario, lote: typeof dados.lote === 'string' ? dados.lote : undefined }));
      const servidores = await SERVIDORES.atualizar(c.env);
      return json(res, 200, { lote, servidores });
    }
    if (rota === '/api/servidores/atualizar') {
      return json(res, 200, { servidores: await SERVIDORES.atualizar(c.env) });
    }
    return json(res, 404, { erro: 'não existe' });
  }

  async function estatico(res, rota) {
    const rel = rota === '/' ? 'index.html' : rota.slice(1);
    const pub = path.join(__dirname, 'public');
    const ficheiro = path.join(pub, rel);
    if (!ficheiro.startsWith(pub + path.sep) || !TIPOS[path.extname(ficheiro)]) return json(res, 404, { erro: 'não existe' });
    try {
      const dados = await fsp.readFile(ficheiro);
      res.writeHead(200, { 'content-type': TIPOS[path.extname(ficheiro)], 'cache-control': 'no-cache' });
      res.end(dados);
    } catch { json(res, 404, { erro: 'não existe' }); }
  }

  return http.createServer(async (req, res) => {
    res.setHeader('content-security-policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    try {
      if (!autorizado(req, c)) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="Plateia", charset="UTF-8"' });
        return res.end('É precisa a palavra-passe da Plateia.');
      }
      const rota = new URL(req.url, 'http://x').pathname;
      if (rota.startsWith('/api/')) return await api(req, res, rota);
      if (req.method !== 'GET') return json(res, 404, { erro: 'não existe' });
      return await estatico(res, rota);
    } catch (e) {
      if (!e.estado) console.error(e);
      json(res, e.estado || 500, { erro: e.message });
    }
  });
}

module.exports = { criar, configuracao };

if (require.main === module) {
  let c;
  try { c = configuracao(); } catch (e) { console.error(e.message); process.exit(1); }
  criar(c).listen(c.porta, c.host, () => {
    console.log(`Plateia ${version} em http://${c.host}:${c.porta}`);
    console.log(`  origem:  ${c.origem}\n  destino: ${c.destino}`);
  });
}
