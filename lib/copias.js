"use strict";
// Cópias de segurança da base de dados: VACUUM INTO (cópia consistente com a aplicação a funcionar), comprimida com gzip.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const NOME = /^eink-\d{4}-\d{2}-\d{2}-\d{6}\.db\.gz$/;

function criarCopias(db, dir, { manter = 14 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const agora = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const nomeDe = () => { const t = agora(); return `eink-${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}-${t.slice(8, 14)}.db.gz`; };
  function listar() {
    return fs.readdirSync(dir).filter((n) => NOME.test(n)).sort().reverse().map((n) => { const st = fs.statSync(path.join(dir, n)); return { nome: n, tamanho: st.size, em: st.mtime.toISOString() }; });
  }
  function limpar() { for (const c of listar().slice(manter)) fs.rmSync(path.join(dir, c.nome), { force: true }); }
  function fazer() {
    const nome = nomeDe(), tmp = path.join(dir, nome + ".tmp.db");
    fs.rmSync(tmp, { force: true });
    db.prepare("VACUUM INTO ?").run(tmp);
    fs.writeFileSync(path.join(dir, nome), zlib.gzipSync(fs.readFileSync(tmp)));
    fs.rmSync(tmp, { force: true });
    limpar();
    return nome;
  }
  const caminho = (nome) => (NOME.test(String(nome)) && fs.existsSync(path.join(dir, nome)) ? path.join(dir, nome) : null);
  // Faz uma cópia se a última tiver mais de `horas` horas (chama-se de hora a hora).
  function seNecessario(horas = 24) {
    const ult = listar()[0];
    if (!ult || Date.now() - Date.parse(ult.em) > horas * 3600000) return fazer();
    return null;
  }
  return { listar, fazer, caminho, seNecessario, manter };
}

module.exports = { criarCopias };
