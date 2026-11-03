"use strict";
// Fotografias da turma automáticas (public/admin-retratos.js): TPRetratosAuto.analisar(ficheiro, alunos, progresso)
// lê um PDF (pdf.js em /vendor/pdfjs: a posição de cada imagem e o texto da página) ou uma imagem (procura blocos com
// aspeto de fotografia e lê os nomes com o Tesseract de /vendor/tesseract), junta a cada fotografia o texto por baixo
// (ou por cima) e liga-o ao aluno da turma com o nome mais parecido. Devolve { paginas: [{ tela }], fotos: [{ pag, q, texto, user, certeza }], porOrdem, semTexto }.
// Nada sai do navegador: o PDF e a imagem só são lidos aqui.
(() => {
  const V = "4.10.38";
  let pdfLib = null, ocr = null;
  const ehPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name || "");

  async function pdfjs() {
    if (!pdfLib) {
      pdfLib = await import(`/vendor/pdfjs/pdf.min.mjs?v=${V}`);
      pdfLib.GlobalWorkerOptions.workerSrc = `/vendor/pdfjs/pdf.worker.min.mjs?v=${V}`;
    }
    return pdfLib;
  }
  const tela = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // Páginas do ficheiro: { tela, textos: [{ t, x0, y0, x1, y1 }] | null, imagens: [{ x, y, w, h }] | null } (coordenadas da tela).
  async function paginas(f, progresso) {
    if (!ehPdf(f)) {
      let b;
      try { b = await createImageBitmap(f, { imageOrientation: "from-image" }); } catch { throw new Error("Esse ficheiro não é uma imagem nem um PDF que o navegador consiga abrir."); }
      // Imagens pequenas (capturas) são ampliadas para os nomes se lerem melhor.
      const k = Math.min(2.5, Math.max(1, 2000 / b.width), 3200 / Math.max(b.width, b.height));
      const c = tela(b.width * k, b.height * k), g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(b, 0, 0, c.width, c.height);
      return [{ tela: c, textos: null, imagens: null }];
    }
    progresso("A abrir o PDF...");
    const L = await pdfjs();
    let doc;
    try { doc = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false, disableAutoFetch: true }).promise; } catch { throw new Error("Não consegui abrir esse PDF (está protegido ou danificado?)."); }
    const res = [], n = Math.min(doc.numPages, 12);
    for (let p = 1; p <= n; p++) {
      progresso(`A ler a página ${p} de ${n}...`);
      const pg = await doc.getPage(p), v1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: Math.min(4, Math.max(1, 2000 / v1.width)) });
      const c = tela(vp.width, vp.height), g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      const textos = [];
      for (const it of (await pg.getTextContent()).items) {
        if (!it.str || !it.str.trim()) continue;
        const m = L.Util.transform(vp.transform, it.transform), fh = Math.hypot(m[2], m[3]) || 10;
        textos.push({ t: it.str, x0: m[4], y0: m[5] - fh, x1: m[4] + (it.width || 0) * vp.scale, y1: m[5] });
      }
      res.push({ tela: c, textos, imagens: imagensDoPdf(L, await pg.getOperatorList(), vp, c) });
    }
    if (doc.numPages > n) progresso(`Só leio as primeiras ${n} páginas.`);
    return res;
  }
  // As imagens desenhadas na página (cada fotografia de um PDF da escola costuma ser uma imagem): segue a matriz atual.
  function imagensDoPdf(L, ops, vp, c) {
    const O = L.OPS, pilha = [], out = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const pintar = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageXObjectRepeat, O.paintJpegXObject].filter((x) => x !== undefined));
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) pilha.push(ctm);
      else if (fn === O.restore) ctm = pilha.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === O.transform) ctm = L.Util.transform(ctm, a);
      else if (fn === O.paintFormXObjectBegin) { pilha.push(ctm); if (a && Array.isArray(a[0]) && a[0].length === 6) ctm = L.Util.transform(ctm, a[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = pilha.pop() || [1, 0, 0, 1, 0, 0];
      else if (pintar.has(fn)) {
        const m = L.Util.transform(vp.transform, ctm);
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys)), w = Math.min(c.width, Math.max(...xs)) - x, h = Math.min(c.height, Math.max(...ys)) - y;
        if (w > 20 && h > 20) out.push({ x, y, w, h });
      }
    }
    // Fora: logótipos pequenos, fundos e páginas digitalizadas (uma imagem a ocupar quase tudo).
    const area = c.width * c.height;
    return filtrarTamanho(out.filter((b) => b.w * b.h > area * 0.0015 && b.w * b.h < area * 0.35 && b.h / b.w > 0.5 && b.h / b.w < 2.5));
  }
  // Mantém as do tamanho mais comum (as fotografias da turma têm todas o mesmo tamanho).
  function filtrarTamanho(bs) {
    if (bs.length < 3) return bs;
    const as = bs.map((b) => b.w * b.h).sort((a, b) => a - b), med = as[Math.floor(as.length / 2)];
    return bs.filter((b) => b.w * b.h > med * 0.4 && b.w * b.h < med * 2.5);
  }

  // Imagem: blocos densos com proporção de fotografia, depois de tirar as linhas finas (molduras e grelhas da tabela).
  function detetarRaster(src) {
    const W = 480, f = W / src.width, H = Math.max(1, Math.round(src.height * f));
    const c = tela(W, H), g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H;
    const lum = new Float32Array(N), sat = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; lum[i] = 0.299 * r + 0.587 * gg + 0.114 * b; sat[i] = Math.max(r, gg, b) - Math.min(r, gg, b); }
    const borda = [];
    for (let x = 0; x < W; x += 2) borda.push(lum[x], lum[(H - 1) * W + x]);
    for (let y = 0; y < H; y += 2) borda.push(lum[y * W], lum[y * W + W - 1]);
    borda.sort((a, b) => a - b);
    const fundo = borda[Math.floor(borda.length / 2)];
    let tinta = new Uint8Array(N);
    for (let i = 0; i < N; i++) tinta[i] = Math.abs(lum[i] - fundo) > 26 || sat[i] > 40 ? 1 : 0;
    // Linhas finas: corridas longas com pouca espessura.
    const linha = new Uint8Array(N), LH = Math.round(W * 0.07), LV = Math.round(H * 0.05);
    const esp = (x, y, dx, dy) => { let n = 1; for (let k = 1; k <= 4; k++) { const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !tinta[yy * W + xx]) break; n++; } for (let k = 1; k <= 4; k++) { const xx = x - dx * k, yy = y - dy * k; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !tinta[yy * W + xx]) break; n++; } return n; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W;) {
      if (!tinta[y * W + x]) { x++; continue; }
      let e = x; while (e < W && tinta[y * W + e]) e++;
      if (e - x >= LH) for (let k = x; k < e; k++) if (esp(k, y, 0, 1) <= 3) linha[y * W + k] = 1;
      x = e;
    }
    for (let x = 0; x < W; x++) for (let y = 0; y < H;) {
      if (!tinta[y * W + x]) { y++; continue; }
      let e = y; while (e < H && tinta[e * W + x]) e++;
      if (e - y >= LV) for (let k = y; k < e; k++) if (esp(x, k, 1, 0) <= 3) linha[k * W + x] = 1;
      y = e;
    }
    for (let i = 0; i < N; i++) if (linha[i]) tinta[i] = 0;
    // Fecho (dilatar e erodir) para encher os claros dentro das fotografias.
    // Dilatar (algum vizinho) ou erodir (todos os vizinhos dentro da imagem) numa janela de 2r+1, por linhas e depois por colunas.
    const passo = (m, r, dil) => {
      const um = (ler, escrever, n) => { let s = 0; for (let k = 0; k < Math.min(r, n); k++) s += ler(k); for (let x = 0; x < n; x++) { if (x + r < n) s += ler(x + r); if (x - r - 1 >= 0) s -= ler(x - r - 1); const val = Math.min(n - 1, x + r) - Math.max(0, x - r) + 1; escrever(x, dil ? (s > 0 ? 1 : 0) : (s === val ? 1 : 0)); } };
      const a = new Uint8Array(N), b = new Uint8Array(N);
      for (let y = 0; y < H; y++) um((x) => m[y * W + x], (x, v) => { a[y * W + x] = v; }, W);
      for (let x = 0; x < W; x++) um((y) => a[y * W + x], (y, v) => { b[y * W + x] = v; }, H);
      return b;
    };
    const tinta0 = tinta;
    tinta = passo(passo(tinta, 2, true), 2, false);
    // Componentes ligadas.
    const vis = new Int32Array(N), fila = new Int32Array(N), cand = [];
    let id = 0;
    for (let i = 0; i < N; i++) {
      if (!tinta[i] || vis[i]) continue;
      id++; let ini = 0, fim = 0; fila[fim++] = i; vis[i] = id;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
      while (ini < fim) {
        const p = fila[ini++], x = p % W, y = (p - x) / W; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && tinta[p - 1] && !vis[p - 1]) { vis[p - 1] = id; fila[fim++] = p - 1; }
        if (x < W - 1 && tinta[p + 1] && !vis[p + 1]) { vis[p + 1] = id; fila[fim++] = p + 1; }
        if (y > 0 && tinta[p - W] && !vis[p - W]) { vis[p - W] = id; fila[fim++] = p - W; }
        if (y < H - 1 && tinta[p + W] && !vis[p + W]) { vis[p + W] = id; fila[fim++] = p + W; }
      }
      // Um nome muito perto da fotografia junta-se a ela: corta na linha vazia que os separa (só no terço de baixo ou de cima).
      const cheia = (y) => { let n2 = 0; for (let x = x0; x <= x1; x++) n2 += tinta0[y * W + x]; return n2 / (x1 - x0 + 1); };
      const alt = y1 - y0 + 1;
      for (let y = y1; y > y1 - alt * 0.4; y--) if (cheia(y) < 0.02) { y1 = y - 1; break; }
      for (let y = y0; y < y0 + alt * 0.3 && y < y1; y++) if (cheia(y) < 0.02) { y0 = y + 1; break; }
      while (y1 > y0 && cheia(y1) < 0.02) y1--;
      while (y0 < y1 && cheia(y0) < 0.02) y0++;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < W * 0.03 || bw * bh < N * 0.002 || bw * bh > N * 0.35) continue;
      let enc = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) enc += tinta[y * W + x];
      if (enc / (bw * bh) < 0.5 || bh / bw < 0.7 || bh / bw > 2.3) continue;
      cand.push({ x: x0 / f, y: y0 / f, w: bw / f, h: bh / f });
    }
    return filtrarTamanho(cand);
  }

  // Ordem de leitura: por linhas (centros com menos de meia altura de diferença) e, em cada uma, da esquerda para a direita.
  function ordenar(bs) {
    const s = [...bs].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2)), linhas = [];
    for (const b of s) { const l = linhas[linhas.length - 1]; if (l && Math.abs((l[0].y + l[0].h / 2) - (b.y + b.h / 2)) < Math.min(l[0].h, b.h) / 2) l.push(b); else linhas.push([b]); }
    return linhas.flatMap((l) => l.sort((a, b) => a.x - b.x));
  }

  async function lerTexto(c, progresso) {
    if (!window.Tesseract) await new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "/vendor/tesseract/tesseract.min.js?v=5.1.1"; s.onload = ok; s.onerror = () => ko(new Error("Não consegui carregar o leitor de texto.")); document.head.append(s); });
    if (!ocr) {
      progresso("A preparar o leitor de texto (só demora na primeira vez)...");
      ocr = window.Tesseract.createWorker("por", 1, { workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract", langPath: "/vendor/tesseract/lang", workerBlobURL: false, gzip: true,
        logger: (m) => { if (m.status === "recognizing text") progresso(`A ler os nomes... ${Math.round(m.progress * 100)}%`); } })
        .then(async (w) => { await w.setParameters({ tessedit_pageseg_mode: "11" }); return w; });
      ocr.catch(() => { ocr = null; });
    }
    const w = await ocr;
    const r = (await w.recognize(c, {}, { blocks: true, text: true })).data, out = [];
    for (const b of r.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const x of l.words || []) {
      if (x.text && x.text.trim() && (x.confidence === undefined || x.confidence > 30)) out.push({ t: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 });
    }
    return out;
  }

  // O texto de cada fotografia: as palavras por baixo dela (ou, sem nenhuma, por cima), cada palavra só numa fotografia.
  function rotulos(fotos, textos) {
    const fora = (t) => fotos.some((b) => { const cx = (t.x0 + t.x1) / 2, cy = (t.y0 + t.y1) / 2; return cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h; });
    const ts = textos.filter((t) => !fora(t));
    const juntar = (cond) => {
      const por = new Map();
      for (const t of ts) {
        const cx = (t.x0 + t.x1) / 2;
        let best = null, dist = Infinity;
        for (const b of fotos) {
          if (!cond(t, b) || cx < b.x - b.w * 0.25 || cx > b.x + b.w * 1.25) continue;
          const dd = Math.abs(cx - (b.x + b.w / 2)); if (dd < dist) { dist = dd; best = b; }
        }
        if (best) { if (!por.has(best)) por.set(best, []); por.get(best).push(t); }
      }
      return por;
    };
    const baixo = juntar((t, b) => t.y0 >= b.y + b.h * 0.85 && t.y0 <= b.y + b.h * 1.9);
    const cima = juntar((t, b) => t.y1 <= b.y + b.h * 0.15 && t.y1 >= b.y - b.h * 0.9);
    for (const b of fotos) {
      const l = baixo.get(b) || cima.get(b) || [];
      b.texto = l.sort((a, c) => (Math.abs(a.y0 - c.y0) < 6 ? a.x0 - c.x0 : a.y0 - c.y0)).map((t) => t.t).join(" ").replace(/\s+/g, " ").trim();
    }
  }

  const PARAR = new Set(["de", "da", "do", "das", "dos", "e"]);
  const fichas = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").split(" ").filter((x) => x.length >= 2 && !PARAR.has(x));
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = cur; }
    return ant[b.length];
  }
  // Semelhança de um nome com o texto lido: cada palavra do nome conta 1 se aparece igual, menos se aparece com erros de leitura.
  function pontos(nome, toks) {
    let s = 0;
    for (const p of new Set(fichas(nome))) {
      let m = 0;
      for (const t of toks) { if (t === p) { m = 1; break; } const d = lev(p, t); if (p.length >= 5 && d <= 1) m = Math.max(m, 0.8); else if (p.length >= 8 && d <= 2) m = Math.max(m, 0.6); }
      s += m;
    }
    return s;
  }
  function ligar(fotos, alunos) {
    const pares = [];
    for (const b of fotos) {
      const toks = fichas(b.texto);
      if (!toks.length) continue;
      const sc = alunos.map((a) => ({ a, s: pontos(a.nome, toks) })).sort((x, y) => y.s - x.s);
      const [p1, p2] = sc, seg = p2 ? p2.s : 0;
      if (p1 && (p1.s >= 1.6 || (p1.s >= 0.8 && p1.s - seg >= 0.8))) pares.push({ b, user: p1.a.user, s: p1.s, folga: p1.s - seg });
    }
    pares.sort((x, y) => y.s - x.s || y.folga - x.folga);
    const usados = new Set();
    for (const p of pares) { if (p.b.user || usados.has(p.user)) continue; p.b.user = p.user; p.b.certeza = p.s >= 2 ? "alta" : "media"; usados.add(p.user); }
  }

  async function analisar(f, alunos, progresso = () => {}) {
    const pags = await paginas(f, progresso), fotos = [];
    let comTexto = false;
    for (let i = 0; i < pags.length; i++) {
      const P = pags[i];
      progresso(pags.length > 1 ? `A procurar as fotografias (página ${i + 1})...` : "A procurar as fotografias...");
      let bs = P.imagens && P.imagens.length ? P.imagens : detetarRaster(P.tela);
      bs = ordenar(bs.map((b) => ({ pag: i, x: b.x, y: b.y, w: b.w, h: b.h, texto: "", user: null, certeza: null })));
      if (!bs.length) continue;
      let textos = P.textos;
      if (!textos || !textos.length) { try { textos = await lerTexto(P.tela, progresso); } catch { textos = []; } }
      rotulos(bs, textos);
      if (bs.some((b) => b.texto)) comTexto = true;
      fotos.push(...bs);
    }
    ligar(fotos, alunos);
    // Sem nomes legíveis e com tantas fotografias como alunos: pela ordem da folha (a confirmar pelo professor).
    let porOrdem = false;
    if (!fotos.some((b) => b.user) && fotos.length && fotos.length === alunos.length) { fotos.forEach((b, k) => { b.user = alunos[k].user; b.certeza = "ordem"; }); porOrdem = true; }
    return { paginas: pags.map((p) => ({ tela: p.tela })), fotos: fotos.map((b) => ({ pag: b.pag, q: { x: b.x, y: b.y, w: b.w, h: b.h }, texto: b.texto, user: b.user, certeza: b.certeza })), porOrdem, semTexto: !comTexto };
  }

  window.TPRetratosAuto = { analisar, ehPdf, _teste: { fichas, pontos, ligar, ordenar, detetarRaster, lerTexto } };
})();
