# UI Patterns — Catálogo Adoptado de Cuadra

> **status:** `current` · Última actualización: 2026-08-30  
> **Propósito:** Qué patrones de UI **usamos**, cuáles **adoptamos después**, y cuáles **rechazamos**.  
> Tokens, tipografía y grids detallados viven en [design-system.md](design-system.md). Este archivo es la lista operativa para agentes y PRs.

**Regla:** Si inventas un layout/flujo UI nuevo y no está aquí → **añádelo en el mismo PR** (Adopted) o no lo merges.

---

## Cómo aplicar (DoD UI)

Antes de mergear un cambio de pantalla:

1. Elegir plantilla de layout (§ Adopted → Layout).
2. Cubrir **loading / empty / error** antes de polish visual.
3. Reutilizar `frontend/src/components/ui/*` — no crear one-offs equivalentes.
4. i18n (`t`/`tp`) + sin `<h1>` de página (layout dashboard).
5. Si el patrón es nuevo → actualizar este archivo.

---

## Adopted — Debe usarse

### Layout & CRUD

| Patrón | Cuándo | Canónico | Anti-patrón |
|---|---|---|---|
| **Toolbar + DataTable** | Listados admin (productos, clientes, etc.) | `DataTable` (search integrado) + botón crear con `RoleGuard` | Tabla HTML cruda; search one-off por página |
| **SlideForm (Sheet)** | Create / edit | `SlideForm` | Modal centrado para formularios largos de CRUD |
| **ConfirmDialog** | Delete / acciones destructivas | `ConfirmDialog` | `window.confirm`; delete sin confirmación |
| **Sin H1 de feature** | Toda página dashboard | Título desde `navigationConfig` / layout | Segundo `<h1>` en la feature page |
| **Contenedor con `max-w-*`** | Formularios y contenido estrecho | `max-w-6xl mx-auto` (listas) / `max-w-4xl` forms densos | `mx-auto` sin `max-w-*` |

### Mobile (< `md` ~768px)

| Patrón | Cuándo | Canónico | Anti-patrón |
|---|---|---|---|
| **SlideForm full-bleed** | Create/edit en teléfono | `SlideForm` full viewport; `--panel-offset: 0` bajo `md` | Panel fijo 420–720px + `paddingRight` que aplasta el main |
| **DataTable search** | Listados CRUD | Toolbar de búsqueda en `DataTable` (`searchable` default true); filtra filas cargadas; empty `common.noResults` | Input de búsqueda solo en una feature; filtrar sin empty state |
| **List → detail** | Splits (pedidos) | Un pane a la vez + botón atrás | `w-[440px]` + form lado a lado sin breakpoint |
| **POS cart sticky** | Caja en teléfono | Productos scrolleables + carrito en el pane (sin scroll de página) | Carrito bajo el fold; scrollbar de página en `/pos` |
| **KPI 2-col** | Report viewer / dashboards | `grid-cols-2 md:grid-cols-3\|4` | `grid-cols-3/4` fijos en móvil |

### Feedback & estados

| Patrón | Cuándo | Canónico | Anti-patrón |
|---|---|---|---|
| **Skeleton loading** | Fetch inicial de listas/páginas | `Skeleton` / skeleton del DataTable | Spinner a pantalla completa; blanco vacío |
| **Empty state** | Lista con 0 ítems | `EmptyState` (`components/ui/empty-state.tsx`) + i18n | Texto suelto "No data"; icono solo |
| **Error inline en form** | Fallo de save/validación | `<Alert variant="destructive">` | Toast de error para fallos de form |
| **Success via Sileo** | Tras create/update/delete OK | `sileo.success({ description: t('…') })` | Toast de error; éxito solo con Alert |
| **Optimistic CRUD** | Catálogos estándar | `useOptimisticCrud` | Refetch manual sin feedback |

### Forms

| Patrón | Cuándo | Canónico | Anti-patrón |
|---|---|---|---|
| **Stack vertical** | ~90% de formularios | `space-y-4` + campo `space-y-2` (Label + Input) | Multi-columna por defecto |
| **Pares relacionados inline** | Moneda+monto, costo+margen | `flex items-end gap-3` | Separar campos que se leen juntos |
| **shadcn controls only** | Todo input | `Input`, `Select`, `Switch`, `Label`, `Button` | `<select>` / `<input>` nativos |
| **Card muted para cálculo** | Bloques de pricing / totales | `rounded-lg border bg-muted/30 p-4` | Cards anidadas > 2 niveles |

### Navigation & input

| Patrón | Cuándo | Canónico | Anti-patrón |
|---|---|---|---|
| **Keyboard-first** | Login, PIN, POS search | `autoFocus` + refocus post-async | Obligar mouse para empezar a escribir |
| **Hotkeys documentados** | Atajos globales/POS | `useHotkey` + badge/tooltip | Atajos ocultos; interferir con typing en inputs (excepto Escape) |
| **Escape cierra** | Modales / sheets / dialogs | Cierra el overlay más cercano | Escape sin efecto |
| **Assistant page** | Preguntar ventas, stock, compras o generar un reporte ya existente | Ítem de menú debajo de Dashboard → `/assistant`. Conversación en el contenido de la página. Errores en `Alert`. El enlace de reporte abre `/reports?report=` | Sheet lateral en el header; chat dentro del POS; generar el reporte solo en el texto sin enlace |
| **POS nav lock** | API down mientras la ruta es `/pos` | Sidebar, tabs, org y logout deshabilitados (excepto POS) + tooltip `sync.posNavLocked`; cobro local sigue | Congelar la caja; dejar salir a pantallas que pegan al API |

