"use strict";
// Avaliações intercalares (1.ª e 2.ª de cada período): menção qualitativa e descritiva de cada aluno.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v, c = 2) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** c) / 10 ** c).replace(".", ","));

  async function intercalares(id, n = 1) {
    const d = await api("GET", `/api/periodos/${id}/intercalares?n=${n}`);
    const nome = Object.fromEntries(d.mencoes.map((m) => [m.id, m.nome]));
    mostrar(`<p><a href="#/pauta/${id}">← Pauta</a></p><h1>Avaliação intercalar · ${esc(d.periodo.nome)}</h1>
      <div class="linha"><nav class="linha" aria-label="Intercalar">${[1, 2].map((k) => `<a class="botao ${k === n ? "" : "sec"}" href="#/intercalares/${id}/${k}">${k}.ª intercalar</a>`).join("")}</nav>
        <button class="sec" id="propor" type="button">Propor menções pelas notas</button></div>
      <p class="pequeno">A menção qualitativa propõe-se pela nota atual de cada aluno: níveis 1 e 2 = Não satisfaz, nível 3 = Satisfaz, nível 4 = Bom, nível 5 = Muito bom. Podes mudá-la à mão e escrever uma descritiva para cada aluno; guarda-se ao sair do campo.</p>
      <div class="tabela-rolagem"><table><thead><tr><th class="num">N.º</th><th>Aluno</th><th class="num">Nota atual</th><th>Menção pela nota</th><th>Menção intercalar</th><th>Descritiva</th></tr></thead>
      <tbody>${d.alunos.map((a) => `<tr data-aluno="${a.id}"><td class="num">${a.numero ?? ""}</td><th scope="row">${esc(a.nome)}</th>
        <td class="num">${a.final === null ? "" : num(a.final, d.casas) + (a.parcial ? "*" : "")}</td><td>${esc(a.mencaoNota || "")}</td>
        <td><select data-m="${a.id}" aria-label="Menção de ${esc(a.nome)}"><option value="">–</option>${d.mencoes.map((m) => `<option value="${m.id}" ${a.mencao === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></td>
        <td><textarea data-t="${a.id}" rows="2" maxlength="2000" style="min-width:26rem;min-height:3.2rem" aria-label="Descritiva de ${esc(a.nome)}">${esc(a.descritiva)}</textarea></td></tr>`).join("") || '<tr><td colspan="6">Adiciona alunos à turma.</td></tr>'}</tbody></table></div>
      <p class="linha"><a class="botao sec" href="/api/periodos/${id}/pauta.xlsx">Descarregar Excel (.xlsx) com as intercalares</a></p>`);
    const gravar = async (linha) => { try { await api("PUT", `/api/periodos/${id}/intercalares`, { n, linhas: [linha] }); } catch { /* aviso mostrado */ } };
    $$("[data-m]").forEach((s) => { s.onchange = () => gravar({ aluno: Number(s.dataset.m), mencao: s.value || null }); });
    $$("[data-t]").forEach((t) => { t.onchange = () => gravar({ aluno: Number(t.dataset.t), descritiva: t.value }); });
    $("#propor").onclick = async () => {
      const preenchidas = d.alunos.filter((a) => a.mencao).length;
      const substituir = preenchidas > 0 && confirm(`${preenchidas} aluno(s) já têm menção. Queres substituí-las pela proposta da nota? («Cancelar» só preenche as que estão vazias.)`);
      await api("POST", `/api/periodos/${id}/intercalares/propor`, { n, substituir }); aviso("Menções propostas."); intercalares(id, n);
    };
  }
  EINK.rotas.push([/^\/intercalares\/(\d+)$/, (id) => intercalares(+id, 1)], [/^\/intercalares\/(\d+)\/([12])$/, (id, n) => intercalares(+id, +n)]);
})();
