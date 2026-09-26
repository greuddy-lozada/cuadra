import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors';

export const StockMovementType = {
  Entry: 1,
  Exit: 2,
} as const;

export type StockMovementTypeValue =
  (typeof StockMovementType)[keyof typeof StockMovementType];

export const StockReferenceType = {
  Sale: 'sale',
  PurchaseOrder: 'purchase_order',
  Stock: 'stock',
} as const;

export type StockReferenceTypeValue =
  (typeof StockReferenceType)[keyof typeof StockReferenceType];

type Tx = Prisma.TransactionClient;

export interface RecordMovementInput {
  organizationId: string;
  productId: string;
  stockId: string;
  type: StockMovementTypeValue;
  quantity: number;
  referenceType: StockReferenceTypeValue;
  referenceId: string;
  observation?: string;
  purchaseOrderId?: string;
}

interface LockedStock {
  id: string;
  existence: number;
}

export async function lockProductStocks(
  tx: Tx,
  organizationId: string,
  productId: string,
): Promise<LockedStock[]> {
  const rows = await tx.$queryRaw<Array<{ id: string; existence: number }>>`
    SELECT id, existence
    FROM stocks
    WHERE id_product = ${productId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  `;
  return rows.map((row) => ({
    id: row.id,
    existence: Number(row.existence),
  }));
}

/** Updates one stock row and appends the kardex line in the same transaction. */
export async function recordMovement(
  tx: Tx,
  input: RecordMovementInput,
): Promise<number> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error('Stock movement quantity must be a positive integer');
  }

  const delta =
    input.type === StockMovementType.Exit ? -input.quantity : input.quantity;

  await tx.stock.update({
    where: { id: input.stockId },
    data: {
      existence: { increment: delta },
      version: { increment: 1 },
      ...(input.purchaseOrderId
        ? { idPurchaseOrder: input.purchaseOrderId }
        : {}),
    },
  });

  const sum = await tx.stock.aggregate({
    where: {
      idProduct: input.productId,
      organizationId: input.organizationId,
    },
    _sum: { existence: true },
  });
  const balanceAfter = sum._sum.existence ?? 0;

  await tx.product.update({
    where: { id: input.productId },
    data: { totalExistence: balanceAfter },
  });

  await tx.stockDet.create({
    data: {
      idStock: input.stockId,
      type: input.type,
      quantity: input.quantity,
      observation: input.observation,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      balanceAfter,
    },
  });

  return balanceAfter;
}

export async function issueProductStock(
  tx: Tx,
  input: {
    organizationId: string;
    productId: string;
    quantity: number;
    referenceType: StockReferenceTypeValue;
    referenceId: string;
    observation?: string;
  },
): Promise<void> {
  if (input.quantity <= 0) return;

  const rows = await lockProductStocks(
    tx,
    input.organizationId,
    input.productId,
  );
  const available = rows.reduce(
    (sum, row) => sum + Math.max(row.existence, 0),
    0,
  );
  if (available < input.quantity) {
    throw new AppException('SALE_005', HttpStatus.CONFLICT);
  }

  let remaining = input.quantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(Math.max(row.existence, 0), remaining);
    if (take <= 0) continue;
    await recordMovement(tx, {
      organizationId: input.organizationId,
      productId: input.productId,
      stockId: row.id,
      type: StockMovementType.Exit,
      quantity: take,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      observation: input.observation,
    });
    remaining -= take;
  }
}

export async function restoreSaleStock(
  tx: Tx,
  input: {
    organizationId: string;
    saleId: string;
    lines: Array<{ productId: string; quantity: number }>;
  },
): Promise<void> {
  const exits = await tx.stockDet.findMany({
    where: {
      type: StockMovementType.Exit,
      referenceType: StockReferenceType.Sale,
      referenceId: input.saleId,
    },
    include: { stock: { select: { idProduct: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  if (exits.length > 0) {
    const groups = new Map<string, typeof exits>();
    for (const exit of exits) {
      const productId = exit.stock.idProduct;
      const list = groups.get(productId) ?? [];
      list.push(exit);
      groups.set(productId, list);
    }
    for (const productId of [...groups.keys()].sort()) {
      await lockProductStocks(tx, input.organizationId, productId);
      for (const exit of groups.get(productId) ?? []) {
        await recordMovement(tx, {
          organizationId: input.organizationId,
          productId,
          stockId: exit.idStock,
          type: StockMovementType.Entry,
          quantity: exit.quantity,
          referenceType: StockReferenceType.Sale,
          referenceId: input.saleId,
          observation: 'Devolución por venta eliminada',
        });
      }
    }
    return;
  }

  const merged = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.quantity) continue;
    merged.set(
      line.productId,
      (merged.get(line.productId) ?? 0) + line.quantity,
    );
  }
  for (const productId of [...merged.keys()].sort()) {
    await returnToOldestStock(tx, {
      organizationId: input.organizationId,
      productId,
      quantity: merged.get(productId) ?? 0,
      referenceType: StockReferenceType.Sale,
      referenceId: input.saleId,
      observation: 'Devolución por venta eliminada',
    });
  }
}

async function returnToOldestStock(
  tx: Tx,
  input: {
    organizationId: string;
    productId: string;
    quantity: number;
    referenceType: StockReferenceTypeValue;
    referenceId: string;
    observation?: string;
  },
): Promise<void> {
  if (input.quantity <= 0) return;
  const rows = await lockProductStocks(
    tx,
    input.organizationId,
    input.productId,
  );
  let stockId = rows[0]?.id;
  if (!stockId) {
    const created = await tx.stock.create({
      data: {
        idProduct: input.productId,
        organizationId: input.organizationId,
        existence: 0,
      },
    });
    stockId = created.id;
  }
  await recordMovement(tx, {
    organizationId: input.organizationId,
    productId: input.productId,
    stockId,
    type: StockMovementType.Entry,
    quantity: input.quantity,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    observation: input.observation,
  });
}
