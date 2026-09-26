# Feature: Ask AI (assistant)

> **status:** `current`  
> **owner:** gerencia  
> **last-verified:** 2026-09-26  
> **code:** `backend/src/modules/assistant/` · `frontend/src/features/assistant/`

El dueño pregunta cómo va el negocio y puede generar un reporte que ya existe. El asistente corre solo en el servidor, solo para la organización actual, y solo por herramientas definidas. No escribe SQL y no crea ni edita ventas, stock, pagos ni órdenes de compra.

---

## 1. Purpose / Non-goals

### Purpose

Responder preguntas operativas (ventas, compras, stock, caja, CxC, CxP) y generar un reporte del registry, con un enlace al visor existente.

### Non-goals (v1)

- Crear o editar registros de negocio (borrador de OC, abono, cliente, recepción).
- Text-to-SQL o cualquier query inventada por el modelo.
- Caja (`/pos`): el asistente no vive dentro del cobro. Se abre desde el menú, en `/assistant`.
- Libro fiscal SENIAT. Un reporte generado sigue siendo el snapshot de gestión.
- Voz, digest programado, deep links dentro de la respuesta.
- Proveedor por defecto. Sin `ASSISTANT_BASE_URL` la página muestra que no está disponible.

---

## 2. Domain model

| Modelo | Campos |
|---|---|
| `AssistantThread` | `organizationId`, `userId`, `title` |
| `AssistantMessage` | `threadId`, `role` (`user` \| `assistant`), `content`, `reportId?` |

El hilo pertenece a un usuario dentro de una organización. El historial enviado al modelo son los últimos turnos de ese hilo, no de la organización.

`reportId` apunta al `GeneratedReport` creado por la herramienta. No es FK: borrar el reporte no borra el mensaje.

---

## 3. Tools (allowlist)

Cada lectura devuelve como máximo 20 filas. Se omiten teléfono, email, dirección y RIF. `organizationId` del modelo se descarta; el id sale de `ContextService`.

| Tool | Quién | Qué hace |
|---|---|---|
| `get_today_snapshot` | employee+ | `DashboardService.getOverview` (CxC/CxP solo manager+, ya filtrado ahí) |
| `summarize_sales` | employee+ | Conteo, revenue y ticket para `from`/`to` en `America/Caracas`. Excluye `ANNULLED` |
| `list_sales` | employee+ | `SalesService.findAll`, tope 20: código, monto, cliente, fecha |
| `search_products` | employee+ | Nombre, existencia, precio USD, flag de stock bajo |
| `list_purchase_orders` | employee+ | Código, estado, monto, fecha, nombre del proveedor |
| `list_register_sessions` | employee+ | Estado, apertura, cierre, caja, usuario. No abre ni cierra |
| `list_receivables` | manager+ | Saldo, vencimiento, nombre del cliente |
| `list_payables` | manager+ | Saldo, vencimiento, nombre del proveedor |
| `generate_report` | manager+ | `ReportsService.generate`. `type` tiene que estar en el registry. Devuelve `reportId`, conteo y preview de 15 filas |

Máximo 4 rondas de herramientas por pregunta.

---

## 4. Provider

El loop depende de `AssistantProvider` (`provider.ts`): prompt de sistema, turnos, definiciones de tools, y o bien texto final o tool calls más conteo de tokens.

`ASSISTANT_PROVIDER` elige el adapter. v1 incluye uno: `openai-compatible` (protocolo HTTP de chat completions + tools, no un vendor). Variables:

| Variable | Notas |
|---|---|
| `ASSISTANT_PROVIDER` | Default `openai-compatible`. Otro valor desactiva el asistente |
| `ASSISTANT_BASE_URL` | Obligatoria. Sin default |
| `ASSISTANT_API_KEY` | Obligatoria |
| `ASSISTANT_MODEL` | Obligatoria. El modelo tiene que soportar tool calls |
| `ASSISTANT_DAILY_LIMIT` | Default 40 preguntas por organización y día (Caracas) |

Ejemplos de host que un operador en Venezuela puede pagar, ambos con el mismo protocolo:

- DeepSeek: `https://api.deepseek.com`
- Moonshot (Kimi): `https://api.moonshot.ai/v1`

Cambiar de host es configuración. Un protocolo de tools distinto es una clase nueva detrás de la misma interfaz. El navegador no llama al modelo.

Preguntas y filas salen del VPS hacia ese host. Las filas siguen sin teléfono, email, dirección ni RIF. Sí incluyen totales, nombres de producto y nombre visible de cliente o proveedor.

---

## 5. API / RBAC / plan

| Método | Ruta | Plan | Rol |
|---|---|---|---|
| `GET` | `/assistant/status` | ninguno (responde `enabled`) | employee+ |
| `GET` | `/assistant/thread` | `professional` | employee+ |
| `POST` | `/assistant/messages` | `professional` | employee+ |

`status.enabled` es true solo si el provider está configurado y el plan de la org es `professional` o superior (`master` de sistema pasa, igual que el guard). La página `/assistant` usa ese flag.

`POST` además: `@Throttle` 20 requests / 10 min. Tope diario `ASSISTANT_DAILY_LIMIT` → `ASSISTANT.DAILY_LIMIT` (429). Sin key o sin URL → `ASSISTANT.UNAVAILABLE` (503). Hilo de otro usuario u otra org → `ASSISTANT.THREAD_NOT_FOUND`.

El permiso manager+ de reportes y CxC/CxP se aplica dentro de la herramienta, no solo en el prompt.

---

## 6. UI

Ítem de menú justo debajo de Dashboard: `nav.assistant` → `/assistant`. El layout pone el título. La página no renderiza `<h1>`. Copy en `assistant.*` (`es` y `en`).

Estado vacío con cuatro preguntas sugeridas. Mientras corre, loading. El error va en un `Alert` en la página. Si el provider no está configurado o el plan no alcanza, la página muestra `assistant.unavailable` y no llama al modelo. Si la respuesta trae `reportId`, un enlace abre `/reports?report=<id>`. El visor de reportes lee ese query param.

---

## 7. Cross-module

| Módulo | Relación |
|---|---|
| dashboard | Snapshot del día |
| sales | Listado y resumen por rango |
| products / stocks | Búsqueda y existencia |
| purchase-orders | Listado |
| cash-register | Sesiones |
| accounts-receivable / payable | Solo manager+ |
| reports | `generate` + visor con `?report=` |

---

## 8. Anti-patterns

- Armar SQL o Prisma `where` con texto del modelo.
- Dejar un host por defecto en código o en ejemplos de un vendor bloqueado en Venezuela.
- Mandar al modelo teléfono, email, dirección, RIF o el cuerpo del mensaje en logs.
- Mostrar el asistente en `/pos` o bloquear la caja si el provider falla.
- Afirmar que el reporte es un libro SENIAT.
- Confiar en el prompt para el rol: la herramienta tiene que negarse.

---

## 9. Definition of Done

- [ ] Dueño en plan professional pregunta cómo va hoy contra ayer y recibe cifras del dashboard.
- [ ] Manager pide el IVA del mes, ve la tarjeta, y el visor abre ese snapshot.
- [ ] Employee que pide el mismo reporte no crea `GeneratedReport`.
- [ ] Otra organización no aparece en los resultados.
- [ ] Sin API key o sin base URL, el botón no está y el resto de la app sigue.
- [ ] El repo no fija un host. Cambiar de proveedor es `ASSISTANT_BASE_URL` y `ASSISTANT_MODEL`.
