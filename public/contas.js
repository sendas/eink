"use strict";
// Palavra-passe das contas locais e ligação do envio de email (avisos de expiração do segredo do Entra).
(() => {
  const { api, aviso, mostrar, esc, $ } = EINK;

  function senha() {
    const obrigatoria = !!EINK.eu.trocar;
    mostrar(`<h1>Palavra-passe</h1>
      ${obrigatoria ? `<p class="painel" role="status"><strong>Tens de escolher uma palavra-passe nova</strong> antes de continuar.</p>` : ""}
      <form class="painel" id="f-senha" style="max-width:26rem;display:grid;gap:.6rem">
        <label>Palavra-passe atual<input name="atual" type="password" autocomplete="current-password" required></label>
        <label>Palavra-passe nova (pelo menos 10 caracteres)<input name="nova" type="password" autocomplete="new-password" minlength="10" required></label>
        <label>Repete a palavra-passe nova<input name="nova2" type="password" autocomplete="new-password" minlength="10" required></label>
        <button>Guardar</button><p id="erro-senha" class="pequeno" role="alert"></p></form>`);
    $("#f-senha").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), er = $("#erro-senha"); er.textContent = "";
      if (f.get("nova") !== f.get("nova2")) { er.textContent = "As duas palavras-passe novas não são iguais."; return; }
      try { await api("POST", "/api/eu/senha", { atual: f.get("atual"), nova: f.get("nova") }); EINK.eu.trocar = false; aviso("Palavra-passe guardada."); location.hash = "#/"; } catch { /* aviso mostrado */ }
    };
  }

  async function correio() {
    const e = await api("GET", "/api/admin/correio");
    const quando = e.expira ? e.expira.split("-").reverse().join("/") : "";
    mostrar(`<p><a href="#/gestao">← Gestão</a></p><h1>Email e avisos</h1>
      <div class="painel"><h2 style="margin-top:0">Segredo do Microsoft Entra</h2>
        ${e.expira ? `<p>Expira a <strong>${quando}</strong> (${e.dias < 0 ? "já expirou" : e.dias === 0 ? "hoje" : "daqui a " + e.dias + " dia" + (e.dias === 1 ? "" : "s")}). ${e.ligado ? `Avisos por email a ${e.limiares.join(", ")} dias do fim${e.avisosEnviados.length ? "; já enviados: " + e.avisosEnviados.join(", ") : ""}.` : "Liga o envio de email para receberes avisos antes desta data."}</p>`
          : `<p>Sem data de expiração. Define <code>CLIENT_SECRET_EXPIRA=aaaa-mm-dd</code> no <code>.env</code> (está no Entra, em Certificados e segredos) para a plataforma poder avisar.</p>`}
      </div>
      <div class="painel"><h2 style="margin-top:0">Envio de email</h2>
        ${e.ligado ? `<p>Ligado com a conta <strong>${esc(e.conta)}</strong> desde ${esc((e.desde || "").slice(0, 10).split("-").reverse().join("/"))}.${e.ultimoEnvio ? ` Último envio: ${esc(e.ultimoEnvio.slice(0, 16).replace("T", " "))}.` : ""}</p>
          ${e.erro ? `<p class="banner-fechado" role="alert"><strong>O último envio falhou:</strong> ${esc(e.erro)}</p>` : ""}
          <p class="linha"><button id="c-teste" type="button">Enviar email de teste</button><a class="botao sec" href="/auth/correio/ligar">Ligar com outra conta</a><button class="perigo" id="c-off" type="button">Desligar</button></p>`
        : `<p>Os emails saem da conta Microsoft 365 de um administrador, através do Microsoft Graph. A plataforma guarda apenas um token de renovação, cifrado, e só envia estes avisos.</p>
          <p><a class="botao" href="/auth/correio/ligar">Ligar o envio de email</a></p>
          <p class="pequeno">Antes, no Entra (Registos de aplicações, Permissões de API), a aplicação precisa das permissões delegadas <code>Mail.Send</code> e <code>offline_access</code>. Se a Microsoft pedir aprovação de administrador, concede-a nessa página.</p>`}
      </div>`);
    if ($("#c-teste")) $("#c-teste").onclick = async () => { try { const r = await api("POST", "/api/admin/correio/teste", {}); aviso(`Email de teste enviado para ${r.para.join(", ")}.`); } catch { /* aviso mostrado */ } correio(); };
    if ($("#c-off")) $("#c-off").onclick = async () => { if (confirm("Desligar o envio de email? Deixas de receber os avisos.")) { await api("POST", "/api/admin/correio/desligar", {}); correio(); } };
  }

  EINK.rotas.push([/^\/senha$/, senha], [/^\/correio$/, correio]);
})();
