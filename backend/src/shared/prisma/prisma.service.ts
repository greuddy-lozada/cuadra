import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ContextService } from '../../modules/tenant/context.service';

/** Org-scoped models. Invite is admin-global (listed across orgs, claimed by unique code). */
export const TENANT_SCOPED_MODELS: readonly string[] = [
  'Supplier',
  'Customer',
  'Company',
  'Product',
  'Tax',
  'Batch',
  'Stock',
  'PurchaseOrder',
  'PurchaseOrderDet',
  'Sale',
  'SalesDet',
  'ExchangeRate',
  'WithholdingRecord',
  'AccountsPayable',
  'AccountsReceivable',
  'PagoMovilConfig',
  'PagoMovilTransaction',
  'GeneratedReport',
  'CashRegister',
  'RegisterSession',
  'RegisterSettlement',
  'AssistantThread',
];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly contextService?: ContextService) {
    const dbUrl = process.env.DATABASE_URL ?? '';
    const connectionLimit = process.env.DATABASE_CONNECTION_LIMIT || '5';
    const sep = dbUrl.includes('?') ? '&' : '?';
    super({
      datasources: {
        db: {
          url: `${dbUrl}${sep}connection_limit=${connectionLimit}`,
        },
      },
    });
  }

  async onModuleInit() {
    const contextService = this.contextService;

    // ponytail: save raw delegates before Object.assign(extended) overwrites them
    const modelsRequiringDelegateAccess = [
      'Organization',
      'User',
      'Plan',
      'Customer',
      'Supplier',
      'Company',
      'Brand',
      'Category',
      'Product',
      'Tax',
      'Batch',
      'Stock',
      'PurchaseOrder',
      'WithholdingRecord',
      'Sale',
      'SubscriptionPayment',
      'AccountsPayable',
      'AccountsReceivable',
      'PagoMovilConfig',
      'PagoMovilTransaction',
      'GeneratedReport',
    ];
    const rawDelegates: Record<
      string,
      Record<string, (...a: unknown[]) => unknown>
    > = {};
    for (const m of modelsRequiringDelegateAccess) {
      const d = m.charAt(0).toLowerCase() + m.slice(1);
      rawDelegates[d] = (this as Record<string, unknown>)[d] as Record<
        string,
        (...a: unknown[]) => unknown
      >;
    }

    const extended = this.$extends({
      query: {
        $allModels: {
          async $allOperations({
            model,
            operation,
            args,
            query,
          }: {
            model: string;
            operation: string;
            args: Record<string, unknown>;
            query: (args: Record<string, unknown>) => Promise<unknown>;
          }) {
            const ctx = contextService?.getCurrent();
            if (!ctx || ctx.isSuperAdmin || !ctx.organizationId)
              return query(args);
            if (model === 'User') return query(args);

            if (!TENANT_SCOPED_MODELS.includes(model)) return query(args);

            if (operation === 'create') {
              const data = args.data as Record<string, unknown> | undefined;
              if (!data?.organizationId) {
                args.data = { ...data, organizationId: ctx.organizationId };
              }
              return query(args);
            }

            const actionsWithWhere = [
              'findUnique',
              'findFirst',
              'findMany',
              'update',
              'delete',
              'updateMany',
              'deleteMany',
            ];
            if (actionsWithWhere.includes(operation)) {
              args.where = {
                ...(args.where as Record<string, unknown>),
                organizationId: ctx.organizationId,
              };
            }

            const softDeleteModels = [
              'Organization',
              'User',
              'Plan',
              'Customer',
              'Supplier',
              'Company',
              'Brand',
              'Category',
              'Product',
              'Tax',
              'Batch',
              'Stock',
              'PurchaseOrder',
              'WithholdingRecord',
              'Sale',
              'SubscriptionPayment',
              'AccountsPayable',
              'AccountsReceivable',
              'PagoMovilConfig',
              'PagoMovilTransaction',
              'GeneratedReport',
              'CashRegister',
            ];
            const readOps = ['findUnique', 'findFirst', 'findMany', 'count'];
            if (
              readOps.includes(operation) &&
              softDeleteModels.includes(model)
            ) {
              const whereObj = args.where as Record<string, unknown>;
              if (!('deletedAt' in (whereObj ?? {}))) {
                args.where = { ...whereObj, deletedAt: null };
              }
            }

            // Soft delete: redirect delete/deleteMany → update/updateMany with deletedAt
            if (softDeleteModels.includes(model)) {
              const delegateName =
                model.charAt(0).toLowerCase() + model.slice(1);
              const rawDelegate = rawDelegates[delegateName];
              if (rawDelegate && operation === 'delete') {
                return rawDelegate.update({
                  where: args.where,
                  data: { deletedAt: new Date() },
                });
              }
              if (rawDelegate && operation === 'deleteMany') {
                return rawDelegate.updateMany({
                  where: args.where,
                  data: { deletedAt: new Date() },
                });
              }
            }

            // Auto-increment version on update for optimistic locking
            const versionedModels = [
              'Supplier',
              'Customer',
              'Company',
              'Product',
              'Tax',
              'Batch',
              'Stock',
              'PurchaseOrder',
              'PurchaseOrderDet',
              'Sale',
              'SalesDet',
              'ExchangeRate',
              'WithholdingRecord',
              'AccountsPayable',
              'AccountsReceivable',
              'License',
              'PagoMovilConfig',
              'PagoMovilTransaction',
              'Invite',
              'User',
              'Organization',
              'Plan',
            ];
            if (
              (operation === 'update' || operation === 'updateMany') &&
              versionedModels.includes(model) &&
              args.data
            ) {
              (args.data as Record<string, unknown>).version = { increment: 1 };
            }

            return query(args);
          },
        },
      },
    });

    Object.assign(this, extended);
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
