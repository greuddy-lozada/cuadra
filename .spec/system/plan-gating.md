# Plan Gating — Features por Plan

> **status:** `current` · last-verified: 2026-08-08  
> **code:** `backend/src/common/decorators/plan-level.decorator.ts` · `plan-level.guard.ts`  
> **Frontend flags:** `frontend/src/lib/feature-flags.ts` · nav `requiredFeature`

Reemplaza referencias rotas a `specs/2026-06-20-plan-gating.md`. Nombres canónicos de plan en código:

| Plan | Order |
|---|---|
| `free` | 0 |
| `starter` | 1 |
| `professional` | 2 |
| `enterprise` | 3 |

**No** usar nombres GTM legacy (Pro / Business) en código ni en specs de sistema.

---

## 1. Backend `@PlanLevel`

- Guard compara `PLAN_ORDER[org.plan]` ≥ `PLAN_ORDER[required]`.
- Role system `master` bypass.
- Errores: `PLAN.NO_PLAN`, `PLAN.UPGRADE_REQUIRED`.

### Controllers (verificado 2026-08-08)

| Min plan | Módulos |
|---|---|
| `free` | customers, currencies, dashboard, exchange-rates, reports |
| `starter` | products, brands, categories, taxes, suppliers, cash-register |
| `professional` | **sales**, purchase-orders, stocks, batches, pago-movil transactions, **assistant** (`POST /assistant/messages`, `GET /assistant/thread`). `GET /assistant/status` no lleva `@PlanLevel`: responde `enabled: false` si el plan no alcanza o el provider no está configurado |
| *(none)* | sync, auth, users, companies, uploads, admin/*, payments, subscriptions, health, bootstrap, pago-movil config |

**Gap:** POS crea ventas vía `/sync/push`, y **sync no tiene `@PlanLevel`**, así que el create de sales puede no exigir `professional` en el path de caja. Cualquier cambio de gating debe considerar sync + sales juntos.

---

## 2. Frontend feature flags

Type `FeatureFlag` incluye: `basic_auth`, `multi_currency`, `basic_reports`, `advanced_reports`, `suppliers`, `customers`, `products`, `export`, `api_access`, `audit_log`, `purchase_orders`, `sales`, `inventory`, `multiple_orgs`, `white_label`, `priority_support`.

Nav hoy usa `requiredFeature` de forma limitada:

- `products` → products, categories, taxes  
- `inventory` → batches, stocks  
- POS **sin** `requiredFeature`

`useFeature()` existe; adopción en UI aún parcial.

---

## 3. Subscription lifecycle

Estados y cron: ver [subscription-lifecycle.md](../business/subscription-lifecycle.md).  
Al degradar plan, features deben dejar de pasar el guard; datos de la org **no** se borran.

---

## 4. Anti-patterns

- Documentar planes Free/Pro/Business como si fueran slugs de código.
- Añadir `@PlanLevel` en un controller sin actualizar esta tabla.
- Asumir que nav `requiredFeature` = backend PlanLevel (son capas distintas).

---

*Refs: [multi-tenancy.md](multi-tenancy.md) · [sales.md](../features/sales.md) · [sync.md](../features/sync.md) · [go-to-market.md](../business/go-to-market.md)*
