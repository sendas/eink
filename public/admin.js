"use strict";
// Administração: docentes com acesso e critérios de avaliação de cada grupo disciplinar.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;

  async function docentes() {
    const [l, grupos] = await Promise.all([api("GET", "/api/admin/professores"), api("GET", "/api/grupos")]);
    mostrar(`<h1>Docentes com acesso</h1>
      ${EINK.eu.grupoDocentes ? `<p class="painel">O acesso é dado pelo grupo «docentes» do Entra ID: quem pertence ao grupo entra e aparece aqui ao fazer o primeiro acesso; quem sai do grupo deixa de poder entrar. Aqui só se escolhe o grupo disciplinar de cada docente.</p>`
        : `<form class="painel linha" id="f-prof"><label>Email da escola<input name="upn" type="email" required placeholder="nome@escola.pt"></label><label>Nome<input name="nome" maxlength="120"></label><button>Dar acesso</button></form>`}
      <div class="painel"><ul class="lista">${l.map((p) => `<li><span>${esc(p.upn)} ${p.admin ? "· administrador" : ""} ${p.ativo ? "" : "· desativado"}</span>
        <span class="linha">${p.ativo ? `<label>Grupo disciplinar<select data-grupo="${p.id}"><option value="">–</option>${grupos.map((g) => `<option value="${g.id}" ${g.id === p.grupo_id ? "selected" : ""}>${esc(g.nome)}</option>`).join("")}</select></label>` : ""}
        ${p.ativo && p.upn !== EINK.eu.upn ? `<button class="perigo" data-off="${p.id}">Retirar acesso</button>` : ""}</span></li>`).join("")}</ul></div>`);
    if ($("#f-prof")) $("#f-prof").onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); await api("POST", "/api/admin/professores", { upn: f.get("upn"), nome: f.get("nome") }); docentes(); };
    $$("[data-off]").forEach((b) => { b.onclick = async () => { if (confirm("Retirar o acesso a este docente?")) { await api("DELETE", "/api/admin/professores/" + b.dataset.off); docentes(); } }; });
    $$("[data-grupo]").forEach((s) => { s.onchange = async () => { await api("PUT", `/api/admin/professores/${s.dataset.grupo}/grupo`, { grupo_id: s.value ? Number(s.value) : null }); aviso("Grupo guardado."); }; });
  }

  // ---------- critérios por grupo disciplinar ----------
  const linhaCrit = (k) => `<tr data-id="${k.id ?? ""}" data-tipo="${k.tipo}">
    <td><input class="c-nome" value="${esc(k.nome)}" maxlength="60" aria-label="Nome do critério"></td>
    <td><input class="c-peso nota" type="number" min="1" max="100" step="any" value="${k.peso}" aria-label="Peso em %"> %</td>
    <td>${k.tipo === "nivel" ? "Nível 1 a 5 (docente)" : "Testes e trabalhos"}</td>
    <td><button class="perigo c-del" type="button" aria-label="Retirar critério">✕</button></td></tr>`;

  async function criterios() {
    const grupos = await api("GET", "/api/grupos");
    mostrar(`<h1>Critérios de avaliação</h1>
      <p class="pequeno">Cada grupo disciplinar tem os seus critérios. Os docentes lançam testes e trabalhos dentro dos critérios de «testes»; a nota final é a média ponderada dos critérios. Os pesos têm de somar 100 %.</p>
      <form class="painel linha" id="f-grupo"><label>Novo grupo disciplinar<input name="nome" required maxlength="60" placeholder="550 Informática"></label><button>Criar grupo</button></form>
      ${grupos.map((g) => `<section class="painel" data-grupo="${g.id}"><div class="linha"><label>Grupo<input class="g-nome" value="${esc(g.nome)}" maxlength="60"></label>
        <label>Nota final com<select class="g-casas"><option value="1" ${g.casas === 1 ? "selected" : ""}>1 casa decimal</option><option value="2" ${g.casas === 2 ? "selected" : ""}>2 casas decimais</option></select></label>
        <button class="perigo g-del" type="button">Apagar grupo</button></div>
        <table><thead><tr><th>Critério</th><th>Peso</th><th>Tipo</th><th></th></tr></thead><tbody>${g.criterios.map(linhaCrit).join("")}</tbody></table>
        <p class="linha"><button class="sec c-add-t" type="button">+ Critério de testes</button><button class="sec c-add-n" type="button">+ Critério de nível 1 a 5</button></p>
        <p class="g-soma"></p><p><button class="g-gravar" type="button">Guardar critérios</button></p></section>`).join("")}`);

    $("#f-grupo").onsubmit = async (e) => { e.preventDefault(); await api("POST", "/api/admin/grupos", { nome: new FormData(e.target).get("nome") }); criterios(); };
    $$("section[data-grupo]").forEach((sec) => {
      const gid = Number(sec.dataset.grupo), corpo = $("tbody", sec);
      const lerLinhas = () => $$("tr", corpo).map((tr) => ({ id: tr.dataset.id ? Number(tr.dataset.id) : undefined, tipo: tr.dataset.tipo, nome: $(".c-nome", tr).value, peso: Number($(".c-peso", tr).value) }));
      const soma = () => {
        const s = Math.round(lerLinhas().reduce((z, k) => z + (k.peso || 0), 0) * 100) / 100;
        const el = $(".g-soma", sec); el.textContent = s === 100 ? "Total: 100 % ✓" : `Total: ${String(s).replace(".", ",")} % (tem de dar 100 %)`; el.style.color = s === 100 ? "var(--ok)" : "var(--erro)";
      };
      const ligar = () => { $$(".c-del", corpo).forEach((b) => { b.onclick = () => { b.closest("tr").remove(); soma(); }; }); $$(".c-peso", corpo).forEach((i) => { i.oninput = soma; }); };
      const juntar = (tipo, nome) => { corpo.insertAdjacentHTML("beforeend", linhaCrit({ nome, peso: 0, tipo })); ligar(); soma(); };
      $(".c-add-t", sec).onclick = () => juntar("testes", "Novo critério");
      $(".c-add-n", sec).onclick = () => juntar("nivel", "Novo critério de nível");
      $(".g-gravar", sec).onclick = async () => { try { await api("PUT", "/api/admin/grupos/" + gid, { nome: $(".g-nome", sec).value, casas: Number($(".g-casas", sec).value), criterios: lerLinhas() }); aviso("Critérios guardados. As pautas dos docentes já usam os novos pesos."); criterios(); } catch { /* aviso mostrado */ } };
      $(".g-del", sec).onclick = async () => { if (confirm("Apagar este grupo disciplinar?")) { try { await api("DELETE", "/api/admin/grupos/" + gid); criterios(); } catch { /* aviso mostrado */ } } };
      ligar(); soma();
    });
  }

  EINK.rotas.push([/^\/admin$/, docentes], [/^\/criterios$/, criterios]);
})();
