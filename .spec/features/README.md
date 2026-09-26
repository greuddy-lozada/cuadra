# Features — Contratos de Dominio

> **status:** `current`  
> Specs por módulo de negocio. Complementan `system/` (cómo construir) y `business/` (por qué construir).

---

## Cómo usar

1. Antes de tocar un módulo, lee su spec aquí (si existe).
2. Si no existe spec del feature, **créala** al implementar o al documentar el comportamiento real del código.
3. Misma PR que cambia reglas de negocio → actualiza la feature spec.

## Estado de documentos

| Tag | Significado |
|---|---|
| `current` | Fuente de verdad vigente |
| `aspirational` | Diseño deseado, aún no refleja el código |
| `obsolete` | Histórico — no seguir |

## Índice

| Feature | Archivo | Status |
|---|---|---|
| Products | [products.md](products.md) | `current` |
| Stocks / kardex | [stocks.md](stocks.md) | `current` |
| POS | [pos.md](pos.md) | `current` |
| Sales | [sales.md](sales.md) | `current` |
| Sync / Offline | [sync.md](sync.md) | `current` |
| Reports | [reports.md](reports.md) | `current` |
| Dashboard (live) | [dashboard.md](dashboard.md) | `current` |
| Accounts receivable (CXC) | [accounts-receivable.md](accounts-receivable.md) | `current` |
| Accounts payable (CXP) | [accounts-payable.md](accounts-payable.md) | `current` |

## Plantilla mínima

Al crear una nueva feature spec, incluir:

1. Frontmatter: `status`, `owner`, `last-verified`, paths de código  
2. Purpose / non-goals  
3. Domain model  
4. Business rules / invariants  
5. API contract (RBAC + plan)  
6. UI flows  
7. Cross-module  
8. Definition of Done  
9. Anti-patterns  

Próximos candidatos P1: cash-register, pago-movil, customers, stocks, auth.  
Reports P0 backlog: `fiscal_iva`, `fiscal_withholding`, `financial_ar`, `financial_ap` — ver [reports.md](reports.md).

---

*Índice general: [../README.md](../README.md)*
