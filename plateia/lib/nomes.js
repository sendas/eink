'use strict';
// Leitura de nomes de ficheiros de filmes e séries. Só funções puras: não toca no disco.

const path = require('node:path');

const VIDEO = new Set(['mkv', 'mp4', 'avi', 'mov', 'm4v', 'wmv', 'mpg', 'mpeg', 'webm', 'flv', 'ts', 'm2ts']);
const LEGENDA = new Set(['srt', 'sub', 'ass', 'ssa', 'vtt', 'idx', 'smi']);

// Palavras que marcam o fim do título num nome de ficheiro.
const LIXO = /^(480p|576p|720p|1080p|1080i|2160p|4k|uhd|hdr|hdr10|bluray|blu-ray|bdrip|brrip|bdremux|remux|webrip|web-dl|webdl|hdtv|dvdrip|dvdscr|hdrip|x264|x265|h264|h265|hevc|xvid|divx|aac|ac3|dts|atmos|10bit|8bit|remastered|proper|repack|dublado|legendado|ptbr|pt-br|pt-pt)$/i;

const ANO = /^(19\d\d|20\d\d)$/;
const AMOSTRA = /^(sample|amostra|trailer)$/i;
const PARTE = /\b(?:cd|part|parte|disc|disco)[ ]?(\d)\b/i;

const SERIE = [
  /\bS(\d{1,2})[ ]?E(\d{1,3})(?:-?E(\d{1,3}))?\b/i,
  /\b(\d{1,2})x(\d{2,3})\b/i,
  /\b(?:season|temporada)[ ]*(\d{1,2})[ ]*(?:episode|epis[oó]dio|ep)[ ]*(\d{1,3})\b/i,
];
const PASTA_TEMPORADA = /^(?:season|temporada|s)[ ._-]*(\d{1,2})$/i;
const SO_EPISODIO = /^(?:e|ep|epis[oó]dio)?[ ]*(\d{1,3})(?![\dp])\b/i;

function extensao(nome) {
  return path.extname(nome).slice(1).toLowerCase();
}
function ehVideo(nome) { return VIDEO.has(extensao(nome)); }
function ehLegenda(nome) { return LEGENDA.has(extensao(nome)); }

