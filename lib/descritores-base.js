"use strict";
// Descritores dos níveis e faixas de percentagem próprias de algumas disciplinas, tirados do manual de avaliação da escola.
// A regra geral do manual é 0 a 19, 20 a 49, 50 a 69, 70 a 89 e 90 a 100 (NIVEIS em lib/avaliacao.js). Uma disciplina só entra aqui se o manual
// lhe der descritores ou faixas diferentes. `limites` = percentagem a partir da qual começam os níveis 2, 3, 4 e 5.
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const BASE = {
  // Manual 2025/2026, página 123: nível 1 de 0 a 20 %, 2 de 21 a 49 %, 3 de 50 a 70 %, 4 de 71 a 89 % e 5 de 90 a 100 %.
  "cidadania e desenvolvimento": {
    limites: [21, 50, 71, 90],
    fonte: "Manual de avaliação das aprendizagens, Cidadania e Desenvolvimento",
    intro: "Os critérios de avaliação devem incidir na maior ou menor capacidade dos alunos de reflexão, participação, cooperação, tomada de decisões e expressão de opinião com liberdade e responsabilidade.",
    niveis: [
      [ // nível 1
        "O aluno não revela um grande sentido de responsabilidade, não demonstrando respeito e compreensão pelas normas sociais.",
        "O aluno não demonstra empenhamento nem interesse, raramente está atento e raramente participa nas atividades.",
        "O aluno não demonstra tolerância, solidariedade e respeito pelos outros.",
        "O aluno não participa nas atividades, não é autónomo.",
        "O aluno não revela uma relação interpessoal satisfatória.",
      ],
      [ // nível 2
        "O aluno revela por vezes sentido de responsabilidade, respeito e compreensão pelas normas sociais.",
        "O aluno demonstra fraco empenhamento, raramente está atento e raramente participa nas atividades.",
        "O aluno demonstra pouca tolerância, solidariedade e respeito pelos outros.",
        "O aluno participa irregularmente nas atividades, não é autónomo.",
        "O aluno não revela uma relação interpessoal satisfatória.",
      ],
      [ // nível 3
        "O aluno revela sentido de responsabilidade, demonstrando respeito e compreensão pelas normas sociais.",
        "É empenhado, está atento, revela interesse e participa nas atividades.",
        "O aluno demonstra tolerância, solidariedade e respeito pelos outros.",
        "O aluno tem uma participação regular e crítica, sendo tolerante, autónomo.",
        "O aluno tem uma relação interpessoal satisfatória.",
      ],
      [ // nível 4
        "O aluno revela um grande sentido de responsabilidade, demonstrando respeito e compreensão pelas normas sociais.",
        "É bastante empenhado, está atento, revela muito interesse e participa ativamente nas atividades.",
        "O aluno demonstra um elevado grau de tolerância, solidariedade e respeito pelos outros.",
        "O aluno tem uma participação ativa e crítica, sendo bastante autónomo.",
        "O aluno tem uma boa relação interpessoal.",
      ],
      [ // nível 5
        "O aluno revela um grande sentido de responsabilidade, demonstrando respeito e compreensão pelas normas sociais.",
        "É muito empenhado, está muito atento, revela muito interesse e participa ativamente nas atividades.",
        "O aluno demonstra um elevado grau de tolerância, solidariedade e respeito pelos outros.",
        "O aluno tem uma participação ativa, crítica e criativa, sendo bastante autónomo.",
        "O aluno tem uma ótima relação interpessoal.",
      ],
    ],
  },
};

// Descritores da disciplina (pelo nome, sem acentos nem maiúsculas), ou null.
const descritoresDe = (nomeGrupo) => BASE[norm(nomeGrupo)] || null;
module.exports = { descritoresDe };
