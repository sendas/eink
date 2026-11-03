"use strict";
// Pauta de um período: avaliações agrupadas pelos critérios que o administrador definiu para o grupo disciplinar da turma.
(() => {
  const { api, mostrar, esc, $, $$ } = EINK;
  const num = (v, casas = 2) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** casas) / 10 ** casas).replace(".", ","));

  async function pautaVista(id) {
    const d = await api("GET", `/api/periodos/${id}/pauta`);
    const testes = d.criterios.filter((k) => k.tipo === "testes");
    const doCrit = (k) => d.avaliacoes.filter((a) => a.criterio_id === k.id);
    const casas = d.grupo.casas, fechado = !!d.periodo.fechado, dis = fechado ? "disabled" : "";
    const modo = EINK.eu.comp_escala || "nivel", pct = modo === "pct"; // escala do comportamento escolhida pelo docente (1 a 5, 0 a 100 % ou automática)
    const dicaComp = pct ? "Escreve uma percentagem de 0 a 100 (por exemplo 85)" : modo === "auto" ? "Um inteiro de 1 a 5 é um nível; qualquer outro valor, ou com %, é uma percentagem de 0 a 100 (para 4 %, escreve 4 %)" : "Escreve um nível de 1 a 5";
    const somaPesos = (k) => doCrit(k).reduce((z, a) => z + a.peso, 0);

    // Cabeçalho em duas linhas: critério (com o seu peso na nota final) e, por baixo, as avaliações dele e a média.
    const g = (gi) => "g" + (gi % 3);
    const l1 = d.criterios.map((k, gi) => `<th class="crit ini fim ${g(gi)}" colspan="${k.tipo === "nivel" ? 1 : doCrit(k).length + 1}" scope="colgroup"><span class="nome-crit">${esc(k.nome)}</span> <span class="peso-crit">${k.peso} %</span></th>`).join("");
    const l2 = d.criterios.map((k, gi) => {
      if (k.tipo === "nivel") return `<th scope="col" class="ini fim ${g(gi)}" title="${dicaComp}">${pct ? "0 a 100 %" : modo === "auto" ? "1 a 5 ou %" : "Nível 1 a 5"}</th>`;
      const sp = somaPesos(k);
      return doCrit(k).map((a, ai) => `<th class="col-av ${g(gi)}${ai === 0 ? " ini" : ""}" scope="col" title="${esc(a.titulo)} · ${esc(a.tipo)} · máx. ${a.maximo}${a.data ? " · " + esc(a.data) : ""} · peso ${num(a.peso)}${sp ? ` (${num((a.peso / sp) * 100, 0)} % do critério)` : ""}">
        <div class="av-tit"><a href="#/grelha/${a.id}" title="Abrir a grelha de ${esc(a.titulo)}">${esc(a.titulo)}</a></div><div class="av-sub">${esc(a.tipo)} · /${a.maximo}${sp ? ` · ${num((a.peso / sp) * 100, 0)} %` : ""}${a.n_itens ? ` · ${a.n_itens} q.` : ""}</div>
        <details class="menu-col"><summary aria-label="Opções de ${esc(a.titulo)}">⋯</summary><div class="menu-col-lista">
          <a class="botao sec" href="#/grelha/${a.id}">${a.n_itens ? `Grelha (${a.n_itens})` : "Grelha"}</a>${fechado || a.n_itens ? "" : `<button class="sec" data-imp="${a.id}">Importar notas</button>`}${fechado ? "" : `<button class="sec" data-peso="${a.id}" data-p="${a.peso}">Peso (${num(a.peso)})</button><button class="perigo" data-del="${a.id}">Apagar</button>`}</div></details></th>`).join("") + `<th class="num fim ${g(gi)}${doCrit(k).length ? "" : " ini"}" scope="col">Média %</th>`;
    }).join("");

    const fp = (v) => String(v).replace(".", ",");
    const normComp = (v) => { const t = String(v ?? "").trim().replace(",", "."), m = /^(\d+(?:\.\d+)?)\s*(%?)$/.exec(t); if (!m) return t; const n = Number(m[1]); const nivel = !m[2] && Number.isInteger(n) && n >= 1 && n <= 5 && modo !== "pct"; return nivel ? String(n) : fp(Math.round(n * 100) / 100) + " %"; };
    const marcarComp = (el) => { el.classList.toggle("comp-pct", /%$/.test(el.value)); };
    const compTxt = (al, k) => (al.compPct && al.compPct[k.id] !== undefined ? fp(al.compPct[k.id]) + " %" : al.niveis[k.id] ?? "");
    const lerLS = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch { return def; } };
    const fotosOn = lerLS("eink.fotos", "1") === "1", vistaCart = lerLS("eink.pautaVista", "tabela") === "cartoes";
    const linhas = d.alunos.map((al) => `<tr data-aluno="${al.id}"><td class="num">${al.numero ?? ""}</td><th scope="row"><span class="aluno-nome">${esc(al.nome)}</span>${fotosOn ? `<div class="foto-linha">${EINK.fotoAluno(al)}</div>` : ""}</th>
      ${d.criterios.map((k, gi) => {
        if (k.tipo === "nivel") return `<td class="ini fim ${g(gi)}"><input class="nota${compTxt(al, k).endsWith("%") ? " comp-pct" : ""}" ${dis} data-nivel="${k.id}" data-aluno="${al.id}" inputmode="decimal" autocomplete="off" title="${dicaComp}" value="${esc(compTxt(al, k))}" aria-label="${esc(k.nome)} de ${esc(al.nome)}"></td>`;
        const av = doCrit(k);
        return av.map((a, ai) => { const v = d.notas[a.id + ":" + al.id]; return `<td class="${g(gi)}${ai === 0 ? " ini" : ""}"><input class="nota" inputmode="decimal" ${a.n_itens ? 'disabled title="Nota calculada pela grelha"' : dis} data-aval="${a.id}" data-aluno="${al.id}" value="${v === undefined ? "" : num(v, 2)}" aria-label="Nota de ${esc(al.nome)} em ${esc(a.titulo)}"></td>`; }).join("") + `<td class="num fim ${g(gi)}${av.length ? "" : " ini"}" data-c="crit-${k.id}"></td>`;
      }).join("")}
      <td class="num res-ini" data-c="final"></td><td class="num" data-c="nivel"></td><td data-c="mencao"></td></tr>`).join("");
    const nCols = 2 + d.criterios.reduce((z, k) => z + (k.tipo === "nivel" ? 1 : doCrit(k).length + 1), 0) + 3;

    mostrar(`<p class="linha"><a href="#/turma/${d.periodo.turma_id}">← Turma</a><span id="troca"></span></p><h1>${esc(d.periodo.turma_nome)} · ${esc(d.periodo.nome)} <small class="pequeno">${esc(d.grupo.nome)} · ${d.grupo.ano ? d.grupo.ano + ".º ano" : "todos os anos"}</small></h1>
      ${fechado ? `<p class="banner-fechado" role="status"><strong>Período fechado</strong> pelo administrador${d.periodo.fechado_em ? " em " + esc(d.periodo.fechado_em.slice(0, 10)) : ""}: as notas estão bloqueadas. Podes consultar, exportar e ver o histórico.</p>` : `<details class="painel nova-aval" ${innerWidth > 760 ? "open" : ""}><summary><strong>Adicionar avaliação</strong> <span class="pequeno">teste, ficha ou trabalho</span></summary><form class="linha" id="f-aval">
        <label>Título<input name="titulo" required maxlength="80" placeholder="Teste 1"></label>
        <label>Critério<select name="criterio">${testes.map((k) => `<option value="${k.id}">${esc(k.nome)} (${k.peso} %)</option>`).join("")}</select></label>
        <label>Tipo<select name="tipo"><option>teste</option><option>trabalho</option><option>ficha</option><option>oral</option><option>outro</option></select></label>
        <label>Peso no critério<input name="peso" type="number" min="0" max="100" step="any" value="1" style="width:6rem"></label>
        <label>Máximo<input name="maximo" type="number" min="1" step="any" value="100" style="width:6rem"></label>
        <label>Data<input name="data" type="date"></label>
        <button>Adicionar avaliação</button>
      </form></details>`}
      <details class="painel como-funciona"><summary><strong>Como funciona</strong> <span class="pequeno">notas, pesos e arredondamentos</span></summary><p class="pequeno">Podes lançar vários testes em cada critério. Dentro do critério a média é ponderada pelo «peso no critério» (por exemplo, um teste com peso 2 conta o dobro de um com peso 1); a nota final junta os critérios pelos pesos definidos pelo administrador (${d.criterios.map((k) => `${esc(k.nome)} ${k.peso} %`).join(", ")}). Escreve «15», «15,5» ou «15/20». Um asterisco (*) na nota final quer dizer que falta algum critério. A nota final arredonda-se a ${casas} casa${casas === 1 ? "" : "s"} decimal${casas === 1 ? "" : "is"}. Para um teste com várias questões, abre a «Grelha»: defines as cotações e lanças a pontuação de cada aluno em cada questão.</p></details>
      <div class="resumo-pauta" id="resumo-pauta"></div>
      <div class="barra-pauta"><div class="troca-vista" role="group" aria-label="Vista da pauta"><button type="button" class="sec ${vistaCart ? "" : "ativo"}" data-vista="tabela">Tabela</button><button type="button" class="sec ${vistaCart ? "ativo" : ""}" data-vista="cartoes">Pauta final em cartões</button></div>
        <div class="troca-vista" role="group" aria-label="Escala do comportamento"><span class="pequeno" style="align-self:center;padding:0 .4rem">Comportamento</span><button type="button" class="sec ${modo === "nivel" ? "ativo" : ""}" data-escala="nivel">1 a 5</button><button type="button" class="sec ${pct ? "ativo" : ""}" data-escala="pct">0 a 100 %</button><button type="button" class="sec ${modo === "auto" ? "ativo" : ""}" data-escala="auto" title="Um inteiro de 1 a 5 é nível; o resto é percentagem">Automático</button></div>
        <label class="linha"><input type="checkbox" id="ver-fotos" ${fotosOn ? "checked" : ""}> Mostrar fotografias</label></div>
      <div class="tabela-rolagem"><table><thead><tr><th rowspan="2" class="num" scope="col">N.º</th><th rowspan="2" scope="col">Aluno</th>${l1}<th rowspan="2" class="num res-ini" scope="col">Final %</th><th rowspan="2" class="num" scope="col">Nível</th><th rowspan="2" scope="col">Menção</th></tr><tr>${l2}</tr></thead>
      <tbody>${linhas || `<tr><td colspan="${nCols}">Adiciona alunos à turma.</td></tr>`}</tbody></table></div>
      <div id="cartoes-final" class="cartoes-final" ${vistaCart ? "" : "hidden"}></div>
      <p class="linha"><a class="botao" href="#/intercalares/${id}">Avaliações intercalares</a><a class="botao sec" href="/api/periodos/${id}/pauta.xlsx">Descarregar Excel (.xlsx)</a><a class="botao sec" href="/api/periodos/${id}/pauta.csv">Descarregar CSV</a><button class="sec" id="hist-bot" type="button">Histórico de alterações</button></p><div id="hist"></div>`);
    EINK.lembrarPauta(id, `${d.periodo.turma_nome || ""} ${d.periodo.nome}`.trim()); if ($("#troca")) EINK.trocaPauta($("#troca"), id);
    $("#hist-bot").onclick = async () => {
      const h = await api("GET", `/api/periodos/${id}/auditoria`);
      $("#hist").innerHTML = `<h2>Histórico de alterações</h2>` + (h.length ? `<div class="tabela-rolagem"><table class="hist-lista"><thead><tr><th>Quando</th><th>Quem</th><th>Aluno</th><th>O quê</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${h.map((x) => `<tr><td>${esc(x.quando)}</td><td>${esc(x.quem)}</td><td>${esc(x.aluno)}</td><td>${esc(x.acao)}${x.detalhe ? " · " + esc(x.detalhe) : ""}</td><td>${esc(x.antes)}</td><td>${esc(x.depois)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="pequeno">Ainda não há alterações.</p>');
    };

    const pintar = (dd) => dd.alunos.forEach((al) => {
      const tr = $(`tr[data-aluno="${al.id}"]`); if (!tr) return;
      for (const k of testes) $(`[data-c="crit-${k.id}"]`, tr).textContent = num(al.criterios[k.id], casas);
      $('[data-c="final"]', tr).innerHTML = al.final === null ? "" : `<span class="fin-n">${num(al.final, casas)}${al.parcial ? "*" : ""}</span>${EINK.escala(al.final, dd.limites)}`;
      $('[data-c="nivel"]', tr).textContent = al.nivel ?? ""; $('[data-c="mencao"]', tr).textContent = al.mencao;
      tr.className = al.nivel ? "n" + al.nivel : "";
    });
    const ligarFotos = () => $$("[data-foto]").forEach((b) => { b.onclick = () => { const al = d.alunos.find((x) => x.id === Number(b.dataset.foto)); if (al) EINK.janelaFoto(al, () => pautaVista(id)); }; });
    const cartoesFinal = (dd) => { const alvo = $("#cartoes-final"); if (!alvo) return;
      alvo.innerHTML = dd.alunos.map((al) => `<article class="aluno-cartao">${fotosOn ? EINK.fotoAluno(al, "foto-g") : ""}<h3>${esc(al.nome)}</h3><p class="pequeno">${al.numero ? "N.º " + al.numero : "&nbsp;"}</p>
        <div class="aluno-final"><strong>${al.final === null ? "–" : num(al.final, casas)}</strong><span>%${al.parcial ? " *" : ""}</span></div>${EINK.escala(al.final, dd.limites, { grande: true })}
        <p class="aluno-mencao">${al.nivel ? `<span class="lv lv${al.nivel}"></span> Nível ${al.nivel} · ${esc(al.mencao || "")}` : "Sem nota final"}</p></article>`).join("") || '<p class="pequeno">Adiciona alunos à turma.</p>';
      ligarFotos(); };
    const aplicarVista = (v) => { try { localStorage.setItem("eink.pautaVista", v); } catch { /* sem armazenamento */ }
      $(".tabela-rolagem").hidden = v === "cartoes"; $("#cartoes-final").hidden = v !== "cartoes"; $$("[data-vista]").forEach((b) => b.classList.toggle("ativo", b.dataset.vista === v)); };
    $$("[data-vista]").forEach((b) => { b.onclick = () => aplicarVista(b.dataset.vista); });
    $$("[data-escala]").forEach((b) => { b.onclick = async () => { if (b.dataset.escala === modo) return; await api("PUT", "/api/eu/comportamento", { escala: b.dataset.escala }); EINK.eu.comp_escala = b.dataset.escala; pautaVista(id); }; });
    $("#ver-fotos").onchange = (e) => { try { localStorage.setItem("eink.fotos", e.target.checked ? "1" : "0"); } catch { /* sem armazenamento */ } pautaVista(id); };
    // Resumo em números grandes: média da turma, alunos por nível e notas lançadas.
    const resumo = (dd) => {
      const fin = dd.alunos.filter((a) => a.final !== null), niv = [0, 0, 0, 0, 0];
      dd.alunos.forEach((a) => { if (a.nivel) niv[a.nivel - 1]++; });
      const media = fin.length ? fin.reduce((z, a) => z + a.final, 0) / fin.length : null, esp = dd.avaliacoes.length * dd.alunos.length, lanc = Object.keys(dd.notas).length, pc = esp ? Math.round((lanc / esp) * 100) : 0, ac = niv[0] + niv[1];
      $("#resumo-pauta").innerHTML = `<div><span class="rotulo">Média da turma</span><strong class="grande-n">${media === null ? "–" : num(media, 1)}<small> %</small></strong><span class="pequeno">${fin.length} de ${dd.alunos.length} alunos com nota final</span></div>
        <div><span class="rotulo">Alunos por nível</span>${niv.some((x) => x) ? `<div class="niveis">${niv.map((x, i) => (x ? `<span class="lv lv${i + 1}" style="flex:${x}" title="Nível ${i + 1}: ${x}">${x}</span>` : "")).join("")}</div><div class="niveis-leg">${[1, 2, 3, 4, 5].map((i) => `<span><i class="lv lv${i}"></i>${i}</span>`).join("")}</div>` : '<span class="pequeno">Sem níveis ainda.</span>'}</div>
        <div><span class="rotulo">Notas lançadas</span><strong class="grande-n">${pc}<small> %</small></strong><div class="progresso"><div style="width:${pc}%"></div></div><span class="pequeno">${lanc} de ${esp}${ac ? ` · ${ac} aluno${ac === 1 ? "" : "s"} a acompanhar` : ""}</span></div>`;
    };
    pintar(d); resumo(d); cartoesFinal(d); ligarFotos(); aplicarVista(vistaCart ? "cartoes" : "tabela");
    const recalcular = async () => { const dd = await api("GET", `/api/periodos/${id}/pauta`); pintar(dd); resumo(dd); cartoesFinal(dd); };

    if (!fechado) $("#f-aval").onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      await api("POST", `/api/periodos/${id}/avaliacoes`, { ...f, criterio: Number(f.criterio), peso: Number(f.peso), maximo: Number(f.maximo) }); pautaVista(id);
    };
    $$("input.nota").forEach((i) => { i.onchange = async () => {
      try { await api("PUT", `/api/avaliacoes/${i.dataset.aval}/notas`, { linhas: [{ aluno: Number(i.dataset.aluno), nota: i.value }] }); await recalcular(); }
      catch { i.focus(); }
    }; });
    $$("[data-nivel]").forEach((s) => { s.dataset.ant = s.value; s.onchange = async () => { try { await api("PUT", `/api/periodos/${id}/niveis`, { criterio: Number(s.dataset.nivel), aluno: Number(s.dataset.aluno), valor: s.value }); } catch { s.value = s.dataset.ant; return; } s.value = s.value.trim() ? normComp(s.value) : ""; marcarComp(s); s.dataset.ant = s.value; await recalcular(); }; });
    // Menus «⋯» dos cabeçalhos: abrem por cima da tabela (posição fixa), um de cada vez, e fecham ao clicar fora.
    $$("details.menu-col").forEach((m) => { m.addEventListener("toggle", () => {
      if (!m.open) return;
      $$("details.menu-col").forEach((o) => { if (o !== m) o.open = false; });
      const r = $("summary", m).getBoundingClientRect(), l = $(".menu-col-lista", m);
      l.style.top = r.bottom + 4 + "px"; l.style.left = Math.max(8, Math.min(r.left, innerWidth - 190)) + "px";
    }); });
    document.addEventListener("click", (e) => { if (!e.target.closest("details.menu-col")) $$("details.menu-col[open]").forEach((m) => { m.open = false; }); });
    const tabelaP = $(".tabela-rolagem table");
    if (tabelaP && !fechado) EINK.folha(tabelaP, { aplicar: async (lista) => {
      const por = new Map();
      for (const x of lista) {
        const el = x.el, antes = el.value; el.value = x.valor;
        if (el.dataset.nivel) { try { await api("PUT", `/api/periodos/${id}/niveis`, { criterio: Number(el.dataset.nivel), aluno: Number(el.dataset.aluno), valor: x.valor }); el.value = x.valor.trim() ? normComp(x.valor) : ""; marcarComp(el); el.dataset.ant = el.value; } catch { el.value = antes; } }
        else { if (!por.has(el.dataset.aval)) por.set(el.dataset.aval, []); por.get(el.dataset.aval).push({ el, antes, aluno: Number(el.dataset.aluno), nota: x.valor }); }
      }
      for (const [aval, l] of por) {
        try { for (let i = 0; i < l.length; i += 150) await api("PUT", `/api/avaliacoes/${aval}/notas`, { linhas: l.slice(i, i + 150).map((y) => ({ aluno: y.aluno, nota: y.nota })) }); }
        catch { l.forEach((y) => { y.el.value = y.antes; }); }
      }
      await recalcular();
    } });
    $$("[data-imp]").forEach((b) => { b.onclick = () => importarNotas(Number(b.dataset.imp), d.avaliacoes.find((x) => x.id === Number(b.dataset.imp)), () => pautaVista(id)); });
    $$("[data-del]").forEach((b) => { b.onclick = async () => { if (confirm("Apagar esta avaliação e as notas?")) { await api("DELETE", "/api/avaliacoes/" + b.dataset.del); pautaVista(id); } }; });
    $$("[data-peso]").forEach((b) => { b.onclick = async () => { const v = prompt("Peso dentro do critério (1 = normal, 2 = conta o dobro)", b.dataset.p); if (v !== null) { await api("PATCH", "/api/avaliacoes/" + b.dataset.peso, { peso: Number(String(v).replace(",", ".")) }); pautaVista(id); } }; });
  }

  // Importar notas de um teste (colar do Excel ou escolher um ficheiro): mostra o que vai acontecer antes de gravar.
  function importarNotas(avalId, av, depois) {
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `<h2 style="margin-top:0">Importar notas: ${esc(av.titulo)}</h2>
      <p class="pequeno">Cola do Excel colunas com número, nome e nota (ou só nome e nota), ou escolhe um ficheiro .xlsx ou .csv. As notas vão de 0 a ${av.maximo}; também se aceita «15/20». Os alunos são associados pelo número e pelo nome.</p>
      <textarea id="imp-texto" rows="6" placeholder="1&#9;Ana Silva&#9;15,5&#10;2&#9;Bruno Costa&#9;12"></textarea>
      <p class="linha"><label>Ou ficheiro<input type="file" id="imp-fich" accept=".xlsx,.csv,.txt"></label><button type="button" id="imp-ver">Ver o que vai acontecer</button><button type="button" class="sec" id="imp-cancelar">Cancelar</button></p><div id="imp-res"></div>`;
    document.body.append(dlg); dlg.showModal();
    let ficheiro = null;
    const fechar = () => { dlg.close(); dlg.remove(); };
    $("#imp-cancelar", dlg).onclick = fechar;
    $("#imp-fich", dlg).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 600000) { aviso("O ficheiro é demasiado grande (máximo 600 KB).", true); return; }
      const bytes = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      ficheiro = { nome: f.name, base64: btoa(bin) };
    };
    $("#imp-ver", dlg).onclick = async () => {
      try {
        const r = await api("POST", `/api/avaliacoes/${avalId}/notas/importar`, ficheiro ? ficheiro : { texto: $("#imp-texto", dlg).value });
        $("#imp-res", dlg).innerHTML = `<div class="tabela-rolagem" style="max-height:18rem"><table><thead><tr><th>N.º</th><th>Aluno</th><th class="num">Nota</th><th>Estado</th></tr></thead><tbody>${r.linhas.map((l) => `<tr class="${l.ok ? "" : "n1"}"><td>${l.numero ?? ""}</td><td>${esc(l.nome)}</td><td class="num">${esc(l.nota)}</td><td>${l.ok ? "Importar" : esc(l.motivo)}</td></tr>`).join("")}</tbody></table></div>
          <p>${r.aplicaveis} nota(s) para importar${r.alunosSemLinha.length ? ` · ${r.alunosSemLinha.length} aluno(s) da turma sem linha no ficheiro` : ""}.</p><p><button type="button" id="imp-ok" ${r.aplicaveis ? "" : "disabled"}>Importar ${r.aplicaveis} nota(s)</button></p>`;
        const ok = $("#imp-ok", dlg);
        if (ok) ok.onclick = async () => {
          const linhas = r.linhas.filter((l) => l.ok).map((l) => ({ aluno: l.aluno, nota: l.nota }));
          try { for (let i = 0; i < linhas.length; i += 150) await api("PUT", `/api/avaliacoes/${avalId}/notas`, { linhas: linhas.slice(i, i + 150) }); aviso(`${linhas.length} nota(s) importada(s).`); fechar(); depois(); } catch { /* aviso mostrado */ }
        };
      } catch { /* aviso mostrado */ }
    };
  }

  EINK.rotas.push([/^\/pauta\/(\d+)$/, (id) => pautaVista(+id)]);
})();
