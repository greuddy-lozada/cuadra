# Feature: POS

> **status:** `current`  
> **owner:** ventas / caja  
> **last-verified:** 2026-08-30  
> **code:** `frontend/src/features/pos/` · cart `frontend/src/stores/pos-store.ts`  
> **Backend de persistencia:** vía [sync.md](sync.md) → [sales.md](sales.md) (no `POST /sales` directo).

---

## 1. Purpose / Non-goals

### Purpose

Caja rápida offline-first: buscar producto/cliente, armar carrito, estacionar, cobrar — sin depender de internet en el momento de la venta.

### Non-goals

- No es admin CRUD de catálogo (eso es products/customers).
- No es panel fiscal SENIAT.
- Parked orders y atajos personalizados son **locales** (Dexie), no se sincronizan.

---

## 2. Structure

```
features/pos/
  pos-page.tsx              # shell / hotkeys
  hooks/use-pos.ts
  hooks/use-offline-sale.ts # createSale → Dexie + syncQueue
  models/pos.model.ts
  components/
    product-search.tsx | product-grid.tsx | product-card.tsx
    cart-panel.tsx | customer-search.tsx | customer-bar.tsx
    payment-modal.tsx | parked-orders.tsx
    sale-history.tsx | receipt-dialog.tsx | pos-toolbar.tsx
    ...
```

Nav: `/pos`, `minLevel: 40`. Hoy **sin** `requiredFeature` en nav (gap vs plan `sales`).

---

## 3. Flows

| Flujo | Comportamiento |
|---|---|
| Buscar producto | Dexie `products` por name/code (includes); chips de categoría; lista densa; ↑↓/Enter; barcode buffer Enter (≥3 chars); `autoFocus` |
| Catálogo UI | Design **A** (caja rápida): search-first + chips + rows — no grid de cards como default |
| Carrito | Zustand (`pos-store`); qty ≤ stock; taxes desde Dexie |
| Cliente | CustomerSearch; quick-add; clear customer hotkey |
| Estacionar | Dexie `parkedOrders` only; resume merge por productId |
| Cobrar | `PaymentModal` → `useOfflineSale.createSale` |
| Historial | `GET /api/sales` (código, cliente, fechas) y fusiona ventas locales aún no sincronizadas en `localDb.sales` |
| Sync | Auth provider arranca SyncEngine; push cuando hay red |
| API down (deploy) | Cobro sigue (Dexie). Sidebar, tabs, org switcher, logout y abrir/cerrar caja se bloquean en `/pos` hasta `HEAD /api/health` 200. Si el selector de caja está abierto, se cierra para no bloquear el cobro. |

Un restart del API (deploy) es **el mismo caso que “sin internet”** para caja: el cobro no espera al servidor. Política de ventana y qué sí se corta: [deployment.md](../DevOps/deployment.md) §7.

Detección: `networkStatus` (ping a `/api/health` + interceptor axios). No usar `navigator.onLine` como “API vivo”. UI: `usePosNavLock` — solo en `/pos`.

### Persistencia de venta

```
createSale
  → localDb.sales + stockCache--
  → syncQueue { table: 'sales', operation: 'create' }
  → SyncEngine.push → POST /api/sync/push
  → SalesService.create (DRAFT + stock server)
```

### PaymentMethod (int)

`Cash=1`, `PagoMovil=2`, `Transfer=3`, `Card=4`, `Mixed=5`, `Credit=6`

- **Credit:** cliente obligatorio; abre CXC por el saldo no cubierto con otros métodos (ver [accounts-receivable.md](accounts-receivable.md)).

---

## 4. Keyboard (defaults)

Config: `frontend/src/config/shortcuts.ts` · override Dexie · `useHotkey`.

| Atajo | Acción |
|---|---|
| F1 | Focus product search |
| F2 | Focus customer search |
| F3 | Clear customer |
| F4 | Clear cart |
| F5 | Refresh product grid |
| F8 | Park order |
| F9 | Pay |
| F10 | Undo |
| Esc | Close modal |
| Ctrl+Alt+C | Quick add customer |

Documentar atajos en UI (tooltip/badge). No capturar hotkeys modales mientras el usuario escribe en inputs (excepto Escape).

---

## 5. UI rules

- Plantilla **B — POS** en [UI-UX/patterns.md](../UI-UX/patterns.md). Llena el pane del dashboard **sin scroll de página**; solo scrollean la lista de productos y el carrito.
- Sin `<h1>` propio si está bajo dashboard layout (POS puede ser fullscreen — seguir patrón existente del feature).
- i18n `pos.*` / shortcuts keys.
- Success cobro: feedback en UI + receipt; errores visibles (no tragar).
- API unreachable en `/pos`: deshabilitar nav online-only (sidebar, tabs, org, logout) con tooltip `sync.posNavLocked`. No congelar el cobro.

---

## 6. Cross-module

| Módulo | Relación |
|---|---|
| sync / Dexie | Catálogo pull + sales push |
| sales | Persistencia canónica en servidor |
| products / customers / taxes / exchange-rates | Datos locales |
| cash-register | `registerSessionId` cuando hay sesión |
| pago-movil | Método de pago 2 (flujo settings/payments) |

---

## 7. Definition of Done

- [ ] Venta offline encola y sincroniza sin doble cobro indebido (idempotencia / queue)
- [ ] Stock local no permite qty > existencia mostrada
- [ ] Hotkeys no rompen typing en inputs
- [ ] E2E POS: buscar → agregar → cobrar
- [ ] API down en POS: nav online-only bloqueada; cobro local sigue

---

## 8. Anti-patterns

- No hacer `POST /api/sales` desde el cobro del POS (rompería offline-first).
- No asumir plan gating en nav (hoy ausente — no “arreglar” silenciosamente sin producto).
- No sync de parked orders como si fueran ventas.
- No inventar wizard/stepper para el flujo diario de caja.
- No tratar un deploy como “hay que cerrar caja”. El corte es del API; el ticket local no.
- No usar `navigator.onLine === true` como señal de que el backend está vivo (un deploy deja el Wi‑Fi arriba).

---

*Refs: [sync.md](sync.md) · [sales.md](sales.md) · [products.md](products.md) · [deployment.md](../DevOps/deployment.md) · [patterns.md](../UI-UX/patterns.md)*
