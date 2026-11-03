"use strict";
// Registo de acessos dos docentes: endereço IP, navegador, sistema, tipo de dispositivo (móvel, tablet ou computador) e tamanho do ecrã.
// Serve a segurança e o apoio técnico; guarda-se durante um prazo definido pelo administrador (por defeito 180 dias) e consulta-se em Gestão.
module.exports = function registar(X) {
  const { rota, db, erro, soAdmin } = X;
  const cfgLer = (k, def) => { const r = db.prepare("SELECT valor FROM config WHERE chave = ?").get(k); return r ? r.valor : def; };
  const cfgGravar = (k, v) => db.prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor").run(k, String(v));
  const retencao = () => Math.min(730, Math.max(7, Number(cfgLer("acessos_dias", "180")) || 180));

  // Navegador, sistema e tipo de dispositivo a partir do «user agent» (sem bibliotecas).
  function analisar(ua) {
    const u = String(ua || "");
    const v = (re) => { const m = re.exec(u); return m ? m[1].split(".")[0] : ""; };
    let navegador = "Outro", versao = "";
    if (/Edg(?:e|A|iOS)?\//.test(u)) { navegador = "Edge"; versao = v(/Edg(?:e|A|iOS)?\/([\d.]+)/); }
    else if (/OPR\/|Opera/.test(u)) { navegador = "Opera"; versao = v(/OPR\/([\d.]+)/); }
    else if (/SamsungBrowser\//.test(u)) { navegador = "Samsung Internet"; versao = v(/SamsungBrowser\/([\d.]+)/); }
    else if (/Firefox\/|FxiOS\//.test(u)) { navegador = "Firefox"; versao = v(/(?:Firefox|FxiOS)\/([\d.]+)/); }
    else if (/Chrome\/|CriOS\//.test(u)) { navegador = "Chrome"; versao = v(/(?:Chrome|CriOS)\/([\d.]+)/); }
    else if (/Safari\//.test(u) && /Version\//.test(u)) { navegador = "Safari"; versao = v(/Version\/([\d.]+)/); }
    let so = "Outro";
    if (/iPhone|iPad|iPod/.test(u)) so = "iOS"; else if (/Android/.test(u)) so = "Android"; else if (/Windows/.test(u)) so = "Windows";
    else if (/Mac OS X|Macintosh/.test(u)) so = "macOS"; else if (/CrOS/.test(u)) so = "ChromeOS"; else if (/Linux|X11/.test(u)) so = "Linux";
    let dispositivo = "computador";
    if (/iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u))) dispositivo = "tablet";
    else if (/Mobi|iPhone|iPod|Android/.test(u)) dispositivo = "móvel";
    return { navegador: navegador + (versao ? " " + versao : ""), so, dispositivo };
  }

  // Um registo por docente, endereço e navegador em cada 6 horas: volta a ver-se o mesmo → só sobe a contagem.
  function registarAcesso({ profId, ip, ua, ecra = "", idioma = "" }) {
    if (!profId) return;
    const a = analisar(ua), uaT = String(ua || "").slice(0, 300), ipT = String(ip || "").slice(0, 64);
    const ex = db.prepare("SELECT id FROM acessos WHERE prof_id = ? AND ip = ? AND ua = ? AND ultimo > datetime('now', '-6 hours') ORDER BY id DESC LIMIT 1").get(profId, ipT, uaT);
    if (ex) {
      db.prepare("UPDATE acessos SET ultimo = datetime('now'), n = n + 1, ecra = CASE WHEN ? != '' THEN ? ELSE ecra END, idioma = CASE WHEN ? != '' THEN ? ELSE idioma END WHERE id = ?").run(ecra, ecra, idioma, idioma, ex.id);
    } else {
      db.prepare("INSERT INTO acessos (prof_id, ip, navegador, so, dispositivo, ecra, idioma, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(profId, ipT, a.navegador, a.so, a.dispositivo, ecra, idioma, uaT);
    }
  }
  const limpar = () => db.prepare("DELETE FROM acessos WHERE ultimo < datetime('now', ?)").run(`-${retencao()} days`).changes;

  // O navegador diz o tamanho do ecrã, uma vez por sessão.
  rota("POST", "/api/acesso", (c) => {
    const n = (x, max) => { const v = Math.round(Number(x)); return Number.isFinite(v) && v > 0 && v < max ? v : 0; };
    const l = n(c.b.largura, 20000), h = n(c.b.altura, 20000), j = n(c.b.janela, 20000), d = Math.round(Number(c.b.dpr) * 10) / 10;
    const ecra = l && h ? `${l}×${h}${j ? ` (janela ${j})` : ""}${d > 0 && d < 10 ? ` @${d}x` : ""}${c.b.toque ? " · toque" : ""}` : "";
    registarAcesso({ profId: c.p.id, ip: c.ip, ua: c.ua, ecra, idioma: String(c.b.idioma || "").slice(0, 20) });
    return { ok: true };
  });

  rota("GET", "/api/admin/acessos", (c, u) => {
    soAdmin(c);
    const dias = Math.min(730, Math.max(1, Number(u.searchParams.get("dias")) || 30)), prof = Number(u.searchParams.get("prof")) || null;
    const linhas = db.prepare(`SELECT a.id, a.prof_id, p.nome, p.upn, a.ip, a.navegador, a.so, a.dispositivo, a.ecra, a.idioma, a.primeiro, a.ultimo, a.n
      FROM acessos a JOIN professores p ON p.id = a.prof_id WHERE a.ultimo > datetime('now', ?) ${prof ? "AND a.prof_id = ?" : ""} ORDER BY a.ultimo DESC LIMIT 2000`).all(...[`-${dias} days`, ...(prof ? [prof] : [])]);
    const conta = (k) => { const m = {}; for (const l of linhas) m[l[k].split(" ")[0] || "?"] = (m[l[k].split(" ")[0] || "?"] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    return { dias, retencao: retencao(), total: linhas.length, linhas, resumo: { dispositivo: conta("dispositivo"), navegador: conta("navegador"), so: conta("so") }, docentes: db.prepare("SELECT id, nome, upn FROM professores ORDER BY nome").all() };
  });
  rota("PUT", "/api/admin/acessos/config", (c) => {
    soAdmin(c);
    const d = Math.round(Number(c.b.dias));
    if (!Number.isInteger(d) || d < 7 || d > 730) throw erro(400, "O prazo vai de 7 a 730 dias.");
    cfgGravar("acessos_dias", d); limpar(); return { retencao: retencao() };
  });
  rota("POST", "/api/admin/acessos/apagar", (c) => {
    soAdmin(c);
    if (c.b.confirmar !== true) throw erro(400, "Confirma que queres apagar todo o registo de acessos.");
    return { apagados: db.prepare("DELETE FROM acessos").run().changes };
  });
  return { registarAcesso, limpar, analisar };
};
