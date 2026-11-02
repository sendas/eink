"use strict";
// Administração: docentes com acesso e critérios de avaliação de cada grupo disciplinar.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;

  async function docentes() {
    const [l, grupos] = await Promise.all([api("GET", "/api/admin/professores"), api("GET", "/api/grupos")]);
    mostrar(`<h1>Docentes com acesso</h1>
      ${EINK.eu.grupoDocentes ? `<p class="painel">O acesso é dado pelo grupo «docentes» do Entra ID: quem pertence ao grupo entra e aparece aqui ao fazer o primeiro acesso; quem sai do grupo deixa de poder entrar. Aqui só se escolhe o grupo disciplinar de cada docente.</p>`
        : `<form class="painel linha" id="f-prof"><label>Email da escola<input name="upn" type="email" required placeholder="nome@escola.pt"></label><label>Nome<input name="nome" maxlength="120"></label><button>Dar acesso</button></form>`}
      <form class="painel linha" id="f-local"><strong>Conta local</strong> <label>Utilizador<input name="utilizador" required maxlength="40" placeholder="ana.silva" autocapitalize="none" spellcheck="false"></label><label>Nome<input name="nome" maxlength="120"></label><label class="linha"><input type="checkbox" name="admin"> Administrador</label><button>Criar conta local</button>
        <span class="pequeno">Para docentes sem conta Office. Gera-se uma palavra-passe que só vês uma vez; o docente muda-a na primeira entrada.</span></form>
      <div id="credenciais"></div>
      <div class="painel"><ul class="lista">${l.map((p) => `<li><span>${esc(p.upn)} <span class="pequeno">${p.local ? "conta local" : "conta Office"}</span> ${p.nome && p.nome !== p.upn ? "· " + esc(p.nome) : ""} ${p.admin ? "· administrador" : ""} ${p.ativo ? "" : "· desativado"}${p.trocar ? " · tem de mudar a palavra-passe" : ""}<br><span class="pequeno">${p.ultimo_acesso ? "Último acesso: " + esc(p.ultimo_acesso.slice(0, 16)) : "Ainda não entrou"}</span></span>
        <span class="linha">${p.ativo ? `<label>Grupo disciplinar<select data-grupo="${p.id}"><option value="">–</option>${grupos.map((g) => `<option value="${g.id}" ${g.id === p.grupo_id ? "selected" : ""}>${esc(g.nome)}</option>`).join("")}</select></label>` : ""}
        ${p.upn !== EINK.eu.upn ? `<label class="linha"><input type="checkbox" data-adm="${p.id}" ${p.admin ? "checked" : ""}> Administrador</label>` : ""}
        ${p.local ? `<button class="sec" data-nova="${p.id}">Nova palavra-passe</button>` : ""}
        ${!p.ativo ? `<button class="sec" data-on="${p.id}">Reativar</button>` : ""}
        ${p.ativo && p.upn !== EINK.eu.upn ? `<button class="perigo" data-off="${p.id}">Retirar acesso</button>` : ""}</span></li>`).join("")}</ul></div>`);
    const mostrarCred = (d, titulo) => {
      $("#credenciais").innerHTML = `<div class="painel" role="status"><strong>${titulo}</strong><p>Utilizador: <code>${esc(d.utilizador)}</code><br>Palavra-passe: <code id="cred-senha">${esc(d.senha)}</code></p><p class="pequeno">Guarda estes dados agora: a palavra-passe não volta a aparecer. Entrega-os ao docente por um meio privado. Tem de a mudar na primeira entrada.</p><button class="sec" id="cred-copiar" type="button">Copiar utilizador e palavra-passe</button></div>`;
      $("#cred-copiar").onclick = async () => { try { await navigator.clipboard.writeText(`Utilizador: ${d.utilizador}\nPalavra-passe: ${d.senha}`); aviso("Copiado."); } catch { aviso("Não foi possível copiar. Seleciona o texto e copia à mão.", true); } };
      $("#credenciais").scrollIntoView({ block: "nearest" });
    };
    $("#f-local").onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); const d = await api("POST", "/api/admin/professores/locais", { utilizador: f.get("utilizador"), nome: f.get("nome"), admin: f.get("admin") === "on" }); await docentes(); mostrarCred(d, "Conta local criada"); };
    $$("[data-nova]").forEach((b) => { b.onclick = async () => { if (confirm("Gerar uma palavra-passe nova? A anterior deixa de funcionar.")) { const d = await api("POST", `/api/admin/professores/${b.dataset.nova}/senha`, {}); mostrarCred(d, "Nova palavra-passe"); } }; });
    $$("[data-on]").forEach((b) => { b.onclick = async () => { await api("POST", `/api/admin/professores/${b.dataset.on}/reativar`, {}); docentes(); }; });
    $$("[data-adm]").forEach((k) => { k.onchange = async () => { try { await api("PUT", `/api/admin/professores/${k.dataset.adm}/admin`, { admin: k.checked }); aviso("Papel guardado."); } catch { k.checked = !k.checked; } }; });
    if ($("#f-prof")) $("#f-prof").onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); await api("POST", "/api/admin/professores", { upn: f.get("upn"), nome: f.get("nome") }); docentes(); };
    $$("[data-off]").forEach((b) => { b.onclick = async () => { if (confirm("Retirar o acesso a este docente?")) { await api("DELETE", "/api/admin/professores/" + b.dataset.off); docentes(); } }; });
    $$("[data-grupo]").forEach((s) => { s.onchange = async () => { await api("PUT", `/api/admin/professores/${s.dataset.grupo}/grupo`, { grupo_id: s.value ? Number(s.value) : null }); aviso("Grupo guardado."); }; });
  }

  // ---------- critérios por grupo disciplinar ----------
  const linhaCrit = (k) => `<tr data-id="${k.id ?? ""}" data-tipo="${k.tipo}">
    <td><input class="c-nome" value="${esc(k.nome)}" maxlength="60" aria-label="Nome do critério"></td>
    <td><input class="c-peso nota" type="number" min="1" max="100" step="any" value="${k.peso}" aria-label="Peso em %"> %</td>
    <td>${k.tipo === "nivel" ? "Nível 1 a 5 (docente)" : "Testes e trabalhos"}</td>
    <td><button class="perigo c-del" type="button" aria-label="Retirar critério">✕</button></td></tr>`;

  const anoTxt = (e) => (e.ano ? `${e.ano}.º ano` : "Todos os anos");
  async function criterios() {
    const grupos = await api("GET", "/api/grupos");
    mostrar(`<h1>Critérios de avaliação</h1>
      <p class="pequeno">Os critérios variam por disciplina (grupo disciplinar) e por ano de escolaridade. Cada disciplina tem um esquema para «todos os anos» e pode ter esquemas próprios para anos concretos: uma turma usa o do seu ano e, se não houver, o de «todos os anos». Os docentes lançam testes e trabalhos dentro dos critérios de «testes»; a nota final é a média ponderada dos critérios, que têm de somar 100 %.</p>
      <form class="painel linha" id="f-grupo"><label>Nova disciplina / grupo disciplinar<input name="nome" required maxlength="60" placeholder="550 Informática"></label><button>Criar</button></form>
      ${grupos.map((g) => `<section class="painel" data-grupo="${g.id}"><div class="linha"><label>Disciplina<input class="g-nome" value="${esc(g.nome)}" maxlength="60"></label><button class="sec g-ren" type="button">Mudar nome</button><button class="perigo g-del" type="button">Apagar</button></div>
        ${g.esquemas.map((e) => `<div class="painel" data-esquema="${e.id}" data-ano="${e.ano}"><div class="linha"><strong>${anoTxt(e)}</strong>
            <label>Nota final com<select class="g-casas"><option value="1" ${e.casas === 1 ? "selected" : ""}>1 casa decimal</option><option value="2" ${e.casas === 2 ? "selected" : ""}>2 casas decimais</option></select></label>
            ${e.ano ? `<button class="perigo e-del" type="button">Apagar este esquema</button>` : ""}</div>
          <table><thead><tr><th>Critério</th><th>Peso</th><th>Tipo</th><th></th></tr></thead><tbody>${e.criterios.map(linhaCrit).join("")}</tbody></table>
          <p class="linha"><button class="sec c-add-t" type="button">+ Critério de testes</button><button class="sec c-add-n" type="button">+ Critério de nível 1 a 5</button></p>
          <p class="g-soma"></p><p><button class="g-gravar" type="button">Guardar</button></p></div>`).join("")}
        <p class="linha"><label>Esquema próprio para o ano<select class="e-ano">${[5, 6, 7, 8, 9, 10, 11, 12].filter((a) => !g.esquemas.some((e) => e.ano === a)).map((a) => `<option value="${a}">${a}.º ano</option>`).join("")}</select></label><button class="sec e-add" type="button">Criar (copia «todos os anos»)</button></p></section>`).join("")}`);

    $("#f-grupo").onsubmit = async (e) => { e.preventDefault(); await api("POST", "/api/admin/grupos", { nome: new FormData(e.target).get("nome") }); criterios(); };
    $$("section[data-grupo]").forEach((sec) => {
      const gid = Number(sec.dataset.grupo);
      $(".g-ren", sec).onclick = async () => { try { await api("PUT", "/api/admin/grupos/" + gid, { nome: $(".g-nome", sec).value }); aviso("Nome guardado."); } catch { /* aviso mostrado */ } };
      $(".g-del", sec).onclick = async () => { if (confirm("Apagar esta disciplina e os seus esquemas?")) { try { await api("DELETE", "/api/admin/grupos/" + gid); criterios(); } catch { /* aviso mostrado */ } } };
      $(".e-add", sec).onclick = async () => { const ano = $(".e-ano", sec).value; if (!ano) return; try { await api("POST", `/api/admin/grupos/${gid}/esquemas`, { ano: Number(ano) }); criterios(); } catch { /* aviso mostrado */ } };
      $$("[data-esquema]", sec).forEach((es) => {
        const eid = Number(es.dataset.esquema), corpo = $("tbody", es);
        const lerLinhas = () => $$("tr", corpo).map((tr) => ({ id: tr.dataset.id ? Number(tr.dataset.id) : undefined, tipo: tr.dataset.tipo, nome: $(".c-nome", tr).value, peso: Number($(".c-peso", tr).value) }));
        const soma = () => {
          const t = Math.round(lerLinhas().reduce((z, k) => z + (k.peso || 0), 0) * 100) / 100;
          const el = $(".g-soma", es); el.textContent = t === 100 ? "Total: 100 % ✓" : `Total: ${String(t).replace(".", ",")} % (tem de dar 100 %)`; el.style.color = t === 100 ? "var(--ok)" : "var(--erro)";
        };
        const ligar = () => { $$(".c-del", corpo).forEach((b) => { b.onclick = () => { b.closest("tr").remove(); soma(); }; }); $$(".c-peso", corpo).forEach((i) => { i.oninput = soma; }); };
        const juntar = (tipo, nome) => { corpo.insertAdjacentHTML("beforeend", linhaCrit({ nome, peso: 0, tipo })); ligar(); soma(); };
        $(".c-add-t", es).onclick = () => juntar("testes", "Novo critério");
        $(".c-add-n", es).onclick = () => juntar("nivel", "Novo critério de nível");
        $(".g-gravar", es).onclick = async () => { try { await api("PUT", "/api/admin/esquemas/" + eid, { casas: Number($(".g-casas", es).value), criterios: lerLinhas() }); aviso("Guardado. As pautas dos docentes já usam os novos pesos."); criterios(); } catch { /* aviso mostrado */ } };
        const del = $(".e-del", es); if (del) del.onclick = async () => { if (confirm("Apagar este esquema? As turmas desse ano passam a usar o de «todos os anos».")) { try { await api("DELETE", "/api/admin/esquemas/" + eid); criterios(); } catch { /* aviso mostrado */ } } };
        ligar(); soma();
      });
    });
  }


  // ---------- gestão: hub, fecho de períodos, alterações, cópias e privacidade ----------
  const hub = () => mostrar(`<h1>Gestão</h1>${EINK.avisoSegredo()}<p class="pequeno">Só para administradores.</p><div class="cartoes">${[
    ["👥", "Docentes", "Contas Office e locais, e a disciplina de cada um", "#/admin"], ["✉️", "Email e avisos", "Aviso antes de o segredo do Entra expirar", "#/correio"], ["⚖️", "Critérios de avaliação", "Por disciplina e ano", "#/criterios"],
    ["🔒", "Fecho de períodos", "Bloquear as notas depois do conselho de turma", "#/fecho"], ["📜", "Registo de alterações", "Quem mudou o quê e quando", "#/auditoria"],
    ["💾", "Cópias de segurança", "Da base de dados", "#/copias"], ["🛡", "Privacidade e retenção", "Turmas arquivadas e prazos", "#/privacidade-admin"],
    ["📈", "Estatísticas de acesso", "Quem usa a plataforma e como", "#/estatisticas"], ["🧑‍🏫", "Diretores de turma", "Quem vê a pauta de todas as disciplinas", "#/direcoes"],
  ].map(([i, n, d, h]) => `<a class="cartao" href="${h}"><span class="icone" aria-hidden="true">${i}</span><span>${n}<small>${d}</small></span></a>`).join("")}</div>`);

  async function fecho() {
    const l = await api("GET", "/api/admin/periodos");
    const nomes = [...new Set(l.filter((x) => !x.arquivada).map((x) => x.periodo))];
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Fecho de períodos</h1>
      <p class="pequeno">Um período fechado bloqueia as notas, as avaliações, os níveis e as intercalares: os docentes só podem consultar e exportar. Cada fecho e reabertura fica no registo de alterações.</p>
      <div class="painel linha"><label>Em todas as turmas ativas<select id="f-nome">${nomes.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><button id="f-fechar-todos">Fechar</button><button class="sec" id="f-abrir-todos">Reabrir</button></div>
      <div class="tabela-rolagem"><table><thead><tr><th>Turma</th><th>Ano letivo</th><th>Docente</th><th>Período</th><th>Estado</th><th></th></tr></thead><tbody>${l.map((x) => `<tr><td>${esc(x.turma)}${x.arquivada ? " (arquivada)" : ""}</td><td>${esc(x.ano_letivo)}</td><td>${esc(x.docente)}</td><td>${esc(x.periodo)}</td><td>${x.fechado ? `Fechado${x.fechado_em ? " em " + esc(x.fechado_em.slice(0, 10)) : ""}` : "Aberto"}</td><td><button class="sec" data-p="${x.id}" data-f="${x.fechado ? 0 : 1}">${x.fechado ? "Reabrir" : "Fechar"}</button></td></tr>`).join("")}</tbody></table></div>`);
    const mudar = async (corpo, msg) => { try { const r = await api("POST", "/api/admin/periodos/fechar", corpo); aviso(`${msg} (${r.alterados}).`); fecho(); } catch { /* aviso mostrado */ } };
    $("#f-fechar-todos").onclick = () => { const nome = $("#f-nome").value; if (nome && confirm(`Fechar «${nome}» em todas as turmas ativas?`)) mudar({ nome, fechado: true }, "Fechados"); };
    $("#f-abrir-todos").onclick = () => { const nome = $("#f-nome").value; if (nome && confirm(`Reabrir «${nome}» em todas as turmas ativas?`)) mudar({ nome, fechado: false }, "Reabertos"); };
    $$("[data-p]").forEach((b) => { b.onclick = () => mudar({ ids: [Number(b.dataset.p)], fechado: b.dataset.f === "1" }, b.dataset.f === "1" ? "Fechado" : "Reaberto"); });
  }

  async function auditoria() {
    const filtros = { turma: "", aluno: "", acao: "", quem: "" };
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Registo de alterações</h1>
      <form class="painel linha" id="f-aud">${[["turma", "Turma"], ["aluno", "Aluno"], ["acao", "O quê"], ["quem", "Quem"]].map(([k, t]) => `<label>${t}<input name="${k}"></label>`).join("")}<button>Filtrar</button></form><div id="aud"></div>`);
    const carregar = async () => {
      const q = new URLSearchParams(filtros).toString();
      const l = await api("GET", "/api/admin/auditoria?" + q);
      $("#aud").innerHTML = l.length ? `<p class="pequeno">As ${l.length} alterações mais recentes.</p><div class="tabela-rolagem"><table class="hist-lista"><thead><tr><th>Quando</th><th>Quem</th><th>Turma</th><th>Período</th><th>Aluno</th><th>O quê</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${l.map((x) => `<tr><td>${esc(x.quando)}</td><td>${esc(x.quem)}</td><td>${esc(x.turma)}</td><td>${esc(x.periodo)}</td><td>${esc(x.aluno)}</td><td>${esc(x.acao)}${x.detalhe ? " · " + esc(x.detalhe) : ""}</td><td>${esc(x.antes)}</td><td>${esc(x.depois)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="pequeno">Nada encontrado.</p>';
    };
    $("#f-aud").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); for (const k of Object.keys(filtros)) filtros[k] = f.get(k) || ""; carregar(); };
    carregar();
  }

  const tam = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  async function copiasPag() {
    const r = await api("GET", "/api/admin/copias");
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Cópias de segurança</h1>
      <p class="pequeno">A plataforma faz uma cópia da base de dados todos os dias (guarda as ${r.manter} mais recentes), na pasta <code>copias</code> do volume de dados. Convém descarregar uma de vez em quando e guardá-la fora da VPS, por exemplo no OneDrive da escola.</p>
      <p><button id="c-fazer">Fazer uma cópia agora</button></p>
      <div class="painel"><ul class="lista">${r.copias.map((c) => `<li><span>${esc(c.nome)} <span class="pequeno">${tam(c.tamanho)}</span></span><a class="botao sec" href="/api/admin/copias/descarregar?nome=${encodeURIComponent(c.nome)}">Descarregar</a></li>`).join("") || '<li class="pequeno">Ainda não há cópias.</li>'}</ul></div>
      <h2>Repor uma cópia</h2><p class="pequeno">Pára o contentor, descomprime o ficheiro (<code>gunzip</code>) e substitui <code>eink.db</code> no volume de dados pela cópia, apagando os ficheiros <code>eink.db-wal</code> e <code>eink.db-shm</code>. Depois volta a arrancar. Está explicado no LEIA-ME.</p>`);
    $("#c-fazer").onclick = async () => { try { await api("POST", "/api/admin/copias", {}); aviso("Cópia criada."); copiasPag(); } catch { /* aviso mostrado */ } };
  }

  async function privacidadeAdmin() {
    const r = await api("GET", "/api/admin/privacidade");
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Privacidade e retenção</h1>
      <p>A plataforma guarda ${r.alunosTotal} alunos (nome, número e, se importado, o email). As turmas arquivadas e o registo de alterações são apagados quando passa o prazo de retenção. A <a href="/privacidade.html">página de privacidade</a> mostra este prazo aos docentes.</p>
      <form class="painel linha" id="f-ret"><label>Prazo de retenção das turmas arquivadas (anos)<input name="anos" type="number" min="1" max="10" value="${r.anos}" style="width:6rem"></label><button>Guardar</button></form>
      <h2>Turmas arquivadas (${r.arquivadas.length})</h2>
      <div class="painel"><ul class="lista">${r.arquivadas.map((t) => `<li><span>${esc(t.nome)} · ${esc(t.ano_letivo)} · ${esc(t.docente)} <span class="pequeno">${t.alunos} alunos, arquivada em ${esc((t.arquivada_em || "").slice(0, 10))}</span></span><strong>${t.expirada ? "Fora do prazo" : "Dentro do prazo"}</strong></li>`).join("") || '<li class="pequeno">Não há turmas arquivadas.</li>'}</ul></div>
      <p class="pequeno">Registo de alterações fora do prazo: ${r.auditoriaExpirada}.</p>
      <form class="painel linha" id="f-apagar"><label>Para apagar as turmas arquivadas fora do prazo (e o registo antigo), escreve APAGAR<input name="confirmar" autocomplete="off"></label><button class="perigo">Apagar o que está fora do prazo</button></form>`);
    $("#f-ret").onsubmit = async (e) => { e.preventDefault(); try { await api("POST", "/api/admin/privacidade/retencao", { anos: Number(new FormData(e.target).get("anos")) }); aviso("Prazo guardado."); privacidadeAdmin(); } catch { /* aviso mostrado */ } };
    $("#f-apagar").onsubmit = async (e) => { e.preventDefault(); try { const x = await api("POST", "/api/admin/privacidade/apagar", { confirmar: new FormData(e.target).get("confirmar") }); aviso(`${x.turmas} turma(s) apagada(s).`); privacidadeAdmin(); } catch { /* aviso mostrado */ } };
  }


  // ---------- estatísticas de acesso ----------
  const NOME_AREA = { painel: "Início", turmas: "Turmas", "turmas-arquivadas": "Turmas arquivadas", turma: "Turma e alunos", pauta: "Pauta", grelha: "Grelha de teste", intercalares: "Intercalares", temporizador: "Temporizador", sorteio: "Sorteio", chamada: "Chamada", listas: "Listas", sondagens: "Sondagens", sondagem: "Sondagem (resultados)", mapa: "Mapa de sala", quadros: "Quadros", quadro: "Quadro", quizzes: "Quizzes", quiz: "Editor de quiz", "quiz-resultados": "Resultados de quiz", vivo: "Jogo ao vivo", gestao: "Gestão", admin: "Docentes", criterios: "Critérios", fecho: "Fecho de períodos", auditoria: "Registo de alterações", copias: "Cópias de segurança", "privacidade-admin": "Privacidade", estatisticas: "Estatísticas" };
  const NOME_PUBLICO = { sondagem_pagina: "Aberturas da página de sondagem", sondagem_voto: "Votos em sondagens", jogo_pagina: "Aberturas da página do jogo", jogo_entrada: "Alunos que entraram em jogos" };
  async function estatisticas(dias = 30) {
    const d = await api("GET", "/api/admin/estatisticas?dias=" + dias);
    const max = Math.max(1, ...d.serie.map((x) => x.vistas));
    const r = d.resumo;
    const fmt = (iso) => (iso ? iso.slice(0, 10) : "nunca");
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Estatísticas de acesso</h1>
      <p class="linha">${[7, 30, 90, 365].map((n) => `<a class="botao ${n === dias ? "" : "sec"}" href="#/estatisticas/${n}">${n} dias</a>`).join("")}<button class="sec" id="e-csv" type="button">Descarregar (CSV)</button></p>
      <p class="pequeno">De ${esc(d.de)} a ${esc(d.ate)}. Só se guardam contagens por dia, docente e ecrã (nunca endereços IP nem conteúdos), durante 400 dias.</p>
      <div class="cartoes">${[["Docentes ativos (7 dias)", `${r.docentesAtivos7} de ${r.docentesTotal}`], ["Docentes ativos (30 dias)", `${r.docentesAtivos30} de ${r.docentesTotal}`], [`Entradas (${dias} dias)`, r.logins], [`Ecrãs vistos (${dias} dias)`, r.vistas], ["Ficheiros exportados", d.exportacoes], ["Jogos de quiz criados", d.jogosCriados]].map(([t, v]) => `<div class="cartao"><span><strong style="font-size:1.5rem">${v}</strong><small>${t}</small></span></div>`).join("")}</div>
      ${r.nuncaEntraram ? `<p class="pequeno">${r.nuncaEntraram} docente(s) com acesso ainda nunca entraram.</p>` : ""}
      <h2>Utilização por dia</h2>
      <div class="e-grafico" role="img" aria-label="Ecrãs vistos por dia">${d.serie.map((x) => `<div class="e-col" title="${esc(x.dia)}: ${x.vistas} ecrãs, ${x.logins} entradas, ${x.docentes} docentes"><div class="e-barra" style="height:${Math.round((x.vistas / max) * 100)}%"></div></div>`).join("")}</div>
      <details><summary>Ver os números por dia</summary><div class="tabela-rolagem"><table><thead><tr><th>Dia</th><th class="num">Entradas</th><th class="num">Docentes</th><th class="num">Ecrãs vistos</th></tr></thead><tbody>${[...d.serie].reverse().map((x) => `<tr><td>${esc(x.dia)}</td><td class="num">${x.logins}</td><td class="num">${x.docentes}</td><td class="num">${x.vistas}</td></tr>`).join("")}</tbody></table></div></details>
      <h2>Ecrãs mais usados</h2><div class="painel"><ul class="lista">${d.areas.map((a) => `<li><span>${esc(NOME_AREA[a.area] || a.area)}</span><strong>${a.n}</strong></li>`).join("") || '<li class="pequeno">Ainda sem dados.</li>'}</ul></div>
      <h2>Docentes</h2><div class="tabela-rolagem"><table><thead><tr><th>Docente</th><th>Último acesso</th><th class="num">Entradas</th><th class="num">Ecrãs vistos</th><th class="num">Exportações</th></tr></thead><tbody>${d.docentes.map((x) => `<tr><td>${esc(x.nome || x.upn)} <span class="pequeno">${esc(x.upn)}</span></td><td>${esc(fmt(x.ultimo_acesso))}</td><td class="num">${x.logins}</td><td class="num">${x.vistas}</td><td class="num">${x.exportacoes}</td></tr>`).join("")}</tbody></table></div>
      <h2>Páginas dos alunos (sem identificação)</h2><div class="painel"><ul class="lista">${Object.entries(NOME_PUBLICO).map(([k, t]) => `<li><span>${t}</span><strong>${d.publicoTotais[k] || 0}</strong></li>`).join("")}</ul></div>
      <h2>Dados guardados</h2><div class="painel"><ul class="lista">${Object.entries({ "Turmas ativas": d.dados.turmas, Alunos: d.dados.alunos, Avaliações: d.dados.avaliacoes, "Notas lançadas": d.dados.notas, Quizzes: d.dados.quizzes, Sondagens: d.dados.sondagens, "Jogos terminados": d.dados.jogosTerminados }).map(([t, v]) => `<li><span>${t}</span><strong>${v}</strong></li>`).join("")}</ul></div>`);
    $("#e-csv").onclick = () => {
      const linhas = [["Dia", "Entradas", "Docentes", "Ecrãs vistos"], ...d.serie.map((x) => [x.dia, x.logins, x.docentes, x.vistas])].map((l) => l.join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(linhas); a.download = "estatisticas-acesso.csv"; a.click();
    };
  }

  EINK.rotas.push([/^\/estatisticas$/, () => estatisticas(30)], [/^\/estatisticas\/(7|30|90|365)$/, (n) => estatisticas(+n)], [/^\/admin$/, docentes], [/^\/criterios$/, criterios], [/^\/gestao$/, hub], [/^\/fecho$/, fecho], [/^\/auditoria$/, auditoria], [/^\/copias$/, copiasPag], [/^\/privacidade-admin$/, privacidadeAdmin]);
})();
