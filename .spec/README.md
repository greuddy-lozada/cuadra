# .spec — Fuente de Verdad de Cuadra

> **Directorio canónico de especificaciones.**  
> Todo agente de IA, desarrollador humano o herramienta de CI/CD debe consultar este índice antes de escribir, revisar o desplegar código.  
> Si una regla no está documentada aquí, **no existe**.  
> **status tags:** `current` | `aspirational` | `obsolete`  
> Última actualización: 2026-08-08.

---

## Jerarquía de verdad (conflictos)

1. **Feature specs** ([features/](features/)) — reglas de dominio del módulo  
2. **System specs** ([system/](system/)) — arquitectura, seguridad, API, DB  
3. **UI patterns + design system** ([UI-UX/patterns.md](UI-UX/patterns.md), [UI-UX/design-system.md](UI-UX/design-system.md)) — layouts y estados de pantalla  
4. **Business** ([business/](business/)) — visión y roadmap (no inventan API)  
5. **AGENTS.md** — patrones de código / i18n / wiring UI  
6. **Plans** ([plans/](plans/)) — solo si `status: active`; ignorar `obsolete` / `done` salvo contexto histórico  
7. **Audit** ([audit/](audit/)) — nunca fuente de verdad operativa  

Código y feature/UI spec deben ir alineados en el **mismo PR**.

---

## Mapa de Documentos

### 🧠 Comportamiento del Agente
| Archivo | Propósito | Status |
|---|---|---|
| [AGENTS.md](AGENTS.md) | Convenciones de código, i18n, UI, DoD para agentes | `current` |

### 📦 Features (contratos de dominio)
| Archivo | Propósito | Status |
|---|---|---|
| [features/README.md](features/README.md) | Índice + plantilla de feature specs | `current` |
| [features/products.md](features/products.md) | Catálogo: pricing, API, RBAC, UI | `current` |
| [features/pos.md](features/pos.md) | Caja offline-first, hotkeys, cobro vía sync | `current` |
| [features/sales.md](features/sales.md) | Documento de venta, inmutabilidad, API | `current` |
| [features/sync.md](features/sync.md) | Dexie pull/push, conflictos oversold | `current` |
| [features/reports.md](features/reports.md) | Engine shipped + backlog contador VE (fiscal/AR-AP) | `current` |
| [features/dashboard.md](features/dashboard.md) | Live overview: KPIs del día, SSE+Redis, role-aware | `current` |
| [features/accounts-receivable.md](features/accounts-receivable.md) | CXC: crédito POS, listado, abonos | `current` |
| [features/accounts-payable.md](features/accounts-payable.md) | CXP: PO RECEIVED, listado, abonos | `current` |
| [features/assistant.md](features/assistant.md) | Ask AI: preguntas del negocio y reportes existentes | `current` |

### 🏗️ Sistema (Reglas de Arquitectura)
| Archivo | Propósito | Status |
|---|---|---|
| [system/architecture.md](system/architecture.md) | Vertical Slicing, `modules/` vs `features/`, convenciones | `current` |
| [system/security.md](system/security.md) | AuthN (JWT body+localStorage), RBAC, inmutabilidad sales | `current` |
| [system/multi-tenancy.md](system/multi-tenancy.md) | `organizationId`, ContextService, Prisma filter | `current` |
| [system/plan-gating.md](system/plan-gating.md) | Planes free→enterprise, `@PlanLevel`, feature flags | `current` |
| [system/database.md](system/database.md) | PostgreSQL, migraciones, soft delete, índices | `current` |
| [system/api-conventions.md](system/api-conventions.md) | Respuestas, HTTP, paginación, `SALE_*` codes | `current` |
| [system/testing.md](system/testing.md) | Cobertura, estructura de tests, E2E | `current` |
| [system/performance.md](system/performance.md) | Bundle, query limits, latencia, caching | `current` |

### 💼 Negocio — BMAD Method
| Archivo | Propósito | Status |
|---|---|---|
| [business/product-strategy.md](business/product-strategy.md) | Visión, ICP, roadmap | `current` |
| [business/customer-discovery.md](business/customer-discovery.md) | Hipótesis, entrevistas | `current` |
| [business/go-to-market.md](business/go-to-market.md) | Lanzamiento, pricing, canales | `current` |
| [business/subscription-lifecycle.md](business/subscription-lifecycle.md) | Expiración, grace, downgrade | `current` |

### 🎨 UI/UX
| Archivo | Propósito | Status |
|---|---|---|
| [UI-UX/patterns.md](UI-UX/patterns.md) | Patrones adoptados / next / rejected + DoD UI | `current` |
| [UI-UX/design-system.md](UI-UX/design-system.md) | Tokens, tipografía, grids, a11y | `current` |

