"use strict";
// Base de dados SQLite (módulo node:sqlite do Node 22, sem dependências).
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const ESQUEMA = `
-- Grupo disciplinar / disciplina (ex.: 550 Informática).
CREATE TABLE IF NOT EXISTS grupos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);
-- Esquema de avaliação de um grupo para um ano de escolaridade (ano 0 = todos os anos, é o esquema base de cada grupo).
-- Uma turma usa o esquema do seu ano; se o grupo não tiver um para esse ano, usa o de «todos os anos».
CREATE TABLE IF NOT EXISTS esquemas (
  id INTEGER PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL DEFAULT 0,
  casas INTEGER NOT NULL DEFAULT 1, -- casas decimais da nota final (1 ou 2)
  UNIQUE (grupo_id, ano)
);
-- Critério: peso (%) na nota final. tipo 'testes' = média das avaliações dos docentes; 'nivel' = nível 1 a 5 dado pelo docente (ex.: comportamento).
CREATE TABLE IF NOT EXISTS criterios (
  id INTEGER PRIMARY KEY,
  esquema_id INTEGER NOT NULL REFERENCES esquemas(id) ON DELETE CASCADE,
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
  ano INTEGER NOT NULL DEFAULT 0, -- ano de escolaridade (0 = não indicado)
  nome TEXT NOT NULL,
  ano_letivo TEXT NOT NULL DEFAULT '',
  arquivada INTEGER NOT NULL DEFAULT 0,
  arquivada_em TEXT,
  criado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS alunos (
  id INTEGER PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  numero INTEGER,
  email TEXT NOT NULL DEFAULT '',
  genero TEXT NOT NULL DEFAULT '', -- 'M', 'F' ou vazio (para os textos das apreciações)
  nome TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  fechado INTEGER NOT NULL DEFAULT 0, -- 1 = notas bloqueadas pelo administrador
  fechado_em TEXT,
  fechado_por TEXT NOT NULL DEFAULT ''
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
-- Avaliação intercalar (1.ª ou 2.ª de cada período): menção qualitativa e texto descritivo por aluno.
CREATE TABLE IF NOT EXISTS intercalares (
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  mencao TEXT,
  descritiva TEXT NOT NULL DEFAULT '',
  niveis TEXT NOT NULL DEFAULT '', -- JSON {critério: 1..5} usado para sugerir o texto
  PRIMARY KEY (periodo_id, aluno_id, n)
);
CREATE TABLE IF NOT EXISTS niveis (
  criterio_id INTEGER NOT NULL REFERENCES criterios(id) ON DELETE CASCADE,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  nivel INTEGER,
  PRIMARY KEY (criterio_id, periodo_id, aluno_id)
);
-- Registo de alterações (quem mudou o quê e quando). Não tem chaves estrangeiras de propósito: guarda-se uma fotografia dos nomes.
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  quem TEXT NOT NULL,
  turma_id INTEGER,
  turma TEXT NOT NULL DEFAULT '',
  periodo_id INTEGER,
  periodo TEXT NOT NULL DEFAULT '',
  aluno TEXT NOT NULL DEFAULT '',
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  antes TEXT NOT NULL DEFAULT '',
  depois TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
-- Mapa de sala: lugares = JSON {"linha,coluna": id do aluno | "x" (corredor)}.
CREATE TABLE IF NOT EXISTS mapas (
  turma_id INTEGER PRIMARY KEY REFERENCES turmas(id) ON DELETE CASCADE,
  linhas INTEGER NOT NULL DEFAULT 5,
  colunas INTEGER NOT NULL DEFAULT 6,
  lugares TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS quadros (
  id INTEGER PRIMARY KEY,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '[]',
  atualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Sondagem rápida com código: os votos são só contagens, sem dados pessoais.
CREATE TABLE IF NOT EXISTS sondagens (
  id INTEGER PRIMARY KEY,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE,
  pergunta TEXT NOT NULL,
  opcoes TEXT NOT NULL,
  votos TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'escolha', -- 'escolha' (opções) ou 'aberta' (resposta curta e nuvem de palavras)
  aberta INTEGER NOT NULL DEFAULT 1,
  criada TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Respostas curtas de uma sondagem aberta (sem qualquer identificação de quem respondeu).
CREATE TABLE IF NOT EXISTS sondagem_respostas (
  id INTEGER PRIMARY KEY,
  sondagem_id INTEGER NOT NULL REFERENCES sondagens(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  criada TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Imagens das perguntas de um quiz (JPEG, PNG ou WebP, até 400 KB cada).
CREATE TABLE IF NOT EXISTS quiz_imagens (
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  dados BLOB NOT NULL
);
-- Quizzes (estilo Kahoot) do docente.
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  dados TEXT NOT NULL,
  criado TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quiz_resultados (
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  jogadores INTEGER NOT NULL,
  resumo TEXT NOT NULL
);
-- Estatísticas de utilização: contagens por dia, docente e área (sem IP nem conteúdo). area: login, exportacao, jogo_sessao ou v_<ecrã>.
CREATE TABLE IF NOT EXISTS uso (
  dia TEXT NOT NULL,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, prof_id, area)
);
-- Páginas dos alunos (sondagens e jogos): só contagens por dia, sem qualquer identificação.
CREATE TABLE IF NOT EXISTS uso_publico (
  dia TEXT NOT NULL,
  tipo TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, tipo)
);
-- Grelhas e quizzes partilhados entre docentes do mesmo grupo disciplinar (só a estrutura).
CREATE TABLE IF NOT EXISTS partilhas (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  dados TEXT NOT NULL,
  criado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Diretor de turma: o docente que vê (só leitura) a pauta de todas as disciplinas da turma «nome» do ano letivo.
CREATE TABLE IF NOT EXISTS direcoes (
  ano_letivo TEXT NOT NULL,
  turma TEXT NOT NULL,
  prof_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  PRIMARY KEY (ano_letivo, turma)
);
CREATE TABLE IF NOT EXISTS presencas (
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  estado TEXT NOT NULL,
  PRIMARY KEY (aluno_id, data)
);
CREATE INDEX IF NOT EXISTS i_itens_aval ON itens(avaliacao_id);
CREATE INDEX IF NOT EXISTS i_criterios_esquema ON criterios(esquema_id);
CREATE INDEX IF NOT EXISTS i_alunos_turma ON alunos(turma_id);
CREATE INDEX IF NOT EXISTS i_periodos_turma ON periodos(turma_id);
CREATE INDEX IF NOT EXISTS i_aval_periodo ON avaliacoes(periodo_id);
`;

