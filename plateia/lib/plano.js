'use strict';
// Plano de arrumação: ler o disco, propor mudanças, aplicá-las e desfazê-las.
// Nunca apaga nem substitui ficheiros: só muda nomes e pastas, e regista tudo no diário.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const NOMES = require('./nomes');

const SALTAR = new Set(['@eaDir', '#recycle', '$RECYCLE.BIN', 'System Volume Information', 'lost+found']);

async function existe(caminho) {
  try { await fsp.lstat(caminho); return true; } catch { return false; }
}

// Lista as pastas (com os seus ficheiros) por baixo de `raiz`, sem seguir atalhos.
async function varrer(raiz) {
  const pastas = [];
  const fila = [''];
  while (fila.length) {
    const rel = fila.pop();
    let entradas;
    try { entradas = await fsp.readdir(path.join(raiz, rel), { withFileTypes: true }); }
    catch { continue; }
    const ficheiros = [];
    for (const e of entradas) {
      if (e.name.startsWith('.') || SALTAR.has(e.name)) continue;
      if (e.isDirectory()) fila.push(rel ? `${rel}/${e.name}` : e.name);
      else if (e.isFile()) ficheiros.push(e.name);
    }
    if (ficheiros.length) pastas.push({ rel, ficheiros });
  }
  return pastas;
}

const chave = (abs) => path.resolve(abs).toLowerCase();

/**
 * Constrói o plano. Cada item:
 * { id, de, para, tipo, titulo, ano, temporada, episodios, tamanho, anexos, estado, motivo }
 * estado: 'certo' (já no sítio), 'pronto', 'rever' (leitura duvidosa) ou 'conflito'.
 * `de` é relativo à origem e `para` relativo ao destino.
 */
async function construir(origem, destino, opcoes) {
  origem = path.resolve(origem);
  destino = path.resolve(destino);
  const itens = [];
  for (const pasta of await varrer(origem)) {
    for (const nome of pasta.ficheiros) {
      if (!NOMES.ehVideo(nome)) continue;
      const de = pasta.rel ? `${pasta.rel}/${nome}` : nome;
      const info = NOMES.analisar(de);
      const semExt = NOMES.destinoDe(info, opcoes);
      const para = `${semExt}.${info.ext}`;
      const base = nome.slice(0, nome.length - info.ext.length - 1);
      // Legendas com o mesmo nome («Filme.pt.srt») acompanham o vídeo.
      const anexos = pasta.ficheiros
        .filter((f) => NOMES.ehLegenda(f) && (f.startsWith(base + '.')))
        .map((f) => ({
          de: pasta.rel ? `${pasta.rel}/${f}` : f,
          para: semExt + f.slice(base.length),
        }));
      let tamanho = 0;
      try { tamanho = (await fsp.stat(path.join(origem, de))).size; } catch { /* desapareceu entretanto */ }
      itens.push({
        id: de, de, para,
        tipo: info.tipo,
        titulo: info.tipo === 'serie' ? info.serie : info.titulo,
        ano: info.ano || null,
        temporada: info.temporada ?? null,
        episodios: info.episodios || null,
        tamanho, anexos,
        estado: info.duvida ? 'rever' : 'pronto',
        motivo: info.duvida || '',
      });
    }
  }

  const alvos = new Map();
  for (const it of itens) {
    const k = chave(path.join(destino, it.para));
    if (!alvos.has(k)) alvos.set(k, []);
    alvos.get(k).push(it);
  }
  for (const it of itens) {
    const absDe = path.join(origem, it.de);
    const absPara = path.join(destino, it.para);
    if (path.resolve(absDe) === path.resolve(absPara)) {
      it.estado = 'certo'; it.motivo = '';
      continue;
    }
    const iguais = alvos.get(chave(absPara));
    if (iguais.length > 1) {
      it.estado = 'conflito';
      it.motivo = 'vários ficheiros dariam este mesmo nome: ' +
        iguais.filter((o) => o !== it).map((o) => o.de).join(', ');
    } else if (await existe(absPara)) {
      it.estado = 'conflito';
      it.motivo = 'já existe um ficheiro com este nome no destino';
    }
  }
  itens.sort((a, b) => a.para.localeCompare(b.para, 'pt'));
  return itens;
}

