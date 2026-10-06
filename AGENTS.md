<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Public writes (orders, events, clicks, webhook logs) go only through server functions/server routes using the service-role client; all sensitive tables are admin-only via RLS (has_role). Why: anon users must never write directly.
- Payment core (AbacatePay, webhook verification, post-payment steps) lives in src/lib/payments.server.ts and is exposed via /api/public/* server routes (create-payment, check-order-status, abacatepay-webhook) plus server fns for the app UI. Why: no Supabase edge functions in TanStack Start; one shared implementation.
- No self-signup: admins are granted only by inserting into user_roles (bootstrap trigger removed). Why: nobody becomes admin automatically.
- Panel renewal + username lookup live in src/lib/renewal.server.ts; failed renewals queue in renewal_retries, processed by /api/public/renewal-retries via a cron job armed on enqueue and unscheduled when the queue drains. Why: bounded retries without a permanent poller.

## Admin rules
1. Do not change the payment core (payments.server.ts, src/routes/api/public/*, webhook, /pagar flow) unless explicitly asked; only import and call existing functions.
2. Panel reads: authenticated browser client + RLS + admin_* RPCs. Side-effect actions: createServerFn + requireSupabaseAuth + assertAdmin (src/lib/admin.server.ts) before any supabaseAdmin use.
3. Service-role key never reaches the client; secrets are never shown in the UI, only "configurado / não configurado".
4. Money is integer cents in DB and math; format only for display (pt-BR, BRL). Percentages with 1 decimal; division by zero shows "—".
5. Dates and day grouping use America/Sao_Paulo (AT TIME ZONE in SQL); display dd/MM/yyyy HH:mm.
6. No mock data; every block has loading (skeleton), empty (message + hint) and error (message + "Tentar novamente") states.
7. Mobile-first: below 768px tables become card lists and filters live in a Sheet; touch targets >= 44px.
8. Accessibility: labels on all fields, visible focus, AA contrast, aria-label on icon-only buttons, badges always carry text.
9. Never edit generated files (routeTree.gen.ts, supabase types/client/auth-middleware); DB changes only via migrations.
10. Destructive or money/order-state actions require an AlertDialog confirmation and write to admin_audit_log (logAdminAction).
- Admin global filters live in the URL (validateSearch on /admin layout, resolved by useAdminFilters/resolveRange in src/lib/admin-filters.ts). Why: shareable links and one source of truth.
