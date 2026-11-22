# TOP TV - WhatsApp Bridge

Extensão que liga a tela **Cobrança WhatsApp** do painel ao WhatsApp Web que você já mantém aberto. Ela envia as mensagens da fila **na mesma aba**, uma por vez, com intervalo aleatório entre elas.

## Instalar (Chrome ou Edge)
1. Baixe a pasta `tools/extension-whatsapp` (ou o `.zip` pelo botão **Baixar Extensão** no painel e extraia).
2. Abra `chrome://extensions` (no Edge: `edge://extensions`).
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta `extension-whatsapp`.
5. Abra o **WhatsApp Web** (já conectado) em uma aba e o painel em outra. No painel, o selo deve ficar verde: **Extensão Conectada**.

## Usar
Em **Cobrança WhatsApp**, marque os clientes, escolha o intervalo e clique em **Iniciar Envios Automáticos**. Deixe a aba do WhatsApp Web aberta (não precisa ficar na frente). Você pode pausar a qualquer momento.

## Observações
- Só obedece ao painel em `administrativotop.lovable.app` e `localhost` (lista `ALLOWED_HOSTS` no topo de `panel-bridge.js`; segurança, para que outros sites não comandem seu WhatsApp). Se usar domínio próprio, adicione-o em `host_permissions` e `content_scripts.matches` no `manifest.json` e recarregue a extensão.
- O envio usa as funções internas do próprio WhatsApp Web (instantâneo, sem recarregar). Se o WhatsApp mudar, cai no fluxo pela tela.
- Números sem WhatsApp aparecem como **Sem WhatsApp** e a fila segue.
- Envio automático em massa pode levar o WhatsApp a limitar ou banir o número. Use intervalos longos e só com quem é seu cliente.
- Depois de atualizar os arquivos, clique em recarregar a extensão em `chrome://extensions`.
