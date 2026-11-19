'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const MAX_LINHAS = 500;
  const NOME_ESTADO = { pronto: 'Pronto', rever: 'A rever', conflito: 'Conflito', certo: 'Já no sítio' };
  const FILTROS = [['mudar', 'Por arrumar'], ['pronto', 'Prontos'], ['rever', 'A rever'], ['conflito', 'Conflitos'], ['certo', 'Já no sítio']];

  let itens = [];
  let filtro = 'mudar';
  const escolhidos = new Set();

  function el(tag, props, ...filhos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('data-') || k.startsWith('aria-')) n.setAttribute(k, v);
      else n[k] = v;
    }
    for (const f of filhos) if (f != null) n.append(f);
    return n;
  }

  async function pedir(rota, dados) {
    const r = await fetch(rota, dados === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dados),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
    return j;
  }

  function avisar(texto, erro) {
    const a = $('#aviso');
    a.textContent = texto || '';
    a.hidden = !texto;
    a.classList.toggle('erro', Boolean(erro));
  }

  function tamanho(b) {
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1).replace('.', ',')} GB`;
    return `${Math.max(1, Math.round(b / 1048576))} MB`;
  }

  const podeEscolher = (it) => it.estado === 'pronto' || it.estado === 'rever';

  function visiveis() {
    const q = $('#procura').value.trim().toLowerCase();
    return itens.filter((it) => {
      if (filtro === 'mudar' ? it.estado === 'certo' : it.estado !== filtro) return false;
      return !q || it.de.toLowerCase().includes(q) || it.para.toLowerCase().includes(q);
    });
  }

  function caminho(texto, extra) {
    const i = texto.lastIndexOf('/');
    const td = el('td', { class: 'caminho' });
    if (i >= 0) td.append(el('span', { class: 'pasta' }, texto.slice(0, i + 1)));
    td.append(texto.slice(i + 1));
    if (extra) td.append(el('span', { class: 'extra' }, extra));
    return td;
  }

  function desenharFiltros() {
    const caixa = $('#filtros');
    caixa.replaceChildren();
    for (const [chave, nome] of FILTROS) {
      const n = itens.filter((it) => (chave === 'mudar' ? it.estado !== 'certo' : it.estado === chave)).length;
      const b = el('button', { type: 'button', 'data-filtro': chave, class: chave === filtro ? 'ativo' : '' }, `${nome} (${n})`);
      b.addEventListener('click', () => { filtro = chave; desenhar(); });
      caixa.append(b);
    }
  }

  function desenhar() {
    desenharFiltros();
    const lista = visiveis();
    const corpo = $('#tabela tbody');
    corpo.replaceChildren();
    for (const it of lista.slice(0, MAX_LINHAS)) {
      const caixa = el('input', { type: 'checkbox', checked: escolhidos.has(it.id), disabled: !podeEscolher(it) });
      caixa.setAttribute('aria-label', `Escolher ${it.de}`);
      caixa.addEventListener('change', () => {
        if (caixa.checked) escolhidos.add(it.id); else escolhidos.delete(it.id);
        resumo();
      });
      const legendas = it.anexos.length ? `, ${it.anexos.length} ${it.anexos.length === 1 ? 'legenda' : 'legendas'}` : '';
      const estado = el('td', { class: `estado ${it.estado}` }, NOME_ESTADO[it.estado]);
      if (it.motivo) estado.append(el('span', { class: 'motivo' }, it.motivo));
      corpo.append(el('tr', null, el('td', null, caixa), caminho(it.de, tamanho(it.tamanho) + legendas), caminho(it.para), estado));
    }
    $('#tabela').hidden = !lista.length;
    $('#vazio').hidden = Boolean(lista.length);
    $('#vazio').textContent = !itens.length ? 'Não encontrei filmes nem séries nesta pasta.'
      : filtro === 'mudar' ? 'Está tudo arrumado.' : 'Nada nesta lista.';
    $('#corte').hidden = lista.length <= MAX_LINHAS;
    $('#corte').textContent = `A mostrar os primeiros ${MAX_LINHAS} de ${lista.length}. Use a procura para ver os outros; «escolher todos» abrange a lista inteira.`;
    resumo();
  }

  function resumo() {
    const n = escolhidos.size;
    $('#escolhidos').textContent = n ? `${n} ${n === 1 ? 'ficheiro escolhido' : 'ficheiros escolhidos'}` : '';
    $('#aplicar').disabled = !n;
    const possiveis = visiveis().filter(podeEscolher);
    $('#todos').checked = possiveis.length > 0 && possiveis.every((it) => escolhidos.has(it.id));
    $('#todos').disabled = !possiveis.length;
  }

  async function carregar() {
    $('#reler').disabled = true;
    try {
      itens = (await pedir('/api/plano')).itens;
      escolhidos.clear();
      // Por omissão, só os seguros ficam escolhidos; os «a rever» escolhem-se à mão.
      for (const it of itens) if (it.estado === 'pronto') escolhidos.add(it.id);
      desenhar();
      desenharBiblioteca();
    } catch (e) { avisar(`Não consegui ler o disco: ${e.message}`, true); }
    $('#reler').disabled = false;
  }

  function textoServidores(lista) {
    return lista.map((s) => `${s.nome}: ${s.detalhe}`).join('\n');
  }

  async function aplicar() {
    $('#confirmar').close();
    $('#aplicar').disabled = true;
    avisar('A arrumar…');
    try {
      const r = await pedir('/api/aplicar', { ids: [...escolhidos] });
      const linhas = [`${r.lote.ops.length} ficheiros arrumados.`];
      if (r.lote.falhas.length) linhas.push(`${r.lote.falhas.length} falharam:`, ...r.lote.falhas.map((f) => `  ${f.de}: ${f.erro}`));
      if (r.servidores.length) linhas.push(textoServidores(r.servidores));
      avisar(linhas.join('\n'), r.lote.falhas.length > 0);
      await carregar();
    } catch (e) { avisar(`Não arrumei: ${e.message}`, true); resumo(); }
  }

  function desenharBiblioteca() {
    const sec = $('#biblioteca');
    sec.replaceChildren();
    const certos = itens.filter((it) => it.estado === 'certo');
    if (!certos.length) {
      sec.append(el('p', { class: 'vazio' }, 'Ainda não há nada arrumado. Comece em «Organizar».'));
      return;
    }
    const filmes = certos.filter((it) => it.tipo === 'filme');
    const series = new Map();
    for (const it of certos.filter((i) => i.tipo === 'serie')) {
      if (!series.has(it.titulo)) series.set(it.titulo, { temporadas: new Set(), episodios: 0 });
      const s = series.get(it.titulo);
      s.temporadas.add(it.temporada);
      s.episodios += it.episodios.length;
    }
    if (filmes.length) {
      sec.append(el('h2', null, `Filmes (${filmes.length})`));
      const g = el('div', { class: 'grelha' });
      for (const f of filmes) g.append(el('div', { class: 'cartao' }, el('strong', null, f.titulo), el('span', null, `${f.ano || 'sem ano'} · ${tamanho(f.tamanho)}`)));
      sec.append(g);
    }
    if (series.size) {
      sec.append(el('h2', null, `Séries (${series.size})`));
      const g = el('div', { class: 'grelha' });
      for (const [nome, s] of series) {
        const t = s.temporadas.size;
        g.append(el('div', { class: 'cartao' }, el('strong', null, nome),
          el('span', null, `${t} ${t === 1 ? 'temporada' : 'temporadas'} · ${s.episodios} ${s.episodios === 1 ? 'episódio' : 'episódios'}`)));
      }
      sec.append(g);
    }
  }

  async function desenharHistorico() {
    const sec = $('#historico');
    sec.replaceChildren();
    let lotes;
    try { lotes = (await pedir('/api/historico')).lotes; }
    catch (e) { sec.append(el('p', { class: 'vazio' }, `Não consegui ler o histórico: ${e.message}`)); return; }
    if (!lotes.length) { sec.append(el('p', { class: 'vazio' }, 'Ainda não houve arrumações.')); return; }
    for (const l of lotes) {
      const quando = new Date(l.quando).toLocaleString('pt-PT');
      const titulo = el('strong', null, `${quando}: ${l.ops.length} ficheiros movidos`);
      const cab = el('header', null, titulo);
      if (l.desfeito) cab.append(el('span', { class: 'nota' }, `Desfeito (${l.desfeito.repostos} repostos${l.desfeito.falhas.length ? `, ${l.desfeito.falhas.length} falharam` : ''})`));
      else if (l.ops.length) {
        const b = el('button', { type: 'button', 'data-desfazer': l.id }, 'Desfazer');
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const r = await pedir('/api/desfazer', { lote: l.id });
            const d = r.lote.desfeito;
            avisar(`${d.repostos} ficheiros repostos.${d.falhas.length ? `\n${d.falhas.length} não puderam ser repostos:\n${d.falhas.map((f) => `  ${f.de}: ${f.erro}`).join('\n')}` : ''}`, d.falhas.length > 0);
            await carregar();
          } catch (e) { avisar(`Não desfiz: ${e.message}`, true); }
          desenharHistorico();
        });
        cab.append(b);
      }
      const ul = el('ul');
      for (const op of l.ops.slice(0, 8)) ul.append(el('li', null, `${op.de} → ${op.para}`));
      if (l.ops.length > 8) ul.append(el('li', null, `e mais ${l.ops.length - 8}`));
      for (const f of l.falhas) ul.append(el('li', null, `Falhou ${f.de}: ${f.erro}`));
      sec.append(el('div', { class: 'lote' }, cab, ul));
    }
  }

  function mostrar(vista) {
    for (const v of ['organizar', 'biblioteca', 'historico']) $(`#${v}`).hidden = v !== vista;
    for (const b of document.querySelectorAll('#nav button')) b.classList.toggle('ativo', b.dataset.vista === vista);
    if (vista === 'historico') desenharHistorico();
  }

  for (const b of document.querySelectorAll('#nav button')) b.addEventListener('click', () => mostrar(b.dataset.vista));
  $('#procura').addEventListener('input', desenhar);
  $('#reler').addEventListener('click', () => { avisar(''); carregar(); });
  $('#todos').addEventListener('change', () => {
    for (const it of visiveis().filter(podeEscolher)) {
      if ($('#todos').checked) escolhidos.add(it.id); else escolhidos.delete(it.id);
    }
    desenhar();
  });
  $('#aplicar').addEventListener('click', () => {
    const rever = itens.filter((it) => escolhidos.has(it.id) && it.estado === 'rever').length;
    $('#confirmar-texto').textContent = `Vou mudar o nome e a pasta de ${escolhidos.size} ${escolhidos.size === 1 ? 'ficheiro' : 'ficheiros'}` +
      (rever ? `, dos quais ${rever} com leitura duvidosa («a rever»).` : '.');
    $('#confirmar').showModal();
  });
  $('#confirmar-nao').addEventListener('click', () => $('#confirmar').close());
  $('#confirmar-sim').addEventListener('click', aplicar);

  pedir('/api/estado').then((e) => {
    $('#versao').textContent = e.versao;
    $('#pastas').textContent = e.origem === e.destino ? `Disco: ${e.origem}` : `De ${e.origem} para ${e.destino}`;
    if (e.servidores.length) $('#pastas').textContent += ` · Ligado a ${e.servidores.join(', ')}`;
  }).catch((e) => avisar(e.message, true));
  carregar();
})();
