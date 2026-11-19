#!/usr/bin/env node
'use strict';
// Plateia na linha de comandos: prever, aplicar e desfazer sem abrir o navegador.

const path = require('node:path');
const PLANO = require('./lib/plano');

const AJUDA = `Plateia: arruma filmes e séries.

  node cli.js prever   <origem> [destino]             mostra o que mudaria (não mexe em nada)
  node cli.js aplicar  <origem> [destino] --confirmo  arruma os ficheiros seguros
  node cli.js desfazer                                repõe a última arrumação

Sem destino, arruma dentro da própria origem. Os ficheiros «a rever» e em
conflito nunca são movidos pela linha de comandos; para esses, usar a interface
(npm start). O diário fica em PLATEIA_DADOS (por defeito, ./dados).`;

async function principal() {
  const args = process.argv.slice(2);
  const confirmo = args.includes('--confirmo');
  const [comando, origem, destinoArg] = args.filter((a) => !a.startsWith('--'));
  const diario = path.join(process.env.PLATEIA_DADOS || path.join(__dirname, 'dados'), 'diario.json');

  if (comando === 'desfazer') {
    const lote = await PLANO.desfazer({ diario });
    console.log(`Repostos ${lote.desfeito.repostos} ficheiros.`);
    for (const f of lote.desfeito.falhas) console.log(`  FALHOU ${f.de}: ${f.erro}`);
    return;
  }
  if (!['prever', 'aplicar'].includes(comando) || !origem) { console.log(AJUDA); process.exitCode = comando ? 1 : 0; return; }

  const destino = destinoArg || origem;
  const itens = await PLANO.construir(origem, destino);
  const conta = (e) => itens.filter((i) => i.estado === e).length;
  for (const it of itens) {
    if (it.estado === 'certo') continue;
    const marca = { pronto: 'MOVER   ', rever: 'REVER   ', conflito: 'CONFLITO' }[it.estado];
    console.log(`${marca} ${it.de}\n      →  ${it.para}${it.motivo ? `\n         (${it.motivo})` : ''}`);
  }
  console.log(`\n${conta('pronto')} prontos, ${conta('rever')} a rever, ${conta('conflito')} em conflito, ${conta('certo')} já no sítio.`);

  if (comando === 'prever') return;
  if (!confirmo) { console.log('\nNada foi movido. Para arrumar os «prontos», repetir com --confirmo.'); return; }
  const ids = itens.filter((i) => i.estado === 'pronto').map((i) => i.id);
  const lote = await PLANO.aplicar({ origem, destino, ids, diario });
  console.log(`\nMovidos ${lote.ops.length} ficheiros. Para repor: node cli.js desfazer`);
  for (const f of lote.falhas) console.log(`  FALHOU ${f.de}: ${f.erro}`);
}

principal().catch((e) => { console.error(e.message); process.exit(1); });
