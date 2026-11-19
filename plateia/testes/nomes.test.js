'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analisar, destinoDe } = require('../lib/nomes');

const para = (rel) => { const i = analisar(rel); return `${destinoDe(i)}.${i.ext}`; };

const CASOS = [
  ['The.Matrix.1999.1080p.BluRay.x264-GRP.mkv', 'Filmes/The Matrix (1999)/The Matrix (1999).mkv'],
  ['the_matrix_(1999)_[grupo].avi', 'Filmes/The Matrix (1999)/The Matrix (1999).avi'],
  ['Blade Runner 2049 (2017).mp4', 'Filmes/Blade Runner 2049 (2017)/Blade Runner 2049 (2017).mp4'],
  ['2001.A.Space.Odyssey.1968.720p.mkv', 'Filmes/2001 A Space Odyssey (1968)/2001 A Space Odyssey (1968).mkv'],
  ['1917.2019.2160p.UHD.mkv', 'Filmes/1917 (2019)/1917 (2019).mkv'],
  ['O Pátio das Cantigas (1942)/filme.mkv', 'Filmes/O Pátio das Cantigas (1942)/O Pátio das Cantigas (1942).mkv'],
  ['Kill.Bill.2003.CD1.avi', 'Filmes/Kill Bill (2003)/Kill Bill (2003) - part1.avi'],
  ['Face/Off (1997).mkv', 'Filmes/Off (1997)/Off (1997).mkv'],
  ['Breaking.Bad.S01E02.720p.HDTV.x264-GRP.mkv', 'Séries/Breaking Bad/Season 01/Breaking Bad - S01E02.mkv'],
  ['breaking bad - 1x03 - and the bag is in the river.avi', 'Séries/Breaking Bad/Season 01/Breaking Bad - S01E03 - And The Bag Is In The River.avi'],
  ['Doctor.Who.2005.S03E10.Blink.1080p.mkv', 'Séries/Doctor Who (2005)/Season 03/Doctor Who (2005) - S03E10 - Blink.mkv'],
  ['Show.S02E01E02.mkv', 'Séries/Show/Season 02/Show - S02E01-E02.mkv'],
  ['Conta-me Como Foi/Temporada 2/03 - O Baile.mkv', 'Séries/Conta-me Como Foi/Season 02/Conta-me Como Foi - S02E03 - O Baile.mkv'],
  ['Dark/Season 1/S01E04.mkv', 'Séries/Dark/Season 01/Dark - S01E04.mkv'],
  ['Friends Temporada 1 Episódio 5.mp4', 'Séries/Friends/Season 01/Friends - S01E05.mp4'],
];

for (const [de, esperado] of CASOS) {
  test(`lê «${de}»`, () => assert.equal(para(de), esperado));
}

test('um filme sem ano fica a rever', () => {
  const i = analisar('Ferias.de.Verao.mkv');
  assert.equal(i.titulo, 'Ferias de Verao');
  assert.equal(i.duvida, 'sem ano no nome');
});

test('amostras ficam a rever', () => {
  assert.match(analisar('The.Matrix.1999.sample.mkv').duvida, /amostra/);
});

test('um filme com resolução no nome não passa por série', () => {
  assert.equal(analisar('Video.1920x1080.2012.mkv').tipo, 'filme');
});

test('o nome final não leva carateres proibidos no Windows', () => {
  const p = para('Que.Horas.Sao?.2015.mkv');
  assert.doesNotMatch(p, /[<>:"|?*]/);
});

test('as pastas são configuráveis', () => {
  const i = analisar('Dark.S01E04.mkv');
  assert.equal(destinoDe(i, { series: 'TV', temporada: 'Temporada' }), 'TV/Dark/Temporada 01/Dark - S01E04');
});
