"use strict";
// Modelos de grelha: estrutura de um teste (grupos, questões e cotações) que o docente guarda para voltar a usar e envia a colegas dentro da plataforma.
// Nunca levam notas nem alunos. Um modelo enviado fica na lista do colega como «recebido de …».
module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, avalDe, itensDe, dominios = [] } = X;
  const LIMITE = 100;

  const limparItens = (lista) => {
    if (!Array.isArray(lista) || !lista.length || lista.length > 60) throw erro(400, "Um modelo tem de 1 a 60 questões.");
    return lista.map((x) => {
      const nome = texto(x.nome, 80), grupo = texto(x.grupo, 60), cotacao = Math.round(Number(String(x.cotacao).replace(",", ".")) * 10000) / 10000;
      if (!nome) throw erro(400, "Todas as questões precisam de nome.");
      if (!(cotacao > 0 && cotacao <= 1000)) throw erro(400, `A cotação de «${nome}» tem de ser maior que 0.`);
      return { grupo, nome, cotacao };
    });
  };
  const resumo = (m) => { const itens = JSON.parse(m.itens); return { id: m.id, nome: m.nome, criado: m.criado, de: m.de_nome || "", nova: !!m.nova, n: itens.length, soma: Math.round(itens.reduce((z, i) => z + i.cotacao, 0) * 10000) / 10000, itens }; };

  rota("GET", "/api/grelha-modelos", (c) => db.prepare("SELECT * FROM grelha_modelos WHERE prof_id = ? ORDER BY nova DESC, id DESC LIMIT 200").all(c.p.id).map(resumo));
  rota("POST", "/api/grelha-modelos/vistos", (c) => { db.prepare("UPDATE grelha_modelos SET nova = 0 WHERE prof_id = ?").run(c.p.id); return { ok: true }; });
  // Colegas a quem se pode enviar um modelo (só nomes).
  rota("GET", "/api/colegas", (c) => db.prepare("SELECT id, nome, upn FROM professores WHERE ativo = 1 AND local = 0 AND id != ? ORDER BY nome, upn").all(c.p.id).map((p) => ({ id: p.id, nome: p.nome || p.upn, email: p.upn })));

  // Cria um modelo a partir de um teste que já tem grelha, ou de uma lista de questões.
  rota("POST", "/api/grelha-modelos", (c) => {
    const nome = texto(c.b.nome, 100);
    if (!nome) throw erro(400, "Dá um nome ao modelo.");
    let itens;
    if (c.b.avaliacao !== undefined) {
      const a = existe(avalDe(c.p, inteiro(c.b.avaliacao)), "Teste inexistente.");
      itens = limparItens(itensDe(a.id).map((i) => ({ grupo: i.grupo, nome: i.nome, cotacao: i.cotacao })));
    } else itens = limparItens(c.b.itens);
    if (db.prepare("SELECT COUNT(*) AS n FROM grelha_modelos WHERE prof_id = ?").get(c.p.id).n >= LIMITE) throw erro(409, `Já tens ${LIMITE} modelos: apaga alguns.`);
    return { id: Number(db.prepare("INSERT INTO grelha_modelos (prof_id, nome, itens) VALUES (?, ?, ?)").run(c.p.id, nome, JSON.stringify(itens)).lastInsertRowid) };
  });
  rota("PUT", "/api/grelha-modelos/:id", (c) => {
    const m = existe(db.prepare("SELECT * FROM grelha_modelos WHERE id = ? AND prof_id = ?").get(c.id[0], c.p.id), "Modelo inexistente.");
    const nome = texto(c.b.nome, 100); if (!nome) throw erro(400, "Dá um nome ao modelo.");
    db.prepare("UPDATE grelha_modelos SET nome = ? WHERE id = ?").run(nome, m.id); return { ok: true };
  });
  rota("DELETE", "/api/grelha-modelos/:id", (c) => {
    const m = existe(db.prepare("SELECT id FROM grelha_modelos WHERE id = ? AND prof_id = ?").get(c.id[0], c.p.id), "Modelo inexistente.");
    db.prepare("DELETE FROM grelha_modelos WHERE id = ?").run(m.id); return { ok: true };
  });
  // Envia uma cópia do modelo a colegas: pelos ids dos que já entraram na plataforma e/ou pelo email institucional dos que ainda não entraram
  // (a cópia fica à espera e chega quando o colega entrar pela primeira vez). Cada um fica com a sua e pode apagá-la ou alterá-la sem afetar as outras.
  rota("POST", "/api/grelha-modelos/:id/enviar", (c) => {
    const m = existe(db.prepare("SELECT * FROM grelha_modelos WHERE id = ? AND prof_id = ?").get(c.id[0], c.p.id), "Modelo inexistente.");
    const ids = new Set((Array.isArray(c.b.para) ? c.b.para : []).map(inteiro).filter((x) => x && x !== c.p.id));
    const emails = [...new Set((Array.isArray(c.b.emails) ? c.b.emails : []).map((e) => String(e).trim().toLowerCase()))].slice(0, 40);
    const pendentes = [];
    for (const e of emails) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e.length > 120) throw erro(400, `«${e}» não é um email válido.`);
      if (e === c.p.upn) continue;
      if (dominios.length && !dominios.includes(e.split("@")[1])) throw erro(400, `«${e}» não é um email da escola. Só se envia a colegas do agrupamento.`);
      const reg = db.prepare("SELECT id FROM professores WHERE upn = ? AND ativo = 1 AND local = 0").get(e);
      if (reg) ids.add(reg.id); else pendentes.push(e);
    }
    if (!ids.size && !pendentes.length) throw erro(400, "Escolhe pelo menos um colega.");
    let enviados = 0, aEspera = 0; const quem = c.p.nome || c.p.upn;
    for (const id of [...ids].slice(0, 40)) {
      if (!db.prepare("SELECT 1 FROM professores WHERE id = ? AND ativo = 1").get(id)) continue;
      if (db.prepare("SELECT COUNT(*) AS n FROM grelha_modelos WHERE prof_id = ?").get(id).n >= LIMITE) continue;
      db.prepare("INSERT INTO grelha_modelos (prof_id, nome, itens, de_nome, nova) VALUES (?, ?, ?, ?, 1)").run(id, m.nome, m.itens, quem); enviados++;
    }
    for (const e of pendentes) {
      if (db.prepare("SELECT COUNT(*) AS n FROM grelha_pendentes WHERE upn = ?").get(e).n >= 20) continue;
      db.prepare("INSERT INTO grelha_pendentes (upn, itens, nome, de_nome) VALUES (?, ?, ?, ?)").run(e, m.itens, m.nome, quem); aEspera++;
    }
    if (!enviados && !aEspera) throw erro(409, "Não foi possível enviar: os colegas escolhidos não existem ou já têm demasiados modelos.");
    return { enviados, aEspera };
  });
  // Quando um docente entra pela primeira vez (ou volta), recebe o que lhe enviaram antes de ter conta.
  const entregar = (prof) => {
    if (!prof || !prof.upn) return 0;
    const l = db.prepare("SELECT * FROM grelha_pendentes WHERE upn = ? ORDER BY id").all(prof.upn);
    for (const x of l) { if (db.prepare("SELECT COUNT(*) AS n FROM grelha_modelos WHERE prof_id = ?").get(prof.id).n < LIMITE) db.prepare("INSERT INTO grelha_modelos (prof_id, nome, itens, de_nome, nova) VALUES (?, ?, ?, ?, 1)").run(prof.id, x.nome, x.itens, x.de_nome); }
    if (l.length) db.prepare("DELETE FROM grelha_pendentes WHERE upn = ?").run(prof.upn);
    return l.length;
  };
  db.prepare("DELETE FROM grelha_pendentes WHERE criado < datetime('now', '-180 days')").run();
  return { entregar, novas: (profId) => db.prepare("SELECT COUNT(*) AS n FROM grelha_modelos WHERE prof_id = ? AND nova = 1").get(profId).n };
};
