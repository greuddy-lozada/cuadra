# Feature: Reports

> **status:** `current`  
> **owner:** analytics / contabilidad de gestión  
> **last-verified:** 2026-08-08  
> **code:** `backend/src/modules/reports/` · `frontend/src/features/reports/`  
> **Design histórico:** [plans/reports-module-design.md](../plans/reports-module-design.md) (`done` engine; backlog fiscal abajo)

Contrato del módulo de reportes + backlog priorizado para lo que un **contador / dueño en Venezuela** necesita.  
Cuadra es **POS + gestión**, no máquina fiscal SENIAT — los libros fiscales formales son Later salvo que se decida ampliar scope.

---

## 1. Purpose / Non-goals

### Purpose

Generar reportes parametrizados, persistir resultados (`generated_reports`), visualizarlos e imprimirlos (`window.print()` MVP), para gerencia y apoyo al contador.

### Non-goals (hoy)

- No sustituye Portal SENIAT / Forma 30.
- No es libro de ventas/compras con validez formal (faltan nº control, correlativos fiscales, etc.).
- No es contabilidad de partida doble (diario/mayor).

---

## 2. Engine (shipped)

| Pieza | Detalle |
|---|---|
| Registry | `report-registry.ts` — un objeto por tipo |
| API | `POST /reports`, `GET /reports`, `GET /reports/types`, `GET /reports/:id`, `DELETE /reports/:id` |
| Plan | `@PlanLevel('free')` |
| RBAC | `@MinOrgLevel(employee)` |
| Persistencia | `GeneratedReport` — immutable snapshot; regenerar = nuevo registro |
| PDF | Client `window.print()` |
| Categories UI hoy | `sales`, `inventory` (fiscal/financial en DTO pero sin tipos en registry) |

Raw SQL en registry es excepción documentada (analytics); siempre parametrizado.

---

## 3. Registry — estado actual

| type | category | Status | Audience |
|---|---|---|---|
| `sales_summary` | sales | ✅ Shipped | Dueño / contador gestión |
| `sales_by_customer` | sales | ✅ Shipped | Dueño / cobranza |
| `sales_by_product` | sales | ✅ Shipped | Dueño / inventario |
| `inventory_status` | inventory | ✅ Shipped | Inventario |
| `stock_movements` | inventory | ✅ Shipped | Inventario / auditorías internas. Solo filas con `balance_after` (el kardex). |
| `fiscal_iva` | fiscal | ✅ Shipped | Contador gestión (no libro SENIAT) |
| `fiscal_withholding` | fiscal | ✅ Shipped | Retenciones |
| `financial_ar` | financial | ✅ Shipped | CxC / aging |
| `financial_ap` | financial | ✅ Shipped | CxP / aging |

### Notas de implementación P0

- `fiscal_iva` excluye `ANNULLED`; **incluye DRAFT** mientras el POS persista ventas como DRAFT (hasta exista flujo ISSUED).
- Categorías UI: sales, inventory, fiscal, financial.
- CSV export ya disponible en el viewer.

---

## 4. Backlog priorizado (contador Venezuela)

### P0 — Contador de gestión — ✅ Shipped (2026-08-08)

| # | type | category | Status |
|---|---|---|---|
| 1 | `fiscal_iva` | fiscal | ✅ |
| 2 | `fiscal_withholding` | fiscal | ✅ |
| 3 | `financial_ar` | financial | ✅ |
| 4 | `financial_ap` | financial | ✅ |

### Mejoras recomendadas sobre shipped (no nuevos tipos)

| Mejora | Por qué |
|---|---|
| Default rango = **mes calendario** al abrir params | Contador declara por mes (presets ya existen) |
| Excluir DRAFT cuando exista flujo ISSUED | Totales fiscales más limpios |
| Mostrar **VES + USD** + tasa | Multi-moneda VZLA |
| Header print: RIF org (además del nombre) | Entregable al contador |

### P1 — Operación diaria que el contador pide

| # | type (propuesto) | category | Qué entrega | Fuentes |
|---|---|---|---|---|
| 5 | `sales_by_payment_method` | sales | Totales por Cash / Pago Móvil / Transfer / Card / Mixed | `sales` / `sale_payments` |
| 6 | `cash_register_summary` | sales | Cuadre por sesión de caja | `cash-register` / `register_sessions` + sales |
| 7 | `purchases_received` | financial o inventory | Compras/recepciones del período (precursor libro compras) | `purchase_orders` received |
| 8 | `sales_fx_breakdown` | sales | Ventas VES vs USD + tasa aplicada | `sales`, exchange rates |

### P2 — “Listo para declaración” (SENIAT-grade) — Later

Solo si product-strategy abre facturación fiscal. Requiere identidad documental (nº factura/control), no inventar desde tickets POS.

| # | type (propuesto) | Notas |
|---|---|---|
| 9 | `libro_ventas` | Columnas: fecha, nº doc, RIF/nombre, gravado/exento, alícuota, débito, total, anuladas en 0 |
| 10 | `libro_compras` | Fecha, control, RIF proveedor, base, crédito, total |
| — | Export CSV formal | Totales = lo que iría a Forma 30 |

Marcar estos como `aspirational` hasta existir documento fiscal real.

---

## 5. API / UI rules

- Añadir reporte = **solo** nuevo entry en `reportRegistry` + i18n `es`/`en` + renderer en frontend (no engine nuevo).
- Misma PR: actualizar esta spec (mover fila de backlog → Shipped).
- UI patterns: [patterns.md](../UI-UX/patterns.md) — empty/loading/error; print CSS.
- No hardcode strings; keys bajo `reports.*`.
- Categorías en UI: al shippear P0, añadir `fiscal` y `financial` a `reports.categories` en locales.

---

## 6. Cross-module

| Módulo | Relación |
|---|---|
| sales / POS / sync | Ventas; cuidado con DRAFT vs emitidas |
| stocks | `stock_movements` lee el kardex. Ver [stocks.md](stocks.md) |
| taxes | Alícuotas para `fiscal_iva` |
| withholding / POs / suppliers | Retenciones y compras |
| AR / AP | Aging financiero |
| cash-register | Cuadre P1 |
| companies / org | RIF en header de impresión |

---

## 7. Anti-patterns

- Llamar “libro de ventas SENIAT” a un summary sin columnas/control legales.
- Incluir ventas `DRAFT` en totales fiscales sin opción explícita.
- Reportes sin `organization_id` filter.
- Duplicar engine o queries fuera del registry.
- Scope creep fiscal sin decisión en [product-strategy.md](../business/product-strategy.md).

---

## 8. Definition of Done (por tipo nuevo)

- [ ] Entry en `reportRegistry` con query parametrizada + tests o smoke manual
- [ ] i18n es + en (type name/desc + params)
- [ ] Renderer + categoría en UI
- [ ] Preset mes calendario funciona
- [ ] Print legible (header org)
- [ ] Fila movida a ✅ Shipped en §3 de esta spec

---

*Refs: [sales.md](sales.md) · [plan-gating.md](../system/plan-gating.md) · [product-strategy.md](../business/product-strategy.md) · [reports-module-design.md](../plans/reports-module-design.md)*
