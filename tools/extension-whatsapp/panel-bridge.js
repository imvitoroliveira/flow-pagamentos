// Roda na aba do painel. Conversa com a página por window.postMessage e com o background por chrome.runtime.
// Protocolo: painel → extensão {source:"toptv-panel", type, payload}; extensão → painel {source:"toptv-extension", type, ...}.
(() => {
  // Segurança: o manifest cobre *.lovable.app inteiro, mas só o SEU painel pode comandar envios (senão qualquer site
  // lovable.app poderia mandar mensagens pelo seu WhatsApp). Se usar outro endereço, acrescente-o aqui.
  const ALLOWED_HOSTS = ["administrativotop.lovable.app", "localhost", "127.0.0.1"];
  if (!ALLOWED_HOSTS.includes(window.location.hostname)) return;

  const reply = (msg) => window.postMessage({ source: "toptv-extension", ...msg }, "*");
  const pong = () => reply({ type: "TOPTV_PONG", version: chrome.runtime.getManifest().version });

  function cleanItems(payload) {
    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    return items.slice(0, 500)
      .filter((i) => i && typeof i.username === "string" && /^\d{12,13}$/.test(String(i.phone)) && typeof i.text === "string" && i.text.length > 0 && i.text.length <= 4000)
      .map((i) => ({ username: i.username, name: String(i.name || ""), phone: String(i.phone), text: i.text }));
  }

  // Filtra só pela etiqueta da mensagem (alguns navegadores, como o Brave, mascaram ev.source em contextos isolados).
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "toptv-panel") return;
    if (d.type === "TOPTV_PING") {
      pong();
    } else if (d.type === "TOPTV_START_QUEUE") {
      const items = cleanItems(d.payload);
      if (!items.length) { reply({ type: "TOPTV_ERROR", message: "Nenhum item válido na fila." }); return; }
      chrome.runtime.sendMessage({ action: "START_QUEUE", payload: { delayMin: d.payload.delayMin, delayMax: d.payload.delayMax, items } }).catch(() =>
        reply({ type: "TOPTV_ERROR", message: "Extensão indisponível. Recarregue a página e tente de novo." }));
    } else if (d.type === "TOPTV_STOP_QUEUE") {
      chrome.runtime.sendMessage({ action: "STOP_QUEUE" }).catch(() => {});
    }
  });

  // Progresso vindo do background → página do painel.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.toPanel) reply(msg.toPanel);
  });

  // PONG proativo: a página pode ainda não estar escutando no início, então repete algumas vezes.
  pong();
  [300, 1000, 2500, 5000].forEach((ms) => setTimeout(pong, ms));
})();
