"use strict";
// A turma como centro de gestão: separadores (Alunos, Pauta, Intercalares, Aula, Definições), alunos em cartões com a nota, as faltas,
// a participação e a intercalar, seleção de vários alunos, mudança de turma com ou sem notas, e a ficha de cada aluno (`#/aluno/:id`)
// com as notas de todos os períodos, a assiduidade, a participação e as observações privadas do docente.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v, casas = 1) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** casas) / 10 ** casas).replace(".", ","));
  const dataPt = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const limpo = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const notaCurta = (a, escala) => (a.final === null ? "Sem notas" : escala === "valores" ? `${a.valores} valores` : `Nível ${a.nivel}`);
  const SEP = [["", "Alunos"], ["pauta", "Pauta"], ["intercalares", "Intercalares"], ["aula", "Aula"], ["definicoes", "Definições"]];
  const estado = {}; // por turma: procura, filtro, ordem e período escolhidos (para não se perderem ao redesenhar)

  const janela = (classe, html) => {
    const dlg = document.createElement("dialog"); dlg.className = classe; dlg.innerHTML = html; document.body.append(dlg); dlg.showModal();
    const fechar = () => { try { dlg.close(); } catch { /* já fechada */ } dlg.remove(); };
    dlg.addEventListener("cancel", () => dlg.remove()); dlg.querySelectorAll("[data-fechar]").forEach((b) => { b.onclick = fechar; });
    return { dlg, fechar };
  };

  // ---------- mudar de turma ----------
  function janelaMover(turma, alunos, outras, depois) {
    if (!outras.length) return aviso("Não tens outra turma ativa para onde mudar o aluno. Cria primeiro a turma nova.", true);
    const { dlg, fechar } = janela("tu-dlg", `<h2>Mudar de turma</h2>
      <p>${alunos.length === 1 ? `<strong>${esc(alunos[0].nome)}</strong> sai de ${esc(turma.nome)}.` : `<strong>${alunos.length} alunos</strong> saem de ${esc(turma.nome)}: ${esc(alunos.map((a) => a.nome).join(", "))}.`}</p>
      <label>Para a turma<select id="mv-dest">${outras.map((t) => `<option value="${t.id}">${esc(t.nome)}${t.ano_letivo ? " · " + esc(t.ano_letivo) : ""}</option>`).join("")}</select></label>
      <fieldset class="tu-opcoes"><legend>O que levar para a turma nova?</legend>
        <label><input type="radio" name="levar" value="nada" checked><span><strong>Só o aluno</strong>Entra na turma nova sem notas.</span></label>
        <label><input type="radio" name="levar" value="media"><span><strong>A média atual</strong>Em cada período, a turma nova ganha a avaliação «Média trazida de ${esc(turma.nome)}», com a média dos testes do aluno.</span></label>
        <label><input type="radio" name="levar" value="testes"><span><strong>As notas de cada teste</strong>Cada nota vai para o teste com o mesmo nome na turma nova. Se lá não houver um teste igual, é criado um teste novo («Teste 1 (de ${esc(turma.nome)})») só com a nota deste aluno. Aos colegas não fica como nota em falta.</span></label>
      </fieldset>
      <p class="pequeno">Com a média ou com os testes, o comportamento também passa, se a turma nova tiver esse critério. A fotografia e as observações acompanham sempre o aluno. Em ${esc(turma.nome)} o aluno fica em «Saíram da turma», com as notas guardadas. Períodos fechados na turma nova ficam de fora.</p>
      <p class="linha"><button type="button" id="mv-ok">Mudar de turma</button><button type="button" class="sec" data-fechar>Cancelar</button></p>`);
    $("#mv-ok", dlg).onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await api("POST", `/api/turmas/${turma.id}/alunos/mover`, { alunos: alunos.map((a) => a.id), destino: Number($("#mv-dest", dlg).value), levar: dlg.querySelector("[name=levar]:checked").value });
        fechar();
        aviso(`${plural(r.movidos, "aluno passou", "alunos passaram")} para ${r.destino.nome}.${r.notas ? ` ${plural(r.notas, "nota copiada", "notas copiadas")}${r.testesNovos ? `, ${plural(r.testesNovos, "avaliação criada", "avaliações criadas")}` : ""}.` : ""}${r.fechados.length ? ` Ficou de fora: ${r.fechados.join(", ")} (fechado).` : ""}`);
        depois(r);
      } catch { e.target.disabled = false; }
    };
  }
  const sair = async (alunos) => {
    if (!confirm(`${alunos.length === 1 ? alunos[0].nome + " anulou" : alunos.length + " alunos anularam"} a matrícula ou saiu da escola?\n\nSai das listas e da pauta, mas as notas ficam guardadas em «Saíram da turma» e pode voltar.`)) return false;
    for (const a of alunos) await api("PATCH", "/api/alunos/" + a.id, { estado: "anulou" });
    return true;
  };
  const remover = async (alunos) => {
    if (!confirm(`Apagar ${alunos.length === 1 ? alunos[0].nome : alunos.length + " alunos"} e todas as suas notas, faltas e observações?\n\nNão se pode desfazer. Se o aluno só saiu da turma, usa «Saiu da turma»: as notas ficam guardadas.`)) return false;
    for (const a of alunos) await api("DELETE", "/api/alunos/" + a.id);
    return true;
  };

  const cabecalho = (t, sep) => `<p class="nao-imprimir"><a href="#/turmas">← Turmas</a></p>
    <h1 class="tu-titulo">${esc(t.nome)} <small class="pequeno">${esc(t.ano_letivo || "")}${t.arquivada ? " · arquivada" : ""}</small></h1>
    <nav class="tu-sep nao-imprimir" aria-label="Secções da turma">${SEP.map(([k, n]) => `<a href="#/turma/${t.id}${k ? "/" + k : ""}"${k === sep ? ' aria-current="page"' : ""}>${n}</a>`).join("")}</nav>`;

  // ---------- separador Alunos ----------
  const cartao = (a, d) => {
    const linhas = [];
    if (a.faltas || a.atrasos) linhas.push([a.faltas ? plural(a.faltas, "falta", "faltas") : "", a.atrasos ? plural(a.atrasos, "atraso", "atrasos") : ""].filter(Boolean).join(" · "));
    if (a.pos || a.neg) linhas.push(`Participação: ${a.pos} a favor${a.neg ? `, ${a.neg} a melhorar` : ""}`);
    if (a.inter) linhas.push(`${a.inter.n}.ª intercalar: ${esc(a.inter.nome)}`);
    const avisos = [];
    if (a.final !== null && a.emFalta) avisos.push(`<span class="tu-etq aviso">${plural(a.emFalta, "nota em falta", "notas em falta")}</span>`);
    if (a.obs) avisos.push(`<span class="tu-etq">${plural(a.obs, "observação", "observações")}</span>`);
    return `<article class="tu-cartao${a.nivel ? " n" + a.nivel : ""}" data-id="${a.id}">
      <label class="tu-marca" hidden><input type="checkbox" data-sel="${a.id}" aria-label="Selecionar ${esc(a.nome)}"></label>
      <a class="tu-abre" href="#/aluno/${a.id}" aria-label="Abrir a ficha de ${esc(a.nome)}">
        ${EINK.foto(a, "foto-ch")}
        <h3>${a.numero ? `<span class="tu-num">${a.numero}</span> ` : ""}${esc(a.nome)}</h3>
        <p class="tu-nota">${a.final === null ? '<span class="tu-niv">Sem notas</span>' : `<span class="tu-niv n${a.nivel}">${notaCurta(a, d.escala)}</span> <span class="pequeno">${num(a.final)} %${a.parcial ? " (parcial)" : ""} · ${esc(a.mencao)}</span>`}</p>
        ${EINK.escala(a.final, d.limites)}
        ${linhas.map((l) => `<p class="tu-linha">${l}</p>`).join("")}${avisos.length ? `<p class="tu-etqs">${avisos.join(" ")}</p>` : ""}
      </a></article>`;
  };
  const painelAdicionar = (vazia) => `<div id="tu-add-painel" class="tu-add"${vazia ? "" : " hidden"}>
      <form class="painel" id="f-alunos"><label>${vazia ? "Cola aqui a lista de alunos" : "Adicionar alunos"}: um por linha («12 Ana Silva»), ou cola do Excel (colunas número, nome e email)<textarea name="texto" placeholder="1 Ana Silva&#10;2 Bruno Costa"></textarea></label>
        <p class="linha"><label>Ou escolhe um ficheiro Excel (.xlsx) ou CSV<input type="file" id="f-ficheiro" accept=".xlsx,.csv,.txt"></label></p>
        <p class="pequeno">O ficheiro é lido e os nomes aparecem acima para os reveres antes de adicionares. Nomes só em minúsculas ou só em maiúsculas ficam com maiúscula inicial.</p><p><button>Adicionar alunos</button></p></form>
      ${vazia ? "" : `<details class="painel" id="fotos-pdf"><summary><strong>Fotografias da turma a partir de um PDF ou imagem</strong> <span class="pequeno">reconhece cada fotografia e o nome por baixo</span></summary>
        <p class="pequeno">Escolhe o PDF (ou uma imagem) com as fotografias da turma. Encontro as fotografias, leio os nomes e ligo cada uma ao aluno. Vês tudo antes de guardar. O ficheiro nunca sai do teu computador: só ficam guardados os recortes das fotografias.</p>
        <p class="linha"><label>PDF ou imagem da turma<input type="file" id="f-fotos-pdf" accept="application/pdf,image/*"></label></p><p id="fotos-pdf-estado" class="pequeno" role="status"></p><div id="fotos-pdf-res"></div></details>
      <details class="painel" id="fotos-lote"><summary><strong>Fotografias dos alunos (várias de uma vez)</strong> <span class="pequeno">o nome de cada ficheiro diz de quem é</span></summary>
        <p class="pequeno">Escolhe várias fotografias. Cada ficheiro deve chamar-se com o <strong>número do aluno</strong> (por exemplo <code>12.jpg</code>) ou com o <strong>nome</strong> (<code>Ana Silva.jpg</code>). Antes de guardar, vês a quem cada uma foi ligada e podes corrigir. As imagens são cortadas e reduzidas no navegador.</p>
        <p class="linha"><label>Fotografias<input type="file" id="f-fotos-lote" accept="image/*" multiple></label></p><div id="fotos-lote-res"></div></details>`}</div>`;

  async function alunos(id) {
    const e = estado[id] || (estado[id] = { q: "", filtro: "todos", ordem: "numero", periodo: 0, sel: false }); e.sel = false;
    const d = await api("GET", `/api/turmas/${id}/gestao${e.periodo ? "?periodo=" + e.periodo : ""}`), t = d.turma, vazia = !d.alunos.length;
    const comNota = d.alunos.filter((a) => a.final !== null), risco = d.alunos.filter((a) => a.nivel && a.nivel <= 2).length;
    const FILTROS = [["todos", "Todos"], ["risco", "Em risco de negativa"], ["semnotas", "Sem notas"], ["emfalta", "Com notas em falta"], ["faltas", "Com 3 ou mais faltas"], ["semfoto", "Sem fotografia"]];
    mostrar(`${cabecalho(t, "")}
      ${vazia ? `<div class="painel tu-vazio"><h2>Esta turma ainda não tem alunos</h2><p>Cola a lista em baixo, um aluno por linha. Depois aparecem aqui em cartões, com a nota, as faltas e a fotografia de cada um.</p></div>` : `
      <p class="tu-resumo">${plural(d.alunos.length, "aluno", "alunos")}${d.periodo ? ` · ${esc(d.periodo.nome)}` : ""}${comNota.length ? ` · média ${num(comNota.reduce((z, a) => z + a.final, 0) / comNota.length)} %` : ""}${risco ? ` · <button type="button" class="ligacao" data-ir-filtro="risco">${risco} em risco de negativa</button>` : ""}</p>
      <div class="painel tu-barra nao-imprimir">
        <label class="tu-procura">Procurar aluno<input type="search" id="tu-q" value="${esc(e.q)}" placeholder="Nome ou número" autocomplete="off"></label>
        <label>Mostrar<select id="tu-filtro">${FILTROS.map(([k, n]) => `<option value="${k}"${k === e.filtro ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Ordenar por<select id="tu-ordem">${[["numero", "Número"], ["nome", "Nome"], ["nota", "Nota (mais baixa primeiro)"]].map(([k, n]) => `<option value="${k}"${k === e.ordem ? " selected" : ""}>${n}</option>`).join("")}</select></label>
        ${d.periodos.length > 1 ? `<label>Notas do<select id="tu-per">${d.periodos.map((p) => `<option value="${p.id}"${d.periodo && p.id === d.periodo.id ? " selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></label>` : ""}
        <span class="tu-botoes"><button type="button" id="tu-add">Adicionar alunos ou fotografias</button><button type="button" class="sec" id="tu-selecionar" aria-pressed="false">Selecionar vários</button>
          <details class="tu-mais"><summary class="botao sec">Mais</summary><div><button type="button" class="ligacao" id="tu-numerar">Numerar por ordem alfabética</button><button type="button" class="ligacao" id="tu-nomes">Corrigir as maiúsculas dos nomes</button><button type="button" class="ligacao" id="tu-imprimir">Imprimir a lista</button></div></details></span>
      </div>
      <div class="painel tu-lote nao-imprimir" id="tu-lote" hidden><strong id="tu-lote-n">0 selecionados</strong><button type="button" class="sec" id="tu-todos">Selecionar todos os que estão à vista</button><button type="button" id="tu-mover">Mudar de turma</button><button type="button" class="sec" id="tu-sair">Saíram da turma</button><button type="button" class="perigo" id="tu-remover">Apagar</button></div>`}
      ${painelAdicionar(vazia)}
      <div id="tu-cartoes" class="tu-cartoes"></div><p id="tu-nenhum" class="painel" hidden>Nenhum aluno corresponde ao que escolheste. <button type="button" class="ligacao" data-ir-filtro="todos">Mostrar todos</button></p>
      ${d.inativos.length ? `<details class="painel nao-imprimir" id="tu-sairam"><summary><strong>Saíram da turma (${d.inativos.length})</strong> <span class="pequeno">as notas ficam guardadas</span></summary><ul class="lista">${d.inativos.map((a) => `<li><span><a href="#/aluno/${a.id}"><strong>${esc(a.nome)}</strong></a> <span class="pequeno">${esc(a.estadoNome)}${a.saiu_em ? " em " + dataPt(a.saiu_em) : ""}${a.saiu_nota ? " · " + esc(a.saiu_nota) : ""}</span></span><button type="button" class="sec" data-voltar="${a.id}">Voltar a pôr na turma</button></li>`).join("")}</ul></details>` : ""}`);

    const recarregar = () => alunos(id), porId = new Map(d.alunos.map((a) => [a.id, a]));
    const escolhidos = () => $$("#tu-cartoes [data-sel]:checked").map((x) => porId.get(Number(x.dataset.sel)));
    const contar = () => { const n = escolhidos().length; $("#tu-lote-n").textContent = plural(n, "selecionado", "selecionados"); $$("#tu-mover, #tu-sair, #tu-remover").forEach((b) => { b.disabled = !n; }); };
    const pintar = () => {
      const pal = limpo(e.q).split(/\s+/).filter(Boolean);
      const passa = { todos: () => true, risco: (a) => a.nivel && a.nivel <= 2, semnotas: (a) => a.final === null, emfalta: (a) => a.emFalta > 0 && d.avaliacoes > 0, faltas: (a) => a.faltas >= 3, semfoto: (a) => !a.foto }[e.filtro] || (() => true);
      const l = d.alunos.filter((a) => passa(a) && pal.every((p) => limpo(`${a.numero ?? ""} ${a.nome}`).includes(p)));
      if (e.ordem === "nome") l.sort((x, y) => x.nome.localeCompare(y.nome, "pt", { sensitivity: "base" }));
      if (e.ordem === "nota") l.sort((x, y) => (x.final ?? 999) - (y.final ?? 999));
      $("#tu-cartoes").innerHTML = l.map((a) => cartao(a, d)).join("");
      $("#tu-nenhum").hidden = vazia || l.length > 0;
      $("#tu-cartoes").classList.toggle("a-selecionar", e.sel);
      $$("#tu-cartoes .tu-marca").forEach((m) => { m.hidden = !e.sel; });
      $$("#tu-cartoes .tu-abre").forEach((lig) => { lig.onclick = (ev) => { if (!e.sel) return; ev.preventDefault(); const cx = lig.parentNode.querySelector("[data-sel]"); cx.checked = !cx.checked; lig.parentNode.classList.toggle("escolhido", cx.checked); contar(); }; });
      $$("#tu-cartoes [data-sel]").forEach((cx) => { cx.onchange = () => { cx.closest(".tu-cartao").classList.toggle("escolhido", cx.checked); contar(); }; });
      if (!vazia) contar();
    };
    pintar();
    document.querySelectorAll("#vista [data-ir-filtro]").forEach((b) => { b.onclick = () => { e.filtro = b.dataset.irFiltro; e.q = ""; if ($("#tu-filtro")) { $("#tu-filtro").value = e.filtro; $("#tu-q").value = ""; } pintar(); }; });
    if (!vazia) {
      $("#tu-q").oninput = (ev) => { e.q = ev.target.value; pintar(); };
      $("#tu-filtro").onchange = (ev) => { e.filtro = ev.target.value; pintar(); };
      $("#tu-ordem").onchange = (ev) => { e.ordem = ev.target.value; pintar(); };
      if ($("#tu-per")) $("#tu-per").onchange = (ev) => { e.periodo = Number(ev.target.value); recarregar(); };
      $("#tu-add").onclick = () => { const p = $("#tu-add-painel"); p.hidden = !p.hidden; if (!p.hidden) { p.scrollIntoView({ block: "nearest" }); $("#f-alunos textarea").focus(); } };
      $("#tu-selecionar").onclick = (ev) => { e.sel = !e.sel; ev.target.setAttribute("aria-pressed", String(e.sel)); ev.target.textContent = e.sel ? "Terminar a seleção" : "Selecionar vários"; $("#tu-lote").hidden = !e.sel; pintar(); };
      $("#tu-todos").onclick = () => { $$("#tu-cartoes [data-sel]").forEach((cx) => { cx.checked = true; cx.closest(".tu-cartao").classList.add("escolhido"); }); contar(); };
      $("#tu-mover").onclick = () => janelaMover(t, escolhidos(), d.outras, recarregar);
      $("#tu-sair").onclick = async () => { if (await sair(escolhidos())) { aviso("Feito. Estão em «Saíram da turma»."); recarregar(); } };
      $("#tu-remover").onclick = async () => { if (await remover(escolhidos())) { aviso("Alunos apagados."); recarregar(); } };
      $("#tu-numerar").onclick = async () => { if (!confirm("Numerar os alunos de 1 em diante, por ordem alfabética? Os números atuais são substituídos.")) return; const r = await api("POST", `/api/turmas/${id}/alunos/numerar`, {}); aviso(`${r.numerados} alunos numerados.`); recarregar(); };
      $("#tu-nomes").onclick = async () => { const r = await api("POST", `/api/turmas/${id}/alunos/nomes`, {}); aviso(r.corrigidos ? `${plural(r.corrigidos, "nome corrigido", "nomes corrigidos")}.` : "Os nomes já estavam bem escritos."); recarregar(); };
      $("#tu-imprimir").onclick = () => window.print();
    }
    $$("[data-voltar]").forEach((b) => { b.onclick = async () => { await api("PATCH", "/api/alunos/" + b.dataset.voltar, { estado: "" }); aviso("O aluno voltou à turma."); recarregar(); }; });
    $("#f-ficheiro").onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      if (f.size > 700000) return aviso("O ficheiro é demasiado grande (máximo 700 KB).", true);
      const b = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192));
      try { const r = await api("POST", "/api/importar/alunos", { nome: f.name, base64: btoa(bin) }); $("#f-alunos textarea").value = r.texto; aviso(`${r.total} alunos lidos. Revê e carrega em «Adicionar alunos».`); } catch { /* aviso mostrado */ }
    };
    $("#f-alunos").onsubmit = async (ev) => { ev.preventDefault(); const r = await api("POST", `/api/turmas/${id}/alunos`, { texto: new FormData(ev.target).get("texto") }); aviso(`${r.adicionados} alunos adicionados.`); recarregar(); };
    if (!vazia) { if (EINK.ligarFotosLote) EINK.ligarFotosLote(d.alunos, id); if (EINK.ligarFotosPdf) EINK.ligarFotosPdf(d.alunos, recarregar); }
  }

  // ---------- separadores Pauta, Intercalares, Aula e Definições ----------
  async function separador(id, sep) {
    const t = await api("GET", "/api/turmas/" + id), semAlunos = !t.alunos.length;
    const falta = semAlunos ? `<p class="painel tu-vazio">Esta turma ainda não tem alunos. <a href="#/turma/${id}">Adiciona os alunos</a> antes de lançares notas.</p>` : "";
    let corpo = "";
    if (sep === "pauta") corpo = `${falta}<div class="painel"><ul class="lista">${t.periodos.map((p) => `<li><a href="#/pauta/${p.id}"><strong>${esc(p.nome)}</strong></a>${p.fechado ? '<span class="pequeno">fechado</span>' : ""}<a class="botao${p.fechado ? " sec" : ""}" href="#/pauta/${p.id}">Abrir pauta</a></li>`).join("")}</ul>
        <form class="linha" id="f-periodo"><label>Novo período<input name="nome" required maxlength="60" placeholder="Por exemplo: Recuperação"></label><button class="sec">Adicionar</button></form></div>
        <p class="pequeno">Na pauta crias os testes e trabalhos, lanças as notas e vês a nota final de cada aluno.</p>`;
    if (sep === "intercalares") corpo = `${falta}<div class="painel"><ul class="lista">${t.periodos.map((p) => `<li><strong>${esc(p.nome)}</strong><span class="linha"><a class="botao sec" href="#/intercalares/${p.id}/1">1.ª intercalar</a><a class="botao sec" href="#/intercalares/${p.id}/2">2.ª intercalar</a></span></li>`).join("")}</ul></div>
        <p class="pequeno">Em cada intercalar escreves a menção e a descritiva de cada aluno. «Propor menções pelas notas» preenche tudo a partir da pauta.</p>`;
    if (sep === "aula") corpo = `<p class="pequeno">Abre uma ferramenta já com esta turma escolhida.</p><div class="cartoes">${EINK.FERRAMENTAS.filter((f) => ["#/aula", "#/chamada", "#/mapa", "#/sorteio", "#/lembretes", "#/participacao"].includes(f[3])).map((f) => `<a class="cartao" href="${f[3]}" data-com-turma><span class="icone" aria-hidden="true">${f[0]}</span><span>${f[1]}<small>${f[2]}</small></span></a>`).join("")}</div><p><a href="#/sala">Todas as ferramentas de sala de aula</a></p>`;
    if (sep === "definicoes") corpo = `<h2>Critérios de avaliação · ${esc(t.grupo.nome)} · ${t.grupo.ano ? t.grupo.ano + ".º ano" : "todos os anos"}</h2>
        <div class="painel"><ul class="lista">${t.grupo.criterios.map((k) => `<li><span>${esc(k.nome)} <span class="pequeno">${k.tipo === "nivel" ? "nível dado por ti" : "média dos testes e trabalhos que lançares"}</span></span><strong>${k.peso} %</strong></li>`).join("")}</ul>
          <p class="pequeno">Definidos pelo administrador para esta disciplina e ano. A nota final é a média destes critérios pelos seus pesos.</p></div>
        <h2>Arquivar ou apagar</h2><div class="painel"><p class="pequeno">Arquivar guarda a turma e tira-a das listas (por exemplo no fim do ano). Apagar elimina os alunos e todas as notas, sem volta.</p>
          <p class="linha"><button class="sec" id="arquivar-turma">${t.arquivada ? "Voltar a ativar a turma" : "Arquivar turma"}</button><button class="perigo" id="apagar-turma">Apagar turma</button></p></div>`;
    mostrar(cabecalho(t, sep) + corpo);
    if (sep === "pauta") $("#f-periodo").onsubmit = async (ev) => { ev.preventDefault(); await api("POST", `/api/turmas/${id}/periodos`, { nome: new FormData(ev.target).get("nome") }); separador(id, sep); };
    if (sep === "aula") $$("[data-com-turma]").forEach((a) => { a.onclick = () => EINK.guardar("turma", id); });
    if (sep === "definicoes") {
      $("#arquivar-turma").onclick = async () => { await api("POST", `/api/turmas/${id}/arquivar`, { arquivada: !t.arquivada }); location.hash = "#/turmas"; };
      $("#apagar-turma").onclick = async () => { if (confirm(`Apagar a turma ${t.nome}, os alunos e todas as notas? Não se pode desfazer.`)) { await api("DELETE", "/api/turmas/" + id); location.hash = "#/turmas"; } };
    }
  }

  // ---------- ficha do aluno ----------
  async function ficha(id) {
    const f = await api("GET", `/api/alunos/${id}/ficha`), a = f.aluno, t = f.turma, val = f.escala === "valores", recarregar = () => ficha(id);
    const nivelTxt = (p) => (p.final === null ? "Sem notas" : val ? `${p.valores} valores` : `Nível ${p.nivel}`);
    const nivelDe = (pct) => (pct === null || pct === undefined ? 0 : 1 + f.limites.filter((x) => pct >= x).length);
    const comDados = f.periodos.filter((p) => p.final !== null || p.intercalares.length || p.criterios.some((k) => k.avaliacoes.length));
    const periodo = (p) => `<section class="painel fi-periodo"><h3>${esc(p.nome)}${p.fechado ? ' <span class="pequeno">fechado</span>' : ""} <span class="tu-niv${p.nivel ? " n" + p.nivel : ""}">${nivelTxt(p)}</span>${p.final !== null ? ` <span class="pequeno">${num(p.final)} %${p.parcial ? " (parcial)" : ""} · ${esc(p.mencao)}</span>` : ""}</h3>
      ${EINK.escala(p.final, f.limites, { grande: true })}
      <div class="tabela-rolagem"><table class="fi-tabela"><thead><tr><th>Avaliação</th><th class="num">Nota</th><th class="num">%</th></tr></thead><tbody>${p.criterios.map((k) => k.tipo === "nivel"
        ? `<tr class="fi-crit"><th>${esc(k.nome)} <span class="pequeno">${k.peso} %</span></th><td class="num">${k.nivel ? "Nível " + k.nivel : "–"}</td><td class="num">${k.media === null ? "" : num(k.media)}</td></tr>`
        : `${k.avaliacoes.map((x) => `<tr><td>${esc(x.titulo)}${x.data ? ` <span class="pequeno">${dataPt(x.data)}</span>` : ""}${x.grelha ? ` <a class="pequeno nao-imprimir" href="#/grelha/${x.id}">grelha</a>` : ""}</td><td class="num">${x.valor === null ? '<span class="pequeno">sem nota</span>' : `${num(x.valor, 2)} <span class="pequeno">em ${num(x.maximo)}</span>`}</td><td class="num"><span class="${x.pct === null ? "" : "tu-niv n" + nivelDe(x.pct)}">${x.pct === null ? "" : num(x.pct)}</span></td></tr>`).join("") || `<tr><td colspan="3" class="pequeno">Sem avaliações em «${esc(k.nome)}».</td></tr>`}
           <tr class="fi-crit"><th>Média de ${esc(k.nome)} <span class="pequeno">${k.peso} %</span></th><td></td><td class="num">${k.media === null ? "–" : num(k.media)}</td></tr>`).join("")}</tbody></table></div>
      ${p.intercalares.map((i) => `<div class="fi-inter"><strong>${i.n}.ª intercalar${i.nome ? ": " + esc(i.nome) : ""}</strong>${i.descritiva ? `<p>${esc(i.descritiva)}</p>` : ""}</div>`).join("")}
      <p class="nao-imprimir"><a href="#/pauta/${p.id}">Abrir a pauta do ${esc(p.nome)}</a></p></section>`;
    mostrar(`<p class="nao-imprimir fi-topo"><a href="#/turma/${t.id}">← ${esc(t.nome)}</a>${a.estado ? "" : `<span class="fi-nav">${f.anterior ? `<a class="botao sec" href="#/aluno/${f.anterior}" id="fi-ant">← Anterior</a>` : ""}<span class="pequeno">${f.posicao} de ${f.total}</span>${f.seguinte ? `<a class="botao sec" href="#/aluno/${f.seguinte}" id="fi-seg">Seguinte →</a>` : ""}</span>`}</p>
      <header class="fi-cab">${EINK.fotoAluno(a, "foto-g")}<div><h1>${esc(a.nome)}</h1>
        <p class="pequeno">${a.numero ? "N.º " + a.numero + " · " : ""}${esc(t.nome)}${t.ano_letivo ? " · " + esc(t.ano_letivo) : ""}${a.email ? " · " + esc(a.email) : ""}</p>
        ${a.estado ? `<p class="banner-fechado">${esc(a.estadoNome)}${a.saiu_em ? " em " + dataPt(a.saiu_em) : ""}${a.saiu_nota ? ". " + esc(a.saiu_nota) : ""}. Já não está nas listas nem na pauta desta turma; as notas ficaram guardadas.</p>` : ""}</div></header>
      <p class="linha nao-imprimir fi-acoes"><button type="button" class="sec" id="fi-editar">Corrigir nome e número</button>${a.estado ? '<button type="button" id="fi-voltar">Voltar a pôr na turma</button>' : '<button type="button" class="sec" id="fi-mover">Mudar de turma</button><button type="button" class="sec" id="fi-sair">Saiu da turma</button>'}<button type="button" class="sec" id="fi-imprimir">Imprimir a ficha</button>
        <details class="tu-mais"><summary class="botao sec">Mais</summary><div><button type="button" class="ligacao perigo-txt" id="fi-apagar">Apagar o aluno e as notas</button></div></details></p>
      <h2>Notas</h2>${comDados.length ? comDados.map(periodo).join("") : `<p class="painel tu-vazio">Ainda não há notas deste aluno. As notas lançam-se na <a href="#/turma/${t.id}/pauta">pauta</a>.</p>`}
      <h2>Assiduidade</h2><div class="painel">${f.presencas.aulas ? `<p><strong>${plural(f.presencas.faltas.length, "falta", "faltas")}</strong> e <strong>${plural(f.presencas.atrasos.length, "atraso", "atrasos")}</strong> em ${plural(f.presencas.aulas, "aula com chamada", "aulas com chamada")}.</p>${f.presencas.faltas.length ? `<p class="pequeno">Faltas: ${f.presencas.faltas.map(dataPt).join(", ")}</p>` : ""}${f.presencas.atrasos.length ? `<p class="pequeno">Atrasos: ${f.presencas.atrasos.map(dataPt).join(", ")}</p>` : ""}` : '<p class="pequeno">Sem chamadas registadas. A chamada faz-se em «Sala de aula».</p>'}</div>
      <h2>Participação</h2><div class="painel">${f.registos.pos + f.registos.neg ? `<p><strong>${f.registos.pos}</strong> a favor e <strong>${f.registos.neg}</strong> a melhorar.</p><p class="pequeno">${Object.entries(f.registos.tipos).map(([k, n]) => `${esc(k)}: ${n}`).join(" · ")}</p><p class="pequeno">Últimos: ${f.registos.ultimos.map((r) => `${dataPt(r.data)} ${esc(r.tipo)}`).join("; ")}</p>` : '<p class="pequeno">Sem registos de participação.</p>'}</div>
      <h2 id="fi-obs-tit">Observações privadas</h2><div class="painel" id="fi-obs">
        <p class="aviso-privado pequeno">Só tu vês estas observações. Não aparecem no projetor, nas exportações nem a colegas, e apagam-se com o aluno. Escreve só o que precisas para acompanhar o aluno.</p>
        <form id="f-obs" class="nao-imprimir"><label>Nova observação<textarea name="texto" rows="3" maxlength="2000" required placeholder="Por exemplo: falei com a encarregada de educação sobre os trabalhos de casa."></textarea></label>
          <p class="linha"><label>Data<input type="date" name="data" value="${EINK.hoje()}" max="${EINK.hoje()}"></label><button>Guardar observação</button></p></form>
        <ul class="fi-obs-lista">${f.observacoes.map((o) => `<li><span class="pequeno">${dataPt(o.data)}</span><p>${esc(o.texto)}</p><button type="button" class="ligacao nao-imprimir" data-obs="${o.id}" aria-label="Apagar a observação de ${dataPt(o.data)}">Apagar</button></li>`).join("") || '<li class="pequeno">Ainda sem observações.</li>'}</ul></div>`);
    document.querySelectorAll("#vista [data-foto]").forEach((b) => { b.onclick = () => EINK.janelaFoto(a, recarregar); });
    $("#fi-imprimir").onclick = () => window.print();
    $("#fi-editar").onclick = () => {
      const { dlg, fechar } = janela("tu-dlg", `<h2>Dados do aluno</h2><form id="f-dados"><label>Nome<input name="nome" required maxlength="120" value="${esc(a.nome)}"></label>
        <p class="linha"><label>Número<input name="numero" type="number" min="1" max="999" value="${a.numero ?? ""}"></label><label>Género (para os textos das intercalares)<select name="genero"><option value="">Não indicar</option><option value="F"${a.genero === "F" ? " selected" : ""}>Feminino</option><option value="M"${a.genero === "M" ? " selected" : ""}>Masculino</option></select></label></p>
        <label>Email (opcional)<input name="email" type="email" maxlength="120" value="${esc(a.email || "")}"></label>
        <p class="linha"><button>Guardar</button><button type="button" class="sec" data-fechar>Cancelar</button></p></form>`);
      $("#f-dados", dlg).onsubmit = async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target); await api("PATCH", "/api/alunos/" + id, { nome: fd.get("nome"), numero: fd.get("numero") === "" ? null : Number(fd.get("numero")), genero: fd.get("genero"), email: fd.get("email") }); fechar(); aviso("Dados guardados."); recarregar(); };
    };
    if ($("#fi-mover")) $("#fi-mover").onclick = () => janelaMover(t, [a], f.outras, () => { location.hash = "#/turma/" + t.id; });
    if ($("#fi-sair")) $("#fi-sair").onclick = async () => { if (await sair([a])) { aviso("Feito. Está em «Saíram da turma»."); location.hash = "#/turma/" + t.id; } };
    if ($("#fi-voltar")) $("#fi-voltar").onclick = async () => { await api("PATCH", "/api/alunos/" + id, { estado: "" }); aviso("O aluno voltou à turma."); recarregar(); };
    $("#fi-apagar").onclick = async () => { if (await remover([a])) { aviso("Aluno apagado."); location.hash = "#/turma/" + t.id; } };
    $("#f-obs").onsubmit = async (ev) => { ev.preventDefault(); const fd = new FormData(ev.target); await api("POST", `/api/alunos/${id}/observacoes`, { texto: fd.get("texto"), data: fd.get("data") }); aviso("Observação guardada."); recarregar(); };
    $$("[data-obs]").forEach((b) => { b.onclick = async () => { if (confirm("Apagar esta observação?")) { await api("DELETE", "/api/observacoes/" + b.dataset.obs); recarregar(); } }; });
  }

  EINK.turmaVista = alunos;
  EINK.rotas.push([/^\/turma\/(\d+)\/(pauta|intercalares|aula|definicoes)$/, (id, sep) => separador(+id, sep)], [/^\/aluno\/(\d+)$/, (id) => ficha(+id)]);
})();
