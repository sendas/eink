"use strict";
// Ferramentas de sala com dados guardados: mapa de sala, quadros de notas e sondagens com código.
const crypto = require("node:crypto");
const { frequencias } = require("./palavras");

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem O, 0, I, L, 1: não se confundem num ecrã
const VALIDADE_SONDAGEM_MS = 12 * 3600000;
const novoCodigo = (db) => { for (let i = 0; i < 50; i++) { let c = ""; for (let k = 0; k < 5; k++) c += ALFABETO[crypto.randomInt(ALFABETO.length)]; if (!db.prepare("SELECT 1 FROM sondagens WHERE codigo = ?").get(c)) return c; } throw new Error("Sem códigos livres."); };

function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, turmaDe } = X;
  const meu = (tabela, p, id) => existe(db.prepare(`SELECT * FROM ${tabela} WHERE id = ? AND prof_id = ?`).get(id, p.id));

  // ---------- mapa de sala ----------
  rota("GET", "/api/turmas/:id/mapa", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const m = db.prepare("SELECT linhas, colunas, lugares FROM mapas WHERE turma_id = ?").get(t.id) || { linhas: 5, colunas: 6, lugares: "{}" };
    return { linhas: m.linhas, colunas: m.colunas, lugares: JSON.parse(m.lugares), alunos: db.prepare("SELECT id, numero, nome FROM alunos WHERE turma_id = ? ORDER BY COALESCE(numero, 9999), nome").all(t.id) };
  });
  // lugares: { "linha,coluna": id do aluno | "x" (corredor) }, linhas e colunas de 1 a 12. Um aluno só pode ter um lugar.
  rota("PUT", "/api/turmas/:id/mapa", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const linhas = inteiro(c.b.linhas), colunas = inteiro(c.b.colunas);
    if (!(linhas >= 1 && linhas <= 12 && colunas >= 1 && colunas <= 12)) throw erro(400, "A sala tem de 1 a 12 filas e colunas.");
    const doTurma = new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(t.id).map((x) => x.id));
    const usados = new Set(), lugares = {};
    for (const [k, v] of Object.entries(c.b.lugares || {})) {
      const m = /^(\d+),(\d+)$/.exec(k);
      if (!m || Number(m[1]) >= linhas || Number(m[2]) >= colunas) continue; // lugares fora da sala ignoram-se
      if (v === "x") { lugares[k] = "x"; continue; }
      const id = inteiro(v);
      if (!doTurma.has(id)) throw erro(400, "Aluno que não pertence à turma.");
      if (usados.has(id)) throw erro(400, "Um aluno só pode ocupar um lugar.");
      usados.add(id); lugares[k] = id;
    }
    db.prepare("INSERT INTO mapas (turma_id, linhas, colunas, lugares) VALUES (?, ?, ?, ?) ON CONFLICT (turma_id) DO UPDATE SET linhas = excluded.linhas, colunas = excluded.colunas, lugares = excluded.lugares").run(t.id, linhas, colunas, JSON.stringify(lugares));
    return { ok: true };
  });

  // ---------- quadros: notas coloridas que se arrastam ----------
  const limparNotas = (v) => {
    if (!Array.isArray(v) || v.length > 100) throw erro(400, "Um quadro leva até 100 notas.");
    return v.map((n, i) => ({ id: texto(n.id || `n${i}`, 20) || `n${i}`, x: Math.min(3000, Math.max(0, Math.round(Number(n.x) || 0))), y: Math.min(3000, Math.max(0, Math.round(Number(n.y) || 0))), cor: Math.min(5, Math.max(0, inteiro(n.cor) ?? 0)), texto: String(n.texto ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 500) }));
  };
  rota("GET", "/api/quadros", (c) => db.prepare("SELECT id, nome, atualizado, LENGTH(dados) AS tam FROM quadros WHERE prof_id = ? ORDER BY atualizado DESC LIMIT 100").all(c.p.id));
  rota("POST", "/api/quadros", (c) => {
    const nome = texto(c.b.nome, 60) || "Quadro novo";
    if (db.prepare("SELECT COUNT(*) AS n FROM quadros WHERE prof_id = ?").get(c.p.id).n >= 100) throw erro(409, "Já tens 100 quadros.");
    return { id: Number(db.prepare("INSERT INTO quadros (prof_id, nome) VALUES (?, ?)").run(c.p.id, nome).lastInsertRowid) };
  });
  rota("GET", "/api/quadros/:id", (c) => { const q = meu("quadros", c.p, c.id[0]); return { id: q.id, nome: q.nome, notas: JSON.parse(q.dados) }; });
  rota("PUT", "/api/quadros/:id", (c) => {
    const q = meu("quadros", c.p, c.id[0]);
    const nome = c.b.nome === undefined ? q.nome : texto(c.b.nome, 60) || q.nome;
    const dados = c.b.notas === undefined ? q.dados : JSON.stringify(limparNotas(c.b.notas));
    db.prepare("UPDATE quadros SET nome = ?, dados = ?, atualizado = datetime('now') WHERE id = ?").run(nome, dados, q.id);
    return { ok: true };
  });
  rota("DELETE", "/api/quadros/:id", (c) => { const q = meu("quadros", c.p, c.id[0]); db.prepare("DELETE FROM quadros WHERE id = ?").run(q.id); return { ok: true }; });

  // ---------- sondagens: pergunta com código; os alunos votam em /s/CÓDIGO (sem conta) ----------
  const dadosSondagem = (r, detalhe = false) => {
    const votos = JSON.parse(r.votos), base = { id: r.id, codigo: r.codigo, tipo: r.tipo, pergunta: r.pergunta, opcoes: JSON.parse(r.opcoes), votos, total: votos.reduce((z, x) => z + x, 0), aberta: !!r.aberta && !expirada(r), criada: r.criada };
    if (r.tipo !== "aberta") return base;
    const respostas = db.prepare("SELECT id, texto FROM sondagem_respostas WHERE sondagem_id = ? ORDER BY id DESC LIMIT 400").all(r.id);
    return { ...base, total: db.prepare("SELECT COUNT(*) AS n FROM sondagem_respostas WHERE sondagem_id = ?").get(r.id).n, ...(detalhe ? { respostas, palavras: frequencias(respostas.map((x) => x.texto)) } : {}) };
  };
  const expirada = (r) => Date.now() - Date.parse(r.criada.replace(" ", "T") + "Z") > VALIDADE_SONDAGEM_MS;
  X.sondagemExpirada = expirada;
  rota("GET", "/api/sondagens", (c) => db.prepare("SELECT * FROM sondagens WHERE prof_id = ? ORDER BY id DESC LIMIT 30").all(c.p.id).map(dadosSondagem));
  rota("POST", "/api/sondagens", (c) => {
    const pergunta = texto(c.b.pergunta, 200), aberta = c.b.tipo === "aberta";
    const opcoes = aberta ? [] : (Array.isArray(c.b.opcoes) ? c.b.opcoes : []).map((o) => texto(o, 80)).filter(Boolean);
    if (!pergunta) throw erro(400, "Escreve a pergunta.");
    if (!aberta && (opcoes.length < 2 || opcoes.length > 8)) throw erro(400, "Indica de 2 a 8 opções.");
    if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) throw erro(400, "As opções têm de ser diferentes.");
    const codigo = novoCodigo(db);
    const id = Number(db.prepare("INSERT INTO sondagens (prof_id, codigo, pergunta, opcoes, votos, tipo) VALUES (?, ?, ?, ?, ?, ?)").run(c.p.id, codigo, pergunta, JSON.stringify(opcoes), JSON.stringify(opcoes.map(() => 0)), aberta ? "aberta" : "escolha").lastInsertRowid);
    return { id, codigo };
  });
  rota("GET", "/api/sondagens/:id", (c) => dadosSondagem(meu("sondagens", c.p, c.id[0]), true));
  // Tirar uma resposta aberta imprópria (a moderação é do docente).
  rota("DELETE", "/api/sondagens/:id/respostas/:rid", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("DELETE FROM sondagem_respostas WHERE id = ? AND sondagem_id = ?").run(c.id[1], s.id); return { ok: true }; });
  rota("POST", "/api/sondagens/:id/estado", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("UPDATE sondagens SET aberta = ? WHERE id = ?").run(c.b.aberta === false ? 0 : 1, s.id); return { ok: true }; });
  // Contagem à mão (mão no ar): delta +1 ou -1 numa opção.
  rota("POST", "/api/sondagens/:id/voto", (c) => {
    const s = meu("sondagens", c.p, c.id[0]), votos = JSON.parse(s.votos), k = inteiro(c.b.opcao), d = c.b.delta === -1 ? -1 : 1;
    if (!(k >= 0 && k < votos.length)) throw erro(400, "Opção inválida.");
    votos[k] = Math.max(0, votos[k] + d);
    db.prepare("UPDATE sondagens SET votos = ? WHERE id = ?").run(JSON.stringify(votos), s.id);
    return { ok: true };
  });
  rota("POST", "/api/sondagens/:id/repor", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("UPDATE sondagens SET votos = ? WHERE id = ?").run(JSON.stringify(JSON.parse(s.opcoes).map(() => 0)), s.id); db.prepare("DELETE FROM sondagem_respostas WHERE sondagem_id = ?").run(s.id); return { ok: true }; });
  rota("DELETE", "/api/sondagens/:id", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("DELETE FROM sondagens WHERE id = ?").run(s.id); return { ok: true }; });
}

module.exports = { registar, VALIDADE_SONDAGEM_MS };
