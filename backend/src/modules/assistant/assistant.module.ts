import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportsModule } from '../reports/reports.module';
import { SalesModule } from '../sales/sales.module';
import { ProductsModule } from '../products/products.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { CashRegisterModule } from '../cash-register/cash-register.module';
import { AccountsReceivableModule } from '../accounts-receivable/accounts-receivable.module';
import { AccountsPayableModule } from '../accounts-payable/accounts-payable.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantTools } from './assistant-tools';
import { ASSISTANT_PROVIDER } from './provider';
import type { AssistantProvider } from './provider';
import { readAssistantConfig } from './assistant.config';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Module({
  imports: [
    DashboardModule,
    ReportsModule,
    SalesModule,
    ProductsModule,
    PurchaseOrdersModule,
    CashRegisterModule,
    AccountsReceivableModule,
    AccountsPayableModule,
  ],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantTools,
    {
      provide: ASSISTANT_PROVIDER,
      useFactory: (): AssistantProvider | null => {
        const config = readAssistantConfig();
        if (!config) return null;
        return new OpenAiCompatibleProvider(config);
      },
    },
  ],
})
export class AssistantModule {}
