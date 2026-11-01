"use strict";
// Cálculo da pauta de um período. Funções puras, sem acesso à base de dados.
//
// Cada avaliação (teste, trabalho...) tem um peso em % e um máximo. A nota de cada aluno é convertida em %.
// A média dos trabalhos usa só as avaliações que o aluno já tem, pelos seus pesos. O comportamento (1 a 5) vale
// `pesoComportamento` % da nota final e entra pelo meio da faixa do seu nível.
// Níveis 1 a 5 pelos limites 20, 50, 70 e 90 (nível 2 a partir de 20 %, nível 3 a partir de 50 %...).

const NIVEIS = [20, 50, 70, 90];
const MENCOES = ["Muito insuficiente", "Insuficiente", "Suficiente", "Bom", "Muito bom"];

const nivelDe = (pct, niveis = NIVEIS) => (pct === null || pct === undefined ? null : 1 + niveis.filter((x) => pct >= x).length);
const mencaoDe = (nivel) => (nivel ? MENCOES[nivel - 1] : "");

// Percentagem que um nível de comportamento representa: o meio da sua faixa (10, 35, 60, 80, 95 com os limites por defeito).
function pctDeNivel(n, niveis = NIVEIS) {
  const l = [0, ...niveis, 100];
  const k = Math.min(5, Math.max(1, Math.round(n)));
  return (l[k - 1] + l[k]) / 2;
}

// Converte o que o docente escreve numa nota: «15», «15,5», «15/20». Vazio é «sem nota» (null). Devolve NaN se não for válida.
function lerNota(txt, maximo) {
  if (txt === null || txt === undefined) return null;
  const t = String(txt).trim().replace(",", ".");
  if (t === "") return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (m) {
    const den = Number(m[2]);
    if (!(den > 0)) return NaN;
    const v = (Number(m[1]) / den) * maximo;
    return v < 0 || v > maximo ? NaN : v;
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  const v = Number(t);
  return v < 0 || v > maximo ? NaN : v;
}

// avaliacoes: [{ id, peso, maximo }]; alunos: [{ id }]; notas: Map "avaliacaoId:alunoId" → valor; comportamento: Map alunoId → 1..5.
function pauta({ alunos, avaliacoes, notas, comportamento = new Map(), pesoComportamento = 30, niveis = NIVEIS }) {
  const contam = avaliacoes.filter((a) => a.peso > 0);
  return alunos.map((al) => {
    let soma = 0, pesos = 0, em_falta = 0;
    const pcts = {};
    for (const a of avaliacoes) {
      const v = notas.get(a.id + ":" + al.id);
      pcts[a.id] = v === undefined || v === null ? null : (v / a.maximo) * 100;
    }
    for (const a of contam) {
      if (pcts[a.id] === null) { em_falta++; continue; }
      soma += pcts[a.id] * a.peso;
      pesos += a.peso;
    }
    const media = pesos ? soma / pesos : null;
    const comp = comportamento.get(al.id);
    const temComp = Number.isInteger(comp) && comp >= 1 && comp <= 5;
    let final = null;
    if (media !== null) {
      final = temComp ? (media * (100 - pesoComportamento) + pctDeNivel(comp, niveis) * pesoComportamento) / 100 : media;
      final = Math.round(final);
    }
    const nivel = nivelDe(final, niveis);
    return { aluno: al.id, pcts, media: media === null ? null : Math.round(media * 10) / 10, comportamento: temComp ? comp : null, final, nivel, mencao: mencaoDe(nivel), em_falta };
  });
}

module.exports = { NIVEIS, MENCOES, nivelDe, mencaoDe, pctDeNivel, lerNota, pauta };
