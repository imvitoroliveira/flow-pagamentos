// Roda na aba do painel. Conversa com a página por window.postMessage e com o background por chrome.runtime.
// Protocolo: painel → extensão {source:"toptv-panel", type, payload}; extensão → painel {source:"toptv-extension", type, ...}.
(() => {
  const reply = (msg) => window.postMessage({ source: "toptv-extension", ...msg }, window.location.origin);

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || ev.origin !== window.location.origin) return;
    const d = ev.data;
    if (!d || d.source !== "toptv-panel") return;
    if (d.type === "TOPTV_PING") {
      reply({ type: "TOPTV_PONG", version: chrome.runtime.getManifest().version });
    } else if (d.type === "TOPTV_START_QUEUE") {
      chrome.runtime.sendMessage({ action: "START_QUEUE", payload: d.payload }).catch(() =>
        reply({ type: "TOPTV_ERROR", message: "Extensão indisponível. Recarregue a página e tente de novo." }));
    } else if (d.type === "TOPTV_STOP_QUEUE") {
      chrome.runtime.sendMessage({ action: "STOP_QUEUE" }).catch(() => {});
    }
  });

  // Progresso vindo do background → página do painel.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.toPanel) reply(msg.toPanel);
  });
})();
