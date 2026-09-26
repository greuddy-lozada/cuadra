import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import {
  MinOrgLevel,
  ROLE_LEVEL,
} from '../../common/decorators/min-level.decorator';
import { PlanLevel } from '../../common/decorators/plan-level.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { KardexQueryDto } from './dto/kardex-query.dto';

@Controller('stocks')
@PlanLevel('professional')
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Post()
  @MinOrgLevel(ROLE_LEVEL.manager)
  create(@Body() dto: CreateStockDto) {
    return this.stocksService.create(dto);
  }

  @Get()
  @MinOrgLevel(ROLE_LEVEL.employee)
  async findAll(@Query() pagination: PaginationQueryDto) {
    return this.stocksService.findAll(pagination.page, pagination.limit);
  }

  @Get('alerts')
  @MinOrgLevel(ROLE_LEVEL.employee)
  getAlerts(@Query('threshold') threshold?: string) {
    return this.stocksService.getAlerts(threshold ? Number(threshold) : 5);
  }

  @Get('kardex')
  @MinOrgLevel(ROLE_LEVEL.employee)
  findKardex(@Query() query: KardexQueryDto) {
    return this.stocksService.findKardex(
      query.productId,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @MinOrgLevel(ROLE_LEVEL.employee)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stocksService.findOne(id);
  }

  @Patch(':id')
  @MinOrgLevel(ROLE_LEVEL.manager)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockDto) {
    return this.stocksService.update(id, dto);
  }

  @Delete(':id')
  @MinOrgLevel(ROLE_LEVEL.master)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.stocksService.remove(id);
  }
}
