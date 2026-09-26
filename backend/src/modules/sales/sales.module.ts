import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { StocksModule } from '../stocks/stocks.module';

@Module({
  imports: [AuditLogModule, DashboardModule, StocksModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
