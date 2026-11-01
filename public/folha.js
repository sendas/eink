"use strict";
// Folha ao estilo do Excel online, aplicada a uma tabela de células editáveis (input.nota ou select):
// letras de coluna, caixa de nome, cabeçalhos e primeiras colunas fixos, setas/Enter/Tab, seleção de intervalos
// (rato e Shift+setas), copiar/colar de e para o Excel, preencher para baixo (Ctrl+D), apagar, desfazer (Ctrl+Z).
// A gravação fica a cargo de quem a usa (opc.aplicar), que recebe todas as alterações de uma vez.
(() => {
  const { $, $$ } = EINK;
  const letra = (n) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const CTL = "input.nota, select";

  EINK.folha = (tabela, opc = {}) => {
    const corpo = $("tbody", tabela), cabeca = $("thead", tabela);
    if (!corpo || !cabeca || !$(CTL, corpo)) return;
    const caixa = tabela.closest(".tabela-rolagem") || tabela.parentElement;
    caixa.classList.add("folha-caixa"); tabela.classList.add("folha");
    const linhas = () => $$("tr", corpo).filter((tr) => $(CTL, tr));
    const celulas = (tr) => $$("td", tr).filter((td) => $(CTL, td));
    const ctl = (r, c) => { const tr = linhas()[r]; const td = tr && celulas(tr)[c]; return td ? $(CTL, td) : null; };
    const posDe = (el) => { const td = el.closest("td"), tr = td.closest("tr"); return [linhas().indexOf(tr), celulas(tr).indexOf(td)]; };
    const nCol = () => Math.max(...linhas().map((tr) => celulas(tr).length));
    const editavel = (el) => el && !el.disabled && !el.readOnly;

    // Letras de coluna por cima do cabeçalho existente.
    const nTotal = linhas()[0].children.length;
    const trL = document.createElement("tr"); trL.className = "folha-letras";
    for (let i = 0; i < nTotal; i++) { const th = document.createElement("th"); th.textContent = letra(i); th.setAttribute("aria-hidden", "true"); trL.append(th); }
    cabeca.prepend(trL);

    // Caixa de nome e barra de fórmulas.
    const barra = document.createElement("div"); barra.className = "folha-barra"; barra.innerHTML = `<span class="folha-nome" aria-live="polite">–</span><span class="folha-rotulo pequeno">Clica numa célula. Setas, Enter e Tab movem-se; podes colar do Excel.</span>`;
    caixa.before(barra);
    const nomeEl = $(".folha-nome", barra), rotEl = $(".folha-rotulo", barra);

    // Cabeçalhos e primeiras duas colunas fixos (medidos depois de a tabela estar desenhada).
    const fixar = () => {
      let topo = 0; for (const tr of $$("tr", cabeca)) { const h = tr.getBoundingClientRect().height; $$("th", tr).forEach((th) => { th.style.top = topo + "px"; }); topo += h; }
      const w0 = linhas()[0].children[0].getBoundingClientRect().width;
      const marca = (th, esq) => { th.style.left = esq + "px"; th.classList.add("folha-fixa"); };
      const x0 = tabela.getBoundingClientRect().left;
      $$("th", cabeca).forEach((th) => { const x = Math.round(th.getBoundingClientRect().left - x0 + caixa.scrollLeft); if (x === 0) marca(th, 0); else if (Math.abs(x - w0) < 2) marca(th, w0); });
      linhas().forEach((tr) => { const [a, b] = tr.children; a.style.left = "0px"; a.classList.add("folha-fixa"); b.style.left = w0 + "px"; b.classList.add("folha-fixa"); });
    };
    requestAnimationFrame(fixar);

    // Seleção
    let ancora = null, foco = null, desfazer = [];
    const limites = () => ancora && foco ? [Math.min(ancora[0], foco[0]), Math.max(ancora[0], foco[0]), Math.min(ancora[1], foco[1]), Math.max(ancora[1], foco[1])] : null;
    const selecionados = () => { const L = limites(); const out = []; if (!L) return out; for (let r = L[0]; r <= L[1]; r++) { const linha = []; for (let c = L[2]; c <= L[3]; c++) linha.push(ctl(r, c)); out.push(linha); } return out; };
    const pintar = () => {
      $$(".fo-sel, .fo-ativa", corpo).forEach((e) => e.classList.remove("fo-sel", "fo-ativa"));
      const L = limites(); if (!L) return;
      selecionados().flat().forEach((e) => e && e.closest("td").classList.add("fo-sel"));
      if (foco) { const e = ctl(...foco); if (e) e.closest("td").classList.add("fo-ativa"); }
      const e = ctl(...foco); const tr = e.closest("tr"), n = linhas().indexOf(tr) + 1;
      const ref = (r, c) => letra(celulas(linhas()[r])[c].cellIndex) + (r + 1);
      nomeEl.textContent = L[0] === L[1] && L[2] === L[3] ? ref(foco[0], foco[1]) : `${ref(L[0], L[2])}:${ref(L[1], L[3])}`;
      rotEl.textContent = e.getAttribute("aria-label") || `Linha ${n}`;
    };
    const ir = (r, c, estender, focar = true) => {
      const R = linhas().length, C = nCol(); r = Math.max(0, Math.min(R - 1, r)); c = Math.max(0, Math.min(C - 1, c));
      const e = ctl(r, c); if (!e) return;
      foco = [r, c]; if (!estender) ancora = [r, c];
      if (focar) e.focus({ preventScroll: false });
      pintar();
      if (focar && e.select && e.tagName === "INPUT") e.select();
      e.closest("td").scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    // Aplicar alterações (guarda o estado anterior para desfazer)
    const aplicar = async (lista, semDesfazer) => {
      lista = lista.filter((x) => editavel(x.el) && x.el.value !== x.valor);
      if (!lista.length) return;
      if (!semDesfazer) { desfazer.push(lista.map((x) => ({ el: x.el, valor: x.el.value }))); if (desfazer.length > 30) desfazer.shift(); }
      if (opc.aplicar) await opc.aplicar(lista);
      else lista.forEach((x) => { x.el.value = x.valor; x.el.dispatchEvent(new Event("change", { bubbles: true })); });
    };

    // Rato
    corpo.addEventListener("mousedown", (ev) => {
      const el = ev.target.closest("td") && $(CTL, ev.target.closest("td")); if (!el) return;
      const [r, c] = posDe(el);
      if (ev.shiftKey && ancora) { ev.preventDefault(); foco = [r, c]; pintar(); return; }
      ancora = [r, c]; foco = [r, c]; pintar(); corpo.dataset.arrasta = "1";
    });
    corpo.addEventListener("mouseover", (ev) => {
      if (corpo.dataset.arrasta !== "1" || !(ev.buttons & 1)) return;
      const td = ev.target.closest("td"), el = td && $(CTL, td); if (!el) return;
      const [r, c] = posDe(el); if (r === foco[0] && c === foco[1]) return;
      foco = [r, c]; pintar(); getSelection().removeAllRanges(); if (document.activeElement && document.activeElement.blur && (r !== ancora[0] || c !== ancora[1])) document.activeElement.blur();
    });
    document.addEventListener("mouseup", () => { delete corpo.dataset.arrasta; });
    corpo.addEventListener("focusin", (ev) => { const el = ev.target.closest && ev.target.matches(CTL) ? ev.target : null; if (!el) return; el.dataset.orig = el.value; const [r, c] = posDe(el); if (!foco || foco[0] !== r || foco[1] !== c || (limites() && ancora[0] === foco[0] && ancora[1] === foco[1])) { foco = [r, c]; if (!ancora || !corpo.dataset.arrasta) ancora = [r, c]; pintar(); } });

    // Teclado
    corpo.addEventListener("keydown", (ev) => {
      const el = ev.target; if (!el.matches || !el.matches(CTL)) return;
      const [r, c] = foco || posDe(el), multi = limites() && (ancora[0] !== foco[0] || ancora[1] !== foco[1]);
      const mod = ev.ctrlKey || ev.metaKey, k = ev.key;
      const noFimTexto = el.tagName !== "INPUT" || (el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length) || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
      const noInicioTexto = el.tagName !== "INPUT" || (el.selectionStart === 0 && el.selectionEnd === 0) || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
      const mover = (dr, dc) => { ev.preventDefault(); const base = ev.shiftKey ? foco : [r, c]; ir(base[0] + dr, base[1] + dc, ev.shiftKey); };
      if (k === "ArrowDown") return mover(1, 0);
      if (k === "ArrowUp") return mover(-1, 0);
      if (k === "ArrowRight" && (noFimTexto || ev.shiftKey)) return mover(0, 1);
      if (k === "ArrowLeft" && (noInicioTexto || ev.shiftKey)) return mover(0, -1);
      if (k === "Enter") { ev.preventDefault(); if (el.tagName === "INPUT") el.blur(); return ir(r + (ev.shiftKey ? -1 : 1), c, false); }
      if (k === "Escape") { if (el.dataset.orig !== undefined) el.value = el.dataset.orig; ancora = foco = [r, c]; pintar(); return; }
      if (k === "Home" && mod) { ev.preventDefault(); return ir(0, 0, ev.shiftKey); }
      if (k === "End" && mod) { ev.preventDefault(); return ir(linhas().length - 1, nCol() - 1, ev.shiftKey); }
      if ((k === "Delete" || k === "Backspace") && multi) { ev.preventDefault(); return aplicar(selecionados().flat().filter(Boolean).map((e) => ({ el: e, valor: "" }))); }
      if (mod && (k === "d" || k === "D")) {
        ev.preventDefault(); const L = limites(), alt = [];
        for (let cc = L[2]; cc <= L[3]; cc++) { const o = ctl(L[0], cc); if (!o) continue; for (let rr = L[0] + (L[1] > L[0] ? 1 : 0); rr <= Math.max(L[1], L[0] + 1); rr++) { const d = ctl(rr, cc); if (d && d !== o) alt.push({ el: d, valor: o.value }); } }
        return aplicar(alt);
      }
      if (mod && (k === "z" || k === "Z") && desfazer.length) { ev.preventDefault(); const u = desfazer.pop(); return aplicar(u.map((x) => ({ el: x.el, valor: x.valor })), true); }
      if (mod && (k === "a" || k === "A") && multi) { ev.preventDefault(); ancora = [0, 0]; foco = [linhas().length - 1, nCol() - 1]; pintar(); }
    });

    // Copiar e colar (texto separado por tabulações, como no Excel)
    corpo.addEventListener("copy", (ev) => {
      const L = limites(); if (!L || (L[0] === L[1] && L[2] === L[3])) return;
      ev.preventDefault(); ev.clipboardData.setData("text/plain", selecionados().map((l) => l.map((e) => (e ? e.value : "")).join("\t")).join("\n"));
    });
    corpo.addEventListener("cut", (ev) => {
      const L = limites(); if (!L || (L[0] === L[1] && L[2] === L[3])) return;
      ev.preventDefault(); ev.clipboardData.setData("text/plain", selecionados().map((l) => l.map((e) => (e ? e.value : "")).join("\t")).join("\n"));
      aplicar(selecionados().flat().filter(Boolean).map((e) => ({ el: e, valor: "" })));
    });
    corpo.addEventListener("paste", (ev) => {
      const el = ev.target; if (!el.matches || !el.matches(CTL)) return;
      const texto = (ev.clipboardData.getData("text/plain") || "").replace(/\r/g, "").replace(/\n$/, "");
      if (!texto) return;
      const grelha = texto.split("\n").map((l) => l.split("\t"));
      const unica = grelha.length === 1 && grelha[0].length === 1;
      const L = limites() || [...posDe(el), ...posDe(el)].slice(0, 4);
      const multi = limites() && (ancora[0] !== foco[0] || ancora[1] !== foco[1]);
      if (unica && !multi) return; // colagem normal dentro de uma só célula
      ev.preventDefault();
      const r0 = multi ? L[0] : foco[0], c0 = multi ? L[2] : foco[1], alt = [];
      if (unica) { selecionados().flat().forEach((e) => e && alt.push({ el: e, valor: grelha[0][0].trim() })); }
      else grelha.forEach((l, i) => l.forEach((v, j) => { const e = ctl(r0 + i, c0 + j); if (e) alt.push({ el: e, valor: v.trim() }); }));
      // O select só aceita valores que existem; os outros ficam de fora.
      const boas = alt.filter((x) => x.el.tagName !== "SELECT" || [...x.el.options].some((o) => o.value === x.valor || o.text === x.valor));
      boas.forEach((x) => { if (x.el.tagName === "SELECT") x.valor = [...x.el.options].find((o) => o.value === x.valor || o.text === x.valor).value; });
      aplicar(boas).then(() => { ancora = [r0, c0]; foco = [Math.min(linhas().length - 1, r0 + (unica ? 0 : grelha.length - 1)), Math.min(nCol() - 1, c0 + (unica ? 0 : Math.max(...grelha.map((l) => l.length)) - 1))]; pintar(); if (EINK.aviso) EINK.aviso(`${boas.length} célula(s) preenchida(s).`); });
    });
  };
})();
