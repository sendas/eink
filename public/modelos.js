"use strict";
// Modelos de grelha: guardar a estrutura de um teste (questões e cotações), voltar a usá-la e enviá-la a colegas dentro da plataforma.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v) => String(Math.round(v * 100) / 100).replace(".", ",");

  // Campo de destinatários como no Outlook: escreves as primeiras letras do nome ou do email, aparecem as sugestões
  // (setas e Enter ou Tab para escolher, clique também serve) e cada escolha vira uma etiqueta que se retira com × ou Backspace.
  const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  EINK.campoDestinatarios = (colegas, aoMudar) => {
    const escolhidos = [], caixa = document.createElement("div"), meu = String((EINK.eu && EINK.eu.upn) || "").toLowerCase(); caixa.className = "dest";
    caixa.innerHTML = `<div class="dest-campo"><span class="dest-rot">Para</span><span class="dest-chips"></span><input class="dest-in" type="text" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="dest-lista" placeholder="Escreve o nome ou o email do colega"></div><ul class="dest-lista" id="dest-lista" role="listbox" hidden></ul>`;
    const campo = $(".dest-campo", caixa), chips = $(".dest-chips", caixa), entrada = $(".dest-in", caixa), lista = $(".dest-lista", caixa);
    let sugestoes = [], ativo = 0;
    const fechar = () => { lista.hidden = true; entrada.setAttribute("aria-expanded", "false"); sugestoes = []; };
    const desenharChips = () => {
      chips.innerHTML = escolhidos.map((c) => `<span class="dest-chip${c.pendente ? " pendente" : ""}" title="${esc(c.email)}${c.pendente ? " (ainda não entrou na plataforma: recebe quando entrar)" : ""}">${esc(c.nome)}<button type="button" class="dest-x" data-id="${esc(c.email)}" aria-label="Retirar ${esc(c.nome)}">×</button></span>`).join("");
      $$(".dest-x", chips).forEach((x) => { x.onclick = () => { const i = escolhidos.findIndex((c) => c.email === x.dataset.id); if (i >= 0) escolhidos.splice(i, 1); desenharChips(); aoMudar(escolhidos); entrada.focus(); }; });
    };
    const juntar = (c) => { if (!escolhidos.some((x) => x.email === c.email)) escolhidos.push(c); entrada.value = ""; fechar(); desenharChips(); aoMudar(escolhidos); entrada.focus(); };
    // Prefixo de uma palavra do nome ou do email primeiro; depois quem contém o texto.
    const procurar = (t) => {
      const q = norm(t); if (!q) return [];
      const pontos = (c) => { const nome = norm(c.nome), email = norm(c.email); const palavras = nome.split(/\s+/);
        if (email.startsWith(q) || nome.startsWith(q)) return 3; if (palavras.some((w) => w.startsWith(q)) || email.split("@")[0].split(/[._-]/).some((w) => w.startsWith(q))) return 2; if (nome.includes(q) || email.includes(q)) return 1; return 0; };
      return colegas.filter((c) => !escolhidos.some((x) => x.email === c.email)).map((c) => [pontos(c), c]).filter(([p]) => p).sort((x, y) => y[0] - x[0] || x[1].nome.localeCompare(y[1].nome, "pt")).slice(0, 8).map(([, c]) => c);
    };
    const realce = (texto, t) => { const i = norm(texto).indexOf(norm(t)); if (!t || i < 0) return esc(texto); return esc(texto.slice(0, i)) + "<b>" + esc(texto.slice(i, i + t.length)) + "</b>" + esc(texto.slice(i + t.length)); };
    const mostrar_ = () => {
      sugestoes = procurar(entrada.value); ativo = 0;
      const t = entrada.value.trim().toLowerCase();
      // Um email completo que ainda não está na plataforma: envia-se na mesma, e chega quando o colega entrar.
      const emailLivre = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) && t !== meu && !colegas.some((c) => c.email === t) && !escolhidos.some((c) => c.email === t);
      if (emailLivre) sugestoes.push({ id: null, nome: t, email: t, pendente: true, livre: true });
      if (!t) return fechar();
      const aviso0 = colegas.length ? "Nenhum colega encontrado. Escreve o email completo (nome@…) para enviar na mesma." : (EINK.eu && EINK.eu.admin ? "Ainda não há lista de docentes. Importa-a em Gestão, Docentes, para os nomes aparecerem aqui; entretanto escreve o email completo." : "Ainda não há outros docentes na lista. Escreve o email completo do colega para enviar na mesma.");
      lista.innerHTML = sugestoes.length ? sugestoes.map((c, i) => `<li role="option" id="dest-o${i}" data-i="${i}" aria-selected="${i === 0}" class="${i === 0 ? "ativo" : ""}">${c.livre ? `<strong>Enviar para ${esc(c.email)}</strong><small>Ainda não entrou na plataforma: recebe o modelo quando entrar</small>` : `<strong>${realce(c.nome, entrada.value)}</strong><small>${realce(c.email, entrada.value)}${c.pendente ? " · ainda não entrou na plataforma" : ""}</small>`}</li>`).join("") : `<li class="sem">${aviso0}</li>`;
      lista.hidden = false; entrada.setAttribute("aria-expanded", "true");
      $$("li[data-i]", lista).forEach((li) => { li.onmousedown = (e) => { e.preventDefault(); juntar(sugestoes[Number(li.dataset.i)]); }; });
    };
    const marcar = (i) => { ativo = (i + sugestoes.length) % sugestoes.length; $$("li[data-i]", lista).forEach((li, k) => { li.classList.toggle("ativo", k === ativo); li.setAttribute("aria-selected", String(k === ativo)); }); entrada.setAttribute("aria-activedescendant", "dest-o" + ativo); const li = $("#dest-o" + ativo, lista); if (li) li.scrollIntoView({ block: "nearest" }); };
    entrada.oninput = mostrar_;
    entrada.onkeydown = (e) => {
      if (e.key === "ArrowDown" && sugestoes.length) { e.preventDefault(); marcar(ativo + 1); }
      else if (e.key === "ArrowUp" && sugestoes.length) { e.preventDefault(); marcar(ativo - 1); }
      else if ((e.key === "Enter" || e.key === "Tab" || e.key === ";" || e.key === ",") && sugestoes.length && entrada.value.trim()) { e.preventDefault(); juntar(sugestoes[ativo]); }
      else if (e.key === "Enter") { e.preventDefault(); fechar(); }
      else if (e.key === "Escape" && !lista.hidden) { e.stopPropagation(); e.preventDefault(); fechar(); }
      else if (e.key === "Backspace" && !entrada.value && escolhidos.length) { escolhidos.pop(); desenharChips(); aoMudar(escolhidos); }
    };
    entrada.onblur = () => setTimeout(fechar, 120);
    // Colar uma lista de emails (do Outlook ou do Excel): ficam os que existem na plataforma.
    entrada.onpaste = (e) => {
      const t = (e.clipboardData || window.clipboardData).getData("text"); if (!/[;,\n\t]/.test(t)) return;
      e.preventDefault(); let ok = 0, falhas = 0;
      for (const parte of t.split(/[;,\n\t]+/).map((x) => x.trim()).filter(Boolean)) {
        const email = ((/<([^>]+)>/.exec(parte) || [])[1] || parte).trim().toLowerCase(), c = colegas.find((x) => norm(x.email) === norm(email) || norm(x.nome) === norm(parte));
        if (c) { if (!escolhidos.some((x) => x.email === c.email)) { escolhidos.push(c); ok++; } }
        else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email !== meu) { if (!escolhidos.some((x) => x.email === email)) { escolhidos.push({ id: null, nome: email, email, pendente: true }); ok++; } }
        else falhas++;
      }
      desenharChips(); aoMudar(escolhidos); if (falhas) aviso(`${falhas} endereço${falhas === 1 ? " não é válido" : "s não são válidos"}.`, true);
    };
    campo.onclick = () => entrada.focus();
    return { caixa, escolhidos, focar: () => entrada.focus() };
  };

  // Janela para escolher os colegas que recebem uma cópia do modelo.
  EINK.dialogoEnviar = async (modeloId, nome, depois) => {
    let colegas = []; try { colegas = await api("GET", "/api/colegas"); } catch { return; }
    const dlg = document.createElement("dialog"); dlg.className = "sug-dlg dest-dlg";
    dlg.innerHTML = `<h2 style="margin-top:0">Enviar «${esc(nome)}» a colegas</h2>
      <p class="pequeno">Cada colega recebe uma cópia da estrutura (questões e cotações), sem notas nem alunos. Vê-la em «Modelos».</p>
      <div id="dest-aqui"></div>
      <p class="linha"><button type="button" id="col-enviar" disabled>Enviar</button><button type="button" class="sec" id="col-fechar">Cancelar</button></p>`;
    document.body.append(dlg); dlg.showModal();
    const campo = EINK.campoDestinatarios(colegas, (l) => { $("#col-enviar", dlg).disabled = !l.length; });
    $("#dest-aqui", dlg).append(campo.caixa); campo.focar();
    const fechar = () => { dlg.close(); dlg.remove(); };
    $("#col-fechar", dlg).onclick = fechar; dlg.addEventListener("cancel", () => dlg.remove());
    $("#col-enviar", dlg).onclick = async (e) => {
      const para = campo.escolhidos.filter((c) => c.id).map((c) => c.id), emails = campo.escolhidos.filter((c) => !c.id).map((c) => c.email);
      if (!para.length && !emails.length) return aviso("Escolhe pelo menos um colega.", true);
      e.target.disabled = true;
      try { const r = await api("POST", `/api/grelha-modelos/${modeloId}/enviar`, { para, emails }); fechar(); aviso([r.enviados ? `Modelo enviado a ${r.enviados} colega${r.enviados === 1 ? "" : "s"}.` : "", r.aEspera ? `${r.aEspera} colega${r.aEspera === 1 ? " ainda não entrou" : "s ainda não entraram"} na plataforma e ${r.aEspera === 1 ? "recebe" : "recebem"} o modelo quando entrar${r.aEspera === 1 ? "" : "em"}.` : ""].filter(Boolean).join(" ")); if (depois) depois(); } catch { e.target.disabled = false; }
    };
  };

  const lerLinhas = (t) => String(t || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/\t|;|\|/).map((x) => x.trim());
    return c.length >= 3 ? { grupo: c[0], nome: c[1], cotacao: c[2] } : { grupo: "", nome: c[0], cotacao: c[1] };
  });

  async function modelos() {
    const lista = await api("GET", "/api/grelha-modelos");
    mostrar(`<h1>Modelos de grelha</h1>
      <p class="pequeno">Guarda a estrutura de um teste (questões e cotações) para a usares noutros testes e turmas, ou envia-a a colegas. Para criar um modelo a partir de um teste, abre a grelha desse teste e escolhe «Guardar esta grelha como modelo».</p>
      <details class="painel"><summary><strong>Criar um modelo novo</strong> <span class="pequeno">uma questão por linha</span></summary>
        <form id="f-modelo" class="linha" style="flex-direction:column;align-items:stretch">
          <label>Nome do modelo<input name="nome" required maxlength="100" placeholder="Teste de Matemática, 8.º ano"></label>
          <label>Questões e cotações<textarea name="itens" rows="6" required placeholder="1 ; 10&#10;2 ; 15&#10;Grupo II | 3 | 25"></textarea></label>
          <p class="pequeno">Escreve «questão ; cotação» ou «grupo | questão | cotação». Podes colar do Excel. Convém que as cotações somem 100.</p>
          <p><button>Guardar modelo</button></p>
        </form></details>
      ${lista.length ? `<div class="mod-lista">${lista.map((m) => `<article class="mod-cartao" data-id="${m.id}">
        <h3>${esc(m.nome)} ${m.nova ? '<span class="mod-nova">novo</span>' : ""}</h3>
        <p class="pequeno">${m.n} questões · soma ${num(m.soma)} pts${m.de ? ` · recebido de ${esc(m.de)}` : ""}</p>
        <details><summary class="pequeno">Ver as questões</summary><ul class="lista">${m.itens.map((i) => `<li><span>${i.grupo ? esc(i.grupo) + " · " : ""}${esc(i.nome)}</span><strong>${num(i.cotacao)}</strong></li>`).join("")}</ul></details>
        <p class="linha"><button type="button" data-env="${m.id}">Enviar a colegas</button><button type="button" class="sec" data-ren="${m.id}">Mudar o nome</button><button type="button" class="perigo" data-del="${m.id}">Apagar</button></p>
      </article>`).join("")}</div>` : '<p class="painel">Ainda não tens modelos. Cria um aqui ou a partir da grelha de um teste.</p>'}`);
    // Vistos: apaga a marca de «novo» e o número ao lado de «Modelos».
    if (lista.some((m) => m.nova)) { api("POST", "/api/grelha-modelos/vistos", {}).catch(() => {}); EINK.eu.grelhas_novas = 0; const b = document.getElementById("nav-modelos-n"); if (b) b.hidden = true; }
    $("#f-modelo").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      try { await api("POST", "/api/grelha-modelos", { nome: f.get("nome"), itens: lerLinhas(f.get("itens")) }); aviso("Modelo guardado."); modelos(); } catch { /* aviso mostrado */ }
    };
    $$("[data-env]").forEach((b) => { b.onclick = () => { const m = lista.find((x) => x.id === Number(b.dataset.env)); EINK.dialogoEnviar(m.id, m.nome); }; });
    $$("[data-ren]").forEach((b) => { b.onclick = async () => { const m = lista.find((x) => x.id === Number(b.dataset.ren)), n = prompt("Novo nome do modelo:", m.nome); if (n && n.trim()) { await api("PUT", `/api/grelha-modelos/${m.id}`, { nome: n }); modelos(); } }; });
    $$("[data-del]").forEach((b) => { b.onclick = async () => { if (confirm("Apagar este modelo? Os testes que já o usam não mudam.")) { await api("DELETE", `/api/grelha-modelos/${b.dataset.del}`); modelos(); } }; });
  }
  EINK.rotas.push([/^\/modelos$/, modelos]);
})();
