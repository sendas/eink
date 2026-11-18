"use strict";
// Gestão dos alunos de uma turma: resumo para os cartões, ficha do aluno (notas, intercalares, assiduidade, participação e observações
// privadas), saída da turma (transferido ou matrícula anulada, sem apagar as notas), mudança de turma com ou sem notas, numeração e nomes.
// Tudo filtrado pelo docente da turma. As observações são só do docente: nunca vão para o projetor, para as exportações nem para colegas.

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);
// «ana silva» ou «ANA SILVA» passa a «Ana Silva»; um nome já com maiúsculas e minúsculas fica como está.
function nomeProprio(nome) {
  const n = String(nome || "").trim().replace(/\s+/g, " ");
  if (!n || (n !== n.toLowerCase() && n !== n.toUpperCase())) return n;
  return n.toLowerCase().split(" ").map((p, i) => (i && PARTICULAS.has(p) ? p : p.split("-").map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join("-"))).join(" ");
}
const hoje = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date());
const chave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const ESTADOS = { "": "Na turma", transferido: "Transferido", anulou: "Anulou a matrícula" };
const LEVAR = new Set(["nada", "media", "testes"]);

function registar(X) {
  const { rota, db, erro, texto, inteiro, existe, turmaDe, alunoDe, transacao, dadosPauta, esquemaDaTurma, auditar, INTERCALAR } = X;
  const turma = (c) => existe(turmaDe(c.p, c.id[0]), "Turma inexistente.");
  const periodosDe = (tid) => db.prepare("SELECT * FROM periodos WHERE turma_id = ? ORDER BY ordem, id").all(tid);
  // Período em foco: o último que já tem avaliações (senão o primeiro), como no Início.
  const focoDe = (periodos) => { let f = periodos[0] || null; for (const p of periodos) if (db.prepare("SELECT 1 FROM avaliacoes WHERE periodo_id = ? LIMIT 1").get(p.id)) f = p; return f; };
  const nomeMencao = Object.fromEntries(INTERCALAR.map((m) => [m.id, m.nome]));

  // ---------- resumo da turma para os cartões ----------
  rota("GET", "/api/turmas/:id/gestao", (c, u) => {
    const t = turma(c), periodos = periodosDe(t.id);
    const per = periodos.find((p) => p.id === inteiro(u.searchParams.get("periodo"))) || focoDe(periodos);
    const d = per ? dadosPauta(per) : null;
    const linhas = new Map((d ? d.alunos : []).map((a) => [a.id, a]));
    const conta = (sql) => new Map(db.prepare(sql).all(t.id).map((r) => [r.l, r]));
    const pres = conta("SELECT p.aluno_id l, SUM(p.estado = 'F') f, SUM(p.estado = 'A') a FROM presencas p JOIN alunos x ON x.id = p.aluno_id WHERE x.turma_id = ? GROUP BY p.aluno_id");
    const reg = conta("SELECT r.aluno_id l, SUM(r.positivo = 1) pos, SUM(r.positivo = 0) neg FROM registos r JOIN alunos x ON x.id = r.aluno_id WHERE x.turma_id = ? GROUP BY r.aluno_id");
    const obs = conta("SELECT o.aluno_id l, COUNT(*) n FROM observacoes o JOIN alunos x ON x.id = o.aluno_id WHERE x.turma_id = ? GROUP BY o.aluno_id");
    const inter = new Map();
    if (per) for (const r of db.prepare("SELECT aluno_id l, n, mencao m FROM intercalares WHERE periodo_id = ? AND mencao IS NOT NULL ORDER BY n").all(per.id)) inter.set(r.l, { n: r.n, mencao: r.m, nome: nomeMencao[r.m] || "" });
    const todos = db.prepare("SELECT a.id, a.numero, a.nome, a.email, a.genero, a.estado, a.saiu_em, a.saiu_nota, f.atualizada AS foto FROM alunos a LEFT JOIN fotos f ON f.aluno_id = a.id WHERE a.turma_id = ? ORDER BY COALESCE(a.numero, 9999), a.nome").all(t.id);
    const proprias = d ? d.avaliacoes.filter((x) => !x.trazida) : [];
    const alunos = todos.filter((a) => !a.estado).map((a) => {
      const l = linhas.get(a.id) || {}, p = pres.get(a.id) || {}, r = reg.get(a.id) || {};
      return { id: a.id, numero: a.numero, nome: a.nome, email: a.email, genero: a.genero, foto: a.foto, final: l.final ?? null, nivel: l.nivel ?? null, valores: l.valores ?? null, mencao: l.mencao || "", parcial: !!l.parcial,
        notas: d ? d.avaliacoes.filter((x) => d.notas[x.id + ":" + a.id] != null).length : 0, emFalta: proprias.filter((x) => d.notas[x.id + ":" + a.id] == null).length,
        faltas: p.f || 0, atrasos: p.a || 0, pos: r.pos || 0, neg: r.neg || 0, inter: inter.get(a.id) || null, obs: (obs.get(a.id) || {}).n || 0 };
    });
    return {
      turma: { id: t.id, nome: t.nome, ano_letivo: t.ano_letivo, ano: t.ano, arquivada: !!t.arquivada }, grupo: esquemaDaTurma(t),
      escala: d ? d.escala : "niveis", limites: d ? d.limites : [20, 50, 70, 90], avaliacoes: proprias.length,
      periodos: periodos.map((p) => ({ id: p.id, nome: p.nome, fechado: !!p.fechado })), periodo: per ? { id: per.id, nome: per.nome } : null,
      alunos, inativos: todos.filter((a) => a.estado).map((a) => ({ id: a.id, numero: a.numero, nome: a.nome, foto: a.foto, estado: a.estado, estadoNome: ESTADOS[a.estado] || a.estado, saiu_em: a.saiu_em, saiu_nota: a.saiu_nota })),
      outras: db.prepare("SELECT id, nome, ano_letivo FROM turmas WHERE prof_id = ? AND arquivada = 0 AND id <> ? ORDER BY ano, nome").all(c.p.id, t.id),
    };
  });

  // ---------- ficha do aluno ----------
  rota("GET", "/api/alunos/:id/ficha", (c) => {
    const a = existe(alunoDe(c.p, c.id[0])), t = db.prepare("SELECT * FROM turmas WHERE id = ?").get(a.turma_id);
    const foto = (db.prepare("SELECT atualizada t FROM fotos WHERE aluno_id = ?").get(a.id) || {}).t || null;
    let escala = "niveis", limites = [20, 50, 70, 90];
    const periodos = periodosDe(t.id).map((per) => {
      const d = dadosPauta(per, a.id), l = d.alunos.find((x) => x.id === a.id) || {}; escala = d.escala; limites = d.limites;
      return {
        id: per.id, nome: per.nome, fechado: !!per.fechado, final: l.final ?? null, nivel: l.nivel ?? null, valores: l.valores ?? null, mencao: l.mencao || "", parcial: !!l.parcial,
        criterios: d.criterios.map((k) => ({ id: k.id, nome: k.nome, peso: k.peso, tipo: k.tipo, media: l.criterios ? l.criterios[k.id] ?? null : null, nivel: l.niveis ? l.niveis[k.id] ?? null : null,
          avaliacoes: k.tipo === "nivel" ? [] : d.avaliacoes.filter((x) => x.criterio_id === k.id).map((x) => ({ id: x.id, titulo: x.titulo, data: x.data, maximo: x.maximo, peso: x.peso, grelha: x.n_itens > 0, trazida: !!x.trazida, valor: d.notas[x.id + ":" + a.id] ?? null, pct: l.pcts ? l.pcts[x.id] ?? null : null })).filter((x) => !x.trazida || x.valor !== null) })),
        intercalares: db.prepare("SELECT n, mencao, descritiva FROM intercalares WHERE periodo_id = ? AND aluno_id = ? ORDER BY n").all(per.id, a.id).filter((i) => i.mencao || i.descritiva).map((i) => ({ n: i.n, mencao: i.mencao, nome: nomeMencao[i.mencao] || "", descritiva: i.descritiva })),
      };
    });
    const pres = db.prepare("SELECT data, estado FROM presencas WHERE aluno_id = ? ORDER BY data DESC").all(a.id);
    const reg = db.prepare("SELECT data, tipo, positivo FROM registos WHERE aluno_id = ? ORDER BY data DESC, id DESC").all(a.id), tipos = {};
    for (const r of reg) tipos[r.tipo] = (tipos[r.tipo] || 0) + 1;
    const ativos = db.prepare("SELECT id FROM alunos WHERE turma_id = ? AND estado = '' ORDER BY COALESCE(numero, 9999), nome").all(t.id).map((x) => x.id), i = ativos.indexOf(a.id);
    return {
      aluno: { id: a.id, numero: a.numero, nome: a.nome, email: a.email, genero: a.genero, foto, estado: a.estado, estadoNome: ESTADOS[a.estado] || "", saiu_em: a.saiu_em, saiu_nota: a.saiu_nota },
      turma: { id: t.id, nome: t.nome, ano_letivo: t.ano_letivo }, escala, limites, periodos,
      anterior: i > 0 ? ativos[i - 1] : null, seguinte: i >= 0 && i < ativos.length - 1 ? ativos[i + 1] : null, posicao: i + 1, total: ativos.length,
      presencas: { aulas: pres.length, faltas: pres.filter((p) => p.estado === "F").map((p) => p.data), atrasos: pres.filter((p) => p.estado === "A").map((p) => p.data) },
      registos: { pos: reg.filter((r) => r.positivo).length, neg: reg.filter((r) => !r.positivo).length, tipos, ultimos: reg.slice(0, 12).map((r) => ({ data: r.data, tipo: r.tipo, positivo: !!r.positivo })) },
      observacoes: db.prepare("SELECT id, data, texto FROM observacoes WHERE aluno_id = ? ORDER BY data DESC, id DESC").all(a.id),
      outras: db.prepare("SELECT id, nome, ano_letivo FROM turmas WHERE prof_id = ? AND arquivada = 0 AND id <> ? ORDER BY ano, nome").all(c.p.id, t.id),
    };
  });

  // ---------- dados do aluno: nome, número, email, género e estado ----------
  rota("PATCH", "/api/alunos/:id", (c) => {
    const a = existe(alunoDe(c.p, c.id[0])), b = c.b || {};
    if (b.genero !== undefined) db.prepare("UPDATE alunos SET genero = ? WHERE id = ?").run(b.genero === "M" || b.genero === "F" ? b.genero : "", a.id);
    if (b.nome !== undefined) { const n = texto(b.nome, 120); if (!n) throw erro(400, "Escreve o nome do aluno."); db.prepare("UPDATE alunos SET nome = ? WHERE id = ?").run(n, a.id); }
    if (b.numero !== undefined) {
      const n = b.numero === null || b.numero === "" ? null : inteiro(b.numero);
      if (n !== null && (n < 1 || n > 999)) throw erro(400, "O número do aluno tem de ser de 1 a 999.");
      db.prepare("UPDATE alunos SET numero = ? WHERE id = ?").run(n, a.id);
    }
    if (b.email !== undefined) { const e = texto(b.email, 120).toLowerCase(); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw erro(400, "O email não parece válido."); db.prepare("UPDATE alunos SET email = ? WHERE id = ?").run(e, a.id); }
    if (b.estado !== undefined) {
      if (b.estado !== "" && b.estado !== "anulou" && b.estado !== "transferido") throw erro(400, "Estado inválido.");
      db.prepare("UPDATE alunos SET estado = ?, saiu_em = ?, saiu_nota = ? WHERE id = ?").run(b.estado, b.estado ? hoje() : null, b.estado ? texto(b.nota, 120) : "", a.id);
    }
    return { ok: true };
  });

  // ---------- numerar por ordem alfabética e corrigir as maiúsculas dos nomes ----------
  rota("POST", "/api/turmas/:id/alunos/numerar", (c) => {
    const t = turma(c), l = db.prepare("SELECT id, nome FROM alunos WHERE turma_id = ? AND estado = ''").all(t.id).sort((x, y) => x.nome.localeCompare(y.nome, "pt", { sensitivity: "base" }));
    const up = db.prepare("UPDATE alunos SET numero = ? WHERE id = ?");
    transacao(() => l.forEach((a, i) => up.run(i + 1, a.id)));
    return { numerados: l.length };
  });
  rota("POST", "/api/turmas/:id/alunos/nomes", (c) => {
    const t = turma(c), up = db.prepare("UPDATE alunos SET nome = ? WHERE id = ?"); let n = 0;
    transacao(() => { for (const a of db.prepare("SELECT id, nome FROM alunos WHERE turma_id = ?").all(t.id)) { const novo = nomeProprio(a.nome); if (novo !== a.nome) { up.run(novo, a.id); n++; } } });
    return { corrigidos: n };
  });

  // ---------- observações privadas ----------
  rota("POST", "/api/alunos/:id/observacoes", (c) => {
    const a = existe(alunoDe(c.p, c.id[0])), t = String(c.b.texto ?? "").trim().slice(0, 2000);
    if (!t) throw erro(400, "Escreve a observação.");
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(c.b.data || "")) ? c.b.data : hoje();
    if (db.prepare("SELECT COUNT(*) n FROM observacoes WHERE aluno_id = ?").get(a.id).n >= 200) throw erro(409, "Este aluno já tem 200 observações. Apaga as mais antigas.");
    return { id: Number(db.prepare("INSERT INTO observacoes (aluno_id, data, texto) VALUES (?, ?, ?)").run(a.id, data, t).lastInsertRowid), data, texto: t };
  });
  rota("DELETE", "/api/observacoes/:id", (c) => {
    const o = existe(db.prepare("SELECT o.id FROM observacoes o JOIN alunos a ON a.id = o.aluno_id JOIN turmas t ON t.id = a.turma_id WHERE o.id = ? AND t.prof_id = ?").get(c.id[0], c.p.id));
    db.prepare("DELETE FROM observacoes WHERE id = ?").run(o.id); return { ok: true };
  });

  // ---------- mudar de turma ----------
  // Os alunos passam para outra turma do mesmo docente. Na turma de origem ficam como «transferidos», com as notas guardadas.
  // `levar`: «nada» (só o aluno), «media» (a média de cada critério de testes, em cada período, numa avaliação «Média trazida de …»)
  // ou «testes» (a nota de cada teste: no teste com o mesmo título, se existir e não tiver grelha; senão num teste novo «… (de …)»,
  // que só conta para quem tem nota). O comportamento passa para o critério com o mesmo nome. Períodos fechados no destino ficam de fora.
  rota("POST", "/api/turmas/:id/alunos/mover", (c) => {
    const t = turma(c), d = existe(turmaDe(c.p, inteiro(c.b.destino)), "Escolhe a turma de destino.");
    if (d.id === t.id) throw erro(400, "A turma de destino é a mesma.");
    if (d.arquivada) throw erro(400, "A turma de destino está arquivada.");
    const levar = LEVAR.has(c.b.levar) ? c.b.levar : "nada";
    const ids = [...new Set((Array.isArray(c.b.alunos) ? c.b.alunos : []).map(inteiro))].slice(0, 100);
    const alunos = ids.map((id) => db.prepare("SELECT * FROM alunos WHERE id = ? AND turma_id = ? AND estado = ''").get(id, t.id)).filter(Boolean);
    if (!alunos.length) throw erro(400, "Escolhe pelo menos um aluno desta turma.");
    const po = periodosDe(t.id), pd = periodosDe(d.id), eo = esquemaDaTurma(t), ed = esquemaDaTurma(d);
    const critDestino = (k, tipo) => ed.criterios.find((x) => x.tipo === tipo && chave(x.nome) === chave(k.nome)) || (tipo === "testes" ? ed.criterios.find((x) => x.tipo === "testes") : null);
    const r = { movidos: 0, notas: 0, testesNovos: 0, comportamento: 0, fechados: [], semPeriodo: [] };
    const insNota = db.prepare("INSERT INTO notas (avaliacao_id, aluno_id, valor) VALUES (?, ?, ?) ON CONFLICT (avaliacao_id, aluno_id) DO UPDATE SET valor = excluded.valor");
    const novaAval = (perId, kId, titulo, origem) => {
      const ordem = db.prepare("SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM avaliacoes WHERE periodo_id = ?").get(perId).o;
      r.testesNovos++;
      return { id: Number(db.prepare("INSERT INTO avaliacoes (periodo_id, criterio_id, titulo, tipo, peso, maximo, data, ordem, trazida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)").run(perId, kId, titulo, origem.tipo || "teste", origem.peso > 0 ? origem.peso : 1, origem.maximo || 100, origem.data || null, ordem).lastInsertRowid), maximo: origem.maximo || 100 };
    };
    transacao(() => {
      const pautas = levar === "nada" ? [] : po.map((p) => dadosPauta(p));
      for (const a of alunos) {
        const livre = a.numero !== null && !db.prepare("SELECT 1 FROM alunos WHERE turma_id = ? AND estado = '' AND numero = ?").get(d.id, a.numero);
        const novo = Number(db.prepare("INSERT INTO alunos (turma_id, numero, nome, email, genero) VALUES (?, ?, ?, ?, ?)").run(d.id, livre ? a.numero : null, a.nome, a.email, a.genero).lastInsertRowid);
        db.prepare("INSERT INTO fotos (aluno_id, mime, dados, atualizada) SELECT ?, mime, dados, atualizada FROM fotos WHERE aluno_id = ?").run(novo, a.id);
        db.prepare("INSERT INTO observacoes (aluno_id, data, texto, criado) SELECT ?, data, texto, criado FROM observacoes WHERE aluno_id = ?").run(novo, a.id);
        pautas.forEach((dp, i) => {
          const linha = dp.alunos.find((x) => x.id === a.id), dest = pd[i];
          if (!linha) return;
          const temAlgo = dp.avaliacoes.some((x) => dp.notas[x.id + ":" + a.id] != null) || Object.keys(linha.niveis || {}).length;
          if (!temAlgo) return;
          if (!dest) { if (!r.semPeriodo.includes(po[i].nome)) r.semPeriodo.push(po[i].nome); return; }
          if (dest.fechado) { if (!r.fechados.includes(dest.nome)) r.fechados.push(dest.nome); return; }
          const por = (aval, valor, rotulo) => { insNota.run(aval.id, novo, valor); r.notas++; auditar(c, dest.id, a.nome, "Mudança de turma", rotulo, "", String(Math.round(valor * 100) / 100).replace(".", ",")); };
          if (levar === "testes") {
            for (const x of dp.avaliacoes) {
              const v = dp.notas[x.id + ":" + a.id]; if (v == null) continue;
              const k = critDestino(eo.criterios.find((y) => y.id === x.criterio_id) || {}, "testes"); if (!k) continue;
              const pct = v / x.maximo, daqui = db.prepare("SELECT a.id, a.titulo, a.maximo, a.trazida, (SELECT COUNT(*) FROM itens WHERE avaliacao_id = a.id) AS n_itens FROM avaliacoes a WHERE periodo_id = ?").all(dest.id);
              const trazido = `${x.titulo} (de ${t.nome})`.slice(0, 120);
              const igual = daqui.find((y) => !y.trazida && !y.n_itens && chave(y.titulo) === chave(x.titulo)) || daqui.find((y) => y.trazida && chave(y.titulo) === chave(trazido));
              const aval = igual || novaAval(dest.id, k.id, trazido, x);
              por(aval, Math.round(pct * aval.maximo * 100) / 100, aval.titulo || trazido);
            }
          } else {
            for (const k0 of eo.criterios.filter((y) => y.tipo === "testes")) {
              const m = linha.criterios[k0.id]; if (m == null) continue;
              const k = critDestino(k0, "testes"); if (!k) continue;
              const titulo = `Média trazida de ${t.nome}${eo.criterios.filter((y) => y.tipo === "testes").length > 1 ? ": " + k0.nome : ""}`.slice(0, 120);
              const igual = db.prepare("SELECT id, maximo, titulo FROM avaliacoes WHERE periodo_id = ? AND trazida = 1 AND criterio_id = ?").all(dest.id, k.id).find((y) => chave(y.titulo) === chave(titulo));
              por(igual || novaAval(dest.id, k.id, titulo, { maximo: 100, peso: 1 }), m, titulo);
            }
          }
          // Comportamento (critérios de nível): passa para o critério com o mesmo nome, se a turma de destino o tiver.
          for (const n of db.prepare("SELECT criterio_id k, nivel, pct FROM niveis WHERE periodo_id = ? AND aluno_id = ? AND nivel IS NOT NULL").all(po[i].id, a.id)) {
            const k = critDestino(eo.criterios.find((y) => y.id === n.k) || {}, "nivel"); if (!k) continue;
            db.prepare("INSERT INTO niveis (criterio_id, periodo_id, aluno_id, nivel, pct) VALUES (?, ?, ?, ?, ?) ON CONFLICT (criterio_id, periodo_id, aluno_id) DO UPDATE SET nivel = excluded.nivel, pct = excluded.pct").run(k.id, dest.id, novo, n.nivel, n.pct);
            r.comportamento++; auditar(c, dest.id, a.nome, "Mudança de turma", k.nome, "", n.pct != null ? String(n.pct).replace(".", ",") + " %" : String(n.nivel));
          }
        });
        db.prepare("UPDATE alunos SET estado = 'transferido', saiu_em = ?, saiu_nota = ? WHERE id = ?").run(hoje(), `Passou para ${d.nome}`.slice(0, 120), a.id);
        r.movidos++;
      }
    });
    return { ...r, destino: { id: d.id, nome: d.nome }, levar };
  });
}

module.exports = { registar, nomeProprio };
