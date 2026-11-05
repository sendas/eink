"use strict";
// Modelos de grelha: estrutura de um teste (grupos, questões e cotações) que o docente guarda para voltar a usar e envia a colegas dentro da plataforma.
// Nunca levam notas nem alunos. Um modelo enviado fica na lista do colega como «recebido de …».
module.exports = function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, avalDe, itensDe } = X;
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
  rota("GET", "/api/colegas", (c) => db.prepare("SELECT id, nome, upn FROM professores WHERE ativo = 1 AND local = 0 AND id != ? ORDER BY nome, upn").all(c.p.id).map((p) => ({ id: p.id, nome: p.nome || p.upn })));

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
  // Envia uma cópia do modelo a colegas da plataforma; cada um fica com a sua e pode apagá-la ou alterá-la sem afetar as outras.
  rota("POST", "/api/grelha-modelos/:id/enviar", (c) => {
    const m = existe(db.prepare("SELECT * FROM grelha_modelos WHERE id = ? AND prof_id = ?").get(c.id[0], c.p.id), "Modelo inexistente.");
    const ids = [...new Set((Array.isArray(c.b.para) ? c.b.para : []).map(inteiro).filter((x) => x && x !== c.p.id))].slice(0, 40);
    if (!ids.length) throw erro(400, "Escolhe pelo menos um colega.");
    let enviados = 0; const quem = c.p.nome || c.p.upn;
    for (const id of ids) {
      if (!db.prepare("SELECT 1 FROM professores WHERE id = ? AND ativo = 1").get(id)) continue;
      if (db.prepare("SELECT COUNT(*) AS n FROM grelha_modelos WHERE prof_id = ?").get(id).n >= LIMITE) continue;
      db.prepare("INSERT INTO grelha_modelos (prof_id, nome, itens, de_nome, nova) VALUES (?, ?, ?, ?, 1)").run(id, m.nome, m.itens, quem); enviados++;
    }
    if (!enviados) throw erro(409, "Não foi possível enviar: os colegas escolhidos não existem ou já têm demasiados modelos.");
    return { enviados };
  });
  return { novas: (profId) => db.prepare("SELECT COUNT(*) AS n FROM grelha_modelos WHERE prof_id = ? AND nova = 1").get(profId).n };
};
