# Feature: Stocks / Kardex

> **status:** `current`  
> **owner:** inventario  
> **last-verified:** 2026-09-26  
> **code:** `backend/src/modules/stocks/` · `frontend/src/features/stocks/`

Contrato de existencia y del kardex por producto. Si el código y esta spec divergen, actualizar esta spec en el mismo cambio.

---

## 1. Purpose / Non-goals

### Purpose

Llevar la existencia por fila de stock (producto, proveedor, lote) y un kardex por producto: fecha, documento, entrada, salida y saldo.

### Non-goals

- No valúa inventario (sin costo unitario, promedio ponderado ni FIFO de costo).
- No reconstruye ventas anteriores al kardex. Esas ventas no tienen lote asignado.
- No es libro de inventario fiscal.

---

## 2. Domain model

### `Stock` (`stocks`)

Existencia operativa de un producto. `products.totalExistence` es la suma de las filas no eliminadas.

### `StockDet` (`stock_details`) — kardex

| Campo | Notas |
|---|---|
| `type` | `1` entrada, `2` salida. La cantidad es siempre positiva. |
| `quantity` | Unidades del movimiento |
| `referenceType` | `sale` \| `purchase_order` \| `stock` |
| `referenceId` | Id del documento |
| `balanceAfter` | `products.totalExistence` después de este movimiento |
| `observation` | Texto libre (venta, pedido, ajuste, saldo inicial) |

Filas anteriores al kardex pueden tener `balanceAfter` nulo. La pantalla y el reporte `stock_movements` las omiten.

---

## 3. Business rules

1. Toda cambio de `existence` pasa por `recordMovement` en la misma transacción: actualiza la fila, recalcula `totalExistence` y agrega el `StockDet`.
2. Una venta descuenta la fila más antigua (`createdAt`, luego `id`) que tenga existencia. Si no alcanza, continúa con la siguiente. Cada fila tocada genera una salida.
3. Si la existencia del producto no cubre la venta, `SALE_005` y la transacción no deja movimientos.
4. Eliminar una venta escribe entradas sobre las mismas filas que la salida. No borra la salida. Si la venta es anterior al kardex, la entrada va a la fila más antigua.
5. Recibir un pedido escribe una entrada en la fila de ese producto y proveedor.
6. Crear o editar existencia a mano escribe el delta como entrada o salida (`referenceType = stock`). Desactivar la fila no mueve existencia.
7. Al desplegar el kardex, cada fila con existencia distinta de cero recibe un saldo inicial. El saldo corre en el orden de creación de esas filas.

---

## 4. API

Plan: `@PlanLevel('professional')`. Lectura: `@MinOrgLevel(employee)`. Escritura de stock: manager. Baja: master.

| Método | Ruta | Notas |
|---|---|---|
| `GET` | `/stocks/kardex` | `productId` (UUID), `page`, `limit` (máx. 100). Orden cronológico ascendente. |

---

## 5. UI

En Inventario, cada fila abre el kardex del producto (todas sus filas de stock) en el panel lateral. Columnas: fecha, documento, tipo, entrada, salida, saldo, observación.

El reporte Movimientos de Inventario lee las mismas filas con `balance_after`.

---

## 6. Cross-module

| Módulo | Relación |
|---|---|
| sales | Salida al crear, entrada al eliminar. Ver [sales.md](sales.md) |
| purchase-orders | Entrada al recibir |
| sync | El chequeo de oversold suma la existencia del producto |
| reports | `stock_movements` |

---

## 7. Definition of Done

- [ ] Venta, recepción, ajuste y borrado de venta dejan `StockDet` con `balanceAfter` igual a `totalExistence`
- [ ] Una venta no descuenta filas hermanas que no necesita
- [ ] `SALE_005` no deja movimientos parciales
- [ ] Tests en `stock-movement.spec.ts`
- [ ] Esta spec actualizada si cambia el contrato

---

## 8. Anti-patterns

- Descontar todas las filas del producto por la cantidad vendida.
- Borrar la salida del kardex al eliminar la venta.
- Guardar un segundo libro de movimientos fuera de `stock_details`.
