import {
  issueProductStock,
  recordMovement,
  restoreSaleStock,
  StockMovementType,
  StockReferenceType,
} from '../stock-movement';

const ORG = 'org-1';
const PRODUCT = 'product-1';

interface StockRow {
  id: string;
  organizationId: string;
  idProduct: string;
  existence: number;
  createdAt: Date;
  deletedAt: Date | null;
  version: number;
}

interface DetRow {
  id: string;
  idStock: string;
  type: number;
  quantity: number;
  observation?: string;
  referenceType: string;
  referenceId: string;
  balanceAfter: number;
  createdAt: Date;
}

function ledger(initial: StockRow[]) {
  const stocks = initial.map((row) => ({ ...row }));
  const dets: DetRow[] = [];
  const totals = new Map<string, number>();

  const tx = {
    $queryRaw: async (_query: TemplateStringsArray, productId: string) =>
      stocks
        .filter((row) => row.idProduct === productId && row.deletedAt == null)
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .map((row) => ({ id: row.id, existence: row.existence })),
    stock: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          existence?: { increment: number };
          version?: { increment: number };
        };
      }) => {
        const row = stocks.find((item) => item.id === where.id);
        if (!row) throw new Error(`missing stock ${where.id}`);
        if (data.existence) row.existence += data.existence.increment;
        if (data.version) row.version += data.version.increment;
        return row;
      },
      create: async ({
        data,
      }: {
        data: {
          idProduct: string;
          organizationId: string;
          existence: number;
        };
      }) => {
        const row: StockRow = {
          id: `stock-${stocks.length + 1}`,
          organizationId: data.organizationId,
          idProduct: data.idProduct,
          existence: data.existence,
          createdAt: new Date(),
          deletedAt: null,
          version: 0,
        };
        stocks.push(row);
        return row;
      },
      aggregate: async ({
        where,
      }: {
        where: { idProduct: string; organizationId: string };
      }) => ({
        _sum: {
          existence: stocks
            .filter(
              (row) =>
                row.idProduct === where.idProduct &&
                row.organizationId === where.organizationId &&
                row.deletedAt == null,
            )
            .reduce((sum, row) => sum + row.existence, 0),
        },
      }),
    },
    product: {
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { totalExistence: number };
      }) => {
        totals.set(where.id, data.totalExistence);
      },
    },
    stockDet: {
      create: async ({ data }: { data: Omit<DetRow, 'id' | 'createdAt'> }) => {
        const det: DetRow = {
          ...data,
          id: `det-${dets.length + 1}`,
          createdAt: new Date(),
        };
        dets.push(det);
        return det;
      },
      findMany: async ({
        where,
      }: {
        where: { type: number; referenceType: string; referenceId: string };
      }) =>
        dets
          .filter(
            (det) =>
              det.type === where.type &&
              det.referenceType === where.referenceType &&
              det.referenceId === where.referenceId,
          )
          .map((det) => ({
            ...det,
            stock: {
              idProduct: stocks.find((row) => row.id === det.idStock)
                ?.idProduct,
            },
          })),
    },
  };

  return { tx: tx as never, stocks, dets, totals };
}

function stock(id: string, existence: number, createdAt: string): StockRow {
  return {
    id,
    organizationId: ORG,
    idProduct: PRODUCT,
    existence,
    createdAt: new Date(createdAt),
    deletedAt: null,
    version: 0,
  };
}

