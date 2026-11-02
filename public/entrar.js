"use strict";
document.getElementById("f-local").onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), erro = document.getElementById("erro-local"); erro.textContent = "";
  try {
    const r = await fetch("/auth/local", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "eink" }, body: JSON.stringify({ utilizador: f.get("utilizador"), senha: f.get("senha") }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { erro.textContent = d.erro || "Não foi possível entrar. Tenta outra vez."; return; }
    location.href = "/";
  } catch { erro.textContent = "Sem ligação ao servidor. Verifica a rede e tenta outra vez."; }
};
