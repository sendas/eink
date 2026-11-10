"use strict";
// Ferramentas de sala com dados guardados: mapa de sala, quadros de notas e sondagens com código (também o mural e o bilhete de saída).
const crypto = require("node:crypto");
const { frequencias } = require("./palavras");

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem O, 0, I, L, 1: não se confundem num ecrã
const VALIDADE_SONDAGEM_MS = 12 * 3600000;
const novoCodigo = (db) => { for (let i = 0; i < 50; i++) { let c = ""; for (let k = 0; k < 5; k++) c += ALFABETO[crypto.randomInt(ALFABETO.length)]; if (!db.prepare("SELECT 1 FROM sondagens WHERE codigo = ?").get(c)) return c; } throw new Error("Sem códigos livres."); };

function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, turmaDe } = X;
  const meu = (tabela, p, id) => existe(db.prepare(`SELECT * FROM ${tabela} WHERE id = ? AND prof_id = ?`).get(id, p.id));

  // ---------- mapa de sala ----------
  // lugares: { "linha,coluna": id do aluno | "x" (corredor) }, linhas e colunas de 1 a 12. Um aluno só pode ter um lugar.
  // disposicoes: outras disposições guardadas da mesma turma (por exemplo «Testes»), até 6, cada uma com nome, linhas, colunas e lugares.
  const lerDisposicao = (d, doTurma) => {
    const linhas = inteiro(d.linhas), colunas = inteiro(d.colunas);
    if (!(linhas >= 1 && linhas <= 12 && colunas >= 1 && colunas <= 12)) throw erro(400, "A sala tem de 1 a 12 filas e colunas.");
    const usados = new Set(), lugares = {};
    for (const [k, v] of Object.entries(d.lugares || {})) {
      const m = /^(\d+),(\d+)$/.exec(k);
      if (!m || Number(m[1]) >= linhas || Number(m[2]) >= colunas) continue; // lugares fora da sala ignoram-se
      if (v === "x") { lugares[k] = "x"; continue; }
      const id = inteiro(v);
      if (!doTurma.has(id)) throw erro(400, "Aluno que não pertence à turma.");
      if (usados.has(id)) throw erro(400, "Um aluno só pode ocupar um lugar.");
      usados.add(id); lugares[k] = id;
    }
    return { linhas, colunas, lugares };
  };
  rota("GET", "/api/turmas/:id/mapa", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const m = db.prepare("SELECT linhas, colunas, lugares, disposicoes FROM mapas WHERE turma_id = ?").get(t.id) || { linhas: 5, colunas: 6, lugares: "{}", disposicoes: "[]" };
    return { linhas: m.linhas, colunas: m.colunas, lugares: JSON.parse(m.lugares), disposicoes: JSON.parse(m.disposicoes || "[]"), alunos: db.prepare("SELECT a.id, a.numero, a.nome, f.atualizada AS foto FROM alunos a LEFT JOIN fotos f ON f.aluno_id = a.id WHERE a.turma_id = ? ORDER BY COALESCE(a.numero, 9999), a.nome").all(t.id) };
  });
  rota("PUT", "/api/turmas/:id/mapa", (c) => {
    const t = existe(turmaDe(c.p, c.id[0]));
    const doTurma = new Set(db.prepare("SELECT id FROM alunos WHERE turma_id = ?").all(t.id).map((x) => x.id));
    const { linhas, colunas, lugares } = lerDisposicao(c.b, doTurma);
    let disposicoes = null;
    if (c.b.disposicoes !== undefined) {
      if (!Array.isArray(c.b.disposicoes) || c.b.disposicoes.length > 6) throw erro(400, "Podes guardar até 6 disposições.");
      disposicoes = c.b.disposicoes.map((d) => ({ nome: texto(d.nome, 40) || "Disposição", ...lerDisposicao(d, doTurma) }));
    }
    const antes = db.prepare("SELECT disposicoes FROM mapas WHERE turma_id = ?").get(t.id);
    const disp = disposicoes ? JSON.stringify(disposicoes) : (antes ? antes.disposicoes : "[]");
    db.prepare("INSERT INTO mapas (turma_id, linhas, colunas, lugares, disposicoes) VALUES (?, ?, ?, ?, ?) ON CONFLICT (turma_id) DO UPDATE SET linhas = excluded.linhas, colunas = excluded.colunas, lugares = excluded.lugares, disposicoes = excluded.disposicoes").run(t.id, linhas, colunas, JSON.stringify(lugares), disp);
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

  // ---------- sondagens: pergunta com código; os alunos respondem em /s/CÓDIGO (sem conta) ----------
  // Tipos: «escolha» (opções), «aberta» (resposta curta e nuvem de palavras), «mural» (notas curtas dos alunos, com moderação)
  // e «bilhete» (bilhete de saída: 1 a 4 perguntas de escala 1 a 5 ou de texto). Nada identifica quem respondeu.
  const TIPOS = new Set(["escolha", "aberta", "mural", "bilhete"]);
  const BILHETE_PADRAO = [{ tipo: "escala", texto: "Quanto percebeste da aula de hoje?" }, { tipo: "texto", texto: "Uma coisa que aprendeste" }, { tipo: "texto", texto: "Uma dúvida que ficou" }];
  const expirada = (r) => Date.now() - Date.parse(r.criada.replace(" ", "T") + "Z") > VALIDADE_SONDAGEM_MS;
  X.sondagemExpirada = expirada;
  const extraDe = (r) => { try { return JSON.parse(r.extra || "{}"); } catch { return {}; } };
  const contar = (id, cond = "") => db.prepare(`SELECT COUNT(*) AS n FROM sondagem_respostas WHERE sondagem_id = ? ${cond}`).get(id).n;
  const dadosSondagem = (r, detalhe = false) => {
    const votos = JSON.parse(r.votos), extra = extraDe(r);
    const base = { id: r.id, codigo: r.codigo, tipo: r.tipo, pergunta: r.pergunta, opcoes: JSON.parse(r.opcoes), votos, total: votos.reduce((z, x) => z + x, 0), aberta: !!r.aberta && !expirada(r), expirada: expirada(r), criada: r.criada, turma_id: r.turma_id || null, certa: r.certa ?? -1, revelada: r.revelada !== 0, extra };
    if (r.tipo === "aberta") {
      const respostas = db.prepare("SELECT id, texto FROM sondagem_respostas WHERE sondagem_id = ? ORDER BY id DESC LIMIT 400").all(r.id);
      return { ...base, total: contar(r.id), ...(detalhe ? { respostas, palavras: frequencias(respostas.map((x) => x.texto)) } : {}) };
    }
    if (r.tipo === "mural") {
      return { ...base, total: contar(r.id), pendentes: contar(r.id, "AND oculta = 1"), ...(detalhe ? { respostas: db.prepare("SELECT id, texto, coluna, gostos, oculta, destaque, criada FROM sondagem_respostas WHERE sondagem_id = ? ORDER BY id LIMIT 300").all(r.id).map((x) => ({ ...x, oculta: !!x.oculta, destaque: !!x.destaque })) } : {}) };
    }
    if (r.tipo === "bilhete") {
      const perguntas = Array.isArray(extra.perguntas) ? extra.perguntas : BILHETE_PADRAO;
      const res = !detalhe ? null : perguntas.map((q, i) => {
        if (q.tipo === "escala") {
          const dist = [0, 0, 0, 0, 0];
          for (const x of db.prepare("SELECT valor FROM sondagem_respostas WHERE sondagem_id = ? AND pergunta = ? AND valor BETWEEN 1 AND 5").all(r.id, i)) dist[x.valor - 1]++;
          const n = dist.reduce((z, x) => z + x, 0);
          return { tipo: "escala", texto: q.texto, dist, n, media: n ? Math.round((dist.reduce((z, x, k) => z + x * (k + 1), 0) / n) * 10) / 10 : null };
        }
        const respostas = db.prepare("SELECT id, texto FROM sondagem_respostas WHERE sondagem_id = ? AND pergunta = ? AND valor IS NULL ORDER BY id DESC LIMIT 400").all(r.id, i);
        return { tipo: "texto", texto: q.texto, respostas, palavras: frequencias(respostas.map((x) => x.texto)) };
      });
      return { ...base, total: votos[0] || 0, perguntas, ...(res ? { resultados: res } : {}) };
    }
    return base;
  };
  rota("GET", "/api/sondagens", (c, u) => {
    const tipo = u && u.searchParams.get("tipo"), turma = u && inteiro(u.searchParams.get("turma"));
    const onde = ["prof_id = ?"], args = [c.p.id];
    if (tipo && TIPOS.has(tipo)) { onde.push("tipo = ?"); args.push(tipo); } else if (tipo === "sondagem") onde.push("tipo IN ('escolha', 'aberta')");
    if (turma) { onde.push("turma_id = ?"); args.push(turma); }
    return db.prepare(`SELECT * FROM sondagens WHERE ${onde.join(" AND ")} ORDER BY id DESC LIMIT 30`).all(...args).map((r) => dadosSondagem(r));
  });
  const criarSondagem = (c, b) => {
    const tipo = TIPOS.has(b.tipo) ? b.tipo : "escolha";
    let pergunta = texto(b.pergunta, 200), opcoes = [], certa = -1, extra = {}, votos = [];
    const turma = b.turma === undefined || b.turma === null || b.turma === "" ? null : existe(turmaDe(c.p, inteiro(b.turma)), "Turma inexistente.").id;
    if (tipo === "escolha") {
      opcoes = (Array.isArray(b.opcoes) ? b.opcoes : []).map((o) => texto(o, 80)).filter(Boolean);
      if (opcoes.length < 2 || opcoes.length > 8) throw erro(400, "Indica de 2 a 8 opções.");
      if (new Set(opcoes.map((o) => o.toLowerCase())).size !== opcoes.length) throw erro(400, "As opções têm de ser diferentes.");
      const k = inteiro(b.certa); if (k !== null && k >= 0 && k < opcoes.length) certa = k;
      votos = opcoes.map(() => 0);
      if (b.esconder) extra = { esconder: true }; // para «Usar outra vez» voltar a esconder os resultados
    } else if (tipo === "mural") {
      opcoes = (Array.isArray(b.opcoes) ? b.opcoes : []).map((o) => texto(o, 40)).filter(Boolean);
      if (opcoes.length > 4) throw erro(400, "O mural leva até 4 colunas.");
      extra = { modo: b.extra && b.extra.modo === "duvidas" ? "duvidas" : "ideias", aprovar: !!(b.extra && b.extra.aprovar) };
      if (!pergunta) pergunta = extra.modo === "duvidas" ? "Que dúvidas tens?" : "Partilha a tua ideia";
    } else if (tipo === "bilhete") {
      const ps = b.extra && Array.isArray(b.extra.perguntas) ? b.extra.perguntas : BILHETE_PADRAO;
      const perguntas = ps.map((q) => ({ tipo: q && q.tipo === "escala" ? "escala" : "texto", texto: texto(q && q.texto, 120) })).filter((q) => q.texto);
      if (perguntas.length < 1 || perguntas.length > 4) throw erro(400, "O bilhete de saída leva de 1 a 4 perguntas.");
      extra = { perguntas };
      if (!pergunta) pergunta = "Bilhete de saída";
      votos = [0];
    }
    if (!pergunta) throw erro(400, "Escreve a pergunta.");
    const codigo = novoCodigo(db);
    const id = Number(db.prepare("INSERT INTO sondagens (prof_id, codigo, pergunta, opcoes, votos, tipo, turma_id, certa, revelada, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(c.p.id, codigo, pergunta, JSON.stringify(opcoes), JSON.stringify(votos), tipo, turma, certa, b.esconder ? 0 : 1, JSON.stringify(extra)).lastInsertRowid);
    return { id, codigo };
  };
  rota("POST", "/api/sondagens", (c) => criarSondagem(c, c.b));
  // «Usar outra vez»: cópia com código novo (as sondagens só ficam abertas 12 horas).
  rota("POST", "/api/sondagens/:id/copiar", (c) => {
    const s = meu("sondagens", c.p, c.id[0]);
    return criarSondagem(c, { tipo: s.tipo, pergunta: s.pergunta, opcoes: JSON.parse(s.opcoes), certa: s.certa, esconder: s.revelada === 0 || !!extraDe(s).esconder || (s.tipo === "escolha" && !!c.b.esconder), turma: c.b.turma !== undefined ? c.b.turma : (s.turma_id && turmaDe(c.p, s.turma_id) ? s.turma_id : null), extra: extraDe(s) });
  });
  rota("GET", "/api/sondagens/:id", (c) => dadosSondagem(meu("sondagens", c.p, c.id[0]), true));
  // Tirar uma resposta imprópria (a moderação é do docente).
  rota("DELETE", "/api/sondagens/:id/respostas/:rid", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("DELETE FROM sondagem_respostas WHERE id = ? AND sondagem_id = ?").run(c.id[1], s.id); return { ok: true }; });
  // Mural: mostrar ou esconder uma nota, mudar de coluna ou destacar.
  rota("PUT", "/api/sondagens/:id/respostas/:rid", (c) => {
    const s = meu("sondagens", c.p, c.id[0]);
    const r = existe(db.prepare("SELECT * FROM sondagem_respostas WHERE id = ? AND sondagem_id = ?").get(c.id[1], s.id));
    const ncol = Math.max(1, JSON.parse(s.opcoes).length);
    const coluna = c.b.coluna === undefined ? r.coluna : Math.min(ncol - 1, Math.max(0, inteiro(c.b.coluna) ?? 0));
    db.prepare("UPDATE sondagem_respostas SET oculta = ?, coluna = ?, destaque = ? WHERE id = ?").run(c.b.oculta === undefined ? r.oculta : (c.b.oculta ? 1 : 0), coluna, c.b.destaque === undefined ? r.destaque : (c.b.destaque ? 1 : 0), r.id);
    return { ok: true };
  });
  rota("POST", "/api/sondagens/:id/estado", (c) => {
    const s = meu("sondagens", c.p, c.id[0]);
    const aberta = c.b.aberta === undefined ? s.aberta : (c.b.aberta === false ? 0 : 1);
    // Fechar a votação revela os resultados; «revelada» também se muda à parte (mostrar ou esconder as barras no projetor).
    const revelada = c.b.revelada !== undefined ? (c.b.revelada ? 1 : 0) : (c.b.aberta === false ? 1 : s.revelada);
    db.prepare("UPDATE sondagens SET aberta = ?, revelada = ? WHERE id = ?").run(aberta, revelada, s.id);
    return { ok: true };
  });
  // Contagem à mão (mão no ar): delta +1 ou -1 numa opção.
  rota("POST", "/api/sondagens/:id/voto", (c) => {
    const s = meu("sondagens", c.p, c.id[0]), votos = JSON.parse(s.votos), k = inteiro(c.b.opcao), d = c.b.delta === -1 ? -1 : 1;
    if (s.tipo !== "escolha") throw erro(400, "Só as sondagens de escolha contam votos à mão.");
    if (!(k >= 0 && k < votos.length)) throw erro(400, "Opção inválida.");
    votos[k] = Math.max(0, votos[k] + d);
    db.prepare("UPDATE sondagens SET votos = ? WHERE id = ?").run(JSON.stringify(votos), s.id);
    return { ok: true };
  });
  rota("POST", "/api/sondagens/:id/repor", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("UPDATE sondagens SET votos = ? WHERE id = ?").run(JSON.stringify(s.tipo === "bilhete" ? [0] : JSON.parse(s.opcoes).map(() => 0)), s.id); db.prepare("DELETE FROM sondagem_respostas WHERE sondagem_id = ?").run(s.id); return { ok: true }; });
  rota("DELETE", "/api/sondagens/:id", (c) => { const s = meu("sondagens", c.p, c.id[0]); db.prepare("DELETE FROM sondagens WHERE id = ?").run(s.id); return { ok: true }; });
}

module.exports = { registar, VALIDADE_SONDAGEM_MS };
