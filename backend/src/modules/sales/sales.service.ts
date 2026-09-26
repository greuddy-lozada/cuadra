import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContextService } from '../tenant/context.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { AppException } from '../../common/errors';
import { SaleStatus, SALE_STATUS_META } from '../../common/types/statuses';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { StocksService } from '../stocks/stocks.service';
import {
  ArApStatus,
  DEFAULT_DUE_DAYS,
  PaymentMethod,
} from '../../common/types/payment-method';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ContextService,
    private readonly auditLog: AuditLogService,
    private readonly dashboard: DashboardService,
    private readonly stocks: StocksService,
  ) {}

  private unpaidAmount(dto: CreateSaleDto): number {
    const total =
      Number(dto.amount) +
      Number(dto.totalTax ?? 0) -
      Number(dto.withholdingAmount ?? 0);
    const payments = dto.payments ?? [];
    if (payments.length === 0) {
      return dto.paymentMethod === PaymentMethod.Credit ? total : 0;
    }
    const paidNow = payments
      .filter((p) => p.method !== PaymentMethod.Credit)
      .reduce((sum, p) => {
        if (p.currency === 'USD') {
          return sum + p.amount * (dto.exchangeRate || 0);
        }
        return sum + p.amount;
      }, 0);
    return Math.max(0, Math.round((total - paidNow) * 10000) / 10000);
  }

  async create(dto: CreateSaleDto) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          organizationId: orgId,
          code: dto.code,
          date: new Date(dto.date),
          amount: dto.amount,
          amountUsd: dto.amountUsd,
          exchangeRate: dto.exchangeRate,
          paymentMethod: dto.paymentMethod,
          status: SaleStatus.DRAFT,
          idCustomer: dto.idCustomer,
          totalTax: dto.totalTax,
          totalTaxUsd: dto.totalTaxUsd,
          registerSessionId: dto.registerSessionId,
          withholdingPercentage: dto.withholdingPercentage,
          withholdingAmount: dto.withholdingAmount,
          withholdingAmountUsd: dto.withholdingAmountUsd,
          details: {
            create: dto.items.map((item) => ({
              organizationId: orgId,
              idProduct: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitPriceUsd: item.unitPriceUsd,
              subtotal: item.subtotal,
              subtotalUsd: item.subtotalUsd,
              observation: item.observation,
            })),
          },
          payments: dto.payments?.length
            ? {
                create: dto.payments.map((p) => ({
                  organizationId: orgId,
                  method: p.method,
                  amount: p.amount,
                  currency: p.currency,
                })),
              }
            : undefined,
        },
        include: {
          details: true,
          customer: true,
          payments: true,
        },
      });

      const byProduct = new Map<string, number>();
      for (const item of dto.items) {
        const current = byProduct.get(item.productId) || 0;
        byProduct.set(item.productId, current + item.quantity);
      }
      for (const productId of [...byProduct.keys()].sort()) {
        await this.stocks.issue(tx, {
          organizationId: orgId,
          productId,
          quantity: byProduct.get(productId) ?? 0,
          referenceId: created.id,
          observation: dto.code ? `Venta ${dto.code}` : 'Venta',
        });
      }

      const unpaid = this.unpaidAmount(dto);
      if (unpaid > 0.01) {
        if (!dto.idCustomer) {
          throw new AppException('SALE_004', HttpStatus.BAD_REQUEST);
        }
        const issueDate = new Date(dto.date);
        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + DEFAULT_DUE_DAYS);
        await tx.accountsReceivable.create({
          data: {
            organizationId: orgId,
            idSale: created.id,
            amount: unpaid,
            credit: 0,
            issueDate,
            dueDate,
            status: ArApStatus.Open,
          },
        });
      }

      return created;
    });

    await this.auditLog.log({
      organizationId: orgId,
      action: 'CREATE',
      entity: 'Sale',
      entityId: sale.id,
    });

    void this.dashboard.notifySaleCreated(orgId, sale);

    return sale;
  }

  async findAll(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.SaleWhereInput = { organizationId: orgId };
    const search = query.search?.trim();
    if (search) {
      const tokens = search.split(/\s+/).filter(Boolean);
      where.AND = tokens.map((token) => ({
        OR: [
          { code: { contains: token, mode: 'insensitive' } },
          {
            customer: {
              is: { firstName: { contains: token, mode: 'insensitive' } },
            },
          },
          {
            customer: {
              is: { lastName: { contains: token, mode: 'insensitive' } },
            },
          },
        ],
      }));
    }
    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        include: { details: true, customer: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId: orgId },
      include: {
        details: true,
        customer: true,
      },
    });

    if (!sale) {
      throw new AppException('SALE_002', HttpStatus.NOT_FOUND);
    }

    return sale;
  }

  async update(id: string, dto: UpdateSaleDto) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');

    const existing = await this.prisma.sale.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new AppException('SALE_002', HttpStatus.NOT_FOUND);
    if (
      existing.status &&
      !SALE_STATUS_META[existing.status as SaleStatus]?.isMutable
    ) {
      throw new AppException('SALE_001', HttpStatus.FORBIDDEN);
    }

    const sale = await this.prisma.sale.update({
      where: { id, organizationId: orgId },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.paymentMethod !== undefined && {
          paymentMethod: dto.paymentMethod,
        }),
        ...(dto.idCustomer !== undefined && { idCustomer: dto.idCustomer }),
      },
      include: {
        details: true,
        customer: true,
      },
    });

    await this.auditLog.log({
      organizationId: orgId,
      action: 'UPDATE',
      entity: 'Sale',
      entityId: id,
    });
    return sale;
  }

  async remove(id: string) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');
    const sale = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await this.stocks.restoreSale(tx, {
        organizationId: orgId,
        saleId: id,
        lines: sale.details.map((item) => ({
          productId: item.idProduct,
          quantity: item.quantity || 0,
        })),
      });

      await tx.sale.delete({
        where: { id, organizationId: orgId },
      });
    });

    await this.auditLog.log({
      organizationId: orgId,
      action: 'DELETE',
      entity: 'Sale',
      entityId: id,
    });
    return sale;
  }
}
