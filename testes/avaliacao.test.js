"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { pauta, lerNota, nivelDe, pctDeNivel } = require("../lib/avaliacao");

test("lerNota aceita vírgula, fração e vazio", () => {
  assert.strictEqual(lerNota("15,5", 20), 15.5);
  assert.strictEqual(lerNota("15/20", 100), 75);
  assert.strictEqual(lerNota("", 20), null);
  assert.ok(Number.isNaN(lerNota("21", 20)));
  assert.ok(Number.isNaN(lerNota("abc", 20)));
  assert.ok(Number.isNaN(lerNota("5/0", 20)));
});

test("níveis pelos limites 20, 50, 70 e 90", () => {
  assert.deepStrictEqual([0, 19, 20, 49, 50, 69, 70, 89, 90, 100].map((x) => nivelDe(x)), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((n) => pctDeNivel(n)), [10, 35, 60, 80, 95]);
});

const CRIT = [{ id: 1, peso: 60, tipo: "testes" }, { id: 2, peso: 10, tipo: "testes" }, { id: 3, peso: 30, tipo: "nivel" }];

test("vários testes num critério: média ponderada pelo peso dentro do critério", () => {
  const avaliacoes = [{ id: 1, criterio_id: 1, peso: 2, maximo: 20 }, { id: 2, criterio_id: 1, peso: 1, maximo: 100 }];
  const notas = new Map([["1:1", 15], ["2:1", 30]]); // 75 % (peso 2) e 30 % (peso 1)
  const [a] = pauta({ alunos: [{ id: 1 }], criterios: [{ id: 1, peso: 100, tipo: "testes" }], avaliacoes, notas });
  assert.strictEqual(a.criterios[1], 60); // (75*2 + 30*1) / 3
  assert.strictEqual(a.final, 60);
  assert.strictEqual(a.nivel, 3);
  assert.strictEqual(a.parcial, false);
});

test("nota final = média ponderada dos critérios do grupo; critério em falta renormaliza e marca parcial", () => {
  const avaliacoes = [{ id: 1, criterio_id: 1, peso: 1, maximo: 100 }, { id: 2, criterio_id: 2, peso: 1, maximo: 100 }, { id: 3, criterio_id: 2, peso: 3, maximo: 100 }];
  const notas = new Map([["1:1", 80], ["2:1", 40], ["3:1", 60], ["1:2", 50]]);
  const niveis = new Map([["3:1", 5]]); // 95 %
  const [a, b, c] = pauta({ alunos: [{ id: 1 }, { id: 2 }, { id: 3 }], criterios: CRIT, avaliacoes, notas, niveis });
  assert.strictEqual(a.criterios[2], 55); // (40*1 + 60*3) / 4
  assert.strictEqual(a.final, Math.round(80 * 0.6 + 55 * 0.1 + 95 * 0.3)); // 82
  assert.strictEqual(a.parcial, false);
  assert.strictEqual(b.final, 50); // só o critério 1 tem valor
  assert.strictEqual(b.parcial, true);
  assert.strictEqual(b.em_falta, 2);
  assert.strictEqual(c.final, null);
  assert.strictEqual(c.nivel, null);
});

test("avaliação com peso 0 não conta", () => {
  const avaliacoes = [{ id: 1, criterio_id: 1, peso: 1, maximo: 100 }, { id: 2, criterio_id: 1, peso: 0, maximo: 100 }];
  const [a] = pauta({ alunos: [{ id: 1 }], criterios: [{ id: 1, peso: 100, tipo: "testes" }], avaliacoes, notas: new Map([["1:1", 70], ["2:1", 0]]) });
  assert.strictEqual(a.final, 70);
});
