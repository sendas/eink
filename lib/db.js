"use strict";
// Base de dados SQLite (módulo node:sqlite do Node 22, sem dependências).
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ESQUEMA = `
-- Grupo disciplinar (ex.: 550 Informática): o administrador define os critérios de avaliação de cada grupo.
CREATE TABLE IF NOT EXISTS grupos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  casas INTEGER NOT NULL DEFAULT 1 -- casas decimais da nota final (1 ou 2)
);
-- Critério: peso (%) na nota final. tipo 'testes' = média das avaliações dos docentes; 'nivel' = nível 1 a 5 dado pelo docente (ex.: comportamento).
CREATE TABLE IF NOT EXISTS criterios (
  id INTEGER PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  peso REAL NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'testes',
  ordem INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS professores (
  id INTEGER PRIMARY KEY,
  grupo_id INTEGER REFERENCES grupos(id) ON DELETE SET NULL,
  upn TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT '',
  admin INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acesso TEXT
);
CREATE TABLE IF NOT EXISTS turmas (
  id INTEGER PRIMARY KEY,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id),
  nome TEXT NOT NULL,
  ano_letivo TEXT NOT NULL DEFAULT '',
  criado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS alunos (
  id INTEGER PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  numero INTEGER,
  nome TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  criterio_id INTEGER NOT NULL REFERENCES criterios(id),
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'teste',
  peso REAL NOT NULL DEFAULT 1, -- peso relativo dentro do critério
  maximo REAL NOT NULL DEFAULT 100,
  data TEXT,
  ordem INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notas (
  avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  valor REAL,
  PRIMARY KEY (avaliacao_id, aluno_id)
);
-- Grelha de um teste: itens (perguntas) com a sua cotação. O máximo do teste é a soma das cotações e a nota de cada aluno a soma das suas pontuações.
CREATE TABLE IF NOT EXISTS itens (
  id INTEGER PRIMARY KEY,
  avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
  grupo TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL,
  cotacao REAL NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notas_itens (
  item_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  valor REAL,
  PRIMARY KEY (item_id, aluno_id)
);
CREATE TABLE IF NOT EXISTS niveis (
  criterio_id INTEGER NOT NULL REFERENCES criterios(id) ON DELETE CASCADE,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  nivel INTEGER,
  PRIMARY KEY (criterio_id, periodo_id, aluno_id)
);
CREATE TABLE IF NOT EXISTS presencas (
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  estado TEXT NOT NULL,
  PRIMARY KEY (aluno_id, data)
);
CREATE INDEX IF NOT EXISTS i_itens_aval ON itens(avaliacao_id);
CREATE INDEX IF NOT EXISTS i_criterios_grupo ON criterios(grupo_id);
CREATE INDEX IF NOT EXISTS i_alunos_turma ON alunos(turma_id);
CREATE INDEX IF NOT EXISTS i_periodos_turma ON periodos(turma_id);
CREATE INDEX IF NOT EXISTS i_aval_periodo ON avaliacoes(periodo_id);
`;

function abrir(ficheiro) {
  if (ficheiro !== ":memory:") fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  const db = new DatabaseSync(ficheiro);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);
  // Sem nenhum grupo, cria o «Geral»: testes e trabalhos 70 % e comportamento 30 %.
  if (!db.prepare("SELECT 1 FROM grupos LIMIT 1").get()) {
    const g = Number(db.prepare("INSERT INTO grupos (nome) VALUES ('Geral')").run().lastInsertRowid);
    const ins = db.prepare("INSERT INTO criterios (grupo_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)");
    ins.run(g, "Testes e trabalhos", 70, "testes", 0);
    ins.run(g, "Comportamento", 30, "nivel", 1);
  }
  return db;
}

module.exports = { abrir };