### Marketing (público)

| Patrón | Cuándo | Canónico | Anti-patrón |
|---|---|---|---|
| **Landing Soft Tech** | `/` marketing (no autenticado) | Route group `(marketing)` + `features/landing/*`; fondo `--neo-bg`; sombras duales `neo-raised` / `neo-inset` / `neo-cta` en `globals.css` | Mezclar glassmorphism; cards decorativas anidadas; redirect silencioso sin landing |
| **App Soft Tech light (A)** | Dashboard + auth en light | Tokens `:root` Soft Tech; primitives neo en `html:not(.dark)`; sidebar/header soft; login Soft Tech | Forzar neo denso en POS; dark neumórfico sin diseño; theme system por defecto |
| **Hero split + POS mock** | Above the fold | Copy/CTAs izq. + `PosPreview` estático der.; stack en mobile | Hero sin ancla de producto; badges flotantes sobre el mock |
| **Motion cinemática (solo marketing)** | Landing | Timeline hero + `whileInView` + micro-motion POS; `useReducedMotion` | Timelines largas dentro del dashboard/app (ahí rige ≤200ms del design-system) |
| **Auth gate en `/`** | Visitante autenticado | Redirect a dashboard / org-picker (misma lógica que login) | Mostrar marketing a sesión activa |

---

### Visual system (puntero)

Seguir [design-system.md](design-system.md): tokens, tipografía financiera (`tabular-nums`), jerarquía de cards, motion corta, `prefers-reduced-motion`, a11y básica.

---

## Adopt next — Planeado (no inventar one-offs mientras tanto)

Implementar como **componentes compartidos** + actualizar esta sección a Adopted.

| Prioridad | Patrón | Objetivo | Nota de implementación |
|---|---|---|---|
| 1 | **EmptyState variants** | `first-run` \| `no-results` \| `error` | Extender `EmptyState` con `variant` + copy/CTA distintos (filtros → “limpiar filtros”); search ya usa `common.noResults` |
| 2 | **FormField wrapper** | Label + control + hint + error | Un componente para no repetir `space-y-2` / a11y `aria-describedby` |
| 3 | **URL-synced filters** | Vistas compartibles | Query params (`nuqs` o equivalente) en 1–2 módulos piloto |
| 4 | **POS combobox a11y** | ProductSearch / CustomerSearch | listbox/option, flechas, Enter, Escape; contrato en feature POS |
| 5 | **Progressive disclosure** | Forms densos (pricing avanzado) | Max 2 niveles; “Más opciones” / override ya existe parcialmente en products |

**Orden de trabajo sugerido:** 1 → 2 en admin CRUD; 4 en POS; 3 y 5 cuando duela de verdad.

---

## Rejected — No usar en Cuadra

| Patrón | Por qué |
|---|---|
| **Wizard / stepper para POS diario** | Fricción en caja; POS es flujo continuo |
| **Floating labels como default** | Labels fijos arriba son más claros (Baymard) |
| **Drawers anidados / sheets sobre sheets** | Pierde orientación; max 1 sheet de edición |
| **Cards > 2 niveles de nesting** | design-system §8.4 |
| **Dashboard widget soup** | Una sección = un propósito |
| **Error toasts para validación de form** | Errores van inline |
| **Hard-coded copy** | Todo user-facing vía i18n |
| **Módulos UI inventados** (`invoices` page, etc.) | Dominio real: `sales`, `products`, … |

---

## Plantillas de pantalla (elige una)

### A — CRUD admin
```
[ Toolbar: Create (RoleGuard) ]
[ Alert error? ]
[ DataTable | Skeleton | EmptyState ]
[ SlideForm panel ]
[ ConfirmDialog ]
```

### B — POS / caja (design A — caja rápida)
```
[ Search autofocus · ↑↓ Enter · Esc clear ]
[ Category chips: Todos | … ]
[ Dense product rows · Cart sticky / right rail ]
[ Payment / park — keyboard complete ]
```

### C — Dashboard / KPIs
```
[ Grid 12-col o bento ]
[ Card primaria KPI ]
[ Opcional: tabla secundaria full-width ]
```

### E — Marketing landing (Soft Tech)
```
[ Nav neo-raised · anclas · Entrar → /login ]
[ Hero split: copy+CTAs | PosPreview ]
[ Beneficios · Cómo funciona · Precios · Testimonios · FAQ · CTA · Footer ]
[ Motion cinemática + prefers-reduced-motion ]
```

---

## Referencias externas (inspiración, no fuente de verdad)

- NN/g progressive disclosure  
- Baymard form/checkout field minimalism  
- uxpatterns.dev (checkout, forms)  
- shadcn Data Table (filter/sort/visibility)

La fuente de verdad de Cuadra es **este archivo + design-system + componentes en `components/ui`**.

---

*Índice: [../README.md](../README.md) · Tokens: [design-system.md](design-system.md) · Código UI: AGENTS.md Component Patterns*
