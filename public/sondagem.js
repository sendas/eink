"use strict";
// Página dos alunos numa sondagem, num mural ou num bilhete de saída. Sem conta, sem nome e sem dados pessoais.
(() => {
  const codigo = location.pathname.split("/").pop();
  const raiz = document.getElementById("raiz");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  async function carregar() {
    const r = await fetch(`/s/api/${codigo}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { raiz.innerHTML = `<h1>Sondagem</h1><p>${esc(d.erro || "Não foi possível abrir a sondagem.")}</p>`; return; }
    if (d.tipo === "aberta") { aberta(d); return; }
    if (d.tipo === "mural") { mural(d); return; }
    if (d.tipo === "bilhete") { bilhete(d); return; }
    if (d.votou) { raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Obrigado! O teu voto foi registado.</p>`; return; }
    if (!d.aberta) { raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Esta sondagem já fechou.</p>`; return; }
    raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><div class="opcoes-publicas">${d.opcoes.map((o, i) => `<button type="button" class="op-publica c${i % 5}" data-k="${i}">${esc(o)}</button>`).join("")}</div><p class="pequeno" id="msg"></p>`;
    raiz.querySelectorAll("button[data-k]").forEach((b) => {
      b.onclick = async () => {
        raiz.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        const v = await fetch(`/s/api/${codigo}/votar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opcao: Number(b.dataset.k) }) });
        const j = await v.json().catch(() => ({}));
        if (v.ok) raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Obrigado! O teu voto foi registado.</p>`;
        else { document.getElementById("msg").textContent = j.erro || "Não foi possível votar."; if (v.status !== 429) carregar(); }
      };
    });
  }
  // Pergunta de resposta curta: cada aluno pode enviar até 3 respostas.
  function aberta(d) {
    if (!d.aberta) { raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Esta sondagem já fechou.</p>`; return; }
    if (d.votou) { raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Obrigado! Já enviaste as tuas respostas.</p>`; return; }
    raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><form id="f-resp" class="form-publico"><label>A tua resposta (uma palavra ou uma frase curta)<input name="texto" maxlength="60" autocomplete="off" required autofocus></label><p class="pequeno">Podes enviar mais ${d.restantes} resposta(s). Não escrevas o teu nome.</p><p class="erro-msg" id="msg" role="alert"></p><button class="grande">Enviar</button></form>`;
    document.getElementById("f-resp").onsubmit = async (e) => {
      e.preventDefault();
      const v = await fetch(`/s/api/${codigo}/votar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: new FormData(e.target).get("texto") }) });
      const j = await v.json().catch(() => ({}));
      if (v.ok) carregar(); else document.getElementById("msg").textContent = j.erro || "Não foi possível enviar.";
    };
  }
  const enviar = async (sub, corpo) => {
    const v = await fetch(`/s/api/${codigo}/${sub}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    return { ok: v.ok, j: await v.json().catch(() => ({})) };
  };
  // Mural: cada aluno envia até 5 notas (ideias ou dúvidas); no mural de dúvidas pode votar nas dos colegas.
  let vigia = null, aEscrever = false;
  function mural(d, msg) {
    clearTimeout(vigia);
    const duv = d.modo === "duvidas", cols = d.colunas && d.colunas.length > 1 ? d.colunas : null;
    const form = !d.aberta ? '<p class="grande-msg">O mural já fechou.</p>' : d.restantes ? `<form id="f-mu" class="form-publico"><label>${duv ? "A tua dúvida" : "A tua ideia"}<textarea name="texto" maxlength="140" rows="2" required></textarea></label>
      ${cols ? `<label>Coluna<select name="coluna">${cols.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join("")}</select></label>` : ""}
      <p class="pequeno">Podes enviar mais ${d.restantes} nota(s). Não escrevas o teu nome nem o de colegas.${d.aprovar ? " O professor vê as notas antes de aparecerem." : ""}</p><p class="erro-msg" id="msg" role="alert">${esc(msg || "")}</p><button class="grande">Enviar</button></form>` : `<p class="grande-msg">Já enviaste as tuas notas. Obrigado!</p>${msg ? `<p>${esc(msg)}</p>` : ""}`;
    const notas = d.notas.map((n) => `<li class="mu-nota-p ${n.destaque ? "destaque" : ""}">${cols ? `<span class="pequeno">${esc(cols[n.coluna] || "")}</span> ` : ""}${esc(n.texto)}${duv ? ` <button type="button" class="gosto" data-g="${n.id}" ${d.gostei.includes(n.id) || !d.aberta ? "disabled" : ""} aria-label="Também tenho esta dúvida (${n.gostos})">👍 ${n.gostos}</button>` : ""}</li>`).join("");
    raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1>${form}<h2>${duv ? "Dúvidas da turma" : "No mural"}</h2>${duv ? '<p class="pequeno">Toca em 👍 nas dúvidas que também tens.</p>' : ""}<ul class="mu-lista-p">${notas || '<li class="pequeno">Ainda não há notas.</li>'}</ul>`;
    const f = document.getElementById("f-mu");
    if (f) {
      f.addEventListener("input", () => { aEscrever = !!f.texto.value; });
      f.onsubmit = async (e) => {
        e.preventDefault(); const fd = new FormData(f);
        const r = await enviar("votar", { texto: fd.get("texto"), ...(cols ? { coluna: Number(fd.get("coluna")) } : {}) });
        if (r.ok) { aEscrever = false; recarregarMural(r.j.pendente ? "Enviada! Aparece quando o professor a mostrar." : "Enviada!"); } else document.getElementById("msg").textContent = r.j.erro || "Não foi possível enviar.";
      };
    }
    raiz.querySelectorAll("[data-g]").forEach((b) => { b.onclick = async () => { b.disabled = true; await enviar("gosto", { id: Number(b.dataset.g) }); recarregarMural(); }; });
    // As notas dos colegas vão aparecendo (de 5 em 5 segundos), sem apagar o que o aluno está a escrever.
    const tique = () => { if (aEscrever) vigia = setTimeout(tique, 5000); else recarregarMural(); };
    if (d.aberta) vigia = setTimeout(tique, 5000);
  }
  async function recarregarMural(msg) { const r = await fetch(`/s/api/${codigo}`); const d = await r.json().catch(() => ({})); if (r.ok) mural(d, msg); }
  // Bilhete de saída: escala de 1 a 5 e respostas curtas; entrega-se uma vez.
  function bilhete(d) {
    if (d.votou) { raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Obrigado! O teu bilhete foi entregue.</p>`; return; }
    if (!d.aberta) { raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">O bilhete de saída já fechou.</p>`; return; }
    raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><form id="f-bi" class="form-publico">${d.perguntas.map((q, i) => q.tipo === "escala" ? `<fieldset class="bi-escala-p"><legend>${esc(q.texto)}</legend><div class="bi-botoes">${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="q${i}" value="${v}"><span>${v}</span></label>`).join("")}</div><p class="pequeno bi-leg"><span>Nada</span><span>Tudo</span></p></fieldset>` : `<label>${esc(q.texto)}<textarea name="q${i}" maxlength="140" rows="2"></textarea></label>`).join("")}
      <p class="pequeno">É anónimo: não escrevas o teu nome.</p><p class="erro-msg" id="msg" role="alert"></p><button class="grande">Entregar</button></form>`;
    document.getElementById("f-bi").onsubmit = async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      const respostas = d.perguntas.map((q, i) => (q.tipo === "escala" ? (fd.get("q" + i) ? Number(fd.get("q" + i)) : null) : String(fd.get("q" + i) || "")));
      const r = await enviar("votar", { respostas });
      if (r.ok) raiz.innerHTML = `<h1>${esc(d.pergunta)}</h1><p class="grande-msg">Obrigado! O teu bilhete foi entregue.</p>`; else document.getElementById("msg").textContent = r.j.erro || "Não foi possível entregar.";
    };
  }
  carregar();
})();
