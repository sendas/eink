"use strict";
// Importar e exportar os critérios de avaliação de todos os grupos disciplinares de uma só vez (Excel, CSV ou texto colado).
// Uma linha por critério: Grupo; Ano; Critério; Tipo; Peso; Casas decimais. Mostra primeiro o que vai acontecer e só grava depois de confirmado.
const { lerXlsx, paraTexto } = require("./xlsx-ler");

const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CAMPOS = [["grupo", /^grupo/], ["ano", /^ano/], ["criterio", /^criterio/], ["tipo", /^tipo/], ["peso", /^peso/], ["casas", /^casas/], ["nivel", /^nivel/]];

function lerLinhas(txt) {
  const L = String(txt || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!L.length) return [];
  const delim = L.some((l) => l.includes("\t")) ? "\t" : L.some((l) => l.includes(";")) ? ";" : L.some((l) => l.includes("|")) ? "|" : null;
  if (!delim) throw Object.assign(new Error("Separa as colunas com tabulação (colar do Excel) ou ponto e vírgula."), { publico: true });
  return L.map((l) => l.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim()));
}

module.exports = function registar(X) {
  const { rota, db, erro, texto, soAdmin, transacao, esquemaPorId, turmasDoAno, temDados, criarEsquema } = X;

  // Transforma as linhas em esquemas {grupo, ano, casas, criterios[], problemas[]}, sem tocar na base de dados.
  function lerEsquemas(txt) {
    let linhas = lerLinhas(txt);
    if (!linhas.length) throw erro(400, "Não há linhas para importar. Cola as colunas do Excel ou escolhe um ficheiro.");
    let col = { grupo: 0, ano: 1, criterio: 2, tipo: 3, peso: 4, casas: 5 };
    const cab = linhas[0].map(norm);
    if (cab.includes("grupo") || cab.some((c) => /^criterio/.test(c)) && cab.some((c) => /^peso/.test(c))) {
      col = {}; for (const [k, re] of CAMPOS) { const i = cab.findIndex((c) => re.test(c)); if (i >= 0) col[k] = i; }
      for (const k of ["grupo", "criterio", "peso"]) if (col[k] === undefined) throw erro(400, `Falta a coluna «${k === "criterio" ? "Critério" : k === "grupo" ? "Grupo" : "Peso"}» no cabeçalho.`);
      linhas = linhas.slice(1);
    }
    const mapa = new Map(), geral = [];
    linhas.forEach((c, i) => {
      const n = i + 2, g = (k) => (col[k] === undefined ? "" : c[col[k]] ?? "");
      const grupo = texto(g("grupo"), 60), nome = texto(g("criterio"), 60);
      const prob = (m) => geral.push(`Linha ${n}: ${m}`);
      if (!grupo || !nome) return prob("faltam o grupo ou o critério.");
      const ap = norm(g("ano")), am = /^(todos|todo|tod|0|)/.test(ap) && !/\d{1,2}/.test(ap) || ap === "0" ? 0 : Number((ap.match(/\d{1,2}/) || [""])[0]);
      if (!Number.isInteger(am) || am < 0 || am > 12) return prob(`ano «${g("ano")}» inválido (usa «Todos» ou 1 a 12).`);
      const tp = norm(g("tipo")), tipo = tp === "" || tp.startsWith("t") ? "testes" : tp.startsWith("n") ? "nivel" : null;
      if (!tipo) return prob(`tipo «${g("tipo")}» inválido (usa «testes» ou «nível»).`);
      const peso = Number(String(g("peso")).replace("%", "").replace(",", ".").trim());
      if (!(peso > 0 && peso <= 100)) return prob(`o peso de «${nome}» tem de ser maior que 0 e no máximo 100.`);
      const cs = g("casas") === "" ? null : Number(String(g("casas")).trim());
      if (cs !== null && cs !== 1 && cs !== 2) return prob("as casas decimais são 1 ou 2.");
      const pf = /^prof/.test(norm(g("nivel")));
      const chave = grupo.toLowerCase() + "|" + am;
      if (!mapa.has(chave)) mapa.set(chave, { grupo, ano: am, casas: null, criterios: [], problemas: [] });
      const e = mapa.get(chave);
      if (pf) e.profissional = true;
      if (cs !== null) e.casas = cs;
      if (e.criterios.some((k) => k.nome.toLowerCase() === nome.toLowerCase())) e.problemas.push(`critério repetido: ${nome}.`);
      e.criterios.push({ nome, peso, tipo });
    });
    const lista = [...mapa.values()];
    for (const e of lista) {
      const soma = Math.round(e.criterios.reduce((z, k) => z + k.peso, 0) * 100) / 100;
      if (Math.abs(soma - 100) > 0.01) e.problemas.push(`os pesos somam ${soma} %, têm de somar 100 %.`);
      if (e.criterios.length > 8) e.problemas.push("no máximo 8 critérios.");
      if (!e.criterios.some((k) => k.tipo === "testes")) e.problemas.push("é preciso pelo menos um critério de testes.");
    }
    return { esquemas: lista, problemasGerais: geral };
  }

  // Compara cada esquema com o que existe e diz o que acontecia: novo, substituir, igual ou bloqueado.
  function planear(lido) {
    return lido.esquemas.map((e) => {
      const r = { profissional: !!e.profissional, grupo: e.grupo, ano: e.ano, casas: e.casas, criterios: e.criterios, problemas: [...e.problemas], acao: "novo", avisos: [] };
      const g = db.prepare("SELECT id, nome, profissional FROM grupos WHERE LOWER(nome) = LOWER(?)").get(e.grupo);
      if (g) { r.grupo_id = g.id; r.grupo = g.nome; }
      else if (e.ano !== 0 && !lido.esquemas.some((x) => x !== e && x.grupo.toLowerCase() === e.grupo.toLowerCase() && x.ano === 0)) r.avisos.push("Grupo novo: cria-se também o esquema «todos os anos» com os critérios por defeito (70 % e 30 %).");
      if (r.problemas.length || !g) { if (!r.problemas.length && !g) r.acao = "novo grupo"; return r; }
      const ex = db.prepare("SELECT id, casas FROM esquemas WHERE grupo_id = ? AND ano = ?").get(g.id, e.ano);
      if (!ex) {
        r.acao = "novo";
        if (e.ano > 0 && turmasDoAno(g.id, e.ano).some((t) => temDados(t.id))) { r.acao = "bloqueado"; r.problemas.push(`já há turmas do ${e.ano}.º ano deste grupo com avaliações lançadas.`); }
        return r;
      }
      const atual = esquemaPorId(ex.id), casas = e.casas ?? atual.casas;
      const igual = (!e.profissional || !!g.profissional) && casas === atual.casas && atual.criterios.length === e.criterios.length && atual.criterios.every((k, i) => k.nome.toLowerCase() === e.criterios[i].nome.toLowerCase() && k.tipo === e.criterios[i].tipo && Math.abs(k.peso - e.criterios[i].peso) < 0.001);
      if (igual) { r.acao = "igual"; return r; }
      r.acao = "substituir";
      const novos = new Map(e.criterios.map((k) => [k.nome.toLowerCase(), k]));
      for (const k of atual.criterios) {
        const usado = db.prepare("SELECT COUNT(*) AS n FROM avaliacoes WHERE criterio_id = ?").get(k.id).n;
        const n = novos.get(k.nome.toLowerCase());
        if (usado && !n) { r.acao = "bloqueado"; r.problemas.push(`«${k.nome}» já tem avaliações lançadas por docentes e não se pode retirar.`); }
        else if (usado && n.tipo !== k.tipo) { r.acao = "bloqueado"; r.problemas.push(`«${k.nome}» já tem avaliações lançadas: não se pode mudar o tipo.`); }
        else if (usado) r.avisos.push(`«${k.nome}» já tem avaliações lançadas: muda o peso nas turmas que a usam.`);
      }
      return r;
    });
  }

  function aplicar(plano) {
    let criados = 0, substituidos = 0;
    transacao(() => {
      for (const p of plano) {
        if (p.problemas.length || p.acao === "igual" || p.acao === "bloqueado") continue;
        let gid = p.grupo_id || (db.prepare("SELECT id FROM grupos WHERE LOWER(nome) = LOWER(?)").get(p.grupo) || {}).id;
        if (!gid) {
          gid = Number(db.prepare("INSERT INTO grupos (nome) VALUES (?)").run(p.grupo).lastInsertRowid);
          if (p.ano !== 0) criarEsquema(db, gid, 0); // todo o grupo precisa do esquema «todos os anos»
        }
        if (p.profissional) db.prepare("UPDATE grupos SET profissional = 1 WHERE id = ?").run(gid);
        let ex = db.prepare("SELECT id FROM esquemas WHERE grupo_id = ? AND ano = ?").get(gid, p.ano);
        if (!ex) { ex = { id: Number(db.prepare("INSERT INTO esquemas (grupo_id, ano, casas) VALUES (?, ?, ?)").run(gid, p.ano, p.casas ?? 1).lastInsertRowid) }; criados++; }
        else substituidos++;
        const atuais = new Map(esquemaPorId(ex.id).criterios.map((k) => [k.nome.toLowerCase(), k]));
        const manter = new Set();
        p.criterios.forEach((k, i) => {
          const a = atuais.get(k.nome.toLowerCase());
          if (a && a.tipo === k.tipo) { db.prepare("UPDATE criterios SET nome = ?, peso = ?, ordem = ? WHERE id = ?").run(k.nome, k.peso, i, a.id); manter.add(a.id); }
          else if (a) { db.prepare("DELETE FROM criterios WHERE id = ?").run(a.id); db.prepare("INSERT INTO criterios (esquema_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)").run(ex.id, k.nome, k.peso, k.tipo, i); }
          else db.prepare("INSERT INTO criterios (esquema_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)").run(ex.id, k.nome, k.peso, k.tipo, i);
        });
        for (const [, a] of atuais) if (!manter.has(a.id) && !p.criterios.some((k) => k.nome.toLowerCase() === a.nome.toLowerCase())) db.prepare("DELETE FROM criterios WHERE id = ?").run(a.id);
        if (p.casas) db.prepare("UPDATE esquemas SET casas = ? WHERE id = ?").run(p.casas, ex.id);
      }
    });
    return { criados, substituidos };
  }

  rota("POST", "/api/admin/criterios/importar", (c) => {
    soAdmin(c);
    let txt = String(c.b.texto || "");
    if (c.b.base64) {
      const buf = Buffer.from(String(c.b.base64), "base64");
      if (buf.length > 700000) throw erro(413, "O ficheiro é demasiado grande (máximo 700 KB).");
      if (String(c.b.nome || "").toLowerCase().endsWith(".xlsx") || (buf[0] === 0x50 && buf[1] === 0x4b)) { try { txt = paraTexto(lerXlsx(buf)); } catch (e) { throw erro(400, e.publico ? e.message : "Não consegui ler o ficheiro Excel."); } }
      else txt = buf.toString("utf8");
    }
    let lido; try { lido = lerEsquemas(txt); } catch (e) { throw e.codigo ? e : erro(400, e.message); }
    const plano = planear(lido);
    const fazer = plano.filter((p) => !p.problemas.length && p.acao !== "igual" && p.acao !== "bloqueado");
    if (c.b.aplicar === true) {
      if (lido.problemasGerais.length) throw erro(400, "Há linhas com problemas: corrige-as e tenta outra vez.");
      if (plano.some((p) => p.problemas.length && p.acao !== "bloqueado")) throw erro(400, "Há esquemas com problemas: corrige-os e tenta outra vez.");
      return { ...aplicar(plano), ignorados: plano.length - fazer.length, plano };
    }
    return { plano, problemasGerais: lido.problemasGerais, aplicaveis: fazer.length };
  });

  // Todos os critérios atuais no mesmo formato, para editar no Excel e voltar a importar.
  rota("GET", "/api/admin/criterios/exportar", (c) => {
    soAdmin(c);
    const linhas = [["Grupo", "Ano", "Critério", "Tipo", "Peso", "Casas decimais", "Nível"]];
    for (const g of db.prepare("SELECT id, nome, profissional FROM grupos ORDER BY nome").all())
      for (const e of db.prepare("SELECT id FROM esquemas WHERE grupo_id = ? ORDER BY ano").all(g.id).map((x) => esquemaPorId(x.id)))
        for (const k of e.criterios) linhas.push([g.nome, e.ano ? String(e.ano) : "Todos", k.nome, k.tipo === "nivel" ? "nível" : "testes", String(k.peso).replace(".", ","), String(e.casas), g.profissional ? "Profissional" : ""]);
    return { csv: "﻿" + linhas.map((l) => l.map((x) => (/[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x)).join(";")).join("\r\n") };
  });
};
