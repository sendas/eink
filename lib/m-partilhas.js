"use strict";
// Bancos partilhados por disciplina: grelhas de testes e quizzes que um docente partilha com os colegas do mesmo grupo disciplinar.
// Partilha-se só a estrutura (questões e cotações, perguntas e opções): nunca notas nem alunos. As imagens dos quizzes não se partilham.
const { validar } = require("./quiz");

module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, avalDe, soAdmin } = X;
  const exigirGrupo = (c) => { if (!c.p.grupo_id) throw erro(400, "Para partilhar, o administrador tem de te atribuir uma disciplina (Gestão → Docentes)."); return c.p.grupo_id; };

  rota("GET", "/api/partilhas", (c, u) => {
    const tipo = u.searchParams.get("tipo") === "quiz" ? "quiz" : "grelha";
    if (!c.p.grupo_id) return [];
    return db.prepare("SELECT s.id, s.titulo, s.criado, s.dados, s.prof_id, p.nome AS autor, p.upn FROM partilhas s JOIN professores p ON p.id = s.prof_id WHERE s.tipo = ? AND s.grupo_id = ? ORDER BY s.id DESC LIMIT 200").all(tipo, c.p.grupo_id)
      .map((s) => { const d = JSON.parse(s.dados); return { id: s.id, titulo: s.titulo, criado: s.criado, autor: s.autor || s.upn, minha: s.prof_id === c.p.id, n: tipo === "quiz" ? d.perguntas.length : d.length, pontos: tipo === "quiz" ? null : Math.round(d.reduce((z, i) => z + i.cotacao, 0) * 100) / 100 }; });
  });
  rota("POST", "/api/partilhas", (c) => {
    const grupo = exigirGrupo(c), titulo = texto(c.b.titulo, 100);
    if (!titulo) throw erro(400, "Dá um título à partilha.");
    let tipo, dados;
    if (c.b.tipo === "quiz") {
      const q = existe(db.prepare("SELECT * FROM quizzes WHERE id = ? AND prof_id = ?").get(inteiro(c.b.quiz), c.p.id), "Quiz inexistente.");
      const d = JSON.parse(q.dados); d.perguntas = d.perguntas.map(({ imagem, ...resto }) => resto);
      tipo = "quiz"; dados = validar(d);
    } else {
      const a = existe(avalDe(c.p, inteiro(c.b.avaliacao)), "Teste inexistente.");
      const itens = db.prepare("SELECT grupo, nome, cotacao FROM itens WHERE avaliacao_id = ? ORDER BY ordem, id").all(a.id);
      if (!itens.length) throw erro(400, "Este teste ainda não tem grelha.");
      tipo = "grelha"; dados = itens;
    }
    if (db.prepare("SELECT COUNT(*) AS n FROM partilhas WHERE prof_id = ?").get(c.p.id).n >= 100) throw erro(409, "Já tens 100 partilhas: apaga algumas.");
    return { id: Number(db.prepare("INSERT INTO partilhas (tipo, grupo_id, prof_id, titulo, dados) VALUES (?, ?, ?, ?, ?)").run(tipo, grupo, c.p.id, titulo, JSON.stringify(dados)).lastInsertRowid) };
  });
  rota("DELETE", "/api/partilhas/:id", (c) => {
    const s = existe(db.prepare("SELECT * FROM partilhas WHERE id = ?").get(c.id[0]));
    if (s.prof_id !== c.p.id && !c.p.admin) throw erro(403, "Só quem partilhou (ou um administrador) a pode retirar.");
    db.prepare("DELETE FROM partilhas WHERE id = ?").run(s.id);
    return { ok: true };
  });
  // Copia um quiz partilhado para os quizzes do docente (grelhas partilhadas usam-se em /api/avaliacoes/:id/grelha/copiar com `partilha`).
  rota("POST", "/api/quizzes/de-partilha", (c) => {
    const s = existe(db.prepare("SELECT * FROM partilhas WHERE id = ? AND tipo = 'quiz' AND grupo_id = ?").get(inteiro(c.b.partilha), c.p.grupo_id ?? -1), "Partilha inexistente.");
    return { id: Number(db.prepare("INSERT INTO quizzes (prof_id, titulo, dados) VALUES (?, ?, ?)").run(c.p.id, s.titulo.slice(0, 100), s.dados).lastInsertRowid) };
  });
  void soAdmin;
};
