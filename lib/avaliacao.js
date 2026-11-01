"use strict";
// Cálculo da pauta de um período. Funções puras, sem acesso à base de dados.
//
// O administrador define, por grupo disciplinar, os critérios e o peso (%) de cada um na nota final.
//   - critério «testes»: média ponderada das avaliações (testes, trabalhos...) que o docente lhe atribuiu, cada uma com o seu peso relativo;
//   - critério «nivel»: um nível de 1 a 5 dado pelo docente (por exemplo, comportamento), que entra pelo meio da faixa do nível.
// Nota final = média dos critérios pelos seus pesos. Um critério ainda sem valor para o aluno não conta (os outros renormalizam-se)
// e a nota fica marcada como «parcial». A nota final arredonda-se a 1 ou 2 casas decimais (`casas`, definido no grupo) e o nível
// calcula-se a partir dela. Níveis 1 a 5 pelos limites 20, 50, 70 e 90 %.

const NIVEIS = [20, 50, 70, 90];
const MENCOES = ["Muito insuficiente", "Insuficiente", "Suficiente", "Bom", "Muito bom"];

const nivelDe = (pct, niveis = NIVEIS) => (pct === null || pct === undefined ? null : 1 + niveis.filter((x) => pct >= x).length);
// Menções das avaliações intercalares e a proposta a partir da nota: níveis 1 e 2 = Não satisfaz, 3 = Satisfaz, 4 = Bom, 5 = Muito bom.
const INTERCALAR = [{ id: "ns", nome: "Não satisfaz" }, { id: "st", nome: "Satisfaz" }, { id: "b", nome: "Bom" }, { id: "mb", nome: "Muito bom" }];
const propostaInter = (final, limites = NIVEIS) => { const n = nivelDe(final, limites); return n === null ? null : n <= 2 ? "ns" : n === 3 ? "st" : n === 4 ? "b" : "mb"; };
const mencaoDe = (nivel) => (nivel ? MENCOES[nivel - 1] : "");
const arred = (x, casas) => Math.round(x * 10 ** casas) / 10 ** casas;

// Percentagem que um nível representa: o meio da sua faixa (10, 35, 60, 80, 95 com os limites por defeito).
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

// criterios: [{ id, peso, tipo }]; avaliacoes: [{ id, criterio_id, peso, maximo }]; alunos: [{ id }];
// notas: Map "avaliacaoId:alunoId" → valor; niveis: Map "criterioId:alunoId" → 1..5.
function pauta({ alunos, criterios, avaliacoes, notas, niveis = new Map(), limites = NIVEIS, casas = 1 }) {
  return alunos.map((al) => {
    const pcts = {};
    for (const a of avaliacoes) {
      const v = notas.get(a.id + ":" + al.id);
      pcts[a.id] = v === undefined || v === null ? null : (v / a.maximo) * 100;
    }
    let soma = 0, pesos = 0, em_falta = 0;
    const porCriterio = {}, nivelCriterio = {};
    for (const c of criterios) {
      let m = null;
      if (c.tipo === "nivel") {
        const n = niveis.get(c.id + ":" + al.id);
        if (Number.isInteger(n) && n >= 1 && n <= 5) { m = pctDeNivel(n, limites); nivelCriterio[c.id] = n; }
      } else {
        let s = 0, p = 0;
        for (const a of avaliacoes) {
          if (a.criterio_id !== c.id || !(a.peso > 0)) continue;
          if (pcts[a.id] === null) { em_falta++; continue; }
          s += pcts[a.id] * a.peso; p += a.peso;
        }
        if (p) m = s / p;
      }
      porCriterio[c.id] = m === null ? null : arred(m, casas);
      if (m !== null && c.peso > 0) { soma += m * c.peso; pesos += c.peso; }
    }
    const final = pesos ? arred(soma / pesos, casas) : null; // 1 ou 2 casas decimais, como o grupo escolher
    const parcial = final !== null && criterios.some((c) => c.peso > 0 && porCriterio[c.id] === null);
    const nivel = nivelDe(final, limites);
    return { aluno: al.id, pcts, criterios: porCriterio, niveis: nivelCriterio, final, parcial, nivel, mencao: mencaoDe(nivel), em_falta };
  });
}

module.exports = { INTERCALAR, propostaInter, NIVEIS, MENCOES, nivelDe, mencaoDe, pctDeNivel, lerNota, pauta };
