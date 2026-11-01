"use strict";
// Avaliações intercalares (1.ª e 2.ª de cada período): menção qualitativa e descritiva de cada aluno.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v, c = 2) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** c) / 10 ** c).replace(".", ","));

  async function intercalares(id, n = 1) {
    const d = await api("GET", `/api/periodos/${id}/intercalares?n=${n}`);
    const nome = Object.fromEntries(d.mencoes.map((m) => [m.id, m.nome])), fechado = !!d.periodo.fechado, dis = fechado ? "disabled" : "";
    mostrar(`<p><a href="#/pauta/${id}">← Pauta</a></p><h1>Avaliação intercalar · ${esc(d.periodo.nome)}</h1>
      ${fechado ? '<p class="banner-fechado" role="status"><strong>Período fechado</strong> pelo administrador: não se podem alterar as intercalares.</p>' : ""}
      <div class="linha"><nav class="linha" aria-label="Intercalar">${[1, 2].map((k) => `<a class="botao ${k === n ? "" : "sec"}" href="#/intercalares/${id}/${k}">${k}.ª intercalar</a>`).join("")}</nav>
        <button class="sec" id="propor" type="button" ${dis}>Propor menções pelas notas</button></div>
      <p class="pequeno">A menção qualitativa propõe-se pela nota atual de cada aluno: níveis 1 e 2 = Não satisfaz, nível 3 = Satisfaz, níveis 4 e 5 = Satisfaz bastante. Podes mudá-la à mão e escrever uma descritiva para cada aluno; guarda-se ao sair do campo.</p>
      <div class="tabela-rolagem"><table><thead><tr><th class="num">N.º</th><th>Aluno</th><th class="num">Nota atual</th><th>Menção pela nota</th><th>Menção intercalar</th><th>Descritiva</th><th>Sugerir</th></tr></thead>
      <tbody>${d.alunos.map((a) => `<tr data-aluno="${a.id}"><td class="num">${a.numero ?? ""}</td><th scope="row">${esc(a.nome)}</th>
        <td class="num">${a.final === null ? "" : num(a.final, d.casas) + (a.parcial ? "*" : "")}</td><td>${esc(a.mencaoNota || "")}</td>
        <td><select ${dis} data-m="${a.id}" aria-label="Menção de ${esc(a.nome)}"><option value="">–</option>${d.mencoes.map((m) => `<option value="${m.id}" ${a.mencao === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></td>
        <td><textarea ${dis} data-t="${a.id}" rows="2" maxlength="2000" style="min-width:26rem;min-height:3.2rem" aria-label="Descritiva de ${esc(a.nome)}">${esc(a.descritiva)}</textarea></td><td><button class="sec" type="button" data-sug="${a.id}" ${dis}>Sugerir texto</button></td></tr>`).join("") || '<tr><td colspan="7">Adiciona alunos à turma.</td></tr>'}</tbody></table></div>
      <p class="linha"><a class="botao sec" href="/api/periodos/${id}/pauta.xlsx">Descarregar Excel (.xlsx) com as intercalares</a></p>`);
    const gravar = async (linha) => { try { await api("PUT", `/api/periodos/${id}/intercalares`, { n, linhas: [linha] }); } catch { /* aviso mostrado */ } };
    $$("[data-m]").forEach((s) => { s.onchange = () => gravar({ aluno: Number(s.dataset.m), mencao: s.value || null }); });
    $$("[data-t]").forEach((t) => { t.onchange = () => gravar({ aluno: Number(t.dataset.t), descritiva: t.value }); });
    $$("[data-sug]").forEach((b) => { b.onclick = () => sugerir(d, d.alunos.find((x) => x.id === Number(b.dataset.sug)), n, id); });
    $("#propor").onclick = async () => {
      const preenchidas = d.alunos.filter((a) => a.mencao).length;
      const substituir = preenchidas > 0 && confirm(`${preenchidas} aluno(s) já têm menção. Queres substituí-las pela proposta da nota? («Cancelar» só preenche as que estão vazias.)`);
      await api("POST", `/api/periodos/${id}/intercalares/propor`, { n, substituir }); aviso("Menções propostas."); intercalares(id, n);
    };
  }
  // Janela com os critérios: o docente dá níveis de 1 a 5 e vê o texto sugerido, que pode editar antes de o usar.
  function sugerir(d, a, n, periodoId) {
    const APR = window.EINK_APR, niveis = { ...a.niveis };
    let genero = a.genero || "M";
    const dlg = document.createElement("dialog");
    dlg.className = "dlg-sug";
    dlg.innerHTML = `<form method="dialog" id="f-sug"><h2 style="margin-top:0">Apreciação de ${esc(a.nome)}</h2>
      <p class="pequeno">Escolhe o nível de cada critério (1 a 5); os que deixares em «–» não entram no texto. O texto é só uma sugestão: podes editá-lo antes de o usar.</p>
      <div class="linha"><fieldset class="sem-borda"><legend class="pequeno">Género (para o texto)</legend><label class="inline"><input type="radio" name="g" value="M" ${genero === "M" ? "checked" : ""}> Masculino</label> <label class="inline"><input type="radio" name="g" value="F" ${genero === "F" ? "checked" : ""}> Feminino</label></fieldset></div>
      <div class="grelha-sug">${APR.CRITERIOS.map((c) => `<label>${esc(c.nome)}<select data-c="${c.id}"><option value="">–</option>${APR.ETIQUETAS.map((t, i) => `<option value="${i + 1}" ${niveis[c.id] === i + 1 ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`).join("")}</div>
      <label>Texto sugerido<textarea id="sug-texto" rows="7" maxlength="2000">${esc(a.descritiva)}</textarea></label>
      <p class="pequeno" id="sug-info"></p>
      <label class="inline"><input type="checkbox" id="sug-mencao" ${a.mencao ? "" : "checked"}> Aplicar também a menção sugerida pelos níveis</label>
      <p class="linha"><button type="button" id="sug-usar">Usar este texto</button><button type="button" class="sec" id="sug-cancelar">Cancelar</button></p></form>`;
    document.body.append(dlg); dlg.showModal();
    let editado = !!a.descritiva && !Object.keys(niveis).length;
    const refrescar = () => {
      const r = APR.gerar({ nome: a.nome, genero, niveis });
      if (!editado) $("#sug-texto", dlg).value = r.texto;
      $("#sug-info", dlg).textContent = r.media === null ? "Sem níveis escolhidos." : `Média dos níveis: ${String(r.media).replace(".", ",")} · menção sugerida: ${d.mencoes.find((m) => m.id === r.mencao).nome}`;
      return r;
    };
    $("#sug-texto", dlg).oninput = () => { editado = true; };
    $$("select[data-c]", dlg).forEach((s2) => { s2.onchange = () => { if (s2.value) niveis[s2.dataset.c] = Number(s2.value); else delete niveis[s2.dataset.c]; editado = false; refrescar(); }; });
    $$("input[name=g]", dlg).forEach((r) => { r.onchange = () => { genero = r.value; if (!editado) refrescar(); }; });
    $("#sug-cancelar", dlg).onclick = () => { dlg.close(); dlg.remove(); };
    $("#sug-usar", dlg).onclick = async () => {
      const r = refrescar();
      const linha = { aluno: a.id, descritiva: $("#sug-texto", dlg).value, niveis };
      if ($("#sug-mencao", dlg).checked && r.mencao) linha.mencao = r.mencao;
      try {
        if (genero !== a.genero) await api("PATCH", `/api/alunos/${a.id}`, { genero });
        await api("PUT", `/api/periodos/${periodoId}/intercalares`, { n, linhas: [linha] });
        dlg.close(); dlg.remove(); aviso("Apreciação guardada."); intercalares(periodoId, n);
      } catch { /* aviso mostrado */ }
    };
    refrescar();
  }
  EINK.rotas.push([/^\/intercalares\/(\d+)$/, (id) => intercalares(+id, 1)], [/^\/intercalares\/(\d+)\/([12])$/, (id, n) => intercalares(+id, +n)]);
})();