function abrir(ficheiro) {
  if (ficheiro !== ":memory:") fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  const db = new DatabaseSync(ficheiro);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);
  // Sem nenhum grupo, cria o «Geral»: testes e trabalhos 70 % e comportamento 30 %, para todos os anos.
  if (!db.prepare("SELECT 1 FROM grupos LIMIT 1").get()) {
    const g = Number(db.prepare("INSERT INTO grupos (nome) VALUES ('Geral')").run().lastInsertRowid);
    criarEsquema(db, g, 0);
  }
  // Menções antigas das intercalares (Bom, Muito bom) passaram a «Satisfaz bastante».
  db.exec("UPDATE intercalares SET mencao = 'sb' WHERE mencao IN ('b', 'mb')");
  return db;
}

// Cria o esquema de um grupo para um ano. Sem origem, usa os critérios por defeito; com `copiarDe` (id de esquema), copia os dele.
function criarEsquema(db, grupoId, ano, copiarDe = null) {
  const e = Number(db.prepare("INSERT INTO esquemas (grupo_id, ano, casas) VALUES (?, ?, ?)").run(grupoId, ano, copiarDe ? db.prepare("SELECT casas FROM esquemas WHERE id = ?").get(copiarDe).casas : 1).lastInsertRowid);
  const ins = db.prepare("INSERT INTO criterios (esquema_id, nome, peso, tipo, ordem) VALUES (?, ?, ?, ?, ?)");
  if (copiarDe) for (const k of db.prepare("SELECT nome, peso, tipo, ordem FROM criterios WHERE esquema_id = ? ORDER BY ordem, id").all(copiarDe)) ins.run(e, k.nome, k.peso, k.tipo, k.ordem);
  else { ins.run(e, "Testes e trabalhos", 70, "testes", 0); ins.run(e, "Comportamento", 30, "nivel", 1); }
  return e;
}

module.exports = { abrir, criarEsquema };
