"use strict";
// Escolha das disciplinas que o docente leciona: primeiro o ciclo, depois as disciplinas (pode escolher várias).
(() => {
  const { api, aviso, esc, $, $$ } = EINK;
  const CICLOS = [["1", "1.º ciclo"], ["2", "2.º ciclo"], ["3", "3.º ciclo"], ["sec", "Secundário"], ["prof", "Cursos profissionais"], ["todas", "Todas"]];
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const noCiclo = (d, c) => c === "todas" || (c === "prof" ? d.profissional : !d.profissional && d.anos.some((a) => (c === "1" ? a <= 4 : c === "2" ? a >= 5 && a <= 6 : c === "3" ? a >= 7 && a <= 9 : a >= 10)));
  const anosTxt = (a) => (a.length ? a.map((x) => x + ".º").join(", ") + " ano" : "sem anos");

  EINK.escolherDisciplinas = async (depois) => {
    const todas = await api("GET", "/api/disciplinas"), sel = new Set(todas.filter((d) => d.escolhida).map((d) => d.id));
    let ciclo = (() => { const p = todas.find((d) => sel.has(d.id)); return p ? (CICLOS.find(([c]) => noCiclo(p, c)) || ["3"])[0] : "3"; })(), busca = "";
    const dlg = document.createElement("dialog"); dlg.className = "disc-dlg";
    dlg.innerHTML = `<h2 style="margin-top:0">As tuas disciplinas</h2><p class="pequeno">Escolhe o ciclo e marca as disciplinas que lecionas. Podes escolher várias. Os critérios de avaliação aparecem na página inicial e usam-se nas turmas novas.</p>
      <div class="disc-ciclos" role="group" aria-label="Ciclo">${CICLOS.map(([c, n]) => `<button type="button" class="sec" data-ciclo="${c}">${n}</button>`).join("")}</div>
      <label>Procurar disciplina<input type="search" id="disc-busca" placeholder="Escreve parte do nome"></label>
      <ul class="disc-lista" id="disc-lista"></ul><p class="pequeno" id="disc-conta"></p>
      <p class="linha"><button type="button" id="disc-ok">Guardar</button><button type="button" class="sec" id="disc-nao">Cancelar</button></p>`;
    document.body.append(dlg); dlg.showModal();
    const conta = () => { $("#disc-conta", dlg).textContent = sel.size ? `${sel.size} disciplina${sel.size === 1 ? "" : "s"} escolhida${sel.size === 1 ? "" : "s"}: ${todas.filter((d) => sel.has(d.id)).map((d) => d.nome).join(", ")}` : "Ainda não escolheste nenhuma."; };
    const desenhar = () => {
      $$("[data-ciclo]", dlg).forEach((b) => b.classList.toggle("ativo", b.dataset.ciclo === ciclo && !busca));
      const lista = todas.filter((d) => (busca ? norm(d.nome).includes(norm(busca)) : noCiclo(d, ciclo)));
      $("#disc-lista", dlg).innerHTML = lista.map((d) => `<li><label class="disc-item"><input type="checkbox" data-id="${d.id}" ${sel.has(d.id) ? "checked" : ""}><span><strong>${esc(d.nome)}</strong> <small class="pequeno">${esc(anosTxt(d.anos))}${d.profissional ? " · curso profissional" : ""}${d.documentos ? ` · ${d.documentos} PDF` : ""}</small></span></label></li>`).join("") || '<li class="pequeno" style="padding:.7rem">Nenhuma disciplina neste ciclo. Experimenta «Todas» ou a procura.</li>';
      $$("#disc-lista input", dlg).forEach((i) => { i.onchange = () => { const id = Number(i.dataset.id); if (i.checked) sel.add(id); else sel.delete(id); conta(); }; });
      conta();
    };
    $$("[data-ciclo]", dlg).forEach((b) => { b.onclick = () => { ciclo = b.dataset.ciclo; busca = ""; $("#disc-busca", dlg).value = ""; desenhar(); }; });
    $("#disc-busca", dlg).oninput = (e) => { busca = e.target.value.trim(); desenhar(); };
    const fechar = () => { dlg.close(); dlg.remove(); };
    $("#disc-nao", dlg).onclick = fechar; dlg.addEventListener("cancel", () => dlg.remove());
    $("#disc-ok", dlg).onclick = async () => { try { await api("PUT", "/api/eu/disciplinas", { ids: [...sel] }); aviso("Disciplinas guardadas."); fechar(); if (depois) depois(); } catch { /* aviso mostrado */ } };
    desenhar();
  };
})();
