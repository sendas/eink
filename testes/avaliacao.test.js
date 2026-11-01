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

test("média ponderada só com as avaliações que o aluno tem; sem notas fica vazio", () => {
  const avaliacoes = [{ id: 1, peso: 60, maximo: 20 }, { id: 2, peso: 40, maximo: 100 }];
  const notas = new Map([["1:1", 15], ["2:1", 50], ["1:2", 10]]);
  const [a, b, c] = pauta({ alunos: [{ id: 1 }, { id: 2 }, { id: 3 }], avaliacoes, notas, pesoComportamento: 30 });
  assert.strictEqual(a.media, 65); // (75*60 + 50*40) / 100
  assert.strictEqual(a.final, 65);
  assert.strictEqual(a.nivel, 3);
  assert.strictEqual(a.em_falta, 0);
  assert.strictEqual(b.media, 50); // só a primeira avaliação conta
  assert.strictEqual(b.em_falta, 1);
  assert.strictEqual(c.final, null);
  assert.strictEqual(c.nivel, null);
});

test("o comportamento vale 30 % da nota final", () => {
  const avaliacoes = [{ id: 1, peso: 100, maximo: 100 }];
  const [a] = pauta({ alunos: [{ id: 1 }], avaliacoes, notas: new Map([["1:1", 80]]), comportamento: new Map([[1, 5]]) });
  assert.strictEqual(a.final, Math.round(80 * 0.7 + 95 * 0.3)); // 85
  assert.strictEqual(a.nivel, 4);
});
