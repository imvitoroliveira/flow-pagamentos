// Roda dentro do WhatsApp Web (mesma aba, sem recarregar).
// SEND_CHAT_MESSAGE: abre a conversa pela busca do próprio WhatsApp, digita e envia.
// SEND_MESSAGE (reserva): a aba já foi aberta em …/send?phone=…&text=… pelo background; só espera o botão e envia.
(() => {
  const SEND_SELECTORS = ["span[data-icon='send']", "button[aria-label='Enviar']", "button[aria-label='Send']", "[data-testid='compose-btn-send']"];
  const SEARCH_SELECTORS = ["#side div[contenteditable='true'][role='textbox']", "div[contenteditable='true'][data-tab='3']", "#side div[contenteditable='true']"];
  const COMPOSE_SELECTORS = ["footer div[contenteditable='true'][role='textbox']", "footer div[contenteditable='true']", "#main div[contenteditable='true'][data-tab='10']"];
  const ROW_SELECTOR = "#pane-side [role='listitem'], #pane-side [role='row'], #pane-side [data-testid='cell-frame-container']";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const first = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; };
  const findSend = () => { const el = first(SEND_SELECTORS); return el ? (el.closest("button") || el) : null; };
  const findSearch = () => first(SEARCH_SELECTORS);
  const findCompose = () => first(COMPOSE_SELECTORS);
  async function waitFor(fn, ms, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); }
    return null;
  }
  function realClick(el) {
    for (const t of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  }
  // Escreve no campo editável substituindo o conteúdo (execCommand é o que o editor do WhatsApp reconhece).
  function setText(el, text) {
    el.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
    const lines = String(text).split("\n");
    lines.forEach((line, i) => {
      if (i > 0) document.execCommand("insertLineBreak", false);
      if (line) document.execCommand("insertText", false, line);
    });
    if (!(el.textContent || "").trim()) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }
  function clearSearch() {
    const box = findSearch();
    if (box) { box.focus(); document.execCommand("selectAll", false); document.execCommand("delete", false); }
  }
  // Modal de número inválido ("O número de telefone compartilhado por url é inválido" / "não está no WhatsApp").
  function invalidDialog() {
    const d = document.querySelector("div[role='dialog'], div[data-animate-modal-popup='true']");
    return d && /inv[aá]lid|not on whatsapp|n[aã]o est[aá] no whatsapp/i.test(d.textContent || "") ? d : null;
  }
  function closeDialog(d) {
    const btn = d && d.querySelector("button");
    if (btn) realClick(btn);
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  async function clickSendAndConfirm() {
    const btn = await waitFor(findSend, 15000, 300);
    if (!btn) return { ok: false, status: "timeout", error: "Botão de enviar não apareceu em 15 s (confira se o WhatsApp Web está conectado)." };
    await sleep(500); // deixa o texto assentar
    realClick(btn);
    // Confirmado quando o botão de enviar volta a ser o microfone (campo vazio).
    const gone = await waitFor(() => !findSend(), 6000, 300);
    return gone ? { ok: true, status: "sent" } : { ok: false, status: "timeout", error: "Não consegui confirmar o envio." };
  }

  async function sendInChat(msg) {
    const phone = digits(msg.phone);
    if (!/^\d{12,13}$/.test(phone) || !msg.text) return { ok: false, status: "error", error: "Dados inválidos" };
    const box = await waitFor(findSearch, 20000, 500);
    if (!box) return { ok: false, status: "ui_missing", error: "Barra de pesquisa do WhatsApp não encontrada." };

    realClick(box);
    setText(box, phone);
    const tail = phone.slice(-9);
    // Só aceita a linha cujo título (nome/número) contém o telefone: contatos salvos com nome ficam de fora de propósito
    // (não dá para confirmar quem é) e seguem pelo caminho de reserva do background.
    const row = await waitFor(() => [...document.querySelectorAll(ROW_SELECTOR)].find((r) =>
      [...r.querySelectorAll("span[title]")].some((s) => digits(s.getAttribute("title") || s.textContent).includes(tail))), 5000, 250);
    if (!row) { clearSearch(); return { ok: false, status: "chat_not_found" }; }
    realClick(row);

    const compose = await waitFor(findCompose, 8000, 250);
    if (!compose) { clearSearch(); return { ok: false, status: "chat_not_found" }; }
    // Confere o cabeçalho da conversa aberta antes de escrever.
    const header = document.querySelector("#main header");
    const title = header ? [...header.querySelectorAll("span[title]")].map((s) => digits(s.getAttribute("title") || s.textContent)).join(" ") : "";
    if (!title.includes(tail)) { clearSearch(); return { ok: false, status: "chat_not_found" }; }

    const dlg = invalidDialog();
    if (dlg) { closeDialog(dlg); return { ok: false, status: "no_whatsapp", error: "Número sem WhatsApp" }; }
    setText(compose, msg.text);
    return clickSendAndConfirm();
  }

  async function sendFromUrlLoad() {
    const limit = Date.now() + 15000;
    while (Date.now() < limit) {
      const dlg = invalidDialog();
      if (dlg) { closeDialog(dlg); return { ok: false, status: "no_whatsapp", error: "Número sem WhatsApp" }; }
      if (findSend()) return clickSendAndConfirm();
      await sleep(500);
    }
    const dlg = invalidDialog();
    if (dlg) { closeDialog(dlg); return { ok: false, status: "no_whatsapp", error: "Número sem WhatsApp" }; }
    return { ok: false, status: "timeout", error: "Botão de enviar não apareceu em 15 s (confira se o WhatsApp Web está conectado)." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.action === "SEND_CHAT_MESSAGE") { sendInChat(msg).then(sendResponse, (e) => sendResponse({ ok: false, status: "error", error: String(e) })); return true; }
    if (msg.action === "SEND_MESSAGE") { sendFromUrlLoad().then(sendResponse, (e) => sendResponse({ ok: false, status: "error", error: String(e) })); return true; }
  });
})();
