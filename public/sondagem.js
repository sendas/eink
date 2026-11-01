"use strict";
// Página dos alunos numa sondagem: uma pergunta, uma escolha. Sem conta e sem dados pessoais.
(() => {
  const codigo = location.pathname.split("/").pop();
  const raiz = document.getElementById("raiz");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  async function carregar() {
    const r = await fetch(`/s/api/${codigo}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { raiz.innerHTML = `<h1>Sondagem</h1><p>${esc(d.erro || "Não foi possível abrir a sondagem.")}</p>`; return; }
    if (d.tipo === "aberta") { aberta(d); return; }
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
  carregar();
})();
