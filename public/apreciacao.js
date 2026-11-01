"use strict";
// Apreciações para as avaliações intercalares: o docente dá um nível de 1 a 5 a vários critérios e sugere-se um texto.
// Os textos são nossos (não vêm de nenhum site) e ficam à vista aqui; o docente pode sempre editar o resultado.
// Cada nível é uma oração começada pelo verbo. {x|y} escolhe o masculino (x) ou o feminino (y); {N} é o primeiro nome.
(function (raiz) {
  const CRITERIOS = [
    { id: "assiduidade", nome: "Assiduidade", niveis: [
      "falta muito às aulas, o que prejudica seriamente a sua aprendizagem",
      "tem faltado com frequência, devendo ser mais {assíduo|assídua}",
      "é razoavelmente {assíduo|assídua}, com algumas faltas e atrasos",
      "é {assíduo|assídua} e quase sempre pontual",
      "é {assíduo|assídua} e pontual" ] },
    { id: "empenho", nome: "Empenho", niveis: [
      "não demonstra empenho nas tarefas propostas",
      "revela pouco empenho, devendo esforçar-se mais",
      "revela um empenho razoável, embora irregular",
      "mostra-se {empenhado|empenhada} nas atividades propostas",
      "revela um empenho exemplar em todas as atividades" ] },
    { id: "habitos", nome: "Hábitos de trabalho", niveis: [
      "não tem hábitos de trabalho organizados, não traz o material nem realiza as tarefas",
      "tem hábitos de trabalho pouco consolidados, esquecendo-se com frequência do material e das tarefas",
      "tem hábitos de trabalho aceitáveis, embora nem sempre cumpra as tarefas",
      "tem bons hábitos de trabalho, trazendo o material e cumprindo as tarefas",
      "tem excelentes hábitos de trabalho, é {organizado|organizada} e cumpre sempre as tarefas" ] },
    { id: "conhecimentos", nome: "Conhecimentos", niveis: [
      "não revela os conhecimentos mínimos esperados",
      "revela dificuldades na aquisição e na aplicação dos conhecimentos",
      "revela conhecimentos suficientes, com algumas lacunas",
      "revela bons conhecimentos e aplica-os com segurança",
      "revela conhecimentos muito sólidos e aplica-os com grande autonomia" ] },
    { id: "participacao", nome: "Participação", niveis: [
      "não participa nas aulas",
      "participa raramente, mesmo quando é solicitad{o|a}",
      "participa algumas vezes, sobretudo quando é solicitad{o|a}",
      "participa de forma oportuna e pertinente",
      "participa de forma espontânea, ativa e muito pertinente" ] },
    { id: "concentracao", nome: "Concentração", niveis: [
      "não consegue manter a atenção, distraindo-se constantemente",
      "distrai-se com facilidade e perde o fio às explicações",
      "mantém a atenção durante parte da aula",
      "mantém-se {atento|atenta} e {concentrado|concentrada} durante as aulas",
      "revela uma concentração notável, acompanhando com facilidade o trabalho da aula" ] },
    { id: "comportamento", nome: "Comportamento", niveis: [
      "tem um comportamento muito desadequado, perturbando gravemente o funcionamento das aulas",
      "tem um comportamento inadequado, interrompendo com frequência o trabalho da turma",
      "tem um comportamento aceitável, embora por vezes perturbe a aula",
      "tem um bom comportamento e respeita as regras da sala",
      "tem um comportamento exemplar, contribuindo para um bom ambiente na turma" ] },
    { id: "expressao", nome: "Expressão oral e escrita", niveis: [
      "tem grandes dificuldades em expressar-se, oralmente e por escrito",
      "expressa-se com dificuldade, devendo melhorar o vocabulário e a clareza",
      "expressa-se de forma compreensível, mas com alguma imprecisão",
      "expressa-se com clareza e correção",
      "expressa-se com grande clareza, correção e riqueza de vocabulário" ] },
    { id: "progressao", nome: "Progressão", niveis: [
      "não evoluiu ao longo do período",
      "evoluiu pouco, sendo necessário um esforço adicional para recuperar",
      "tem vindo a evoluir de forma gradual",
      "tem evoluído de forma positiva",
      "tem evoluído de forma muito positiva e consistente" ] },
  ];
  const ETIQUETAS = ["1 · Muito insuficiente", "2 · Insuficiente", "3 · Suficiente", "4 · Bom", "5 · Muito bom"];

  // Se alguma oração já tem um «e», separam-se todas por ponto e vírgula, para a frase não ficar ambígua.
const junta = (l) => (l.length <= 1 ? l.join("") : l.some((x) => / e /.test(x)) ? l.join("; ") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]);

  // niveis: { critério: 1..5 }. genero: "M" ou "F". Devolve { texto, media, mencao } (mencao: ns | st | sb, ou null sem níveis).
  function gerar({ nome, genero, niveis }) {
    const f = genero === "F", N = String(nome || "o aluno").trim().split(/\s+/)[0] || "O aluno";
    const sub = (t) => t.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_, m, fem) => (f ? fem : m));
    const alto = [], medio = [], baixo = [], valores = [];
    for (const c of CRITERIOS) {
      const n = niveis && Number(niveis[c.id]);
      if (!(n >= 1 && n <= 5)) continue;
      valores.push(n);
      (n >= 4 ? alto : n === 3 ? medio : baixo).push(sub(c.niveis[n - 1]));
    }
    if (!valores.length) return { texto: "", media: null, mencao: null };
    const ele = f ? "ela" : "ele", partes = [];
    if (alto.length) partes.push(`${N} ${junta(alto)}.`);
    if (medio.length) partes.push(`${alto.length ? "Em geral, " + ele : N} ${junta(medio)}.`);
    if (baixo.length) partes.push(`${alto.length || medio.length ? "No entanto, " + ele : N} ${junta(baixo)}.`);
    const media = valores.reduce((z, x) => z + x, 0) / valores.length;
    partes.push(media >= 4.5 ? "Os resultados são muito positivos e merecem ser realçados." : media >= 3.5 ? "Deve manter o trabalho desenvolvido." : media >= 2.5 ? "Com mais esforço e regularidade, poderá melhorar os resultados." : `Será necessário que ${N} se empenhe mais para alcançar os objetivos da disciplina.`);
    return { texto: partes.join(" "), media: Math.round(media * 100) / 100, mencao: media >= 3.5 ? "sb" : media >= 2.5 ? "st" : "ns" };
  }

  const API = { CRITERIOS, ETIQUETAS, gerar };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.EINK_APR = API;
})(typeof window !== "undefined" ? window : globalThis);
