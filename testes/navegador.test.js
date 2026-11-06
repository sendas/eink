"use strict";
// Teste no navegador (Chromium, via Playwright): percorre os ecrãs principais como um docente e como um aluno e falha se houver
// erros de JavaScript ou pedidos falhados. Se o Playwright ou o Chromium não existirem, o teste é saltado (não falha).
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const { criarServidor } = require("../server");

let chromium = null;
try { ({ chromium } = require("playwright")); } catch { /* sem Playwright */ }

test("navegador: percurso do docente, do administrador e dos alunos", { skip: !chromium && "Playwright não está instalado", timeout: 120000 }, async (t) => {
  let browser;
  try { browser = await chromium.launch(); } catch (e) { t.skip("Chromium indisponível: " + e.message.split("\n")[0]); return; }
  const { servidor } = criarServidor({ DB_FILE: ":memory:", DATA_DIR: os.tmpdir() + "/eink-nav", SEGREDO: "teste", DEV_LOGIN: "1", ADMIN_USERS: "admin@escola.pt", BASE_URL: "http://localhost" });
  await new Promise((r) => servidor.listen(0, r));
  const base = "http://127.0.0.1:" + servidor.address().port;
  t.after(async () => { await browser.close(); servidor.close(); });

  const erros = [];
  const vigiar = (page, quem) => {
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => erros.push(`${quem}: ${e.message}`));
    // Um 409 faz parte de um fluxo normal (pede confirmação antes de apagar notas), por isso não conta como erro.
    page.on("console", (m) => { if (m.type() === "error" && !/status of 409/.test(m.text()) && !(quem === "docente local" && /status of 401/.test(m.text()))) erros.push(`${quem}: ${m.text()}`); });
    page.on("dialog", (d) => (d.type() === "prompt" ? d.accept(d.defaultValue()) : d.accept())); // confirmações e pedidos de texto (aceita o valor sugerido)
  };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); vigiar(p, "docente");
  const ir = async (hash, seletor) => { await p.goto(`${base}/#${hash}`); await p.waitForSelector(seletor); };

  // Entrada e painel
  await p.goto(`${base}/auth/entrar?dev=admin@escola.pt`);
  await p.waitForSelector(".cartoes");
  const cartoes = await p.locator(".cartao").allTextContents();
  assert.ok(cartoes.some((c) => c.includes("Sondagem")) && cartoes.some((c) => c.includes("Quizzes")));
  assert.ok(!cartoes.some((c) => /ruído/i.test(c)), "o medidor de ruído foi retirado");

  // Tema: automático → claro → escuro → automático
  const tema = () => p.evaluate(() => document.documentElement.getAttribute("data-tema"));
  assert.strictEqual(await tema(), null);
  assert.strictEqual(await p.getAttribute(".tema-switch", "aria-checked"), "false", "sem escolha segue o sistema (claro no teste)");
  await p.click(".tema-switch"); assert.strictEqual(await tema(), "escuro"); assert.strictEqual(await p.getAttribute(".tema-switch", "aria-checked"), "true");
  await p.click(".tema-switch"); assert.strictEqual(await tema(), "claro"); assert.strictEqual(await p.getAttribute(".tema-switch", "aria-checked"), "false");
  await p.click(".tema-auto"); assert.strictEqual(await tema(), null);

  // Contas locais: o administrador cria uma, o docente entra com ela e é obrigado a mudar a palavra-passe
  await ir("/admin", "#f-local");
  await p.fill("#f-local [name=utilizador]", "rui.local"); await p.fill("#f-local [name=nome]", "Rui Local"); await p.click("#f-local button");
  await p.waitForSelector("#cred-senha");
  const senhaLocal = await p.textContent("#cred-senha");
  const pl = await (await browser.newContext()).newPage(); vigiar(pl, "docente local");
  await pl.goto(`${base}/entrar.html`);
  // Slideshow: ampliar a captura (versão grande), passar à seguinte com a seta e fechar com Esc
  await pl.click("#sl-ampliar"); await pl.waitForSelector("#lb[open]");
  assert.match(await pl.getAttribute("#lb-img", "src"), /slide-1-g\.jpg/);
  await pl.keyboard.press("ArrowRight"); assert.match(await pl.getAttribute("#lb-img", "src"), /slide-2-g\.jpg/);
  assert.match(await pl.textContent("#lb-legenda"), /2 de 4/);
  await pl.keyboard.press("Escape"); await pl.waitForFunction(() => !document.getElementById("lb").open);
  await pl.click("#local summary"); await pl.waitForSelector("#f-local");
  await pl.fill("#f-local [name=utilizador]", "rui.local"); await pl.fill("#f-local [name=senha]", "errada1234"); await pl.click("#f-local button");
  await pl.waitForFunction(() => /errados/.test(document.getElementById("erro-local").textContent));
  await pl.fill("#f-local [name=senha]", senhaLocal); await pl.click("#f-local button");
  await pl.waitForSelector("#f-senha");
  await pl.fill("[name=atual]", senhaLocal); await pl.fill("[name=nova]", "palavraNova2026"); await pl.fill("[name=nova2]", "palavraNova2026"); await pl.click("#f-senha button");
  await pl.waitForSelector(".cartoes");
  await pl.context().close();
  await ir("/correio", "text=Email e avisos");

  // Aviso de versão nova: se o servidor diz outra versão, aparece a faixa com «Atualizar agora»
  await p.route("**/api/versao", (r) => r.fulfill({ json: { versao: "99.0.0", data: "2099-01-01 00:00", tipo: "novidade", itens: ["Coisa nova para ver."] } }));
  await p.evaluate(() => EINK.verificarVersao()); await p.waitForSelector(".nova-versao.nova #nv-atualizar");
  assert.match(await p.textContent(".nova-versao.nova"), /99\.0\.0/);
  await p.click("#nv-depois"); assert.strictEqual(await p.locator(".nova-versao").count(), 0);
  await p.unroute("**/api/versao");
  // Versão beta e sugestões: a faixa e o botão estão sempre visíveis e o envio funciona
  assert.ok(await p.isVisible(".beta-faixa"), "faixa «Versão beta» visível");
  assert.match(await p.textContent(".beta-faixa"), /Versão beta/);
  assert.ok(await p.isVisible(".sug-botao"), "botão das sugestões visível");
  await p.click(".sug-botao"); await p.waitForSelector(".sug-dlg[open]");
  await p.fill("#sug-texto", "Gostava de poder exportar a pauta para PDF."); await p.click("#sug-enviar");
  await p.waitForFunction(() => !document.querySelector(".sug-dlg"));
  // Turma, alunos colados do Excel, teste e nota
  await ir("/turmas", "#f-turma");
  await p.fill("#f-turma [name=nome]", "7.º A"); await p.fill("#f-turma [name=ano_letivo]", "2026/2027"); await p.selectOption("#f-turma [name=ano]", "7");
  await p.click("#f-turma button"); await p.waitForSelector("#f-alunos");
  await p.fill("#f-alunos textarea", "1\tAna Silva\tana@x.pt\n2\tBruno Costa\t\n3\tCarla Mendes");
  await p.click("#f-alunos button"); await p.waitForSelector("text=Carla Mendes");
  // Fotografias da turma num só PDF: o nome por baixo de cada fotografia liga-a ao aluno (a lista está noutra ordem)
  {
    const turmaUrl = p.url(), g = await (await browser.newContext()).newPage();
    const cx = ["#0f766e", "#b4532a", "#6b4e9b"].map((c) => `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'><rect width='300' height='400' fill='${c}'/><circle cx='150' cy='150' r='70' fill='#f3e6d8'/></svg>`);
    const html = `<body style="margin:30px;font-family:Arial"><div style="display:grid;grid-template-columns:repeat(3,180px);gap:36px 40px">${["Carla Mendes", "Ana Silva", "Bruno Costa"].map((n, i) => `<div style="text-align:center"><img src="data:image/svg+xml;base64,${Buffer.from(cx[i]).toString("base64")}" width="150" height="200"><div style="font-size:15px">${n}</div></div>`).join("")}</div></body>`;
    await g.setContent(html); const pdf = await g.pdf({ format: "A4" }); await g.context().close();
    await p.waitForSelector("#fotos-pdf"); await p.click("#fotos-pdf summary");
    await p.setInputFiles("#f-fotos-pdf", { name: "turma.pdf", mimeType: "application/pdf", buffer: pdf });
    await p.waitForSelector("#fotos-pdf-ok", { timeout: 60000 });
    const lig = await p.evaluate(() => [...document.querySelectorAll("#fotos-pdf-res tbody tr")].map((tr) => tr.children[2].textContent.trim().split(" certeza")[0] + ">" + tr.querySelector("select").selectedOptions[0].textContent.trim()));
    assert.deepStrictEqual(lig.sort(), ["Ana Silva>1 Ana Silva", "Bruno Costa>2 Bruno Costa", "Carla Mendes>3 Carla Mendes"]);
    await p.click("#fotos-pdf-ok"); await p.waitForFunction(() => document.querySelectorAll("img.foto, .foto img, img[src^='data:image/jpeg']").length >= 3 || !document.querySelector("#fotos-pdf-ok"), null, { timeout: 15000 });
    await p.goto(turmaUrl); await p.waitForSelector("text=Carla Mendes");
  }
  await p.click("a:has-text('Abrir pauta') >> nth=0"); await p.waitForSelector("#f-aval");
  await p.fill("#f-aval [name=titulo]", "Teste 1"); await p.fill("#f-aval [name=maximo]", "20"); await p.click("#f-aval button");
  await p.waitForSelector("input.nota");
  await p.fill("input.nota >> nth=0", "15"); await p.press("input.nota >> nth=0", "Tab");
  await p.waitForFunction(() => document.querySelector('[data-c="final"]').textContent.startsWith("75"));
  // Comportamento: lançar, recarregar a pauta (já com o valor guardado) e continuar a abrir
  await p.fill("input[data-nivel] >> nth=0", "4"); await p.press("input[data-nivel] >> nth=0", "Tab");
  await p.waitForFunction(() => document.querySelector('[data-c="nivel"]').textContent.trim() !== "");
  await p.reload(); await p.waitForSelector("input[data-nivel]");
  assert.strictEqual(await p.inputValue("input[data-nivel] >> nth=0"), "4", "o comportamento lançado volta a aparecer ao reabrir a pauta");

  // Grelha do teste: 5 questões de 10 pontos, e pontuações
  const hrefGrelha = await p.getAttribute("a:has-text('Grelha')", "href");
  await ir(hrefGrelha.replace(/^#/, ""), "#i-varias");
  await p.click("#i-varias"); await p.click("#i-gravar");
  await p.waitForSelector(".g-nota");
  assert.match(await p.textContent("#i-total"), /50/);
  await p.fill(".g-nota >> nth=0", "8"); await p.press(".g-nota >> nth=0", "Tab");
  await p.waitForFunction(() => document.querySelector('[data-t="total"]').textContent === "8");

  // Folha ao estilo do Excel: setas, Enter, colar um bloco do Excel e desfazer
  await p.waitForSelector("table.folha .folha-letras");
  await p.click(".g-nota >> nth=0"); await p.keyboard.press("ArrowDown");
  assert.equal(await p.evaluate(() => document.activeElement.dataset.aluno), await p.evaluate(() => document.querySelectorAll(".g-nota")[5].dataset.aluno), "a seta para baixo passa ao aluno seguinte");
  await p.click(".g-nota >> nth=0");
  await p.evaluate(() => { const dt = new DataTransfer(); dt.setData("text/plain", "5\t6\n7\t8"); document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); });
  await p.waitForFunction(() => document.querySelector('[data-t="total"]').textContent === "11"); // 5+6 na 1.ª linha (as outras ficam a 0)
  assert.equal(await p.inputValue(".g-nota >> nth=1"), "6");
  await p.click(".g-nota >> nth=0"); await p.keyboard.press("Control+z");
  await p.waitForFunction(() => document.querySelector('[data-t="total"]').textContent === "8" || document.querySelector('[data-t="total"]').textContent === "");

  // Intercalares e sugestão de texto
  const idPeriodo = (await p.url()).includes("grelha") ? await p.evaluate(() => document.querySelector("a[href^='#/pauta/']").getAttribute("href").split("/").pop()) : "";
  await ir(`/intercalares/${idPeriodo}`, "[data-sug]");
  await p.click("[data-sug] >> nth=0"); await p.waitForSelector(".dlg-sug");
  await p.selectOption("select[data-c=empenho]", "5"); await p.selectOption("select[data-c=assiduidade]", "4");
  assert.match(await p.inputValue("#sug-texto"), /^Ana /);
  await p.click("#sug-usar"); await p.waitForFunction(() => !document.querySelector(".dlg-sug"));
  await p.waitForFunction(() => document.querySelector("textarea[data-t]").value.startsWith("Ana "));

  // Ferramentas de sala
  await ir("/temporizador", "#rel"); await p.click("#ini"); await p.waitForFunction(() => document.getElementById("rel").textContent !== "05:00");
  await ir("/sorteio", "#um"); await p.click("#um"); await p.waitForFunction(() => document.getElementById("res").textContent !== "–");
  await ir("/chamada", "#al button");
  await ir("/listas", "#fl");
  await ir("/mapa", ".m-lugar"); await p.click("#m-acaso");
  await p.waitForFunction(() => document.querySelectorAll(".m-lugar.ocup").length === 3);
  await ir("/quadros", "#f-quadro"); await p.click("#f-quadro button"); await p.waitForSelector("#q-nota"); await p.click("#q-nota"); await p.waitForSelector(".q-nota");

  // Sondagem: o aluno vota num segundo navegador, sem sessão
  await ir("/sondagens", "#f-sond");
  await p.fill("#f-sond [name=pergunta]", "Qual app usas mais?"); await p.click("#s-simnao"); await p.click("#f-sond button:not([type=button])");
  await p.waitForSelector(".s-codigo");
  const codigo = (await p.textContent(".s-codigo")).trim();
  const aluno = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage(); vigiar(aluno, "aluno");
  await aluno.goto(`${base}/s/${codigo}`); await aluno.waitForSelector(".op-publica"); await aluno.click(".op-publica >> nth=0"); await aluno.waitForSelector(".grande-msg");
  await p.waitForFunction(() => /1 votos/.test(document.getElementById("s-estado").textContent), null, { timeout: 8000 });

  // Quiz ao vivo: modelo do tic, sala, um aluno entra e responde
  await ir("/quizzes", "[data-mod]"); await p.click("[data-mod] >> nth=0"); await p.waitForSelector("#f-quiz");
  // Imagem numa pergunta (regressão: a política de segurança já bloqueou imagens «blob:»)
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await p.setInputFiles("[data-img] >> nth=0", { name: "pixel.png", mimeType: "image/png", buffer: PNG }); await p.waitForSelector(".img-pergunta");
  await p.click("#f-quiz button:has-text('Guardar quiz')"); await p.waitForSelector("[data-vivo]");
  await p.click("[data-vivo] >> nth=0"); await p.waitForSelector(".pv-codigo");
  const pin = (await p.textContent(".pv-codigo")).trim();
  await aluno.goto(`${base}/jogar`); await aluno.fill("input[name=pin]", pin); await aluno.click("button");
  await aluno.waitForSelector("input[name=alcunha]"); await aluno.fill("input[name=alcunha]", "Falcão"); await aluno.click("button");
  await aluno.waitForSelector("text=Estás dentro");
  await p.waitForFunction(() => document.querySelector("#v-comecar") && !document.querySelector("#v-comecar").disabled, null, { timeout: 8000 });
  await p.click("#v-comecar"); await p.waitForSelector(".pv-pergunta");
  await p.waitForSelector(".img-pergunta"); await aluno.waitForSelector(".img-pergunta");
  await aluno.waitForSelector(".op-publica:not([disabled])"); await aluno.click(".op-publica >> nth=0"); await aluno.waitForSelector("text=Resposta enviada");
  await p.click("#v-mostrar"); await p.waitForSelector(".pv-op.certa");
  await aluno.waitForSelector(".certo, .errado");

  // Ecrãs de gestão (administrador)
  for (const [hash, sel] of [["/gestao", ".cartoes"], ["/admin", "#f-prof"], ["/criterios", "section[data-grupo]"], ["/fecho", "table"], ["/auditoria", "#f-aud"], ["/copias", "#c-fazer"], ["/privacidade-admin", "#f-ret"], ["/estatisticas", ".e-grafico"], ["/direcoes", "h1"], ["/dt", "h1"], ["/turmas-arquivadas", "h1"]]) await ir(hash, sel);
  await p.click("#c-fazer").catch(() => {});

  assert.deepStrictEqual(erros, [], "erros no navegador:\n" + erros.join("\n"));
});
