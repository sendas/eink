"use strict";
// Ferramentas de sala: temporizador, sorteio, chamada e listas de verificação.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const voltar = '<p><a href="#/">← Início</a></p>';
  let limpeza = null; // o que parar ao sair da vista (relógios, microfone)
  EINK.aoSair = () => { if (limpeza) { limpeza(); limpeza = null; } };

  const guardar = (k, v) => { try { localStorage.setItem("eink." + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const ler = (k, def) => { try { const v = JSON.parse(localStorage.getItem("eink." + k)); return v ?? def; } catch { return def; } };

  // ---------- temporizador ----------
  function temporizador() {
    let total = 300, resta = 300, fim = null, t = null, audio = null;
    mostrar(`${voltar}<div class="ecra-grande"><h1>Temporizador</h1>
      <div class="relogio" id="rel" role="timer" aria-live="off">05:00</div>
      <p>${[1, 2, 5, 10, 15].map((m) => `<button class="sec" data-m="${m}">${m} min</button>`).join(" ")}
        <label style="display:inline-grid">Minutos<input id="min" type="number" min="1" max="180" value="5" style="width:5rem"></label></p>
      <p><button id="ini">Iniciar</button> <button class="sec" id="rep">Repor</button></p></div>`);
    const rel = $("#rel");
    const pintar = () => { const s = Math.max(0, Math.ceil(resta)); rel.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); rel.classList.toggle("fim", s === 0 && total > 0 && fim === null && resta <= 0); };
    const apitar = () => { try { audio = audio || new AudioContext(); for (let i = 0; i < 3; i++) { const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination); o.frequency.value = 880; g.gain.value = .2; o.start(audio.currentTime + i * .45); o.stop(audio.currentTime + i * .45 + .25); } } catch { /* sem áudio */ } };
    const parar = () => { clearInterval(t); t = null; fim = null; $("#ini").textContent = "Iniciar"; };
    const definir = (m) => { parar(); total = resta = m * 60; $("#min").value = m; pintar(); };
    $$("[data-m]").forEach((b) => { b.onclick = () => definir(+b.dataset.m); });
    $("#min").onchange = (e) => definir(Math.min(180, Math.max(1, +e.target.value || 1)));
    $("#rep").onclick = () => definir(total / 60);
    $("#ini").onclick = () => {
      if (t) { resta = (fim - Date.now()) / 1000; parar(); pintar(); return; }
      if (resta <= 0) resta = total;
      fim = Date.now() + resta * 1000; $("#ini").textContent = "Pausa";
      // O relógio vem da hora real, por isso não derrapa se o separador ficar em segundo plano.
      t = setInterval(() => { resta = (fim - Date.now()) / 1000; if (resta <= 0) { resta = 0; parar(); apitar(); } pintar(); }, 200);
    };
    limpeza = () => clearInterval(t);
    pintar();
  }

  // ---------- escolher turma (partilhado) ----------
  async function comTurma(titulo, aoEscolher) {
    const ts = await api("GET", "/api/turmas");
    if (!ts.length) { mostrar(`${voltar}<h1>${titulo}</h1><p>Cria primeiro uma <a href="#/turmas">turma</a>.</p>`); return; }
    const guardada = ler("turma", ts[0].id);
    mostrar(`${voltar}<h1>${titulo}</h1><p><label>Turma<select id="t">${ts.map((t) => `<option value="${t.id}" ${t.id === guardada ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></label></p><div id="corpo"></div>`);
    const carregar = async () => { guardar("turma", +$("#t").value); aoEscolher(await api("GET", "/api/turmas/" + $("#t").value), $("#corpo")); };
    $("#t").onchange = carregar; carregar();
  }

  // ---------- sorteio ----------
  function sorteio() {
    comTurma("Sorteio", (t, el) => {
      let fora = new Set();
      const sortearUm = () => { const l = t.alunos.filter((a) => !fora.has(a.id)); if (!l.length) { fora = new Set(); return sortearUm(); } const a = l[crypto.getRandomValues(new Uint32Array(1))[0] % l.length]; fora.add(a.id); return a; };
      el.innerHTML = `<div class="ecra-grande"><div class="sorteado" id="res" aria-live="polite">–</div>
        <p><label style="display:inline-grid"><span>Grupos de</span><input id="n" type="number" min="2" max="10" value="3" style="width:5rem"></label></p>
        <p><button id="um">Sortear aluno</button> <button class="sec" id="gr">Formar grupos</button> <button class="sec" id="rep">Repor sorteados</button></p>
        <p class="pequeno" id="info"></p><div class="grupos" id="grupos"></div></div>`;
      const info = () => { $("#info").textContent = `${fora.size} de ${t.alunos.length} já sorteados.`; };
      $("#um").onclick = () => { if (!t.alunos.length) return aviso("A turma não tem alunos.", true); $("#res").textContent = sortearUm().nome; info(); };
      $("#rep").onclick = () => { fora = new Set(); info(); };
      $("#gr").onclick = () => {
        const l = [...t.alunos], n = Math.max(2, Math.min(10, +$("#n").value || 3));
        for (let i = l.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [l[i], l[j]] = [l[j], l[i]]; }
        const k = Math.max(1, Math.round(l.length / n)), g = Array.from({ length: k }, () => []);
        l.forEach((a, i) => g[i % k].push(a.nome));
        $("#grupos").innerHTML = g.map((m, i) => `<div class="painel"><strong>Grupo ${i + 1}</strong><br>${m.map(esc).join("<br>")}</div>`).join("");
      };
      info();
    });
  }

  // ---------- chamada ----------
  function chamada() {
    comTurma("Chamada", async (t, el) => {
      const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      el.innerHTML = `<p><label>Data<input id="dt" type="date" value="${hoje}"></label></p><div class="painel"><ul class="lista" id="al"></ul></div>
        <p><button id="gv">Guardar presenças</button> <button class="sec" id="tp">Todos presentes</button></p>`;
      let est = {};
      const pintar = () => { $("#al").innerHTML = t.alunos.map((a) => `<li><span>${a.numero ?? ""} ${esc(a.nome)}</span><span class="estados">${[["P", "Presente"], ["A", "Atraso"], ["F", "Falta"]].map(([k, n]) => `<button data-a="${a.id}" data-e="${k}" aria-pressed="${est[a.id] === k}" title="${n}">${k}</button>`).join("")}</span></li>`).join(""); };
      const carregar = async () => { est = await api("GET", `/api/turmas/${t.id}/presencas?data=${$("#dt").value}`); pintar(); };
      $("#al").onclick = (e) => { const b = e.target.closest("[data-a]"); if (b) { est[b.dataset.a] = b.dataset.e; pintar(); } };
      $("#tp").onclick = () => { t.alunos.forEach((a) => { est[a.id] = "P"; }); pintar(); };
      $("#dt").onchange = carregar;
      $("#gv").onclick = async () => { await api("PUT", `/api/turmas/${t.id}/presencas`, { data: $("#dt").value, estados: est }); aviso("Presenças guardadas."); };
      carregar();
    });
  }

  // ---------- listas de verificação (só neste navegador) ----------
  function listas() {
    let l = ler("listas", [{ nome: "Início da aula", itens: [] }]);
    const pintar = () => {
      mostrar(`${voltar}<h1>Listas de verificação</h1><p class="pequeno">Ficam guardadas só neste navegador.</p>
        <form class="painel linha" id="fl"><label>Nova lista<input name="nome" required maxlength="60"></label><button>Criar</button></form>
        ${l.map((x, i) => `<div class="painel"><strong>${esc(x.nome)}</strong> <button class="perigo" data-dl="${i}" aria-label="Apagar lista ${esc(x.nome)}">Apagar lista</button>
          <ul class="lista">${x.itens.map((it, j) => `<li><label style="display:flex;gap:.5rem;align-items:center;color:inherit;font-size:1rem"><input type="checkbox" data-c="${i}.${j}" ${it.feito ? "checked" : ""}> ${esc(it.texto)}</label><button class="sec" data-di="${i}.${j}" aria-label="Remover item">✕</button></li>`).join("")}</ul>
          <form class="linha" data-fi="${i}"><label>Novo item<input name="t" required maxlength="100"></label><button class="sec">Adicionar</button></form></div>`).join("")}`);
      $("#fl").onsubmit = (e) => { e.preventDefault(); l.push({ nome: new FormData(e.target).get("nome"), itens: [] }); guardar("listas", l); pintar(); };
      $$("[data-fi]").forEach((f) => { f.onsubmit = (e) => { e.preventDefault(); l[+f.dataset.fi].itens.push({ texto: new FormData(f).get("t"), feito: false }); guardar("listas", l); pintar(); }; });
      $$("[data-c]").forEach((c) => { c.onchange = () => { const [i, j] = c.dataset.c.split(".").map(Number); l[i].itens[j].feito = c.checked; guardar("listas", l); }; });
      $$("[data-di]").forEach((b) => { b.onclick = () => { const [i, j] = b.dataset.di.split(".").map(Number); l[i].itens.splice(j, 1); guardar("listas", l); pintar(); }; });
      $$("[data-dl]").forEach((b) => { b.onclick = () => { if (confirm("Apagar esta lista?")) { l.splice(+b.dataset.dl, 1); guardar("listas", l); pintar(); } }; });
    };
    pintar();
  }

  EINK.rotas.push([/^\/temporizador$/, temporizador], [/^\/sorteio$/, sorteio], [/^\/chamada$/, chamada], [/^\/listas$/, listas]);
})();
