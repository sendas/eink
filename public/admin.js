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

  const anoTxt = (e) => (e.ano ? `${e.ano}.º ano` : "Todos os anos");
  async function criterios() {
    const grupos = await api("GET", "/api/grupos");
    mostrar(`<h1>Critérios de avaliação</h1>
      <p class="pequeno">Os critérios variam por disciplina (grupo disciplinar) e por ano de escolaridade. Cada disciplina tem um esquema para «todos os anos» e pode ter esquemas próprios para anos concretos: uma turma usa o do seu ano e, se não houver, o de «todos os anos». Os docentes lançam testes e trabalhos dentro dos critérios de «testes»; a nota final é a média ponderada dos critérios, que têm de somar 100 %.</p>
      <form class="painel linha" id="f-grupo"><label>Nova disciplina / grupo disciplinar<input name="nome" required maxlength="60" placeholder="550 Informática"></label><button>Criar</button></form>
      ${grupos.map((g) => `<section class="painel" data-grupo="${g.id}"><div class="linha"><label>Disciplina<input class="g-nome" value="${esc(g.nome)}" maxlength="60"></label><button class="sec g-ren" type="button">Mudar nome</button><button class="perigo g-del" type="button">Apagar</button></div>
        ${g.esquemas.map((e) => `<div class="painel" data-esquema="${e.id}" data-ano="${e.ano}"><div class="linha"><strong>${anoTxt(e)}</strong>
            <label>Nota final com<select class="g-casas"><option value="1" ${e.casas === 1 ? "selected" : ""}>1 casa decimal</option><option value="2" ${e.casas === 2 ? "selected" : ""}>2 casas decimais</option></select></label>
            ${e.ano ? `<button class="perigo e-del" type="button">Apagar este esquema</button>` : ""}</div>
          <table><thead><tr><th>Critério</th><th>Peso</th><th>Tipo</th><th></th></tr></thead><tbody>${e.criterios.map(linhaCrit).join("")}</tbody></table>
          <p class="linha"><button class="sec c-add-t" type="button">+ Critério de testes</button><button class="sec c-add-n" type="button">+ Critério de nível 1 a 5</button></p>
          <p class="g-soma"></p><p><button class="g-gravar" type="button">Guardar</button></p></div>`).join("")}
        <p class="linha"><label>Esquema próprio para o ano<select class="e-ano">${[5, 6, 7, 8, 9, 10, 11, 12].filter((a) => !g.esquemas.some((e) => e.ano === a)).map((a) => `<option value="${a}">${a}.º ano</option>`).join("")}</select></label><button class="sec e-add" type="button">Criar (copia «todos os anos»)</button></p></section>`).join("")}`);

    $("#f-grupo").onsubmit = async (e) => { e.preventDefault(); await api("POST", "/api/admin/grupos", { nome: new FormData(e.target).get("nome") }); criterios(); };
    $$("section[data-grupo]").forEach((sec) => {
      const gid = Number(sec.dataset.grupo);
      $(".g-ren", sec).onclick = async () => { try { await api("PUT", "/api/admin/grupos/" + gid, { nome: $(".g-nome", sec).value }); aviso("Nome guardado."); } catch { /* aviso mostrado */ } };
      $(".g-del", sec).onclick = async () => { if (confirm("Apagar esta disciplina e os seus esquemas?")) { try { await api("DELETE", "/api/admin/grupos/" + gid); criterios(); } catch { /* aviso mostrado */ } } };
      $(".e-add", sec).onclick = async () => { const ano = $(".e-ano", sec).value; if (!ano) return; try { await api("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: Number(ano) }); criterios(); } catch { /* aviso mostrado */ } };
      $$("[data-esquema]", sec).forEach((es) => {
        const eid = Number(es.dataset.esquema), corpo = $("tbody", es);
        const lerLinhas = () => $$("tr", corpo).map((tr) => ({ id: tr.dataset.id ? Number(tr.dataset.id) : undefined, tipo: tr.dataset.tipo, nome: $(".c-nome", tr).value, peso: Number($(".c-peso", tr).value) }));
        const soma = () => {
          const t = Math.round(lerLinhas().reduce((z, k) => z + (k.peso || 0), 0) * 100) / 100;
          const el = $(".g-soma", es); el.textContent = t === 100 ? "Total: 100 % ✓" : `Total: ${String(t).replace(".", ",")} % (tem de dar 100 %)`; el.style.color = t === 100 ? "var(--ok)" : "var(--erro)";
        };
        const ligar = () => { $$(".c-del", corpo).forEach((b) => { b.onclick = () => { b.closest("tr").remove(); soma(); }; }); $$(".c-peso", corpo).forEach((i) => { i.oninput = soma; }); };
        const juntar = (tipo, nome) => { corpo.insertAdjacentHTML("beforeend", linhaCrit({ nome, peso: 0, tipo })); ligar(); soma(); };
        $(".c-add-t", es).onclick = () => juntar("testes", "Novo critério");
        $(".c-add-n", es).onclick = () => juntar("nivel", "Novo critério de nível");
        $(".g-gravar", es).onclick = async () => { try { await api("PUT", "/api/admin/esquemas/" + eid, { casas: Number($(".g-casas", es).value), criterios: lerLinhas() }); aviso("Guardado. As pautas dos docentes já usam os novos pesos."); criterios(); } catch { /* aviso mostrado */ } };
        const del = $(".e-del", es); if (del) del.onclick = async () => { if (confirm("Apagar este esquema? As turmas desse ano passam a usar o de «todos os anos».")) { try { await api("DELETE", "/api/admin/esquemas/" + eid); criterios(); } catch { /* aviso mostrado */ } } };
        ligar(); soma();
      });
    });
  }

  EINK.rotas.push([/^\/admin$/, docentes], [/^\/criterios$/, criterios]);
})();
