"use strict";
// Chegar às notas num só clique: cada turma com os seus períodos, e «continuar onde ficaste».
(() => {
  const { api, mostrar, esc, $ } = EINK;
  const ultima = () => { try { return JSON.parse(localStorage.getItem("eink.ultimaPauta") || "null"); } catch { return null; } };
  EINK.lembrarPauta = (id, nome) => { try { localStorage.setItem("eink.ultimaPauta", JSON.stringify({ id, nome })); } catch { /* sem armazenamento */ } };

  // HTML das turmas com um botão por período.
  const blocoTurmas = (l) => l.length ? `<div class="notas-turmas">${l.map((t) => `<div class="notas-turma"><div class="notas-nome"><strong>${esc(t.nome)}</strong> <span class="pequeno">${esc(t.ano_letivo)}</span></div>
      <div class="notas-periodos">${t.periodos.map((d) => `<a class="botao sec" href="#/pauta/${d.id}">${esc(d.nome)}${d.fechado ? " (fechado)" : ""}</a>`).join("") || '<span class="pequeno">Sem períodos</span>'}<a class="botao fantasma" href="#/turma/${t.id}" title="Alunos e períodos">Turma</a></div></div>`).join("")}</div>`
    : `<p class="pequeno">Ainda não tens turmas. <a href="#/turmas">Cria a primeira</a>.</p>`;
  const continuar = () => { const u = ultima(); return u ? `<p><a class="botao" href="#/pauta/${u.id}">Continuar: ${esc(u.nome)}</a></p>` : ""; };

  async function notas() {
    mostrar(`<h1>Notas</h1>${continuar()}${blocoTurmas(await api("GET", "/api/atalhos"))}`);
  }
  // Mostrado no topo do painel.
  EINK.atalhosPainel = async (alvo) => { try { const l = await api("GET", "/api/atalhos"); if (alvo) alvo.innerHTML = `<h2>Notas</h2>${continuar()}${blocoTurmas(l)}`; } catch { /* não é essencial */ } };
  // Troca rápida de turma e período dentro da pauta.
  EINK.trocaPauta = async (alvo, atual) => {
    try {
      const l = await api("GET", "/api/atalhos");
      alvo.innerHTML = `<label class="troca-pauta">Ir para <select aria-label="Mudar de turma ou período">${l.map((t) => `<optgroup label="${esc(t.nome)}">${t.periodos.map((d) => `<option value="${d.id}" ${d.id === atual ? "selected" : ""}>${esc(t.nome)} · ${esc(d.nome)}</option>`).join("")}</optgroup>`).join("")}</select></label>`;
      $("select", alvo).onchange = (e) => { location.hash = "#/pauta/" + e.target.value; };
    } catch { /* não é essencial */ }
  };
  EINK.rotas.push([/^\/notas$/, notas]);
})();
