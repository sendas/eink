"use strict";
// Fotografias da turma a partir de um PDF (ou imagem) com todas as fotografias: TPRetratosAuto encontra cada fotografia e o nome por baixo,
// liga-a ao aluno, e aqui o docente confirma antes de guardar. O ficheiro nunca sai do navegador: só se guardam os recortes (256 px).
(() => {
  const { api, aviso, esc, $ } = EINK;
  const ETIQUETA = { alta: ["certeza alta", "etq-alta"], media: ["a confirmar", "etq-media"], ordem: ["pela ordem da folha", "etq-media"] };

  EINK.guardarFotoURL = (alunoId, imagem) => api("PUT", `/api/alunos/${alunoId}/foto`, { imagem });

  // Recorte quadrado de 256 px da fotografia (fotografias de pessoa: um pouco acima do centro, para não cortar a cara).
  const recorte = (tela, q) => {
    const lado = Math.min(q.w, q.h), c = document.createElement("canvas"); c.width = c.height = 256;
    const sx = q.x + (q.w - lado) / 2, sy = q.y + (q.h - lado) * (q.h > q.w ? 0.2 : 0.5);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 256, 256); g.drawImage(tela, sx, sy, lado, lado, 0, 0, 256, 256);
    return c.toDataURL("image/jpeg", 0.85);
  };
  const miniatura = (tela, q) => {
    const c = document.createElement("canvas"), w = 72, h = Math.max(24, Math.min(110, Math.round((72 * q.h) / q.w))); c.width = w; c.height = h; c.className = "retrato-mini";
    c.getContext("2d").drawImage(tela, q.x, q.y, q.w, q.h, 0, 0, w, h); return c;
  };

  EINK.ligarFotosPdf = (alunos, depois) => {
    const entrada = $("#f-fotos-pdf"); if (!entrada) return;
    entrada.onchange = async () => {
      const f = entrada.files[0]; if (!f) return;
      const estado = $("#fotos-pdf-estado"), res = $("#fotos-pdf-res"); res.replaceChildren(); estado.textContent = "A começar…";
      if (!window.TPRetratosAuto) { estado.textContent = "O leitor de fotografias não carregou. Recarrega a página."; return; }
      let r;
      try { r = await window.TPRetratosAuto.analisar(f, alunos.map((a) => ({ user: a.id, nome: a.nome })), (m) => { estado.textContent = m; }); }
      catch (e) { estado.textContent = e.message; aviso(e.message, true); return; }
      if (!r.fotos.length) { estado.textContent = "Não encontrei fotografias nesse ficheiro. Se tens as fotografias em ficheiros separados, usa a opção das várias fotografias, mais abaixo."; return; }
      const ligadas = r.fotos.filter((x) => x.user).length;
      estado.textContent = `${r.fotos.length} fotografia(s) encontrada(s), ${ligadas} ligada(s) a alunos.${r.porOrdem ? " Não consegui ler os nomes: liguei-as pela ordem da folha, confirma com atenção." : r.semTexto ? " Não consegui ler os nomes: escolhe o aluno de cada uma." : ""}`;

      const tabela = document.createElement("table"); tabela.innerHTML = "<thead><tr><th>Guardar</th><th>Fotografia</th><th>Texto lido</th><th>Aluno</th></tr></thead>";
      const corpo = document.createElement("tbody"); tabela.append(corpo);
      const opcoes = (sel) => `<option value="">Não guardar</option>` + alunos.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${a.numero ?? ""} ${esc(a.nome)}</option>`).join("");
      r.fotos.forEach((x, i) => {
        const tr = document.createElement("tr"), et = ETIQUETA[x.certeza];
        tr.innerHTML = `<td><input type="checkbox" class="usar" ${x.user ? "checked" : ""} aria-label="Guardar a fotografia ${i + 1}"></td><td class="mini"></td><td>${esc(x.texto || "sem texto")}${et ? ` <span class="etq ${et[1]}">${et[0]}</span>` : ""}</td><td><select>${opcoes(x.user)}</select></td>`;
        tr.querySelector(".mini").append(miniatura(r.paginas[x.pag].tela, x.q));
        const sel = tr.querySelector("select"), uso = tr.querySelector(".usar");
        sel.onchange = () => { uso.checked = !!sel.value; conta(); }; uso.onchange = conta;
        tr._x = x; corpo.append(tr);
      });
      const caixa = document.createElement("div"); caixa.className = "tabela-rolagem"; caixa.append(tabela);
      const rodape = document.createElement("p"); rodape.innerHTML = `<span id="fotos-pdf-conta" class="pequeno"></span><br><button type="button" id="fotos-pdf-ok">Guardar as fotografias escolhidas</button>`;
      res.append(caixa, rodape);
      const linhas = () => [...corpo.children];
      function conta() {
        const sel = linhas().filter((tr) => tr.querySelector(".usar").checked && tr.querySelector("select").value), ids = sel.map((tr) => tr.querySelector("select").value), rep = ids.length - new Set(ids).size;
        $("#fotos-pdf-conta").textContent = `${sel.length} para guardar${rep ? `. Atenção: ${rep} aluno(s) com mais do que uma fotografia (fica a última).` : "."}`;
        $("#fotos-pdf-ok").disabled = !sel.length;
      }
      conta();
      $("#fotos-pdf-ok").onclick = async () => {
        const sel = linhas().filter((tr) => tr.querySelector(".usar").checked && tr.querySelector("select").value);
        $("#fotos-pdf-ok").disabled = true; let feitas = 0;
        for (const tr of sel) {
          const x = tr._x;
          try { await EINK.guardarFotoURL(Number(tr.querySelector("select").value), recorte(r.paginas[x.pag].tela, x.q)); feitas++; $("#fotos-pdf-conta").textContent = `A guardar… ${feitas} de ${sel.length}`; }
          catch (e) { aviso(e.message, true); }
        }
        aviso(`${feitas} fotografia(s) guardada(s).`); if (depois) depois();
      };
    };
  };
})();
