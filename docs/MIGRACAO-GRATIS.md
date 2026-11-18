# Rodar o NATV de graça (fora dos créditos da Lovable Cloud)

## Situação (confirmada na documentação da Lovable)
- Acabando o saldo de Cloud, a Lovable **pausa o backend** (banco, login, storage). O site publicado continua no ar, mas nada que depende do banco funciona.
- Os dados **não podem ser exportados enquanto o backend estiver pausado**. Primeiro é preciso acordá-lo.
- O saldo gratuito mensal (20 créditos de Cloud) **renova no dia 1º às 00:00 UTC** (30/11 às 21:00 em Brasília). Ou assine um plano pago por 1 mês só para acordar e exportar.
- Um projeto com Lovable Cloud **não pode ser trocado para outro Supabase**; para usar o seu próprio banco, o site precisa rodar fora da Lovable.

## Plano em 2 etapas
### Etapa 1 — Resgatar os dados (único passo que depende da Lovable)
1. Acordar o banco: *More → Database → Wake up* (após o dia 1º ou após assinar um plano pago).
2. *More → Database → Manage → Settings → Export project data → Export data* (card **Database**). A Lovable envia e-mail e salva um arquivo `.backup` em *More → Storage*. **Baixe e guarde uma cópia.** Inclui tabelas e usuários com senha; não inclui segredos/chaves.
3. Copie também os segredos atuais (AbacatePay, Telegram, NATV, etc.) de *Cloud → Secrets*.

### Etapa 2 — Banco e hospedagem gratuitos
**Banco: Supabase (plano Free)** — 500 MB, sem crédito de compute. Para 70–100 clientes/mês sobra muito. Fica ativo enquanto o cron abaixo chamar o site (projetos Free ociosos por 7 dias são pausados).
1. Crie um projeto em supabase.com (região São Paulo).
2. SQL Editor → cole `supabase/setup.sql` → Run. (Troque `https://SEU-DOMINIO.com` pelo domínio real; só afeta a fila antiga de retentativas.)
3. Restaure os dados do `.backup` com PostgreSQL 16+: `pg_restore --no-owner --no-privileges --data-only --schema=public -d "<URL de conexão do novo projeto>" arquivo.backup`.
   Usuários/admins: restaurar `auth.users`/`auth.identities` mantém as senhas; se der conflito, crie os admins de novo (Authentication → Users) e insira o papel: `insert into public.user_roles(user_id, role) values ('<uuid>', 'admin');`.
4. Anote: Project URL, `anon/publishable` key e `service_role` key (Settings → API).

**Site: Cloudflare Workers (Free, 100 mil requisições/dia)** conectado ao repositório do GitHub. O projeto já compila para Cloudflare. Variáveis de ambiente (build **e** runtime):
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `LOVABLE_CRON_SECRET` (qualquer texto longo e aleatório, você inventa), mais os segredos copiados (`ABACATEPAY_*`, `TELEGRAM_*`, `RENEWAL_API_*`, `IP_SALT`, `PUBLIC_SITE_URL` se usar).
Depois aponte o webhook do AbacatePay e o domínio para o novo endereço.

**Agendamentos: cron-job.org (grátis, a cada minuto, com cabeçalho personalizado).** Crie 2 jobs, método POST, cabeçalho `Authorization: Bearer <LOVABLE_CRON_SECRET>`:
- `https://SEU-DOMINIO/api/public/reconcile-payments` — a cada **5 min** (hoje é a cada 2; 5 basta).
- `https://SEU-DOMINIO/api/public/process-drip` — 1x/dia às 08:00 (America/Sao_Paulo).

## O que NÃO foi testado
Este ambiente não consegue instalar pacotes nem rodar o build, então o `setup.sql` e a hospedagem em Cloudflare ainda não foram executados de ponta a ponta. A primeira publicação deve ser feita com um build real e conferida antes de trocar o domínio/webhook.

## Alternativa sem migrar (se preferir ficar na Lovable)
Reduzir o consumo: trocar o cron de 2 min por 5 min (ou só por eventos/webhook), manter o dashboard em 5 min e deixar o banco pausar quando ocioso. Não há como garantir que o plano gratuito (20 créditos/mês) baste: o gasto real só aparece em *More → Usage*, que está bloqueado enquanto estiver sem saldo.
