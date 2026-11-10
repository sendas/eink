"use strict";
// Página dos alunos num quiz ao vivo: entram com o código e uma alcunha e respondem no telemóvel.
(() => {
  const raiz = document.getElementById("raiz");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FORMAS = ["▲", "◆", "●", "■", "★"];
  const pin = (/^\/j\/(\d{6})$/.exec(location.pathname) || [])[1];
  let rev = -1, ultimo = null, recebido = 0, temporizador = null, acabou = false;

  if (!pin) {
    raiz.innerHTML = `<h1>Entrar num jogo</h1><form id="f-pin" class="form-publico"><label>Código do jogo<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required autofocus></label><button class="grande">Entrar</button></form>`;
    document.getElementById("f-pin").onsubmit = (e) => { e.preventDefault(); const v = new FormData(e.target).get("pin").trim(); if (/^\d{6}$/.test(v)) location.href = "/j/" + v; };
    return;
  }

  const api = async (corpo, sub) => {
    const r = await fetch(`/j/api/${pin}${sub ? "/" + sub : ""}`, corpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : undefined);
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, estado: r.status, d };
  };

  // Com equipas, o aluno escolhe a sua ao entrar (as cores repetem as do placar).
  function formEntrar(erro) {
    const eqs = (ultimo && ultimo.equipas) || [];
    raiz.innerHTML = `<h1>Entrar no jogo</h1><form id="f-nome" class="form-publico"><label>A tua alcunha<input name="alcunha" maxlength="16" autocomplete="off" required autofocus></label><p class="pequeno">Não uses o teu nome verdadeiro.</p>
      ${eqs.length ? `<fieldset class="sem-borda eq-escolha"><legend>A tua equipa</legend>${eqs.map((n, i) => `<label class="eq-op eq${i}"><input type="radio" name="equipa" value="${i}" required> ${esc(n)}</label>`).join("")}</fieldset>` : ""}${erro ? `<p class="erro-msg" role="alert">${esc(erro)}</p>` : ""}<button class="grande">Entrar</button></form>`;
    document.getElementById("f-nome").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), r = await api({ alcunha: f.get("alcunha"), ...(f.get("equipa") !== null ? { equipa: Number(f.get("equipa")) } : {}) }, "entrar");
      if (r.ok) { rev = -1; mostrar(r.d); } else formEntrar(r.d.erro || "Não foi possível entrar.");
    };
  }

  const equipas = (v) => (v.topoEquipas && v.topoEquipas.length ? `<h2>Equipas</h2><ol class="topo-jogo">${v.topoEquipas.map((x) => `<li><span class="eq-nome eq${x.equipa}">${esc(x.nome)}</span><b>${x.media}</b></li>`).join("")}</ol><p class="pequeno">Média de pontos por aluno de cada equipa.</p>` : "");
  const opcao = (o, i, extra = "", dis = "") => `<button type="button" class="op-publica c${i % 5} ${extra}" data-k="${i}" ${dis}><span aria-hidden="true">${FORMAS[i % 5]}</span> ${esc(o)}</button>`;

  function mostrar(v) {
    ultimo = v; recebido = performance.now(); rev = v.revisao;
    if (!v.entrou) return formEntrar();
    const eq = v.equipas && v.equipas.length && v.equipa !== null ? ` · equipa <span class="eq-nome eq${v.equipa}">${esc(v.equipas[v.equipa])}</span>` : "";
    const cab = `<p class="pequeno cab-jogo"><strong>${esc(v.nome)}</strong>${eq} · ${v.pontos} pontos${v.posicao ? ` · ${v.posicao}.º lugar` : ""}</p>`;
    // Revisão ao próprio ritmo: sem tempo; depois de cada resposta vê-se a explicação e avança-se com «Seguinte».
    if (v.ritmo && v.fase === "livre") {
      clearInterval(temporizador);
      if (v.concluido) { raiz.innerHTML = `${cab}<h1>Concluíste a revisão!</h1><p class="grande-msg">Acertaste ${v.certas} de ${v.total}.</p><p class="pequeno">Podes fechar esta página.</p>`; return; }
      const img = v.pergunta.imagem ? `<img class="img-pergunta" src="/j/img/${pin}/${v.pergunta.imagem}" alt="">` : "";
      if (v.mostrar) {
        raiz.innerHTML = `${cab}<p class="pequeno">Pergunta ${v.idx + 1} de ${v.total}</p><h1 class="${v.ok ? "certo" : "errado"}">${v.ok ? "Certo!" : "Ainda não"}</h1><p>${esc(v.pergunta.texto)}</p>${img}
          <div class="opcoes-publicas">${v.pergunta.opcoes.map((o, i) => opcao(o, i, i === v.certa ? "certa" : v.minha === i ? "escolhida" : "apagada", "disabled")).join("")}</div>${v.explicacao ? `<p class="explicacao">${esc(v.explicacao)}</p>` : ""}
          <p><button type="button" class="grande" id="seguinte">${v.ultima ? "Ver o resultado" : "Seguinte"}</button></p>`;
        document.getElementById("seguinte").onclick = async (e) => { e.target.disabled = true; const r = await api({}, "seguinte"); if (r.ok) mostrar(r.d); else e.target.disabled = false; };
        return;
      }
      raiz.innerHTML = `${cab}<p class="pequeno">Pergunta ${v.idx + 1} de ${v.total} · sem pressa</p><h1>${esc(v.pergunta.texto)}</h1>${img}<div class="opcoes-publicas">${v.pergunta.opcoes.map((o, i) => opcao(o, i)).join("")}</div>`;
      raiz.querySelectorAll("button[data-k]").forEach((b) => { b.onclick = async () => { raiz.querySelectorAll("button").forEach((x) => { x.disabled = true; }); const r = await api({ pergunta: v.pergunta.id, resposta: Number(b.dataset.k) }, "responder"); if (r.ok) mostrar(r.d); else raiz.querySelectorAll("button").forEach((x) => { x.disabled = false; }); }; });
      return;
    }
    if (v.fase === "sala") { raiz.innerHTML = `${cab}<h1>${esc(v.titulo)}</h1><p class="grande-msg">Estás dentro! À espera que o professor comece…</p><p class="pequeno">${v.jogadores} jogador(es) na sala</p>`; return; }
    if (v.fase === "pergunta") {
      const rest = Math.max(0, v.restante - (performance.now() - recebido));
      raiz.innerHTML = `${cab}<p class="pequeno">Pergunta ${v.idx + 1} de ${v.total}</p><h1>${esc(v.pergunta.texto)}</h1>${v.pergunta.imagem ? `<img class="img-pergunta" src="/j/img/${pin}/${v.pergunta.imagem}" alt="">` : ""}
        <div class="barra-tempo" aria-hidden="true"><div id="bt"></div></div>
        ${v.respondeu ? `<p class="grande-msg">Resposta enviada. À espera dos colegas…</p><div class="opcoes-publicas">${v.pergunta.opcoes.map((o, i) => opcao(o, i, v.minha === i ? "escolhida" : "apagada", "disabled")).join("")}</div>` : `<div class="opcoes-publicas">${v.pergunta.opcoes.map((o, i) => opcao(o, i)).join("")}</div>`}`;
      raiz.querySelectorAll("button[data-k]:not([disabled])").forEach((b) => { b.onclick = async () => { raiz.querySelectorAll("button").forEach((x) => { x.disabled = true; }); const r = await api({ pergunta: v.pergunta.id, resposta: Number(b.dataset.k) }, "responder"); if (r.ok) mostrar(r.d); else { rev = -1; } }; });
      const bt = document.getElementById("bt"), total = v.tempo;
      clearInterval(temporizador);
      temporizador = setInterval(() => { const r = Math.max(0, v.restante - (performance.now() - recebido)); if (bt) bt.style.width = Math.min(100, (r / total) * 100) + "%"; if (r <= 0) clearInterval(temporizador); }, 100);
      return;
    }
    clearInterval(temporizador);
    if (v.fase === "resposta") {
      raiz.innerHTML = `${cab}<h1 class="${v.ok ? "certo" : "errado"}">${v.semResposta ? "Sem resposta a tempo" : v.ok ? "Certo!" : "Errado"}</h1>
        ${v.ok ? `<p class="grande-msg">+${v.ganhos} pontos</p>` : ""}<p>A resposta certa era: <strong>${esc(v.pergunta.opcoes[v.certa])}</strong></p>${v.explicacao ? `<p class="pequeno">${esc(v.explicacao)}</p>` : ""}
        ${equipas(v)}<h2>Em cima na tabela</h2><ol class="topo-jogo">${v.topo.map((x) => `<li><span>${esc(x.nome)}</span><b>${x.pontos}</b></li>`).join("")}</ol><p class="pequeno">${v.ultima ? "Era a última pergunta." : "À espera da próxima pergunta…"}</p>`;
      return;
    }
    if (v.fase === "fim") { raiz.innerHTML = `${cab}<h1>Fim do jogo!</h1><p class="grande-msg">Acertaste ${v.certas} de ${v.total}.</p>${equipas(v)}<h2>Classificação</h2><ol class="topo-jogo">${v.topo.map((x) => `<li><span>${esc(x.nome)}</span><b>${x.pontos}</b></li>`).join("")}</ol>`; acabou = true; }
  }

  // Consulta o servidor de segundo a segundo; só redesenha se a revisão mudou.
  async function consultar() {
    if (acabou) return;
    try {
      const r = await fetch(`/j/api/${pin}?v=${rev}`);
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) { clearInterval(temporizador); raiz.innerHTML = `<h1>Jogo terminado</h1><p>${esc(d.erro || "Este jogo já não existe.")}</p><p><a href="/jogar">Entrar noutro jogo</a></p>`; acabou = true; return; }
      if (r.ok && d.mudou !== false && d.revisao !== undefined && d.revisao !== rev) {
        // Durante a pergunta, os votos dos colegas mudam a revisão mas não o ecrã: não se redesenha, para não estragar um toque.
        const chave = (x) => [x.fase, x.idx, x.respondeu ? 1 : 0, x.entrou ? 1 : 0, x.mostrar ? 1 : 0, x.concluido ? 1 : 0].join("|");
        if ((d.fase === "pergunta" || d.fase === "livre" || (d.fase === "sala" && !d.entrou)) && ultimo && chave(d) === chave(ultimo)) rev = d.revisao; else mostrar(d);
      }
    } catch { /* sem rede: volta a tentar */ }
    setTimeout(consultar, 1000);
  }
  consultar();
})();
