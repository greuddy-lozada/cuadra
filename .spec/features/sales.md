# Feature: Sales

> **status:** `current`  
> **owner:** ventas  
> **last-verified:** 2026-08-08  
> **code:** `backend/src/modules/sales/` · statuses in `backend/src/common/types/statuses.ts`  
> **Nota:** El dominio de venta es **`sales`**, no `invoices`.

Contrato del documento de venta. POS **no** llama `POST /sales` directo en el happy path — crea vía sync (ver [pos.md](pos.md), [sync.md](sync.md)).

---

## 1. Purpose / Non-goals

### Purpose

Persistir ventas (líneas, montos VES/USD, cliente, sesión de caja) con control de stock e inmutabilidad post-emisión.

### Non-goals

- No es facturación fiscal SENIAT (Later en product-strategy).
- Anulación completa (`ANNULLED` + motivo) está en schema/statuses pero **no** hay endpoint de anulación implementado aún.
- UI de caja vive en POS, no en este módulo.

---

## 2. Domain model

### Prisma `Sale` (`sales`)

| Campo | Notas |
|---|---|
| `id` | UUID |
| `organizationId` | Tenant |
| `idCustomer` | Opcional |
| `code`, `date` | Identificación de negocio |
| `amount` / `amountUsd` | Totales |
| `exchangeRate` (+ refs) | Multi-moneda |
| `totalTax` / withholding fields | Impuestos / retenciones |
| `paymentMethod` | Int? (enum de negocio en POS) |
| `status` | String: `DRAFT` \| `ISSUED` \| `ANNULLED` (default `DRAFT`) |
| `version` | Optimistic locking |
| `registerSessionId` | Caja / cash-register session |
| `deletedAt`, `annulledAt`, `annulmentReason` | Soft-delete / anulación futura |
| Relations | `SalesDet`, `SalePayment`, AR, exchange rates |

### Statuses (`SALE_STATUS_META`)

| Status | Mutable | Financiero |
|---|---|---|
| `DRAFT` | Sí | No |
| `ISSUED` | No | Sí |
| `ANNULLED` | No | Sí |

---

## 3. Business rules

1. **Create** siempre persiste `status: DRAFT` (ignora `status` del DTO si viene).
2. Create descuenta la fila de stock más antigua del producto (y la siguiente si no alcanza), escribe una salida de kardex por fila y recalcula `product.totalExistence`. Si no hay existencia, `SALE_005` y no quedan movimientos. Ver [stocks.md](stocks.md).
3. **Update** solo si `isMutable`; si no → `SALE_001` (`AppException`).
4. Update DTO permite solo campos no financieros: `code`, `date`, `paymentMethod`, `idCustomer` — no items/payments/montos.
5. **Delete** escribe entradas de kardex en las mismas filas que la venta descontó y soft-delete (`deletedAt` vía Prisma extension).
6. Multi-tenant: siempre scoped por `organizationId`.
7. No hard-delete de ventas con historial.
8. Si al crear hay saldo no pagado en efectivo/transfer/etc. (incl. `PaymentMethod.Credit=6`), se crea `AccountsReceivable` con `amount = unpaid`, `credit = 0`, `dueDate = issue + 30d` (ver [accounts-receivable.md](accounts-receivable.md)).

### Known gaps (documentar, no inventar)

- Transición a `ISSUED` / flujo de anulación: no implementados en service.
- `SALE_003` (no items) definido pero no lanzado; DTO puede enviar `items: []`.
- DTO tipa `status` como `number` en create; schema usa string — deuda.

---

## 4. API contract

Base: `/api/sales`  
Plan: `@PlanLevel('professional')`  
RBAC: `@MinOrgLevel(employee)` (= 40)  
Throttle create/update/delete: 30/min

| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/` | Create + stock decrement |
| `GET` | `/` | Paginated (`page`, `limit`). Optional `search` (code or customer name), `from`, `to` (ISO dates) |
| `GET` | `/:id` | UUID |
| `PATCH` | `/:id` | Solo si DRAFT / mutable |
| `DELETE` | `/:id` | Soft-delete + entrada de kardex |

### Error codes

| Code | Significado | Usado |
|---|---|---|
| `SALE_001` | Emitida/inmutable — no update | Sí |
| `SALE_002` | Not found | Sí |
| `SALE_003` | Sin ítems | Definido, no usado |
| `SALE_004` | Crédito sin cliente | Sí |
| `SALE_005` | Existencia insuficiente — la venta no se guarda | Sí |

---

## 5. Cross-module

| Módulo | Relación |
|---|---|
| POS + sync | Creación offline → `POST /sync/push` → `SalesService.create` |
| products / stocks | Descuento, reposición y kardex. Ver [stocks.md](stocks.md) |
| customers | FK opcional |
| cash-register | `registerSessionId` |
| reports / dashboard | Lectura de ventas |

---

## 6. Definition of Done

- [ ] Inmutabilidad: update de `ISSUED` lanza `SALE_001`
- [ ] Soft-delete restaura stock
- [ ] Plan professional + org filter
- [ ] Tests `sales.service` / immutability verdes
- [ ] Esta spec actualizada si cambia contrato

---

## 7. Anti-patterns

- No inventar módulo / paths `invoices` o códigos `INVOICE_*`.
- No llamar `POST /sales` desde POS como único path — el path canónico de caja es sync push.
- No mutar montos/líneas de ventas no mutables vía `PartialType(CreateSaleDto)`.
- No hard-delete.

---

*Refs: [pos.md](pos.md) · [sync.md](sync.md) · [security.md](../system/security.md) · [architecture.md](../system/architecture.md)*
