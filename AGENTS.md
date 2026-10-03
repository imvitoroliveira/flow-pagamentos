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
- Payment provider, Telegram and panel renewal helpers live in src/lib/checkout.server.ts, configured via env secrets. Why: keep secrets server-only and swappable.
- First account to sign up becomes admin (DB trigger); later admins are granted by inserting into user_roles. Why: bootstrap without hardcoded credentials.
