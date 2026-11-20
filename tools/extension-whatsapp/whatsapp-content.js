// Roda dentro do WhatsApp Web. O background já abriu o chat (…/send?phone=…&text=…) nesta mesma aba;
// aqui só esperamos o botão de enviar (até 15 s), clicamos e confirmamos.
(() => {
  const SEND_SELECTORS = ["span[data-icon='send']", "button[aria-label='Enviar']", "button[aria-label='Send']", "[data-testid='compose-btn-send']"];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const findSend = () => {
    for (const s of SEND_SELECTORS) { const el = document.querySelector(s); if (el) return el.closest("button") || el; }
    return null;
  };
  // Aviso do WhatsApp para número sem conta ("O número de telefone compartilhado por url é inválido").
  const invalidDialog = () => {
    const d = document.querySelector("div[role='dialog'], div[data-animate-modal-popup='true']");
    return !!d && /inv[aá]lid|not on whatsapp|n[aã]o est[aá] no whatsapp|invalid/i.test(d.textContent || "");
  };

  async function sendNow() {
    const limit = Date.now() + 15000;
    while (Date.now() < limit) {
      if (invalidDialog()) return { ok: false, status: "no_whatsapp", error: "Número sem WhatsApp" };
      const btn = findSend();
      if (btn) {
        await sleep(600); // deixa o texto pré-preenchido assentar
        btn.click();
        // Confirma: o botão some quando a mensagem sai e o campo de texto é limpo.
        for (let i = 0; i < 10; i++) { await sleep(400); if (!findSend()) return { ok: true, status: "sent" }; }
        return { ok: true, status: "sent" };
      }
      await sleep(500);
    }
    return invalidDialog()
      ? { ok: false, status: "no_whatsapp", error: "Número sem WhatsApp" }
      : { ok: false, status: "timeout", error: "Botão de enviar não apareceu em 15 s (confira se o WhatsApp Web está conectado)." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "SEND_MESSAGE") { sendNow().then(sendResponse); return true; }
  });
})();
