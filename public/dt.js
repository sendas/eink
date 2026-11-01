"use strict";
// Direção de turma: a pauta de todas as disciplinas da turma (só leitura) e, para os administradores, a escolha dos diretores de turma.
(() => {
  const { api, aviso, mostrar, esc, $, $$ } = EINK;
  const num = (v, c = 1) => (v === null || v === undefined ? "" : String(Math.round(v * 10 ** c) / 10 ** c).replace(".", ","));
  const q = (o) => new URLSearchParams(o).toString();

  async function lista() {
    const l = await api("GET", "/api/dt");
    mostrar(`<p><a href="#/">← Painel</a></p><h1>Direção de turma</h1>
      <p class="pequeno">A pauta de todas as disciplinas da turma, só para consulta. As turmas dos docentes juntam-se pelo ano letivo e pelo nome da turma.</p>
      <div class="painel"><ul class="lista">${l.map((t) => `<li><a href="#/dt/ver?${q({ ano_letivo: t.ano_letivo, turma: t.turma })}"><strong>${esc(t.turma)}</strong></a><span class="pequeno">${esc(t.ano_letivo)} · ${t.disciplinas} disciplina(s)</span></li>`).join("") || '<li class="pequeno">Ainda não és diretor de nenhuma turma.</li>'}</ul></div>`);
  }

  async function ver(parametros) {
    const p = Object.fromEntries(new URLSearchParams(parametros));
    const d = await api("GET", "/api/dt/consolidado?" + q(p));
    const cel = (c) => !c ? '<td class="num">–</td>' : `<td class="num ${c.nivel ? "n" + c.nivel : ""}" title="${esc(c.mencao || "")}${c.inter1 ? " · 1.ª intercalar: " + esc(c.inter1) : ""}${c.inter2 ? " · 2.ª intercalar: " + esc(c.inter2) : ""}">${c.final === null ? "" : num(c.final) + (c.parcial ? "*" : "")}</td>`;
    mostrar(`<p class="nao-imprimir"><a href="#/dt">← Direção de turma</a></p><h1>${esc(d.turma)} <small class="pequeno">${esc(d.ano_letivo)}</small></h1>
      <div class="linha nao-imprimir"><label>Período<select id="dt-per">${d.periodos.map((x) => `<option ${x === d.periodo ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label><button class="sec" id="dt-imprimir" type="button">Imprimir</button><button class="sec" id="dt-csv" type="button">Descarregar (CSV)</button></div>
      <p class="pequeno">Nota final de cada disciplina em %, no ${esc(d.periodo)}. Um asterisco (*) quer dizer que falta algum critério. A vermelho, abaixo de ${d.limite} %. Passa o rato (ou toca) numa nota para ver a menção e as intercalares.</p>
      <div class="tabela-rolagem"><table><thead><tr><th class="num">N.º</th><th>Aluno</th>${d.disciplinas.map((x) => `<th class="num" title="${esc(x.docente)}">${esc(x.disciplina)}<br><span class="pequeno">${esc(x.docente)}${x.fechado ? " · fechado" : ""}${x.periodo ? "" : " · sem período"}</span></th>`).join("")}<th class="num">Média</th><th class="num">Negativas</th><th class="num">Faltas</th></tr></thead>
      <tbody>${d.alunos.map((a) => `<tr class="${a.negativas >= 2 ? "n1" : ""}"><td class="num">${a.numero ?? ""}</td><th scope="row">${esc(a.nome)}</th>${d.disciplinas.map((x) => cel(a.celulas[x.turma_id])).join("")}<td class="num"><strong>${num(a.media)}</strong></td><td class="num">${a.negativas}</td><td class="num">${a.faltas}</td></tr>`).join("") || '<tr><td colspan="9">Sem alunos.</td></tr>'}</tbody></table></div>
      <p class="pequeno">As linhas a vermelho são de alunos com 2 ou mais disciplinas abaixo de ${d.limite} %. As faltas são a soma das faltas registadas por todos os docentes.</p>`);
    $("#dt-per").onchange = (e) => { location.hash = "#/dt/ver?" + q({ ...p, periodo: e.target.value }); };
    $("#dt-imprimir").onclick = () => window.print();
    $("#dt-csv").onclick = () => {
      const cab = ["N.º", "Aluno", ...d.disciplinas.map((x) => `${x.disciplina} (${x.docente})`), "Média", "Negativas", "Faltas"];
      const linhas = [cab, ...d.alunos.map((a) => [a.numero ?? "", a.nome, ...d.disciplinas.map((x) => { const c = a.celulas[x.turma_id]; return c && c.final !== null ? num(c.final, 2) + (c.parcial ? "*" : "") : ""; }), num(a.media, 2), a.negativas, a.faltas])].map((l) => l.map((v) => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(linhas); a.download = `direcao-${d.turma}.csv`; a.click();
    };
  }

  async function direcoes() {
    const [l, docentes] = await Promise.all([api("GET", "/api/admin/direcoes"), api("GET", "/api/admin/professores")]);
    const ativos = docentes.filter((x) => x.ativo);
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Diretores de turma</h1>
      <p class="pequeno">As turmas criadas pelos docentes agrupam-se pelo ano letivo e pelo nome (por exemplo, «7.º B» de «2026/2027»). Escolhe quem é o diretor de cada uma: passa a ver a pauta de todas as disciplinas, só para consulta.</p>
      <div class="tabela-rolagem"><table><thead><tr><th>Ano letivo</th><th>Turma</th><th class="num">Docentes</th><th>Diretor de turma</th></tr></thead><tbody>${l.map((t, i) => `<tr><td>${esc(t.ano_letivo)}</td><td>${esc(t.turma)}</td><td class="num">${t.docentes}</td><td><select data-i="${i}" aria-label="Diretor de ${esc(t.turma)}"><option value="">–</option>${ativos.map((x) => `<option value="${x.id}" ${t.diretor && t.diretor.prof_id === x.id ? "selected" : ""}>${esc(x.nome || x.upn)}</option>`).join("")}</select></td></tr>`).join("") || '<tr><td colspan="4" class="pequeno">Ainda não há turmas com ano letivo preenchido.</td></tr>'}</tbody></table></div>`);
    $$("select[data-i]").forEach((s) => { s.onchange = async () => { const t = l[Number(s.dataset.i)]; try { await api("PUT", "/api/admin/direcoes", { ano_letivo: t.ano_letivo, turma: t.turma, prof_id: s.value ? Number(s.value) : null }); aviso("Guardado."); } catch { /* aviso mostrado */ } }; });
  }

  EINK.rotas.push([/^\/dt$/, lista], [/^\/dt\/ver\?(.+)$/, ver], [/^\/direcoes$/, direcoes]);
})();
