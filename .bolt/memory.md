# Project memory

## Product intent & audience

- Admin panel for managing a SaaS/lead-management platform
- Target users: internal admins managing sales funnel, logs, and configuration
- Portuguese-language UI

## Brand personality & voice

- Direct, operational tone; concise status reporting
- Portuguese interface labels (Funil, Logs, Configurações, Equipe, Planos, Integrações, Pronto para produção)

## Visual design & UX direction

- Page pattern: top-level sections with tabbed sub-navigation (e.g. Logs has Webhooks/Notificações/Auditoria; Configurações has Planos/Integrações/Equipe/Pronto para produção)
- Replaces "Em breve" placeholders with functional screens
- Error states expected when database schema is absent — pages should degrade gracefully
- Admin list tables use shared list helpers (pattern from existing vendedores code)
- Confirmation dialogs for destructive/edit actions (e.g. plan editing, team removal)
- Test buttons for integrations (configured/not configured status display only)

## Decisions, constraints & rationale

- **Framework:** Vite + React
- **Build status:** `npm run build` never run — cancelled due to persistent npm install failure (`Cannot read properties of null`). Likely trigger: `rolldown` override in `package.json` or missing lockfile. Removing override didn't fix; restored. Requires user-approved dependency change to resolve.
- **Database:** Connected DB is empty — no tables, migrations, or functions. Pages depend on server actions and tables that don't exist yet. `admin_list_admins` function needed for team list.
- **Code written but unverified:** Funil, Logs (3 tabs), Configurações (4 sections), shared list helpers, legacy Webhooks code removed. None compiled or type-checked.
- **Legacy cleanup:** Old Webhooks export removed from legacy file (was unused)

## Open questions & assumptions

- Build/install fix: needs user approval to regenerate lockfile or change version pins
- Database migrations: when will schema be applied so pages show real data instead of error states?
- Server action names were inferred from codebase patterns — full type-check may reveal mismatches
- Helper function signatures assumed from existing vendedores pattern — unverified by compiler