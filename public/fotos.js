"use strict";
// Fotografias dos alunos: miniatura (ou iniciais) e janela para mudar ou remover. A imagem é reduzida no navegador a 256 px quadrados.
(() => {
  const { api, aviso, esc, $ } = EINK;
  const iniciais = (nome) => String(nome || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  EINK.fotoAluno = (a, classe = "") => `<button type="button" class="foto-bot ${classe}" data-foto="${a.id}" aria-label="Fotografia de ${esc(a.nome)}: mudar ou remover">${a.foto ? `<img class="foto" src="/api/alunos/${a.id}/foto?v=${encodeURIComponent(a.foto)}" alt="">` : `<span class="foto foto-vazia" aria-hidden="true">${esc(iniciais(a.nome))}</span>`}</button>`;

  // Lê o ficheiro, corta ao centro e reduz (sem blob:, por causa da política de segurança).
  const reduzir = (ficheiro) => new Promise((ok, mal) => {
    const leitor = new FileReader();
    leitor.onerror = () => mal(new Error("Não foi possível ler a imagem."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => mal(new Error("O ficheiro não é uma imagem que o navegador consiga abrir."));
      img.onload = () => {
        const lado = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = 256;
        c.getContext("2d").drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
        ok(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(ficheiro);
  });
  EINK.guardarFoto = async (id, ficheiro) => { const imagem = await reduzir(ficheiro); return api("PUT", `/api/alunos/${id}/foto`, { imagem }); };

  EINK.janelaFoto = (a, depois) => {
    const dlg = document.createElement("dialog"); dlg.className = "foto-dlg";
    dlg.innerHTML = `<h2 style="margin-top:0">${esc(a.nome)}</h2><div class="foto-grande">${a.foto ? `<img src="/api/alunos/${a.id}/foto?v=${encodeURIComponent(a.foto)}" alt="Fotografia de ${esc(a.nome)}">` : `<span class="foto foto-vazia">${esc(iniciais(a.nome))}</span>`}</div>
      <p class="pequeno">A imagem é cortada ao centro e reduzida. Usa fotografias só com autorização, e só para a tua gestão da turma.</p>
      <p class="linha"><label class="botao">${a.foto ? "Mudar a fotografia" : "Escolher fotografia"}<input type="file" accept="image/*" hidden></label>${a.foto ? '<button type="button" class="perigo" data-rm>Remover</button>' : ""}<button type="button" class="sec" data-fechar>Fechar</button></p>`;
    document.body.append(dlg); dlg.showModal();
    const fechar = () => { dlg.close(); dlg.remove(); };
    $("[data-fechar]", dlg).onclick = fechar; dlg.addEventListener("cancel", () => dlg.remove());
    $("input[type=file]", dlg).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const r = await EINK.guardarFoto(a.id, f); a.foto = r.foto; aviso("Fotografia guardada."); fechar(); depois(); } catch (er) { aviso(er.message, true); } };
    const rm = $("[data-rm]", dlg); if (rm) rm.onclick = async () => { await api("DELETE", `/api/alunos/${a.id}/foto`); a.foto = null; aviso("Fotografia removida."); fechar(); depois(); };
  };
})();
