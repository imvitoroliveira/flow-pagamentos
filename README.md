# Flow Pagamentos

Crie um sistema de pagamento e renovação de assinaturas de um aplicativo de streaming (NATV), em português do Brasil. Ative o Lovable Cloud (backend com banco, auth e edge functions).

Tabelas:

- plans: id, slug (mensal|trimestral|semestral), name, price_cents (3500, 9000, 17000), months (1,3,6), active

- sellers: id, name, telegram_chat_id, active

- campaigns: id, name, slug (único, imutável), seller_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, destination_whatsapp (número), prefilled_message, meta_pixel_id, tiktok_pixel_id, created_at

- clicks: id, campaign_id, ref_code (único, curto), fbp, fbc, fbclid, ttclid, user_agent, ip_hash, state (UF), created_at

- orders: id, ref_code (nullable), campaign_id, seller_id, customer_name, customer_email, customer_phone, panel_username, plan_id, amount_cents, status (pending|paid|renewed|renewal_failed|expired|cancelled), abacate_id, pix_brcode, pix_qr_base64, paid_at, renewed_at, renewal_error, event_id, created_at

- events: id, session_id, ref_code, order_id, type (page_view|checkout_started|pix_generated|paid|renewed), metadata jsonb, created_at

- webhook_logs: id, provider, event, payload jsonb, processed boolean, error, created_at

- notifications_log: id, order_id, channel, status, created_at

Autenticação: apenas admins (email+senha) acessam /admin. A página de pagamento (/pagar) é pública. Use RLS: tabelas sensíveis só acessíveis por admin; a escrita pública acontece apenas via edge functions.

Seed: os 3 planos acima. Estilo visual: dark mode moderno, tons de verde-água, tipografia limpa, mobile-first.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/01fd8fdd-a237-45ef-9ebf-9aca7b382289).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