// Move sem nunca substituir um ficheiro que já exista.
async function mover(de, para) {
  await fsp.mkdir(path.dirname(para), { recursive: true });
  try {
    await fsp.link(de, para); // falha com EEXIST se o destino existir
    await fsp.unlink(de);
    return;
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error('o destino já existe');
    if (e.code === 'EXDEV') {
      // Outro disco: copiar, conferir o tamanho e só então tirar o original.
      await fsp.copyFile(de, para, fs.constants.COPYFILE_EXCL);
      const [a, b] = await Promise.all([fsp.stat(de), fsp.stat(para)]);
      if (a.size !== b.size) {
        await fsp.unlink(para);
        throw new Error('a cópia ficou incompleta');
      }
      await fsp.unlink(de);
      return;
    }
    if (!['EPERM', 'ENOTSUP', 'ENOSYS', 'EOPNOTSUPP', 'EMLINK', 'EACCES'].includes(e.code)) throw e;
  }
  // Discos sem ligações (FAT, exFAT, algumas partilhas de rede).
  if (await existe(para)) throw new Error('o destino já existe');
  await fsp.rename(de, para);
}

// Apaga pastas que ficaram vazias, a subir até `raiz` (que nunca é apagada).
async function limparVazias(pasta, raiz) {
  raiz = path.resolve(raiz);
  let atual = path.resolve(pasta);
  while (atual !== raiz && atual.startsWith(raiz + path.sep)) {
    try { await fsp.rmdir(atual); } catch { return; } // não está vazia
    atual = path.dirname(atual);
  }
}

async function lerDiario(ficheiro) {
  try { return JSON.parse(await fsp.readFile(ficheiro, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`não consegui ler o diário (${ficheiro}): ${e.message}`);
  }
}

async function gravarDiario(ficheiro, lotes) {
  await fsp.mkdir(path.dirname(ficheiro), { recursive: true });
  const tmp = `${ficheiro}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(lotes, null, 1));
  await fsp.rename(tmp, ficheiro);
}

/**
 * Aplica os itens escolhidos (pelos `ids`). O plano é recalculado aqui, por
 * isso o destino de cada ficheiro nunca vem de fora. Itens em conflito ou já
 * certos ficam sempre de fora.
 */
async function aplicar({ origem, destino, ids, diario, opcoes }) {
  origem = path.resolve(origem);
  destino = path.resolve(destino);
  const quero = new Set(ids);
  const itens = (await construir(origem, destino, opcoes))
    .filter((it) => quero.has(it.id) && (it.estado === 'pronto' || it.estado === 'rever'));
  const lotes = await lerDiario(diario);
  const lote = { id: `${Date.now()}`, quando: new Date().toISOString(), origem, destino, ops: [], falhas: [], desfeito: null };
  lotes.push(lote);

  for (const it of itens) {
    const pares = [{ de: it.de, para: it.para }, ...it.anexos];
    for (const p of pares) {
      const absDe = path.join(origem, p.de);
      const absPara = path.join(destino, p.para);
      try {
        await mover(absDe, absPara);
        lote.ops.push({ de: absDe, para: absPara });
        await gravarDiario(diario, lotes); // a cada passo, para sobreviver a um corte de energia
      } catch (e) {
        lote.falhas.push({ de: p.de, erro: e.message });
        if (p === pares[0]) break; // sem o vídeo, as legendas ficam onde estão
      }
    }
    await limparVazias(path.dirname(path.join(origem, it.de)), origem);
  }
  await gravarDiario(diario, lotes);
  return lote;
}

// Devolve os ficheiros de um lote ao sítio de onde saíram.
async function desfazer({ diario, lote: id }) {
  const lotes = await lerDiario(diario);
  const lote = id ? lotes.find((l) => l.id === id) : [...lotes].reverse().find((l) => !l.desfeito);
  if (!lote) throw new Error('não há nada para desfazer');
  if (lote.desfeito) throw new Error('esse lote já foi desfeito');
  const falhas = [];
  let repostos = 0;
  for (const op of [...lote.ops].reverse()) {
    try {
      await mover(op.para, op.de);
      repostos++;
      await limparVazias(path.dirname(op.para), lote.destino);
    } catch (e) {
      falhas.push({ de: op.para, erro: e.code === 'ENOENT' ? 'o ficheiro já não está lá' : e.message });
    }
  }
  lote.desfeito = { quando: new Date().toISOString(), repostos, falhas };
  await gravarDiario(diario, lotes);
  return lote;
}

module.exports = { construir, aplicar, desfazer, lerDiario, varrer };
