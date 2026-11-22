// Service worker: controla a fila e usa a MESMA aba do WhatsApp Web (nunca abre abas novas).
// Caminho normal: o content script abre a conversa pela busca do próprio WhatsApp, SEM recarregar a página.
// Reserva (só quando a conversa não é encontrada na busca, ex.: número que ainda não é contato): abre
// …/send?phone=… nesta mesma aba. Isso recarrega, por isso é feito aqui (o content script morreria no reload).
let running = false;
let stopRequested = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

function waitTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); resolve(false); }, timeoutMs);
    function fn(id, info) {
      if (id === tabId && info.status === "complete") { clearTimeout(t); chrome.tabs.onUpdated.removeListener(fn); resolve(true); }
    }
    chrome.tabs.onUpdated.addListener(fn);
  });
}

async function sendToContent(tabId, message, tries = 3) {
  // O content script injeta logo após o carregamento; tenta algumas vezes.
  for (let i = 0; i < tries; i++) {
    try { return await chrome.tabs.sendMessage(tabId, message); }
    catch { await sleep(1000); }
  }
  return { ok: false, status: "error", error: "Não consegui falar com a aba do WhatsApp Web (recarregue-a)." };
}


// Motor principal (igual ao ForceZAP): usa as funções internas do próprio WhatsApp Web no mundo da página.
// Sem recarregar, sem procurar botões na tela. Se falhar, cai no fluxo pela tela.
async function sendViaStore(tabId, phone, text) {
  try {
    const inj = await chrome.scripting.executeScript({
      target: { tabId }, world: "MAIN", args: [phone, text],
      func: async (phone, text) => {
        try {
          if (typeof window.require !== "function") return { ok: false, status: "store_unavailable" };
          const WidFactory = window.require("WAWebWidFactory");
          const Collections = window.require("WAWebCollections");
          const FindChat = window.require("WAWebFindChatAction");
          const Exists = window.require("WAWebQueryExistsJob");
          if (!WidFactory || !Collections || !Collections.Chat || !FindChat || !Exists) return { ok: false, status: "store_unavailable" };
          const r = await Exists.queryWidExists(WidFactory.createWid(phone + "@c.us"));
          if (!r || r.wid === undefined) return { ok: false, status: "no_whatsapp", error: "Número sem WhatsApp" };
          const chat = Collections.Chat.get(r.wid) || (await FindChat.findOrCreateLatestChat(r.wid))?.chat;
          if (!chat) return { ok: false, status: "store_unavailable" };
          const { getMaybeMeLidUser, getMaybeMePnUser } = window.require("WAWebUserPrefsMeUser");
          const MsgKey = window.require("WAWebMsgKey");
          const from = (typeof chat.id?.isLid === "function" && chat.id.isLid()) ? getMaybeMeLidUser() : getMaybeMePnUser();
          const id = new MsgKey({ from, to: chat.id, id: await MsgKey.newId(), participant: undefined, selfDir: "out" });
          let eph = {};
          try { const u = window.require("WAWebGetEphemeralFieldsMsgActionsUtils"); if (u) eph = u.getEphemeralFields(chat); } catch (_) {}
          const msg = { id, ack: 0, body: text, from, to: chat.id, local: true, self: "out", t: Math.floor(Date.now() / 1000), isNewMsg: true, type: "chat", ...eph };
          const act = window.require("WAWebSendMsgChatAction");
          if (!act || typeof act.addAndSendMsgToChat !== "function") return { ok: false, status: "store_unavailable" };
          const [p1, p2] = act.addAndSendMsgToChat(chat, msg);
          await p1; await p2;
          return { ok: true, status: "sent" };
        } catch (e) { return { ok: false, status: "store_unavailable", error: String(e && e.message || e) }; }
      },
    });
    return (inj && inj[0] && inj[0].result) || { ok: false, status: "store_unavailable" };
  } catch (e) { return { ok: false, status: "store_unavailable", error: String(e && e.message || e) }; }
}

async function runQueue(panelTabId, payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  const min = Math.max(5, Number(payload && payload.delayMin) || 15);
  const max = Math.max(min, Number(payload && payload.delayMax) || 25);
  const say = (msg) => chrome.tabs.sendMessage(panelTabId, { toPanel: msg }).catch(() => {});

  const tabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
  const wa = tabs[0];
  if (!wa || wa.id === undefined) { say({ type: "TOPTV_ERROR", message: "Abra o WhatsApp Web em outra aba antes de iniciar" }); return; }

  // Só na primeira mensagem: garante que a aba do WhatsApp está carregada (nas demais não se mexe na aba).
  if (wa.discarded || wa.status !== "complete") { await chrome.tabs.reload(wa.id); await waitTabComplete(wa.id); }

  running = true; stopRequested = false;
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000); // mantém o service worker vivo
  try {
    for (let i = 0; i < items.length; i++) {
      if (stopRequested) { say({ type: "TOPTV_DONE", stopped: true }); return; }
      const it = items[i];
      const base = { current: i + 1, total: items.length, username: it.username };
      say({ type: "TOPTV_PROGRESS", ...base, status: "sending" });

      let res = await sendViaStore(wa.id, it.phone, it.text);
      if (!res.ok && res.status === "store_unavailable") res = await sendToContent(wa.id, { action: "SEND_CHAT_MESSAGE", phone: it.phone, text: it.text });
      if (!res.ok && (res.status === "chat_not_found" || res.status === "ui_missing")) {
        await chrome.tabs.update(wa.id, { url: `https://web.whatsapp.com/send?phone=${encodeURIComponent(it.phone)}&text=${encodeURIComponent(it.text)}` });
        await waitTabComplete(wa.id);
        res = await sendToContent(wa.id, { action: "SEND_MESSAGE", data: { phone: it.phone } }, 8);
      }
      say({ type: "TOPTV_PROGRESS", ...base, status: res.ok ? "sent" : (res.status || "error"), error: res.error });

      if (i < items.length - 1) {
        const end = Date.now() + rand(min, max) * 1000;
        while (Date.now() < end) { if (stopRequested) break; await sleep(500); }
      }
    }
    say({ type: "TOPTV_DONE", stopped: false });
  } finally { clearInterval(keepAlive); running = false; }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "START_QUEUE") {
    if (running) { if (sender.tab) chrome.tabs.sendMessage(sender.tab.id, { toPanel: { type: "TOPTV_ERROR", message: "Já existe uma fila em andamento." } }).catch(() => {}); return; }
    if (sender.tab && sender.tab.id !== undefined) runQueue(sender.tab.id, msg.payload);
  } else if (msg.action === "STOP_QUEUE") {
    stopRequested = true;
  }
});
