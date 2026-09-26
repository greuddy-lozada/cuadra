import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ROLE_LEVEL } from '../../common/decorators/min-level.decorator';
import { SaleStatus } from '../../common/types/statuses';
import {
  DashboardService,
  LOW_STOCK_THRESHOLD,
} from '../dashboard/dashboard.service';
import { dayRange } from '../dashboard/dashboard-day.util';
import { ReportsService } from '../reports/reports.service';
import { reportRegistry } from '../reports/report-registry';
import { SalesService } from '../sales/sales.service';
import { ProductsService } from '../products/products.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { AccountsReceivableService } from '../accounts-receivable/accounts-receivable.service';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import type { AssistantToolDef } from './provider';

const ROW_CAP = 20;
const PREVIEW_CAP = 15;

const REPORT_TYPES = reportRegistry.map((entry) => entry.type);

export interface AssistantActor {
  userId: string;
  organizationId: string;
  orgRole?: string;
  systemRole?: string;
  isSuperAdmin?: boolean;
}

export const ASSISTANT_TOOLS: AssistantToolDef[] = [
  {
    name: 'get_today_snapshot',
    description:
      'Ventas de hoy, ticket promedio, comparación con ayer, stock bajo y ventas recientes. CxC/CxP solo si el rol lo permite.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'summarize_sales',
    description:
      'Conteo, monto total y ticket promedio de ventas en un rango de fechas YYYY-MM-DD (America/Caracas). Excluye anuladas.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_sales',
    description: 'Últimas ventas (máximo 20): código, monto, cliente y fecha.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        search: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_products',
    description:
      'Busca productos por nombre o código. Devuelve nombre, existencia, precio USD y si está bajo de stock.',
    parameters: {
      type: 'object',
      properties: { search: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_purchase_orders',
    description:
      'Órdenes de compra recientes: código, estado, monto, fecha y proveedor.',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_register_sessions',
    description:
      'Sesiones de caja: estado, apertura, cierre, nombre de caja y usuario. No abre ni cierra la caja.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['abierta', 'cerrada'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_receivables',
    description:
      'Cuentas por cobrar (solo manager o superior): saldo, vencimiento y cliente.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'paid', 'overdue', 'all'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_payables',
    description:
      'Cuentas por pagar (solo manager o superior): saldo, vencimiento y proveedor.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'paid', 'overdue', 'all'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'generate_report',
    description:
      'Genera un reporte existente (solo manager o superior) y devuelve su id para abrirlo en la app.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: REPORT_TYPES },
        parameters: {
          type: 'object',
          properties: {
            dateFrom: { type: 'string' },
            dateTo: { type: 'string' },
            lowStockThreshold: { type: 'number' },
            onlyLowStock: { type: 'string' },
          },
        },
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
];

const TOOL_NAMES = new Set(ASSISTANT_TOOLS.map((tool) => tool.name));

@Injectable()
export class AssistantTools {
  private readonly logger = new Logger(AssistantTools.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly reports: ReportsService,
    private readonly sales: SalesService,
    private readonly products: ProductsService,
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly cashRegister: CashRegisterService,
    private readonly receivables: AccountsReceivableService,
    private readonly payables: AccountsPayableService,
  ) {}

  async execute(
    name: string,
    rawArgs: unknown,
    actor: AssistantActor,
  ): Promise<unknown> {
    const args = sanitizeArgs(rawArgs);
    this.logger.log(`assistant tool=${name.slice(0, 64)}`);

    if (!TOOL_NAMES.has(name)) return { error: 'UNKNOWN_TOOL' };
    if (!actor.organizationId) return { error: 'NO_ORG' };

    try {
      switch (name) {
        case 'get_today_snapshot':
          return (await this.dashboard.getOverview()).data;
        case 'summarize_sales':
          return this.summarizeSales(args, actor.organizationId);
        case 'list_sales':
          return this.listSales(args);
        case 'search_products':
          return this.searchProducts(args);
        case 'list_purchase_orders':
          return this.listPurchaseOrders(args);
        case 'list_register_sessions':
          return this.listSessions(args);
        case 'list_receivables':
          if (!canManageFinancial(actor)) return { error: 'FORBIDDEN' };
          return this.listReceivables(args);
        case 'list_payables':
          if (!canManageFinancial(actor)) return { error: 'FORBIDDEN' };
          return this.listPayables(args);
        case 'generate_report':
          if (!canManageFinancial(actor)) return { error: 'FORBIDDEN' };
          return this.generateReport(args, actor.userId);
        default:
          return { error: 'UNKNOWN_TOOL' };
      }
    } catch (error) {
      this.logger.error(
        `assistant tool=${name} failed ${error instanceof Error ? error.name : 'error'}`,
      );
      return { error: 'TOOL_FAILED' };
    }
  }

  private async summarizeSales(
    args: Record<string, unknown>,
    organizationId: string,
  ) {
    const from = ymd(args.from);
    const to = ymd(args.to);
    if (args.from !== undefined && !from) return { error: 'INVALID_DATE' };
    if (args.to !== undefined && !to) return { error: 'INVALID_DATE' };
    if (from && to && from > to) return { error: 'INVALID_RANGE' };

    const start = from ? dayRange(from).start : undefined;
    const end = to ? dayRange(to).end : undefined;
    const rows = await this.prisma.sale.aggregate({
      where: {
        organizationId,
        status: { not: SaleStatus.ANNULLED },
        ...(start || end
          ? {
              date: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lt: end } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const count = rows._count._all;
    const revenue = Number(rows._sum.amount ?? 0);
    return {
      from,
      to,
      count,
      revenue,
      avgTicket: count === 0 ? 0 : revenue / count,
    };
  }

  private async listSales(args: Record<string, unknown>) {
    const result = await this.sales.findAll({
      page: 1,
      limit: ROW_CAP,
      search: stringArg(args.search),
      from: ymd(args.from) ?? undefined,
      to: ymd(args.to) ?? undefined,
    });
    return (result.data ?? []).slice(0, ROW_CAP).map((sale) => ({
      code: sale.code,
      amount: Number(sale.amount ?? 0),
      customerName: personName(sale.customer),
      date: sale.date ? new Date(sale.date).toISOString() : null,
      status: sale.status,
    }));
  }

  private async searchProducts(args: Record<string, unknown>) {
    const result = await this.products.findAll(
      1,
      ROW_CAP,
      stringArg(args.search),
    );
    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.slice(0, ROW_CAP).map((product) => {
      const row = product as {
        name?: string;
        totalExistence?: number;
        dollarPrice?: Prisma.Decimal | number | null;
      };
      const existence = row.totalExistence ?? 0;
      return {
        name: row.name ?? '',
        existence,
        priceUsd: Number(row.dollarPrice ?? 0),
        lowStock: existence <= LOW_STOCK_THRESHOLD,
      };
    });
  }

  private async listPurchaseOrders(args: Record<string, unknown>) {
    const status = stringArg(args.status);
    const result = await this.purchaseOrders.findAll(1, ROW_CAP);
    return (result.data ?? [])
      .filter((order) => (status ? order.status === status : true))
      .slice(0, ROW_CAP)
      .map((order) => ({
        code: order.code,
        status: order.status,
        amount: Number(order.amount ?? 0),
        date: order.date ? new Date(order.date).toISOString() : null,
        supplierName: order.supplier?.companyName ?? '—',
      }));
  }

  private async listSessions(args: Record<string, unknown>) {
    const status =
      args.status === 'abierta' || args.status === 'cerrada'
        ? args.status
        : undefined;
    const result = await this.cashRegister.findSessions(status);
    const rows = (result.data ?? []).slice(0, ROW_CAP);
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(
      users.map((user) => [
        user.id,
        `${user.firstName} ${user.lastName}`.trim(),
      ]),
    );
    return rows.map((row) => ({
      status: row.status,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      registerName: row.cashRegister?.name ?? '',
      userName: names.get(row.userId) ?? '—',
    }));
  }

  private async listReceivables(args: Record<string, unknown>) {
    const result = await this.receivables.findAll({
      page: 1,
      limit: ROW_CAP,
      status: arStatus(args.status),
    });
    return result.data.slice(0, ROW_CAP).map((row) => ({
      balance: row.balance,
      dueDate: row.dueDate,
      customerName: row.customerName,
      saleCode: row.saleCode,
    }));
  }

  private async listPayables(args: Record<string, unknown>) {
    const result = await this.payables.findAll({
      page: 1,
      limit: ROW_CAP,
      status: arStatus(args.status),
    });
    return result.data.slice(0, ROW_CAP).map((row) => ({
      balance: row.balance,
      dueDate: row.dueDate,
      supplierName: row.supplierName,
      purchaseOrderCode: row.purchaseOrderCode,
    }));
  }

  private async generateReport(args: Record<string, unknown>, userId: string) {
    const type = typeof args.type === 'string' ? args.type : '';
    if (!reportRegistry.some((entry) => entry.type === type)) {
      return { error: 'UNKNOWN_REPORT' };
    }
    const parameters = isRecord(args.parameters) ? args.parameters : {};
    const report = await this.reports.generate({ type, parameters }, userId);
    const rows = rowsOf(report.results);
    return {
      reportId: report.id,
      type,
      rowCount: rows.length,
      preview: rows.slice(0, PREVIEW_CAP),
    };
  }
}

export function canManageFinancial(actor: AssistantActor): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.systemRole === 'master' || actor.systemRole === 'admin')
    return true;
  const level = ROLE_LEVEL[actor.orgRole as keyof typeof ROLE_LEVEL] ?? 0;
  return level >= ROLE_LEVEL.manager;
}

function sanitizeArgs(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      key === 'organizationId' ||
      key === 'orgId' ||
      key === 'organization_id' ||
      key === 'userId'
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function ymd(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  return value;
}

function personName(
  customer:
    | { firstName?: string | null; lastName?: string | null }
    | null
    | undefined,
): string {
  if (!customer) return '—';
  const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim();
  return name || '—';
}

function arStatus(value: unknown): 'open' | 'paid' | 'overdue' | 'all' {
  if (
    value === 'paid' ||
    value === 'overdue' ||
    value === 'all' ||
    value === 'open'
  ) {
    return value;
  }
  return 'open';
}

function rowsOf(results: unknown): unknown[] {
  if (isRecord(results) && Array.isArray(results.rows)) return results.rows;
  return [];
}