describe('stock kardex', () => {
  it('descuenta solo la fila más antigua y deja el saldo del producto', async () => {
    const book = ledger([
      stock('older', 5, '2026-01-01'),
      stock('newer', 8, '2026-02-01'),
    ]);

    await issueProductStock(book.tx, {
      organizationId: ORG,
      productId: PRODUCT,
      quantity: 3,
      referenceType: StockReferenceType.Sale,
      referenceId: 'sale-1',
      observation: 'Venta FAC-1',
    });

    expect(book.stocks.find((row) => row.id === 'older')?.existence).toBe(2);
    expect(book.stocks.find((row) => row.id === 'newer')?.existence).toBe(8);
    expect(book.dets).toEqual([
      expect.objectContaining({
        idStock: 'older',
        type: StockMovementType.Exit,
        quantity: 3,
        balanceAfter: 10,
      }),
    ]);
    expect(book.totals.get(PRODUCT)).toBe(10);
  });

  it('parte la salida cuando la fila más antigua no alcanza', async () => {
    const book = ledger([
      stock('older', 2, '2026-01-01'),
      stock('newer', 5, '2026-02-01'),
    ]);

    await issueProductStock(book.tx, {
      organizationId: ORG,
      productId: PRODUCT,
      quantity: 4,
      referenceType: StockReferenceType.Sale,
      referenceId: 'sale-2',
    });

    expect(book.stocks.map((row) => row.existence)).toEqual([0, 3]);
    expect(
      book.dets.map((det) => [det.idStock, det.quantity, det.balanceAfter]),
    ).toEqual([
      ['older', 2, 5],
      ['newer', 2, 3],
    ]);
  });

  it('rechaza la venta sin escribir movimientos si no hay existencia', async () => {
    const book = ledger([stock('only', 1, '2026-01-01')]);

    await expect(
      issueProductStock(book.tx, {
        organizationId: ORG,
        productId: PRODUCT,
        quantity: 5,
        referenceType: StockReferenceType.Sale,
        referenceId: 'sale-3',
      }),
    ).rejects.toMatchObject({ errorCode: 'SALE_005' });

    expect(book.dets).toHaveLength(0);
    expect(book.stocks[0].existence).toBe(1);
  });

  it('registra una entrada de compra con el saldo posterior', async () => {
    const book = ledger([stock('row', 6, '2026-01-01')]);

    await recordMovement(book.tx, {
      organizationId: ORG,
      productId: PRODUCT,
      stockId: 'row',
      type: StockMovementType.Entry,
      quantity: 4,
      referenceType: StockReferenceType.PurchaseOrder,
      referenceId: 'po-1',
    });

    expect(book.stocks[0].existence).toBe(10);
    expect(book.dets[0]).toEqual(
      expect.objectContaining({
        type: StockMovementType.Entry,
        quantity: 4,
        balanceAfter: 10,
      }),
    );
    expect(book.totals.get(PRODUCT)).toBe(10);
  });

  it('registra el delta de un ajuste manual', async () => {
    const book = ledger([stock('row', 10, '2026-01-01')]);
    const next = 7;
    const delta = next - book.stocks[0].existence;

    await recordMovement(book.tx, {
      organizationId: ORG,
      productId: PRODUCT,
      stockId: 'row',
      type: delta > 0 ? StockMovementType.Entry : StockMovementType.Exit,
      quantity: Math.abs(delta),
      referenceType: StockReferenceType.Stock,
      referenceId: 'row',
      observation: 'Ajuste manual',
    });

    expect(book.stocks[0].existence).toBe(7);
    expect(book.dets[0]).toEqual(
      expect.objectContaining({
        type: StockMovementType.Exit,
        quantity: 3,
        balanceAfter: 7,
      }),
    );
  });

  it('al eliminar la venta devuelve la existencia a las mismas filas', async () => {
    const book = ledger([
      stock('older', 2, '2026-01-01'),
      stock('newer', 5, '2026-02-01'),
    ]);

    await issueProductStock(book.tx, {
      organizationId: ORG,
      productId: PRODUCT,
      quantity: 4,
      referenceType: StockReferenceType.Sale,
      referenceId: 'sale-4',
    });

    await restoreSaleStock(book.tx, {
      organizationId: ORG,
      saleId: 'sale-4',
      lines: [{ productId: PRODUCT, quantity: 4 }],
    });

    expect(book.stocks.map((row) => row.existence)).toEqual([2, 5]);
    expect(
      book.dets.filter((det) => det.type === StockMovementType.Entry),
    ).toEqual([
      expect.objectContaining({ idStock: 'older', quantity: 2 }),
      expect.objectContaining({ idStock: 'newer', quantity: 2 }),
    ]);
    expect(book.totals.get(PRODUCT)).toBe(7);
  });
});
