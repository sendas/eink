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
    const somaPesos = (k) => doCrit(k).reduce((z, a) => z + a.peso, 0);

    // Cabeçalho em duas linhas: critério (com o seu peso na nota final) e, por baixo, as avaliações dele e a média.
    const l1 = d.criterios.map((k) => `<th class="crit" colspan="${k.tipo === "nivel" ? 1 : doCrit(k).length + 1}" scope="colgroup">${esc(k.nome)} <span class="pequeno">${k.peso} %</span></th>`).join("");
    const l2 = d.criterios.map((k) => {
      if (k.tipo === "nivel") return `<th scope="col">Nível 1 a 5</th>`;
      const sp = somaPesos(k);
      return doCrit(k).map((a) => `<th class="num" scope="col">${esc(a.titulo)}<br><span class="pequeno">${esc(a.tipo)} · máx. ${a.maximo}${a.data ? " · " + esc(a.data) : ""}<br>peso ${num(a.peso)}${sp ? ` (${num((a.peso / sp) * 100, 0)} % do critério)` : ""}</span><br>
        <a class="botao sec" href="#/grelha/${a.id}">${a.n_itens ? `Grelha (${a.n_itens})` : "Grelha"}</a> ${fechado || a.n_itens ? "" : `<button class="sec" data-imp="${a.id}">Importar notas</button> `}${fechado ? "" : `<button class="sec" data-peso="${a.id}" data-p="${a.peso}">Peso</button> <button class="perigo" data-del="${a.id}" aria-label="Apagar ${esc(a.titulo)}">✕</button>`}</th>`).join("") + `<th class="num" scope="col">Média %</th>`;
    }).join("");

    const linhas = d.alunos.map((al) => `<tr data-aluno="${al.id}"><td class="num">${al.numero ?? ""}</td><th scope="row">${esc(al.nome)}</th>
      ${d.criterios.map((k) => {
        if (k.tipo === "nivel") return `<td><select ${dis} data-nivel="${k.id}" data-aluno="${al.id}" aria-label="${esc(k.nome)} de ${esc(al.nome)}"><option value="">–</option>${[1, 2, 3, 4, 5].map((n) => `<option ${al.niveis[k.id] === n ? "selected" : ""}>${n}</option>`).join("")}</select></td>`;
        return doCrit(k).map((a) => { const v = d.notas[a.id + ":" + al.id]; return `<td><input class="nota" inputmode="decimal" ${a.n_itens ? 'disabled title="Nota calculada pela grelha"' : dis} data-aval="${a.id}" data-aluno="${al.id}" value="${v === undefined ? "" : num(v, 2)}" aria-label="Nota de ${esc(al.nome)} em ${esc(a.titulo)}"></td>`; }).join("") + `<td class="num" data-c="crit-${k.id}"></td>`;
      }).join("")}
      <td class="num" data-c="final"></td><td class="num" data-c="nivel"></td><td data-c="mencao"></td></tr>`).join("");
    const nCols = 2 + d.criterios.reduce((z, k) => z + (k.tipo === "nivel" ? 1 : doCrit(k).length + 1), 0) + 3;

    mostrar(`<p><a href="#/turma/${d.periodo.turma_id}">← Turma</a></p><h1>${esc(d.periodo.nome)} <small class="pequeno">${esc(d.grupo.nome)} · ${d.grupo.ano ? d.grupo.ano + ".º ano" : "todos os anos"}</small></h1>
      ${fechado ? `<p class="banner-fechado" role="status"><strong>Período fechado</strong> pelo administrador${d.periodo.fechado_em ? " em " + esc(d.periodo.fechado_em.slice(0, 10)) : ""}: as notas estão bloqueadas. Podes consultar, exportar e ver o histórico.</p>` : `<form class="painel linha" id="f-aval">
        <label>Título<input name="titulo" required maxlength="80" placeholder="Teste 1"></label>
        <label>Critério<select name="criterio">${testes.map((k) => `<option value="${k.id}">${esc(k.nome)} (${k.peso} %)</option>`).join("")}</select></label>
        <label>Tipo<select name="tipo"><option>teste</option><option>trabalho</option><option>ficha</option><option>oral</option><option>outro</option></select></label>
        <label>Peso no critério<input name="peso" type="number" min="0" max="100" step="any" value="1" style="width:6rem"></label>
        <label>Máximo<input name="maximo" type="number" min="1" step="any" value="100" style="width:6rem"></label>
        <label>Data<input name="data" type="date"></label>
        <button>Adicionar avaliação</button>
      </form>`}
      <p class="pequeno">Podes lançar vários testes em cada critério. Dentro do critério a média é ponderada pelo «peso no critério» (por exemplo, um teste com peso 2 conta o dobro de um com peso 1); a nota final junta os critérios pelos pesos definidos pelo administrador (${d.criterios.map((k) => `${esc(k.nome)} ${k.peso} %`).join(", ")}). Escreve «15», «15,5» ou «15/20». Um asterisco (*) na nota final quer dizer que falta algum critério. A nota final arredonda-se a ${casas} casa${casas === 1 ? "" : "s"} decimal${casas === 1 ? "" : "is"}. Para um teste com várias questões, abre a «Grelha»: defines as cotações e lanças a pontuação de cada aluno em cada questão.</p>
      <div class="tabela-rolagem"><table><thead><tr><th rowspan="2" class="num" scope="col">N.º</th><th rowspan="2" scope="col">Aluno</th>${l1}<th rowspan="2" class="num" scope="col">Final %</th><th rowspan="2" class="num" scope="col">Nível</th><th rowspan="2" scope="col">Menção</th></tr><tr>${l2}</tr></thead>
      <tbody>${linhas || `<tr><td colspan="${nCols}">Adiciona alunos à turma.</td></tr>`}</tbody></table></div>
      <p class="linha"><a class="botao" href="#/intercalares/${id}">Avaliações intercalares</a><a class="botao sec" href="/api/periodos/${id}/pauta.xlsx">Descarregar Excel (.xlsx)</a><a class="botao sec" href="/api/periodos/${id}/pauta.csv">Descarregar CSV</a><button class="sec" id="hist-bot" type="button">Histórico de alterações</button></p><div id="hist"></div>`);
    $("#hist-bot").onclick = async () => {
      const h = await api("GET", `/api/periodos/${id}/auditoria`);
      $("#hist").innerHTML = `<h2>Histórico de alterações</h2>` + (h.length ? `<div class="tabela-rolagem"><table class="hist-lista"><thead><tr><th>Quando</th><th>Quem</th><th>Aluno</th><th>O quê</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${h.map((x) => `<tr><td>${esc(x.quando)}</td><td>${esc(x.quem)}</td><td>${esc(x.aluno)}</td><td>${esc(x.acao)}${x.detalhe ? " · " + esc(x.detalhe) : ""}</td><td>${esc(x.antes)}</td><td>${esc(x.depois)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="pequeno">Ainda não há alterações.</p>');
    };

    const pintar = (dd) => dd.alunos.forEach((al) => {
      const tr = $(`tr[data-aluno="${al.id}"]`); if (!tr) return;
      for (const k of testes) $(`[data-c="crit-${k.id}"]`, tr).textContent = num(al.criterios[k.id], casas);
      $('[data-c="final"]', tr).textContent = al.final === null ? "" : num(al.final, casas) + (al.parcial ? "*" : "");
      $('[data-c="nivel"]', tr).textContent = al.nivel ?? ""; $('[data-c="mencao"]', tr).textContent = al.mencao;
      tr.className = al.nivel ? "n" + al.nivel : "";
    });
    pintar(d);
    const recalcular = async () => pintar(await api("GET", `/api/periodos/${id}/pauta`));

    if (!fechado) $("#f-aval").onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      await api("POST", `/api/periodos/${id}/avaliacoes`, { ...f, criterio: Number(f.criterio), peso: Number(f.peso), maximo: Number(f.maximo) }); pautaVista(id);
    };
    $$("input.nota").forEach((i) => { i.onchange = async () => {
      try { await api("PUT", `/api/avaliacoes/${i.dataset.aval}/notas`, { linhas: [{ aluno: Number(i.dataset.aluno), nota: i.value }] }); await recalcular(); }
      catch { i.focus(); }
    }; });
    $$("[data-nivel]").forEach((s) => { s.onchange = async () => { await api("PUT", `/api/periodos/${id}/niveis`, { criterio: Number(s.dataset.nivel), aluno: Number(s.dataset.aluno), nivel: s.value || null }); await recalcular(); }; });
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
