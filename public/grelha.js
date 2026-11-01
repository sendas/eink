"use strict";
// Grelha de um teste: o docente define as questões (itens) com a sua cotação e lança a pontuação de cada aluno em cada uma.
// A nota do aluno no teste é a soma das pontuações, e o máximo do teste é a soma das cotações.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v) => (v === null || v === undefined ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
  const lerNum = (t) => Number(String(t).replace(",", "."));

  async function grelha(id) {
    let d = await api("GET", `/api/avaliacoes/${id}/grelha`);
    const a = d.avaliacao;

    function desenhar() {
      const itens = d.itens;
      // Cabeçalho com os grupos (Grupo I, II...) quando existem
      const grupos = [];
      for (const i of itens) { const u = grupos[grupos.length - 1]; if (u && u.nome === i.grupo) u.n++; else grupos.push({ nome: i.grupo, n: 1 }); }
      const temGrupos = grupos.some((g) => g.nome);
      const medias = itens.map((i) => { const v = d.alunos.map((al) => al.marcas[i.id]).filter((x) => x !== undefined); return v.length ? (v.reduce((z, x) => z + x, 0) / v.length / i.cotacao) * 100 : null; });
      mostrar(`<p><a href="#/pauta/${a.periodo_id}">← Pauta</a></p><h1>Grelha: ${esc(a.titulo)}</h1>
        <details class="painel" ${itens.length ? "" : "open"}><summary><strong>Questões e cotações</strong> · máximo ${num(a.maximo)} pontos · <span class="pequeno">clica para editar</span></summary>
          <table><thead><tr><th>Grupo (opcional)</th><th>Questão</th><th>Cotação</th><th></th></tr></thead><tbody id="itens">${itens.map((i) => `<tr data-id="${i.id}"><td><input class="i-grupo" value="${esc(i.grupo)}" maxlength="60" placeholder="Grupo I"></td><td><input class="i-nome" value="${esc(i.nome)}" maxlength="80"></td><td><input class="i-cot nota" value="${num(i.cotacao)}" inputmode="decimal"></td><td class="linha"><button class="sec i-sobe" type="button" aria-label="Subir questão">↑</button><button class="sec i-desce" type="button" aria-label="Descer questão">↓</button><button class="perigo i-del" type="button" aria-label="Retirar questão">✕</button></td></tr>`).join("")}</tbody></table>
          <p class="linha"><button class="sec" id="i-add" type="button">+ Questão</button><button class="sec" id="i-varias" type="button">+ Várias de uma vez</button></p>
          <p id="i-total"></p>
          <p class="linha"><label>Copiar a estrutura de outro teste<select id="i-origem"><option value="">A carregar…</option></select></label><button class="sec" id="i-copiar" type="button">Copiar grelha</button></p>
          <p class="pequeno">Copia só as questões, os grupos, as cotações e a ordem. As pontuações dos alunos não se copiam.</p><p><button id="i-gravar" type="button">Guardar grelha</button> <button class="perigo" id="i-limpar" type="button">Remover a grelha</button></p></details>
        ${itens.length ? `<h2>Pontuação dos alunos</h2>
          <div class="tabela-rolagem"><table><thead>${temGrupos ? `<tr><th rowspan="2">N.º</th><th rowspan="2">Aluno</th>${grupos.map((g) => `<th colspan="${g.n}" class="crit">${esc(g.nome || "")}</th>`).join("")}<th rowspan="2" class="num">Total</th><th rowspan="2" class="num">%</th></tr><tr>` : `<tr><th>N.º</th><th>Aluno</th>`}${itens.map((i) => `<th class="num">${esc(i.nome)}<br><span class="pequeno">/ ${num(i.cotacao)}</span></th>`).join("")}${temGrupos ? "" : `<th class="num">Total / ${num(a.maximo)}</th><th class="num">%</th>`}</tr></thead>
          <tbody>${d.alunos.map((al) => `<tr data-aluno="${al.id}"><td class="num">${al.numero ?? ""}</td><th scope="row">${esc(al.nome)}</th>${itens.map((i) => `<td><input class="nota g-nota" inputmode="decimal" data-item="${i.id}" data-aluno="${al.id}" value="${num(al.marcas[i.id])}" aria-label="${esc(al.nome)}, ${esc(i.nome)}"></td>`).join("")}<td class="num" data-t="total">${num(al.total)}</td><td class="num" data-t="pct">${al.total === null ? "" : num((al.total / a.maximo) * 100)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><th></th><th>% de acerto por questão</th>${medias.map((m) => `<td class="num">${m === null ? "" : num(m)}</td>`).join("")}<td></td><td></td></tr></tfoot></table></div>
          <p class="pequeno">Escreve a pontuação de cada aluno em cada questão (por exemplo «1,5» ou «3/4»). Os totais passam para a pauta automaticamente.</p>` : `<p class="pequeno">Define as questões do teste para poderes lançar a pontuação de cada aluno em cada uma.</p>`}`);

      const corpo = $("#itens");
      const lerItens = () => $$("tr", corpo).map((tr) => ({ id: tr.dataset.id ? Number(tr.dataset.id) : undefined, grupo: $(".i-grupo", tr).value, nome: $(".i-nome", tr).value, cotacao: lerNum($(".i-cot", tr).value) }));
      const total = () => { const t = Math.round(lerItens().reduce((z, i) => z + (i.cotacao || 0), 0) * 100) / 100; $("#i-total").innerHTML = `Máximo do teste: <strong>${num(t)}</strong> pontos`; };
      const ligar = () => {
        $$(".i-sobe", corpo).forEach((b) => { b.onclick = () => { const tr = b.closest("tr"), ant = tr.previousElementSibling; if (ant) ant.before(tr); }; });
        $$(".i-desce", corpo).forEach((b) => { b.onclick = () => { const tr = b.closest("tr"), seg = tr.nextElementSibling; if (seg) seg.after(tr); }; });
        $$(".i-del", corpo).forEach((b) => { b.onclick = () => { b.closest("tr").remove(); total(); }; }); $$(".i-cot", corpo).forEach((i) => { i.oninput = total; }); };
      const nova = (nome = "", cotacao = "", grupo = "") => { corpo.insertAdjacentHTML("beforeend", `<tr><td><input class="i-grupo" value="${esc(grupo)}" maxlength="60" placeholder="Grupo I"></td><td><input class="i-nome" value="${esc(nome)}" maxlength="80"></td><td><input class="i-cot nota" value="${cotacao}" inputmode="decimal"></td><td class="linha"><button class="sec i-sobe" type="button" aria-label="Subir questão">↑</button><button class="sec i-desce" type="button" aria-label="Descer questão">↓</button><button class="perigo i-del" type="button" aria-label="Retirar questão">✕</button></td></tr>`); ligar(); total(); };
      $("#i-add").onclick = () => nova(`${$$("tr", corpo).length + 1}.`);
      $("#i-varias").onclick = () => { const n = Number(prompt("Quantas questões?", "5")); const c = prompt("Cotação de cada uma?", "10"); if (n > 0 && n <= 60 && c) for (let k = 0; k < n; k++) nova(`${$$("tr", corpo).length + 1}.`, c); };
      $("#i-gravar").onclick = async () => {
        const itensNovos = lerItens(); if (!itensNovos.length) return aviso("Acrescenta pelo menos uma questão.", true);
        try { d = await api("PUT", `/api/avaliacoes/${id}/grelha`, { itens: itensNovos }); } catch (e) {
          if (/serão apagadas/.test(e.message) && confirm("Este teste já tem notas lançadas diretamente. Ao criar a grelha, essas notas são apagadas e passam a vir das pontuações. Continuar?")) d = await api("PUT", `/api/avaliacoes/${id}/grelha`, { itens: itensNovos, substituir: true }); else return;
        }
        a.maximo = d.avaliacao.maximo; aviso("Grelha guardada."); desenhar();
      };
      api("GET", "/api/grelhas").then((l) => { $("#i-origem").innerHTML = `<option value="">Escolhe um teste</option>` + l.filter((x) => x.id !== id).map((x) => `<option value="${x.id}">${esc(x.turma)} · ${esc(x.periodo)} · ${esc(x.titulo)} (${x.n_itens} questões, ${num(x.maximo)} pts)</option>`).join(""); }).catch(() => {});
      $("#i-copiar").onclick = async () => {
        const de = Number($("#i-origem").value); if (!de) return aviso("Escolhe o teste de que queres copiar a grelha.", true);
        try { d = await api("POST", `/api/avaliacoes/${id}/grelha/copiar`, { de }); } catch (e) {
          if (/serão apagadas/.test(e.message) && confirm("Este teste já tem pontuações ou notas. Ao copiar a grelha, são apagadas. Continuar?")) d = await api("POST", `/api/avaliacoes/${id}/grelha/copiar`, { de, substituir: true }); else return;
        }
        a.maximo = d.avaliacao.maximo; aviso("Grelha copiada."); desenhar();
      };
      $("#i-limpar").onclick = async () => { if (confirm("Remover a grelha? As notas totais ficam como estão, mas deixas de ver as pontuações por questão.")) { d = await api("PUT", `/api/avaliacoes/${id}/grelha`, { itens: [] }); desenhar(); } };
      $$(".g-nota").forEach((inp) => { inp.onchange = async () => {
        try { d = await api("PUT", `/api/avaliacoes/${id}/grelha/notas`, { linhas: [{ aluno: Number(inp.dataset.aluno), item: Number(inp.dataset.item), nota: inp.value }] }); atualizar(); }
        catch { inp.focus(); }
      }; });
      ligar(); total();
    }
    // Atualiza só os totais, para não perder o foco ao tabular entre células.
    function atualizar() {
      for (const al of d.alunos) { const tr = $(`tr[data-aluno="${al.id}"]`); if (!tr) continue; $('[data-t="total"]', tr).textContent = num(al.total); $('[data-t="pct"]', tr).textContent = al.total === null ? "" : num((al.total / d.avaliacao.maximo) * 100); }
    }
    desenhar();
  }

  EINK.rotas.push([/^\/grelha\/(\d+)$/, (id) => grelha(+id)]);
})();
