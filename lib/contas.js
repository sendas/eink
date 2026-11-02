"use strict";
// Contas locais (utilizador e palavra-passe) para docentes sem conta Office. As palavras-passe guardam-se com scrypt e sal próprio.
const crypto = require("node:crypto");
const scrypt = (s, sal) => new Promise((ok, mal) => crypto.scrypt(s, sal, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? mal(e) : ok(k))));

// Sem caracteres que se confundem (0/O, 1/l/I).
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const gerarSenha = (n = 14) => Array.from({ length: n }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");

async function criarHash(senha) {
  const sal = crypto.randomBytes(16);
  return `scrypt$${sal.toString("base64")}$${(await scrypt(senha, sal)).toString("base64")}`;
}
let falso = null; // para gastar o mesmo tempo quando o utilizador não existe
async function conferir(senha, guardado) {
  if (!guardado) { falso = falso || (await criarHash("x")); guardado = falso; senha = senha + "!"; }
  const [alg, sal, h] = String(guardado).split("$");
  if (alg !== "scrypt" || !sal || !h) return false;
  const esperado = Buffer.from(h, "base64"), calc = await scrypt(String(senha), Buffer.from(sal, "base64"));
  return esperado.length === calc.length && crypto.timingSafeEqual(esperado, calc) && guardado !== falso;
}

const utilizadorValido = (u) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u);
const senhaValida = (s) => typeof s === "string" && s.length >= 10 && s.length <= 200;

module.exports = { gerarSenha, criarHash, conferir, utilizadorValido, senhaValida };
