import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContextService } from '../../modules/tenant/context.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { AppException } from '../../common/errors';
import {
  PurchaseOrderStatus,
  PURCHASE_ORDER_STATUS_META,
} from '../../common/types/statuses';
import {
  ArApStatus,
  DEFAULT_DUE_DAYS,
} from '../../common/types/payment-method';
import { AuditLogService } from '../../modules/audit-log/audit-log.service';
import { StocksService } from '../stocks/stocks.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextService: ContextService,
    private readonly auditLog: AuditLogService,
    private readonly stocks: StocksService,
  ) {}

  private get orgId(): string {
    const ctx = this.contextService?.getCurrent();
    const id = ctx?.organizationId;
    if (!id) throw new Error('No organization context');
    return id;
  }

  private include = {
    supplier: true,
    details: { include: { product: true } },
    exchangeRateRef: true,
    exchangeRateDayRef: true,
    officialExchangeRateRef: true,
    withholdingRecords: true,
  };

  async create(dto: CreatePurchaseOrderDto) {
    const orgId = this.orgId;
    const {
      details,
      applyWithholding,
      withholdingPercentage,
      withholdingProof,
      ...header
    } = dto;

    if (!header.code) {
      const year = new Date().getFullYear();
      const lastOrder = await this.prisma.purchaseOrder.findFirst({
        where: { code: { startsWith: `OC-${year}-` }, organizationId: orgId },
        orderBy: { code: 'desc' },
        select: { code: true },
      });
      const nextSeq = lastOrder
        ? parseInt(lastOrder.code?.split('-').pop() || '0') + 1
        : 1;
      header.code = `OC-${year}-${String(nextSeq).padStart(3, '0')}`;
    }

    if (applyWithholding) {
      const orgCompany = await this.prisma.company.findFirst({
        where: { organizationId: orgId },
      });
      if (!orgCompany?.isWithholdingAgent) {
        throw new AppException('PO_004', HttpStatus.BAD_REQUEST);
      }
      if (!withholdingPercentage) {
        throw new AppException('PO_005', HttpStatus.BAD_REQUEST);
      }
      if (!withholdingProof) {
        throw new AppException('PO_006', HttpStatus.BAD_REQUEST);
      }
    }

    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        ...header,
        status: 'DRAFT',
        idSupplier: dto.idSupplier,
        date: dto.date ? new Date(dto.date) : undefined,
        organizationId: orgId,
        details: details
          ? {
              create: details.map((d) => ({
                idProduct: d.idProduct,
                quantity: d.quantity,
                unitPrice: d.unitPrice,
                unitPriceUsd: d.unitPriceUsd,
                subtotal: d.subtotal,
                subtotalUsd: d.subtotalUsd,
                observation: d.observation,
                organizationId: orgId,
              })),
            }
          : undefined,
        withholdingRecords: applyWithholding
          ? {
              create: {
                idSupplier: dto.idSupplier,
                type: 'IVA',
                percentage: withholdingPercentage!,
                baseAmount: dto.ivaAmount ?? 0,
                baseAmountUsd: dto.ivaAmountUsd ?? 0,
                withheldAmount:
                  (dto.ivaAmount ?? 0) * (withholdingPercentage! / 100),
                withheldAmountUsd:
                  (dto.ivaAmountUsd ?? 0) * (withholdingPercentage! / 100),
                withholdingProof: withholdingProof,
                organizationId: orgId,
              },
            }
          : undefined,
      },
      include: this.include,
    });
    await this.auditLog.log({
      organizationId: orgId,
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: purchaseOrder.id,
    });
    return { data: purchaseOrder, message: 'PURCHASE_ORDER.CREATED' };
  }

  async findAll(page = 1, limit = 20) {
    const orgId = this.orgId;
    const skip = (page - 1) * limit;
    const where = { organizationId: orgId };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        include: this.include,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        ...this.include,
        accountsPayables: true,
      },
    });
    if (!purchaseOrder) throw new AppException('PO_002', HttpStatus.NOT_FOUND);
    return purchaseOrder;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const existing = await this.findOne(id);
    const {
      status: newStatus,
      details: newDetails,
      applyWithholding,
      withholdingPercentage,
      withholdingProof,
      ...header
    } = dto;

    // Allow status-only updates even for non-mutable orders
    if (
      newStatus &&
      Object.keys(header).length === 0 &&
      newDetails == null &&
      applyWithholding == null
    ) {
      const updated = await this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: newStatus },
        include: this.include,
      });
      return { data: updated, message: 'PURCHASE_ORDER.UPDATED' };
    }

    // Data edits: only allowed for mutable statuses
    if (
      existing.status &&
      !PURCHASE_ORDER_STATUS_META[existing.status as PurchaseOrderStatus]
        ?.isMutable
    ) {
      throw new AppException('PO_001', HttpStatus.FORBIDDEN);
    }
    const orgId = this.orgId;

    if (applyWithholding) {
      const orgCompany = await this.prisma.company.findFirst({
        where: { organizationId: orgId },
      });
      if (!orgCompany?.isWithholdingAgent) {
        throw new AppException('PO_004', HttpStatus.BAD_REQUEST);
      }
      if (!withholdingPercentage && !existing.withholdingRecords?.length) {
        throw new AppException('PO_005', HttpStatus.BAD_REQUEST);
      }
      if (!withholdingProof && !existing.withholdingRecords?.length) {
        throw new AppException('PO_006', HttpStatus.BAD_REQUEST);
      }
    }

    const purchaseOrder = await this.prisma.$transaction(async (tx) => {
      // Replace details if provided and order is in DRAFT
      if (newDetails != null && newDetails.length > 0) {
        if (existing.status !== PurchaseOrderStatus.DRAFT) {
          throw new AppException('PO_001', HttpStatus.FORBIDDEN);
        }
        await tx.purchaseOrderDet.deleteMany({
          where: { idPurchaseOrder: id },
        });
        await tx.purchaseOrderDet.createMany({
          data: newDetails.map((d) => ({
            idPurchaseOrder: id,
            idProduct: d.idProduct!,
            quantity: d.quantity ?? 0,
            unitPrice: d.unitPrice ?? 0,
            unitPriceUsd: d.unitPriceUsd ?? 0,
            subtotal: d.subtotal ?? 0,
            subtotalUsd: d.subtotalUsd ?? 0,
            observation: d.observation,
            organizationId: orgId,
          })),
        });
      }

      if (applyWithholding !== undefined) {
        const existingRecord = existing.withholdingRecords?.[0];
        if (applyWithholding) {
          const pct = withholdingPercentage ?? existingRecord?.percentage ?? 75;
          const proof =
            withholdingProof ?? existingRecord?.withholdingProof ?? '';
          const baseAmt = existing.ivaAmount ?? 0;
          const baseAmtUsd = existing.ivaAmountUsd ?? 0;
          const data = {
            idSupplier: dto.idSupplier ?? existing.idSupplier,
            idPurchaseOrder: id,
            type: 'IVA',
            percentage: pct,
            baseAmount: baseAmt,
            baseAmountUsd: baseAmtUsd,
            withheldAmount: Number(baseAmt) * (pct / 100),
            withheldAmountUsd: Number(baseAmtUsd) * (pct / 100),
            withholdingProof: proof,
            organizationId: orgId,
          };
          if (existingRecord) {
            await tx.withholdingRecord.update({
              where: { id: existingRecord.id },
              data,
            });
          } else {
            await tx.withholdingRecord.create({ data });
          }
        } else {
          if (existingRecord) {
            await tx.withholdingRecord.delete({
              where: { id: existingRecord.id },
            });
          }
        }
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: header,
        include: this.include,
      });

      return updated;
    });
    await this.auditLog.log({
      organizationId: orgId,
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
    });
    return { data: purchaseOrder, message: 'PURCHASE_ORDER.UPDATED' };
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto) {
    const existing = await this.findOne(id);
    if (existing.status === PurchaseOrderStatus.RECEIVED) {
      throw new AppException('PO_003', HttpStatus.BAD_REQUEST);
    }
    const orgId = this.orgId;

    await this.prisma.$transaction(async (tx) => {
      const productIds = [
        ...new Set(
          dto.details
            .map((item) => {
              const line = existing.details.find((d) => d.id === item.id);
              return line?.idProduct;
            })
            .filter(Boolean),
        ),
      ] as string[];

      const existingStocks = await tx.stock.findMany({
        where: {
          idProduct: { in: productIds },
          idSupplier: existing.idSupplier,
          organizationId: orgId,
        },
      });
      const stockByProduct = new Map(
        existingStocks.map((s) => [s.idProduct, s]),
      );

      // Validate all details before any writes
      for (const item of dto.details) {
        const line = existing.details.find((d) => d.id === item.id);
        if (!line) throw new AppException('PO_007', HttpStatus.BAD_REQUEST);
        const newReceived = line.receivedQuantity + item.quantity;
        if (newReceived > (line.quantity ?? 0)) {
          throw new AppException('PO_008', HttpStatus.BAD_REQUEST);
        }
      }

      // Batch detail updates in parallel
      const detailUpdates = dto.details.map((item) => {
        const line = existing.details.find((d) => d.id === item.id)!;
        return tx.purchaseOrderDet.update({
          where: { id: item.id },
          data: { receivedQuantity: line.receivedQuantity + item.quantity },
        });
      });
      await Promise.all(detailUpdates);

      for (const item of dto.details) {
        const line = existing.details.find((d) => d.id === item.id)!;

        let stock = stockByProduct.get(line.idProduct);

        if (!stock) {
          stock = await tx.stock.create({
            data: {
              idProduct: line.idProduct,
              idSupplier: existing.idSupplier,
              existence: 0,
              organizationId: orgId,
              idPurchaseOrder: id,
            },
          });
          stockByProduct.set(line.idProduct, stock);
        }

        await this.stocks.receive(tx, {
          organizationId: orgId,
          productId: line.idProduct,
          stockId: stock.id,
          quantity: item.quantity,
          purchaseOrderId: id,
          observation: `Ingreso parcial por pedido ${existing.code ?? id}`,
        });
      }

      const refreshedLines = await tx.purchaseOrderDet.findMany({
        where: { idPurchaseOrder: id },
      });
      const allReceived = refreshedLines.every(
        (l) => l.receivedQuantity >= (l.quantity ?? 0),
      );
      if (allReceived) {
        await tx.purchaseOrder.update({
          where: { id },
          data: { status: PurchaseOrderStatus.RECEIVED },
        });
        const existingAp = await tx.accountsPayable.findFirst({
          where: {
            idPurchaseOrder: id,
            organizationId: orgId,
            deletedAt: null,
          },
        });
        if (!existingAp) {
          const po = await tx.purchaseOrder.findFirst({
            where: { id, organizationId: orgId },
            select: { amount: true },
          });
          const issueDate = new Date();
          const dueDate = new Date(issueDate);
          dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);
          await tx.accountsPayable.create({
            data: {
              organizationId: orgId,
              idPurchaseOrder: id,
              amount: po?.amount ?? 0,
              credit: 0,
              issueDate,
              dueDate,
              status: ArApStatus.Open,
            },
          });
        }
      }
    });

    const result = await this.findOne(id);
    await this.auditLog.log({
      organizationId: orgId,
      action: 'RECEIVE',
      entity: 'PurchaseOrder',
      entityId: id,
    });
    return result;
  }

  async remove(id: string) {
    const po = await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.withholdingRecord.deleteMany({ where: { idPurchaseOrder: id } });
      await tx.purchaseOrderDet.deleteMany({ where: { idPurchaseOrder: id } });
      await tx.accountsPayable.deleteMany({ where: { idPurchaseOrder: id } });
      await tx.purchaseOrder.delete({ where: { id } });
    });
    await this.auditLog.log({
      organizationId: this.orgId,
      action: 'DELETE',
      entity: 'PurchaseOrder',
      entityId: id,
    });
    return { data: po, message: 'PURCHASE_ORDER.DELETED' };
  }
}
