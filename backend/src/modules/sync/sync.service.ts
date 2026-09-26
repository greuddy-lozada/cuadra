import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContextService } from '../tenant/context.service';
import { SalesService } from '../sales/sales.service';
import { PushMutationDto } from './dto/push-mutation.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { CreateSaleDto } from '../sales/dto/create-sale.dto';

export interface SyncProductWithStock {
  id: string;
  name: string;
  code: string;
  price: number;
  dollarPrice: number | null;
  baseCost: number | null;
  margin: number;
  idTax: string | null;
  idBrand: string | null;
  idCategory: string | null;
  updatedAt: Date;
  stock: number;
}

interface SaleWithDetails {
  id: string;
  details: { idProduct: string; quantity: number | null }[];
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ContextService,
    private readonly salesService: SalesService,
  ) {}

  private static readonly SYNC_BATCH_SIZE = 500;

  async pull(since?: string) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');
    const sinceDate = since ? new Date(since) : new Date(0);

    const orderBy = { updatedAt: 'asc' as const };
    const take = SyncService.SYNC_BATCH_SIZE;

    const [
      products,
      customers,
      exchangeRates,
      exchangeRateDays,
      suppliers,
      companies,
      taxes,
      brands,
      categories,
      cashRegisters,
    ] = await Promise.all([
      this.prisma.product.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: {
          id: true,
          name: true,
          code: true,
          price: true,
          dollarPrice: true,
          baseCost: true,
          margin: true,
          idTax: true,
          idBrand: true,
          idCategory: true,
          updatedAt: true,
          stocks: { select: { existence: true } },
        },
        orderBy,
        take,
      }),
      this.prisma.customer.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          idCardNumber: true,
          phoneNumber: true,
          isWithholdingAgent: true,
          withholdingPercentage: true,
          withholdingProof: true,
          updatedAt: true,
        },
        orderBy,
        take,
      }),
      this.prisma.exchangeRate.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: { id: true, rate: true, updatedAt: true },
        orderBy,
        take,
      }),
      this.prisma.exchangeRateDay.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: {
          id: true,
          date: true,
          rateBcvUsd: true,
          rateParalelo: true,
          updatedAt: true,
        },
        orderBy,
        take,
      }),
      this.prisma.supplier.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: { id: true, companyName: true, updatedAt: true },
        orderBy,
        take,
      }),
      this.prisma.company.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: {
          id: true,
          name: true,
          isWithholdingAgent: true,
          withholdingPercentage: true,
          updatedAt: true,
        },
        orderBy,
        take,
      }),
      this.prisma.tax.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: { id: true, name: true, percentage: true, updatedAt: true },
        orderBy,
        take,
      }),
      this.prisma.brand.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: { id: true, name: true, description: true, updatedAt: true },
        orderBy,
        take,
      }),
      this.prisma.category.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: {
          id: true,
          name: true,
          description: true,
          idParent: true,
          updatedAt: true,
        },
        orderBy,
        take,
      }),
      this.prisma.cashRegister.findMany({
        where: { organizationId: orgId, updatedAt: { gt: sinceDate } },
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          updatedAt: true,
        },
        orderBy,
        take,
      }),
    ]);

    const hasMore =
      products.length >= take ||
      customers.length >= take ||
      exchangeRates.length >= take ||
      exchangeRateDays.length >= take ||
      suppliers.length >= take ||
      companies.length >= take ||
      taxes.length >= take ||
      brands.length >= take ||
      categories.length >= take ||
      cashRegisters.length >= take;

    const lastPullAt = new Date();

    // Only advance cursor when all data fits in one batch
    if (!hasMore) {
      await this.prisma.syncCursor.upsert({
        where: { organizationId: orgId },
        update: { lastPullAt },
        create: {
          organizationId: orgId,
          lastPullAt,
          lastPushAt: new Date(0),
        },
      });
    }

    const productsWithStock: SyncProductWithStock[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      price: Number(p.price),
      dollarPrice: p.dollarPrice != null ? Number(p.dollarPrice) : null,
      baseCost: p.baseCost != null ? Number(p.baseCost) : null,
      margin: p.margin,
      idTax: p.idTax,
      idBrand: p.idBrand,
      idCategory: p.idCategory,
      updatedAt: p.updatedAt,
      stock: p.stocks.reduce(
        (sum: number, s: { existence: number }) => sum + s.existence,
        0,
      ),
    }));

    return {
      products: productsWithStock,
      customers,
      exchangeRates,
      exchangeRateDays,
      suppliers,
      companies,
      taxes,
      brands,
      categories,
      cashRegisters,
      hasMore,
      cursor: { lastPullAt: (hasMore ? sinceDate : lastPullAt).toISOString() },
    };
  }

  async push(mutations: PushMutationDto[]) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');

    // Pre-load all relevant stocks in one query (ponytail: avoid N+1)
    const relevantProductIds = [
      ...new Set(
        mutations
          .filter((m) => m.table === 'sales' && m.operation === 'create')
          .flatMap(
            (m) =>
              (m.data as { items?: Array<{ productId: string }> })?.items?.map(
                (i) => i.productId,
              ) ?? [],
          ),
      ),
    ];
    const stockRows =
      relevantProductIds.length > 0
        ? await this.prisma.stock.findMany({
            where: {
              idProduct: { in: relevantProductIds },
              organizationId: orgId,
            },
            select: { idProduct: true, existence: true },
          })
        : [];
    const stockMap = new Map<string, { existence: number }>();
    for (const row of stockRows) {
      const current = stockMap.get(row.idProduct)?.existence ?? 0;
      stockMap.set(row.idProduct, { existence: current + row.existence });
    }

    const accepted: string[] = [];
    const conflicts: Array<{
      localTimestamp: string;
      recordId?: string;
      issue: string;
      description: string;
    }> = [];
    const syncConflictsToCreate: Array<{
      organizationId: string;
      table: string;
      recordId?: string;
      localData: string;
      serverData: string;
      localTimestamp: Date;
      description: string;
      status: string;
    }> = [];
    const errors: Array<{ localTimestamp: string; error: string }> = [];

    for (const mutation of mutations) {
      try {
        if (mutation.table === 'sales' && mutation.operation === 'create') {
          const mutationItems = mutation.data as {
            items: Array<{ productId: string; quantity: number }>;
          };

          let hasConflict = false;

          for (const item of mutationItems.items) {
            const currentStock = stockMap.get(item.productId);

            if (!currentStock || currentStock.existence < item.quantity) {
              const salesSince: SaleWithDetails[] =
                await this.prisma.sale.findMany({
                  where: {
                    organizationId: orgId,
                    createdAt: { gt: new Date(mutation.localTimestamp) },
                    details: {
                      some: { idProduct: item.productId },
                    },
                  },
                  include: { details: true },
                  take: 1000,
                });

              const consumedSince = salesSince.reduce(
                (sum: number, sale: SaleWithDetails) => {
                  const detail = sale.details.find(
                    (d: { idProduct: string; quantity: number }) =>
                      d.idProduct === item.productId,
                  );
                  return sum + (detail?.quantity || 0);
                },
                0,
              );

              const available = (currentStock?.existence || 0) - consumedSince;

              if (available < item.quantity) {
                hasConflict = true;
                conflicts.push({
                  localTimestamp: mutation.localTimestamp,
                  recordId: mutation.recordId,
                  issue: 'oversold',
                  description: `Product ${item.productId}: requested ${item.quantity}, available ${available}`,
                });

                syncConflictsToCreate.push({
                  organizationId: orgId,
                  table: 'sales',
                  recordId: mutation.recordId,
                  localData: JSON.stringify(mutation.data),
                  serverData: JSON.stringify({
                    currentStock: currentStock?.existence || 0,
                    consumedSince,
                  }),
                  localTimestamp: new Date(mutation.localTimestamp),
                  description: `Oversold product ${item.productId}: requested ${item.quantity}, available ${available}`,
                  status: 'pending',
                });

                break;
              }
            }
          }

          if (hasConflict) continue;

          const createSaleDto: CreateSaleDto = {
            code: mutation.data.code as string,
            date: new Date(mutation.data.date as string).toISOString(),
            amount: mutation.data.amount as number,
            amountUsd: mutation.data.amountUsd as number,
            exchangeRate: mutation.data.exchangeRate as number,
            paymentMethod: mutation.data.paymentMethod as number,
            status: mutation.data.status as number,
            idCustomer: mutation.data.idCustomer as string | undefined,
            totalTax: mutation.data.totalTax as number | undefined,
            totalTaxUsd: mutation.data.totalTaxUsd as number | undefined,
            withholdingPercentage: mutation.data.withholdingPercentage as
              | number
              | undefined,
            withholdingAmount: mutation.data.withholdingAmount as
              | number
              | undefined,
            withholdingAmountUsd: mutation.data.withholdingAmountUsd as
              | number
              | undefined,
            registerSessionId: mutation.data.registerSessionId as
              | string
              | undefined,
            items: (
              mutation.data.items as Array<{
                productId: string;
                quantity: number;
                unitPrice: number;
                unitPriceUsd: number;
                subtotal: number;
                subtotalUsd: number;
                taxName?: string;
                taxPercentage?: number;
                taxAmount?: number;
                taxAmountUsd?: number;
              }>
            ).map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitPriceUsd: item.unitPriceUsd,
              subtotal: item.subtotal,
              subtotalUsd: item.subtotalUsd,
              taxName: item.taxName,
              taxPercentage: item.taxPercentage,
              taxAmount: item.taxAmount,
              taxAmountUsd: item.taxAmountUsd,
            })),
            payments: Array.isArray(mutation.data.payments)
              ? (
                  mutation.data.payments as Array<{
                    method: number;
                    amount: number;
                    currency: string;
                  }>
                ).map((p) => ({
                  method: p.method,
                  amount: p.amount,
                  currency: p.currency,
                }))
              : undefined,
          };

          const sale = await this.salesService.create(createSaleDto);
          accepted.push(sale.id);
        } else {
          accepted.push('');
        }
      } catch (error) {
        errors.push({
          localTimestamp: mutation.localTimestamp,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const lastPushAt = new Date();
    await Promise.all([
      this.prisma.syncCursor.upsert({
        where: { organizationId: orgId },
        update: { lastPushAt },
        create: {
          organizationId: orgId,
          lastPullAt: new Date(0),
          lastPushAt,
        },
      }),
      syncConflictsToCreate.length > 0
        ? this.prisma.syncConflict.createMany({ data: syncConflictsToCreate })
        : Promise.resolve(),
    ]);

    return { accepted, conflicts, errors };
  }

  async getConflicts(page = 1, limit = 50) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');
    return this.prisma.syncConflict.findMany({
      where: { organizationId: orgId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async resolveConflict(id: string, dto: ResolveConflictDto) {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');

    return this.prisma.syncConflict.update({
      where: { id, organizationId: orgId },
      data: {
        status: dto.status,
        resolvedAt: new Date(),
      },
    });
  }
}
