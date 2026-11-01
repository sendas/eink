"use strict";
// Base de dados SQLite (módulo node:sqlite do Node 22, sem dependências).
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS professores (
  id INTEGER PRIMARY KEY,
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
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'teste',
  peso REAL NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS comportamento (
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  nivel INTEGER,
  PRIMARY KEY (periodo_id, aluno_id)
);
CREATE TABLE IF NOT EXISTS presencas (
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  estado TEXT NOT NULL,
  PRIMARY KEY (aluno_id, data)
);
CREATE INDEX IF NOT EXISTS i_alunos_turma ON alunos(turma_id);
CREATE INDEX IF NOT EXISTS i_periodos_turma ON periodos(turma_id);
CREATE INDEX IF NOT EXISTS i_aval_periodo ON avaliacoes(periodo_id);
`;

function abrir(ficheiro) {
  if (ficheiro !== ":memory:") fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  const db = new DatabaseSync(ficheiro);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);
  return db;
}

module.exports = { abrir };
