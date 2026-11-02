"use strict";
// Arranque: descobre quem entrou e liga as rotas às vistas.
(async () => {
  try { EINK.eu = await EINK.api("GET", "/api/eu"); } catch { return; }
  document.getElementById("nome").textContent = EINK.eu.nome || EINK.eu.upn;
  if (EINK.eu.admin) document.getElementById("nav-gestao").hidden = false;
  if (EINK.eu.versao) { const v = document.getElementById("versao"); v.textContent = "v" + EINK.eu.versao; v.hidden = false; }
  if (EINK.eu.local) document.getElementById("nav-senha").hidden = false;
  if (EINK.eu.dt) document.getElementById("nav-dt").hidden = false;
  // Botão do tema: Automático (sistema) → Claro → Escuro
  const botaoTema = document.getElementById("tema"), NOME = { auto: "Tema: automático", claro: "Tema: claro", escuro: "Tema: escuro" };
  const pintarTema = () => { const t = window.EINK_TEMA.ler(); botaoTema.textContent = NOME[t]; botaoTema.setAttribute("aria-label", NOME[t] + ". Mudar o tema."); };
  botaoTema.onclick = () => { window.EINK_TEMA.ciclo(); pintarTema(); };
  pintarTema();
  // Estatísticas de utilização: diz-se ao servidor em que ecrã se está (só o nome do ecrã, no máximo uma vez a cada 10 segundos por ecrã).
  const vistos = new Map();
  const contarEcra = (caminho) => {
    const area = caminho.split("/")[1] || "painel", t = Date.now();
    if (EINK.eu.trocar || t - (vistos.get(area) || 0) < 10000) return;
    vistos.set(area, t);
    fetch("/api/uso", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "eink" }, body: JSON.stringify({ area }) }).catch(() => {});
  };
  const ir = async () => {
    EINK.aoSair && EINK.aoSair();
    let caminho = location.hash.replace(/^#/, "");
    if (EINK.eu.trocar && caminho !== "/senha") { location.hash = "#/senha"; return; }
    contarEcra(caminho);
    const area = "#/" + (caminho.split("/")[1] || "");
    document.querySelectorAll(".topo nav a").forEach((a) => { if (a.getAttribute("href") === area || (area === "#/pauta" && a.getAttribute("href") === "#/notas") || ((area === "#/turma") && a.getAttribute("href") === "#/turmas")) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    for (const [re, fn] of EINK.rotas) {
      const m = re.exec(caminho);
      if (m) { try { await fn(...m.slice(1)); } catch { /* o aviso já foi mostrado */ } document.getElementById("vista").focus(); return; }
    }
    location.hash = "#/";
  };
  window.addEventListener("hashchange", ir);
  ir();
})();