### 🚀 DevOps & Entrega
| Archivo | Propósito | Status |
|---|---|---|
| [DevOps/deployment.md](DevOps/deployment.md) | Local, Docker, env, CI/CD, deploys sin cortar caja | `current` |
| [DevOps/release-policy.md](DevOps/release-policy.md) | Criterios de producción, ventana de deploy, smoke, rollback | `current` |
| [DevOps/git-hygiene.md](DevOps/git-hygiene.md) | Ramas, conventional commits, PRs | `current` |

### 📋 Planes de Implementación
| Archivo | Propósito | Status |
|---|---|---|
| [plans/alpha-soft-launch-backlog.md](plans/alpha-soft-launch-backlog.md) | Soft Launch Alpha — backlog 2 semanas | `active` |
| [plans/todo.md](plans/todo.md) | Infra/UX backlog (Redis, K6, etc.) | `done` |
| [plans/implementation-priorities.md](plans/implementation-priorities.md) | Decimal, soft delete, tests | `done` / parcial |
| [plans/reports-module-design.md](plans/reports-module-design.md) | Diseño módulo reportes | `done` (módulo shipped; iterar KPIs) |
| [plans/uuid-migration-plan.md](plans/uuid-migration-plan.md) | Migración UUIDs (histórico) | `obsolete` |
| [plans/database-migration-plan.md](plans/database-migration-plan.md) | Plan original DB (histórico) | `obsolete` |

### 🔍 Auditorías
| Archivo | Propósito | Status |
|---|---|---|
| [audit/](audit/) | Snapshots de auditorías pasadas | histórico — **no** seguir como reglas |

---

## Stack Tecnológico (Resumen)

| Capa | Tecnología |
|---|---|
| Monorepo | pnpm workspaces |
| Backend | NestJS + Prisma ORM + class-validator (`backend/src/modules/`) |
| Frontend | Next.js App Router + React + Tailwind CSS v4 + shadcn/ui v4 (`frontend/src/features/`) |
| Base de datos | PostgreSQL (UUID PKs, tenant `organization_id`) |
| Autenticación | JWT + RBAC (system + org levels) |
| Offline | Dexie + sync module |
| Animaciones | motion (framer-motion) |
| Iconos | lucide-react |
| Tema | next-themes (class strategy) |
| i18n | JSON locales (es.json, en.json) |

---

## Cómo usar este directorio (agentes)

**No leas todo `.spec/` de golpe.** Usa lectura dirigida:

0. **Siempre:** este README + [AGENTS.md](AGENTS.md).  
1. **Feature de negocio:** [features/{módulo}.md](features/) si existe.  
2. **Arquitectura / paths:** [system/architecture.md](system/architecture.md).  
3. **BD:** [system/database.md](system/database.md) + [system/security.md](system/security.md) (inmutabilidad).  
4. **API nueva:** [system/api-conventions.md](system/api-conventions.md).  
5. **UI:** [UI-UX/patterns.md](UI-UX/patterns.md) primero, luego [UI-UX/design-system.md](UI-UX/design-system.md) para tokens.  
6. **Commit / PR:** [DevOps/git-hygiene.md](DevOps/git-hygiene.md).  
7. **Deploy:** [DevOps/release-policy.md](DevOps/release-policy.md) (criterios, ventana, rollback) + [DevOps/deployment.md](DevOps/deployment.md) §7 (deploys sin cortar caja).  
8. **Roadmap / ¿debemos construir esto?:** [business/product-strategy.md](business/product-strategy.md).  
9. **Solo si el usuario pide "lee todas las reglas del proyecto":** leer `current` bajo `.spec/` **excluyendo** `audit/` y planes `obsolete`.

---

## Mantenimiento

- Cambio de reglas de arquitectura, seguridad o dominio → mismo PR que el código.  
- Specs en **Markdown estándar**.  
- Actualizar este índice al añadir documentos.  
- Marcar planes completados como `done` / `obsolete` para que los agentes no los reimplementen.

---

## Doc homes

- **Canónico para agentes:** `.spec/`
- **`docs/specs/`:** histórico / drafts — no usar como fuente de verdad si existe equivalente en `.spec/` (plan gating → [system/plan-gating.md](system/plan-gating.md)).

---

*Referencia rápida: [features/products.md](features/products.md) · [features/pos.md](features/pos.md) · [features/sales.md](features/sales.md) · [features/sync.md](features/sync.md)*
