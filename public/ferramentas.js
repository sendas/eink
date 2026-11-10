"use strict";
// Ferramentas de sala: temporizador, sorteio e chamada. As listas passaram a lembretes da turma (aula.js).
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const voltar = EINK.voltarSala;
  let limpeza = null; // o que parar ao sair da vista (relógios)
  EINK.aoSair = () => { if (limpeza) { limpeza(); limpeza = null; } };
  const { guardar, ler } = EINK;

  // ---------- temporizador ----------
  // Contagem decrescente (ou cronómetro), com anel que muda de cor no último minuto, ±1 min a contar e o apito final desligável.
  // Não há sons de fundo nem medidor de ruído, de propósito.
  function temporizador() {
    const pref = ler("temporizador", { min: 5, som: true, modo: "desce", tarefa: "" });
    let modo = pref.modo === "sobe" ? "sobe" : "desce", total = (pref.min || 5) * 60, resta = total, fim = null, ini = null, decorrido = 0, t = null, audio = null;
    mostrar(`${voltar}<div class="linha cab-ferr"><h1>Temporizador</h1>${EINK.botaoProjetar()}</div>
      <div class="ecra-grande tempo-caixa">
        <div class="anel-tempo" id="anel" style="--p:100"><div class="relogio" id="rel" role="timer" aria-live="off">05:00</div></div>
        <p class="tempo-tarefa" id="tt-ver"></p>
        <p class="linha centro"><button id="ini" class="grande">Iniciar</button><button class="sec" id="menos" title="Menos um minuto">−1 min</button><button class="sec" id="mais" title="Mais um minuto">+1 min</button><button class="sec" id="rep">Repor</button></p>
        <div class="nao-projetar painel tempo-opc">
          <p class="linha centro">${[1, 2, 3, 5, 10, 15, 20].map((m) => `<button class="sec" data-m="${m}">${m} min</button>`).join("")}
            <label style="display:inline-grid">Minutos<input id="min" type="number" min="1" max="180" value="${pref.min || 5}" style="width:5rem"></label></p>
          <p class="linha centro"><label class="inline"><input type="radio" name="modo" value="desce" ${modo === "desce" ? "checked" : ""}> Contagem decrescente</label><label class="inline"><input type="radio" name="modo" value="sobe" ${modo === "sobe" ? "checked" : ""}> Cronómetro</label>
            <label class="inline"><input type="checkbox" id="som" ${pref.som !== false ? "checked" : ""}> Som no fim</label></p>
          <label>O que fazer (aparece por baixo do relógio)<input id="tarefa" maxlength="140" value="${esc(pref.tarefa || "")}" placeholder="Resolvam os exercícios 3 a 5"></label>
        </div></div>`);
    const rel = $("#rel"), anel = $("#anel");
    const gravarPref = () => guardar("temporizador", { min: Math.round(total / 60) || 5, som: $("#som").checked, modo, tarefa: $("#tarefa").value });
    const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(s % 60).padStart(2, "0"); };
    const pintar = () => {
      $("#tt-ver").textContent = $("#tarefa").value;
      if (modo === "sobe") { const s = decorrido + (ini ? (Date.now() - ini) / 1000 : 0); rel.textContent = fmt(s); anel.style.setProperty("--p", 100); anel.dataset.estado = "ok"; rel.classList.remove("fim"); return; }
      const s = Math.max(0, Math.ceil(resta));
      rel.textContent = fmt(s);
      anel.style.setProperty("--p", total ? Math.max(0, Math.min(100, (resta / total) * 100)) : 0);
      anel.dataset.estado = s === 0 ? "fim" : s <= 60 ? "pouco" : "ok";
      rel.classList.toggle("fim", s === 0 && total > 0 && fim === null && resta <= 0);
    };
    const apitar = () => { if (!$("#som").checked) return; try { audio = audio || new AudioContext(); for (let i = 0; i < 3; i++) { const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination); o.frequency.value = 880; g.gain.value = .2; o.start(audio.currentTime + i * .45); o.stop(audio.currentTime + i * .45 + .25); } } catch { /* sem áudio */ } };
    const parar = () => { clearInterval(t); t = null; fim = null; if (ini) { decorrido += (Date.now() - ini) / 1000; ini = null; } $("#ini").textContent = "Iniciar"; };
    const definir = (m) => { parar(); total = resta = m * 60; decorrido = 0; $("#min").value = m; gravarPref(); pintar(); };
    $$("[data-m]").forEach((b) => { b.onclick = () => definir(+b.dataset.m); });
    $("#min").onchange = (e) => definir(Math.min(180, Math.max(1, +e.target.value || 1)));
    $("#rep").onclick = () => definir(Math.round(total / 60) || 5);
    // ±1 min com o relógio a contar: mexe no fim (e no total, para o anel continuar certo).
    const ajustar = (d) => {
      if (modo === "sobe") return;
      if (fim) { fim = Math.max(Date.now(), fim + d * 1000); resta = (fim - Date.now()) / 1000; } else resta = Math.max(0, resta + d);
      total = Math.max(60, total + d); if (resta > total) total = resta; pintar();
    };
    $("#mais").onclick = () => ajustar(60); $("#menos").onclick = () => ajustar(-60);
    $$("[name=modo]").forEach((r) => { r.onchange = () => { modo = r.value; parar(); decorrido = 0; resta = total; gravarPref(); $("#mais").hidden = $("#menos").hidden = modo === "sobe"; pintar(); }; });
    $("#som").onchange = gravarPref; $("#tarefa").oninput = () => { gravarPref(); pintar(); };
    $("#ini").onclick = () => {
      if (t) { if (modo === "desce") resta = (fim - Date.now()) / 1000; parar(); pintar(); return; }
      if (modo === "sobe") { ini = Date.now(); }
      else { if (resta <= 0) resta = total; fim = Date.now() + resta * 1000; }
      $("#ini").textContent = "Pausa";
      // O relógio vem da hora real, por isso não derrapa se o separador ficar em segundo plano.
      t = setInterval(() => { if (modo === "desce") { resta = (fim - Date.now()) / 1000; if (resta <= 0) { resta = 0; parar(); apitar(); } } pintar(); }, 200);
    };
    $("#mais").hidden = $("#menos").hidden = modo === "sobe";
    limpeza = () => clearInterval(t);
    pintar();
  }

  // ---------- escolher turma (partilhado) ----------
  const comTurma = (titulo, aoEscolher, opc) => EINK.escolherTurma(titulo, aoEscolher, opc);

  // ---------- sorteio ----------
  // Sorteia sem repetir até passarem todos (o estado fica até ao fim do dia, por turma), tira quem faltou na chamada de hoje
  // e forma grupos equilibrados por número de grupos ou por alunos em cada grupo. Os grupos podem guardar-se para o placar.
  function sorteio() {
    comTurma("Sorteio", async (t, el) => {
      const chave = `sorteio.${t.id}.${EINK.hoje()}`;
      let fora = new Set(), ausentes = new Set();
      try { fora = new Set(JSON.parse(sessionStorage.getItem("eink." + chave) || "[]")); } catch { /* sem armazenamento */ }
      try { const p = await api("GET", `/api/turmas/${t.id}/presencas?data=${EINK.hoje()}`); for (const [id, e] of Object.entries(p)) if (e === "F") ausentes.add(Number(id)); } catch { /* sem chamada */ }
      const gravar = () => { try { sessionStorage.setItem("eink." + chave, JSON.stringify([...fora])); } catch { /* sem armazenamento */ } };
      const disponiveis = () => t.alunos.filter((a) => !ausentes.has(a.id));
      const cartao = (a) => (a && a.nome ? `<span class="sort-al">${EINK.foto(a, "foto-sort")}<span>${esc(a.nome)}</span></span>` : "–");
      el.innerHTML = `<div class="ecra-grande"><div class="sorteado" id="res" aria-live="polite">–</div>
        <p class="linha centro"><button id="um" class="grande">Sortear aluno</button><button class="sec" id="nao" hidden>Não está, sortear outro</button><button class="sec" id="rep">Recomeçar a lista</button></p>
        <p class="pequeno" id="info"></p>
        <details class="painel nao-projetar sort-grupos" open><summary><strong>Formar grupos</strong></summary>
          <p class="linha"><label class="inline"><input type="radio" name="gm" value="n" checked> Número de grupos</label><label class="inline"><input type="radio" name="gm" value="t"> Alunos por grupo</label>
            <input id="n" type="number" min="2" max="15" value="${ler("sorteio.n", 4)}" style="width:5rem" aria-label="Quantidade"></p>
          <p class="linha"><label>Separar estes dois alunos<select id="sep1"><option value="">—</option>${t.alunos.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("")}</select></label><label>e<select id="sep2"><option value="">—</option>${t.alunos.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("")}</select></label></p>
          <p class="linha"><button class="sec" id="gr">Formar grupos</button><button class="sec" id="gg" hidden>Guardar estes grupos</button><label class="inline"><input type="checkbox" id="anim" ${ler("animacao", true) ? "checked" : ""}> Animação</label></p>
          <div id="guardados"></div></details>
        <div class="grupos" id="grupos"></div></div>`;
      const info = () => { const d = disponiveis(); $("#info").textContent = `${[...fora].filter((id) => d.some((a) => a.id === id)).length} de ${d.length} já sorteados${ausentes.size ? ` · ${ausentes.size} com falta hoje (ficam de fora)` : ""}.`; };
      let ultimo = null, grupos = null;
      const sortearUm = () => {
        let l = disponiveis().filter((a) => !fora.has(a.id));
        if (!l.length) { fora = new Set(); l = disponiveis(); aviso("Já saíram todos: a lista recomeçou."); }
        const a = l[EINK.acaso(l.length)]; fora.add(a.id); gravar(); return a;
      };
      const sortear = async () => {
        if (!disponiveis().length) return aviso("A turma não tem alunos disponíveis.", true);
        const a = sortearUm(); ultimo = a; $("#um").disabled = true;
        await EINK.animarSorteio($("#res"), [a, ...disponiveis()], a, cartao);
        if (!$("#um")) return; // saiu-se da página durante a animação
        $("#um").disabled = false; $("#nao").hidden = false; info();
      };
      $("#um").onclick = sortear;
      $("#nao").onclick = () => { if (ultimo) { ausentes.add(ultimo.id); fora.delete(ultimo.id); gravar(); } sortear(); };
      $("#rep").onclick = () => { fora = new Set(); gravar(); $("#res").textContent = "–"; $("#nao").hidden = true; info(); };
      $("#anim").onchange = (e) => guardar("animacao", e.target.checked);
      const desenharGrupos = (g) => { $("#grupos").innerHTML = g.map((m, i) => `<div class="painel grupo-c c${i % 5}-borda"><strong>Grupo ${i + 1}</strong> <span class="pequeno">${m.length}</span><br>${m.map((a) => esc(a.nome)).join("<br>")}</div>`).join(""); };
      $("#gr").onclick = () => {
        const l = EINK.baralhar(disponiveis()), q = Math.max(2, Math.min(15, +$("#n").value || 3));
        guardar("sorteio.n", q);
        const k = $("[name=gm]:checked").value === "n" ? Math.min(q, l.length) : Math.max(1, Math.ceil(l.length / q));
        // Distribuição equilibrada: os grupos diferem no máximo um aluno.
        const g = Array.from({ length: Math.max(1, k) }, () => []); l.forEach((a, i) => g[i % g.length].push(a));
        const s1 = Number($("#sep1").value), s2 = Number($("#sep2").value);
        if (s1 && s2 && s1 !== s2) {
          const gi = g.findIndex((m) => m.some((a) => a.id === s1) && m.some((a) => a.id === s2));
          if (gi >= 0 && g.length > 1) { const outro = (gi + 1) % g.length, i2 = g[gi].findIndex((a) => a.id === s2), troca = g[outro].findIndex((a) => a.id !== s1); if (troca >= 0) [g[gi][i2], g[outro][troca]] = [g[outro][troca], g[gi][i2]]; }
        }
        grupos = g; desenharGrupos(g); $("#gg").hidden = false;
      };
      const listarGuardados = async () => {
        const l = await api("GET", `/api/turmas/${t.id}/grupos`);
        $("#guardados").innerHTML = l.length ? `<p class="pequeno">Grupos guardados (usam-se no placar de equipas):</p><ul class="lista">${l.map((x) => `<li><span>${esc(x.nome)} <span class="pequeno">${x.dados.length} grupos</span></span><span class="linha"><button class="sec" data-ver="${x.id}">Mostrar</button><button class="perigo" data-del="${x.id}" aria-label="Apagar ${esc(x.nome)}">✕</button></span></li>`).join("")}</ul>` : "";
        $$("[data-ver]", $("#guardados")).forEach((b) => { b.onclick = () => { const x = l.find((y) => y.id === Number(b.dataset.ver)), por = new Map(t.alunos.map((a) => [a.id, a])); grupos = x.dados.map((m) => m.map((id) => por.get(id)).filter(Boolean)); desenharGrupos(grupos); }; });
        $$("[data-del]", $("#guardados")).forEach((b) => { b.onclick = async () => { if (confirm("Apagar estes grupos guardados?")) { await api("DELETE", `/api/turmas/${t.id}/grupos/${b.dataset.del}`); listarGuardados(); } }; });
      };
      $("#gg").onclick = async () => { const nome = prompt("Nome destes grupos:", `Grupos de ${new Date().toLocaleDateString("pt-PT")}`); if (!nome || !grupos) return; await api("POST", `/api/turmas/${t.id}/grupos`, { nome, grupos: grupos.map((m) => m.map((a) => a.id)) }); aviso("Grupos guardados."); listarGuardados(); };
      info(); listarGuardados();
    }, { projetar: true });
  }

  // ---------- chamada ----------
  // Cartões grandes com fotografia; ao abrir estão todos presentes e um toque muda Presente → Falta → Atraso → Presente.
  // Grava sozinha (como o mapa). Vista pelo mapa de sala e resumo das faltas e atrasos da turma.
  const ESTADOS = { P: "Presente", F: "Falta", A: "Atraso" }, SEG = { P: "F", F: "A", A: "P" };
  EINK.chamadaEm = async (t, el, opc = {}) => {
    let est = {}, vista = ler("chamada.vista", "cartoes"), mapa = null, tg = null, data = opc.data || EINK.hoje(), porGravar = false;
    const gravar = (ja) => {
      porGravar = true; clearTimeout(tg);
      const f = async () => { porGravar = false; try { await api("PUT", `/api/turmas/${t.id}/presencas`, { data, estados: est }); $("#ch-estado") && ($("#ch-estado").textContent = "Guardado ✓"); } catch { porGravar = true; } };
      if (ja) return f(); tg = setTimeout(f, 600); if ($("#ch-estado")) $("#ch-estado").textContent = "A guardar…";
    };
    const resumo = () => { const c = { P: 0, F: 0, A: 0 }; for (const a of t.alunos) c[est[a.id] || "P"]++; return `<strong>${c.P}</strong> presentes · <strong>${c.F}</strong> falta${c.F === 1 ? "" : "s"} · <strong>${c.A}</strong> atraso${c.A === 1 ? "" : "s"}`; };
    const cartao = (a, curto) => `<button type="button" class="ch-al est-${est[a.id] || "P"}" data-a="${a.id}" aria-label="${esc(a.nome)}: ${ESTADOS[est[a.id] || "P"]}">${curto ? "" : EINK.foto(a, "foto-ch")}<span class="ch-nome">${a.numero ? `<small>${a.numero}</small> ` : ""}${esc(curto ? EINK.nomeCurto(a) : a.nome)}</span><span class="ch-est">${ESTADOS[est[a.id] || "P"]}</span></button>`;
    const pintar = () => {
      $("#ch-resumo").innerHTML = resumo();
      if (vista === "mapa" && mapa) {
        const por = new Map(t.alunos.map((a) => [a.id, a])), sentados = new Set(Object.values(mapa.lugares).filter((v) => v !== "x"));
        $("#ch-lista").innerHTML = `<div class="m-quadro">Quadro</div><div class="ch-mapa" style="grid-template-columns:repeat(${mapa.colunas},minmax(4.5rem,1fr))">${Array.from({ length: mapa.linhas }, (_, r) => Array.from({ length: mapa.colunas }, (_, c) => { const v = mapa.lugares[`${r},${c}`]; return v && v !== "x" && por.get(v) ? cartao(por.get(v), true) : `<span class="ch-vazio ${v === "x" ? "corr" : ""}"></span>`; }).join("")).join("")}</div>
          ${t.alunos.some((a) => !sentados.has(a.id)) ? `<p class="pequeno">Sem lugar no mapa:</p><div class="ch-grelha">${t.alunos.filter((a) => !sentados.has(a.id)).map((a) => cartao(a)).join("")}</div>` : ""}`;
      } else $("#ch-lista").innerHTML = `<div class="ch-grelha">${t.alunos.map((a) => cartao(a)).join("")}</div>`;
    };
    el.innerHTML = `<div class="linha ch-topo"><label>Data<input id="ch-dt" type="date" value="${data}"></label>
        <span class="linha" role="group" aria-label="Vista"><button type="button" class="sec" data-vista="cartoes" aria-pressed="${vista === "cartoes"}">Cartões</button><button type="button" class="sec" data-vista="mapa" aria-pressed="${vista === "mapa"}">Pelo mapa de sala</button></span>
        <button type="button" class="sec" id="ch-todos">Todos presentes</button><span class="pequeno" id="ch-estado"></span></div>
      <p class="ch-resumo" id="ch-resumo" aria-live="polite"></p><div id="ch-lista"></div>
      <p class="pequeno">Toca num aluno para mudar: Presente → Falta → Atraso. Grava sozinho.</p>`;
    const carregar = async () => {
      const guardado = await api("GET", `/api/turmas/${t.id}/presencas?data=${data}`);
      est = Object.fromEntries(t.alunos.map((a) => [a.id, guardado[a.id] || "P"]));
      pintar();
      // Numa data sem chamada, todos aparecem presentes mas só se grava ao primeiro toque (ou em «Todos presentes»).
      $("#ch-estado").textContent = Object.keys(guardado).length ? "Guardado ✓" : "Ainda não guardada: toca em quem faltou, ou em «Todos presentes».";
    };
    $("#ch-lista").onclick = (e) => { const b = e.target.closest("[data-a]"); if (!b) return; const id = Number(b.dataset.a); est[id] = SEG[est[id] || "P"]; pintar(); gravar(); if (opc.aoMudar) opc.aoMudar(est); };
    $("#ch-todos").onclick = () => { t.alunos.forEach((a) => { est[a.id] = "P"; }); pintar(); gravar(); };
    $("#ch-dt").onchange = async (e) => { if (porGravar) await gravar(true); data = e.target.value; carregar(); };
    $$("[data-vista]", el).forEach((b) => { b.onclick = async () => {
      vista = b.dataset.vista; guardar("chamada.vista", vista); $$("[data-vista]", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (vista === "mapa" && !mapa) { mapa = await api("GET", `/api/turmas/${t.id}/mapa`); if (!Object.values(mapa.lugares).some((v) => v !== "x")) aviso("Esta turma ainda não tem mapa de sala: abre o Mapa de sala para sentar os alunos."); }
      pintar();
    }; });
    const anterior = limpeza; limpeza = () => { if (anterior) anterior(); if (porGravar) gravar(true); };
    window.addEventListener("beforeunload", () => { if (porGravar) gravar(true); }, { once: true });
    if (vista === "mapa") mapa = await api("GET", `/api/turmas/${t.id}/mapa`).catch(() => null);
    await carregar();
    return { estados: () => est };
  };
  function chamada() {
    comTurma("Chamada", async (t, el) => {
      el.innerHTML = `<div role="tablist" class="linha ch-tabs"><button type="button" role="tab" class="sec" aria-selected="true" data-tab="hoje">Chamada</button><button type="button" role="tab" class="sec" aria-selected="false" data-tab="resumo">Resumo da turma</button></div><div id="ch-corpo"></div>`;
      const abrir = async (tab) => {
        $$("[data-tab]", el).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
        if (tab === "hoje") return EINK.chamadaEm(t, $("#ch-corpo"));
        const r = await api("GET", `/api/turmas/${t.id}/presencas/resumo`);
        $("#ch-corpo").innerHTML = `<p class="pequeno">${r.aulas} aula(s) com chamada. Os alunos com 5 ou mais faltas aparecem nos alertas do Início.</p><div class="tabela-rolagem"><table><thead><tr><th>N.º</th><th>Aluno</th><th class="num">Faltas</th><th class="num">Atrasos</th><th>Dias das faltas</th></tr></thead><tbody>${t.alunos.map((a) => { const x = r.alunos[a.id] || { F: 0, A: 0, faltas: [] }; return `<tr class="${x.F >= 5 ? "ch-alerta" : ""}"><td>${a.numero ?? ""}</td><td>${esc(a.nome)}</td><td class="num">${x.F}</td><td class="num">${x.A}</td><td class="pequeno">${x.faltas.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")}</td></tr>`; }).join("")}</tbody></table></div>`;
      };
      $$("[data-tab]", el).forEach((b) => { b.onclick = () => abrir(b.dataset.tab); });
      abrir("hoje");
    });
  }

  EINK.rotas.push([/^\/temporizador$/, temporizador], [/^\/sorteio$/, sorteio], [/^\/chamada$/, chamada], [/^\/listas$/, () => { location.hash = "#/lembretes"; }]);
})();