// «The.Matrix_[grupo]_(1999)» → «The Matrix 1999»
function limpar(texto) {
  return texto
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[(){}]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizar(titulo) {
  const letras = titulo.replace(/[^\p{L}]/gu, '');
  if (!letras) return titulo;
  const misto = letras !== letras.toLowerCase() && letras !== letras.toUpperCase();
  if (misto) return titulo;
  return titulo.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

function aparar(titulo) {
  return capitalizar(titulo.replace(/^[\s-]+|[\s-]+$/g, '').replace(/\s+/g, ' '));
}

// Corta no primeiro termo técnico («1080p», «BluRay», ...).
function ateAoLixo(palavras) {
  const i = palavras.findIndex((p) => LIXO.test(p));
  return i < 0 ? palavras : palavras.slice(0, i);
}

function lerFilme(texto) {
  const palavras = limpar(texto).split(' ').filter(Boolean);
  let iAno = -1;
  for (let i = palavras.length - 1; i > 0; i--) {
    if (ANO.test(palavras[i])) { iAno = i; break; }
  }
  if (iAno > 0) {
    return { titulo: aparar(palavras.slice(0, iAno).join(' ')), ano: Number(palavras[iAno]) };
  }
  return { titulo: aparar(ateAoLixo(palavras).join(' ')), ano: null };
}

function nomeDaSerie(texto) {
  const f = lerFilme(texto);
  return f.ano ? `${f.titulo} (${f.ano})` : f.titulo;
}

function lerSerie(base, pastas) {
  const texto = limpar(base);
  for (const re of SERIE) {
    const m = re.exec(texto);
    if (!m) continue;
    const episodios = [Number(m[2])];
    if (m[3]) {
      const fim = Number(m[3]);
      for (let e = episodios[0] + 1; e <= fim && episodios.length < 20; e++) episodios.push(e);
    }
    let serie = nomeDaSerie(texto.slice(0, m.index));
    // «Série/Season 1/S01E02.mkv»: o nome vem da pasta.
    if (!serie) serie = serieDasPastas(pastas);
    const resto = ateAoLixo(texto.slice(m.index + m[0].length).split(' ').filter(Boolean))
      .filter((p) => !ANO.test(p));
    return { serie, temporada: Number(m[1]), episodios, tituloEpisodio: aparar(resto.join(' ')) };
  }
  // «Série/Temporada 2/03 - Título.mkv»
  const pai = pastas[pastas.length - 1];
  const t = pai && PASTA_TEMPORADA.exec(limpar(pai));
  const e = t && SO_EPISODIO.exec(texto);
  if (t && e && pastas.length >= 2) {
    const resto = ateAoLixo(texto.slice(e[0].length).split(' ').filter(Boolean));
    return {
      serie: nomeDaSerie(pastas[pastas.length - 2]),
      temporada: Number(t[1]),
      episodios: [Number(e[1])],
      tituloEpisodio: aparar(resto.join(' ')),
    };
  }
  return null;
}

function serieDasPastas(pastas) {
  for (let i = pastas.length - 1; i >= 0; i--) {
    if (!PASTA_TEMPORADA.test(limpar(pastas[i]))) return nomeDaSerie(pastas[i]);
  }
  return '';
}

/**
 * Lê um caminho relativo («Pasta/Filme.2010.1080p.mkv») e diz o que é.
 * Devolve { tipo: 'filme' | 'serie', ..., ext, duvida } em que `duvida` é o
 * motivo para a pessoa rever antes de mover ('' = seguro).
 */
function analisar(rel) {
  const partes = rel.split(/[\\/]/).filter(Boolean);
  const ficheiro = partes.pop();
  const ext = extensao(ficheiro);
  const base = ficheiro.slice(0, ficheiro.length - ext.length - 1);
  const palavras = limpar(base).split(' ');
  const amostra = palavras.some((p) => AMOSTRA.test(p));

  const s = lerSerie(base, partes);
  if (s) {
    let duvida = '';
    if (!s.serie) duvida = 'não encontrei o nome da série';
    else if (amostra) duvida = 'parece uma amostra ou um trailer';
    return { tipo: 'serie', ...s, ext, duvida };
  }

  let f = lerFilme(base);
  const pai = partes[partes.length - 1];
  if (!f.ano && pai) {
    const doPai = lerFilme(pai);
    if (doPai.ano && doPai.titulo) f = doPai;
  }
  const p = PARTE.exec(limpar(base));
  let duvida = '';
  if (!f.titulo) duvida = 'não encontrei o título';
  else if (amostra) duvida = 'parece uma amostra ou um trailer';
  else if (!f.ano) duvida = 'sem ano no nome';
  return { tipo: 'filme', titulo: f.titulo, ano: f.ano, parte: p ? Number(p[1]) : null, ext, duvida };
}

// Tira o que os sistemas de ficheiros (sobretudo o Windows) não aceitam.
function seguro(nome) {
  const limpo = nome
    .replace(/[<>"|?*\u0000-\u001f]/g, '')
    .replace(/[:/\\]/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return limpo || 'Sem nome';
}

const dois = (n) => String(n).padStart(2, '0');

/**
 * Caminho arrumado, relativo à pasta de destino, sem a extensão.
 * opcoes: { filmes, series, temporada } = nomes das pastas.
 */
function destinoDe(info, opcoes = {}) {
  const o = { filmes: 'Filmes', series: 'Séries', temporada: 'Season', ...opcoes };
  if (info.tipo === 'serie') {
    const serie = seguro(info.serie || 'Série desconhecida');
    const eps = info.episodios.length > 1
      ? `E${dois(info.episodios[0])}-E${dois(info.episodios[info.episodios.length - 1])}`
      : `E${dois(info.episodios[0])}`;
    let nome = `${serie} - S${dois(info.temporada)}${eps}`;
    if (info.tituloEpisodio) nome += ` - ${seguro(info.tituloEpisodio)}`;
    return [o.series, serie, `${o.temporada} ${dois(info.temporada)}`, nome].join('/');
  }
  const titulo = seguro(info.titulo || 'Filme desconhecido');
  const pasta = info.ano ? `${titulo} (${info.ano})` : titulo;
  const nome = info.parte ? `${pasta} - part${info.parte}` : pasta;
  return [o.filmes, pasta, nome].join('/');
}

module.exports = { analisar, destinoDe, ehVideo, ehLegenda, extensao, limpar, seguro };
