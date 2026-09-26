import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContextService } from '../../modules/tenant/context.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import {
  issueProductStock,
  recordMovement,
  restoreSaleStock,
  StockMovementType,
  StockReferenceType,
} from './stock-movement';

const stockInclude = {
  product: true,
  supplier: true,
  batch: true,
} satisfies Prisma.StockInclude;

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: ContextService,
  ) {}

  private async recalcTotalExistence(
    productId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const result = await tx.stock.aggregate({
      where: { idProduct: productId },
      _sum: { existence: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: { totalExistence: result._sum.existence ?? 0 },
    });
  }

  issue(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      productId: string;
      quantity: number;
      referenceId: string;
      observation?: string;
    },
  ) {
    return issueProductStock(tx, {
      ...input,
      referenceType: StockReferenceType.Sale,
    });
  }

  restoreSale(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      saleId: string;
      lines: Array<{ productId: string; quantity: number }>;
    },
  ) {
    return restoreSaleStock(tx, input);
  }

  receive(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      productId: string;
      stockId: string;
      quantity: number;
      purchaseOrderId: string;
      observation?: string;
    },
  ) {
    return recordMovement(tx, {
      organizationId: input.organizationId,
      productId: input.productId,
      stockId: input.stockId,
      type: StockMovementType.Entry,
      quantity: input.quantity,
      referenceType: StockReferenceType.PurchaseOrder,
      referenceId: input.purchaseOrderId,
      observation: input.observation,
      purchaseOrderId: input.purchaseOrderId,
    });
  }

  async getAlerts(threshold = 5) {
    const ctx = this.contextService?.getCurrent();
    const orgId = ctx?.organizationId;
    return this.prisma.product.findMany({
      where: {
        organizationId: orgId!,
        available: true,
        totalExistence: { lte: threshold },
      },
      select: { id: true, name: true, price: true, totalExistence: true },
      orderBy: { totalExistence: 'asc' },
      take: 10,
    });
  }

  async create(dto: CreateStockDto) {
    const ctx = this.contextService?.getCurrent();
    const orgId = ctx?.organizationId;
    if (!orgId) throw new Error('No organization context');

    const stock = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stock.create({
        data: {
          idProduct: dto.idProduct,
          idSupplier: dto.idSupplier,
          idBatch: dto.idBatch,
          existence: 0,
          organizationId: orgId,
        },
      });
      if (dto.existence !== 0) {
        const delta = dto.existence;
        await recordMovement(tx, {
          organizationId: orgId,
          productId: dto.idProduct,
          stockId: created.id,
          type: delta > 0 ? StockMovementType.Entry : StockMovementType.Exit,
          quantity: Math.abs(delta),
          referenceType: StockReferenceType.Stock,
          referenceId: created.id,
          observation: 'Ajuste manual',
        });
      }
      return tx.stock.findUniqueOrThrow({
        where: { id: created.id },
        include: stockInclude,
      });
    });
    return { data: stock, message: 'STOCK.CREATED' };
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.stock.findMany({
        where: { available: true },
        include: {
          product: true,
          supplier: true,
          batch: true,
          stockDets: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.stock.count({ where: { available: true } }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const stock = await this.prisma.stock.findUnique({
      where: { id },
      include: { product: true, supplier: true, batch: true, stockDets: true },
    });
    if (!stock) throw new NotFoundException('STOCK.NOT_FOUND');
    return stock;
  }

  async update(id: string, dto: UpdateStockDto) {
    const before = await this.findOne(id);
    const { existence, ...rest } = dto;
    const data = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    const nextProductId = rest.idProduct ?? before.idProduct;

    const stock = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.stock.update({ where: { id }, data });
      }
      if (existence !== undefined && existence !== before.existence) {
        const delta = existence - before.existence;
        await recordMovement(tx, {
          organizationId: before.organizationId,
          productId: nextProductId,
          stockId: id,
          type: delta > 0 ? StockMovementType.Entry : StockMovementType.Exit,
          quantity: Math.abs(delta),
          referenceType: StockReferenceType.Stock,
          referenceId: id,
          observation: 'Ajuste manual',
        });
      }
      if (nextProductId !== before.idProduct) {
        await this.recalcTotalExistence(before.idProduct, tx);
        if (existence === undefined || existence === before.existence) {
          await this.recalcTotalExistence(nextProductId, tx);
        }
      }
      return tx.stock.findUniqueOrThrow({
        where: { id },
        include: stockInclude,
      });
    });
    return { data: stock, message: 'STOCK.UPDATED' };
  }

  async remove(id: string) {
    const stock = await this.findOne(id);
    await this.prisma.stock.update({
      where: { id },
      data: { available: false },
    });
    await this.recalcTotalExistence(stock.idProduct);
    return { data: stock, message: 'STOCK.DELETED' };
  }
}
