import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { SalesService } from '../sales.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ContextService } from '../../tenant/context.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { CreateSaleDto } from '../dto/create-sale.dto';
import { UpdateSaleDto } from '../dto/update-sale.dto';

describe('SalesService', () => {
  let service: SalesService;

  const mockOrgId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const saleId = '00000000-0000-0000-0000-000000000001';
  const mockContext = { getCurrent: () => ({ organizationId: mockOrgId }) };

  const mockPrisma = {
    sale: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    stock: {
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAuditLog = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockDashboard = {
    notifySaleCreated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContextService, useValue: mockContext },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: DashboardService, useValue: mockDashboard },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      code: 'FAC-001',
      date: '2026-01-01',
      amount: 100,
      amountUsd: 2,
      exchangeRate: 50,
      status: 1,
      totalTax: 16,
      totalTaxUsd: 0.32,
      items: [
        {
          productId: '00000000-0000-0000-0000-000000000099',
          quantity: 2,
          unitPrice: 50,
          unitPriceUsd: 1,
          subtotal: 100,
          subtotalUsd: 2,
        },
      ],
    } as CreateSaleDto;

    it('debe crear una venta en estado DRAFT con los items proporcionados', async () => {
      const createdSale = {
        id: saleId,
        status: 'DRAFT',
        details: [],
        customer: null,
        payments: [],
      };
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            sale: {
              create: jest.fn().mockResolvedValue({ ...createdSale, ...dto }),
            },
            stock: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              aggregate: jest
                .fn()
                .mockResolvedValue({ _sum: { existence: 0 } }),
            },
            product: { update: jest.fn().mockResolvedValue({}) },
          };
          return fn(tx);
        },
      );

      const result = await service.create(dto);
      expect(result).toBeDefined();
      expect(mockAuditLog.log).toHaveBeenCalledWith({
        organizationId: mockOrgId,
        action: 'CREATE',
        entity: 'Sale',
        entityId: expect.any(String),
      });
    });
  });

  describe('update', () => {
    const updateDto = {
      code: 'FAC-001-UPD',
      date: '2026-01-02',
    } as UpdateSaleDto;

    it('debe permitir modificar una venta en estado DRAFT', async () => {
      mockPrisma.sale.findFirst.mockResolvedValue({
        id: saleId,
        status: 'DRAFT',
        organizationId: mockOrgId,
      });
      mockPrisma.sale.update.mockResolvedValue({
        id: saleId,
        code: 'FAC-001-UPD',
      });

      const result = await service.update(saleId, updateDto);
      expect(result).toBeDefined();
    });

    it('debe lanzar SALE_001 si la venta está emitida (ISSUED)', async () => {
      mockPrisma.sale.findFirst.mockResolvedValue({
        id: saleId,
        status: 'ISSUED',
        organizationId: mockOrgId,
      });

      await expect(service.update(saleId, updateDto)).rejects.toMatchObject({
        errorCode: 'SALE_001',
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('debe lanzar SALE_001 si la venta está anulada (ANNULLED)', async () => {
      mockPrisma.sale.findFirst.mockResolvedValue({
        id: saleId,
        status: 'ANNULLED',
        organizationId: mockOrgId,
      });

      await expect(service.update(saleId, updateDto)).rejects.toMatchObject({
        errorCode: 'SALE_001',
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('debe lanzar SALE_002 si la venta no existe', async () => {
      mockPrisma.sale.findFirst.mockResolvedValue(null);

      await expect(service.update(saleId, updateDto)).rejects.toMatchObject({
        errorCode: 'SALE_002',
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('findOne', () => {
    it('debe retornar la venta con details, customer y payments', async () => {
      mockPrisma.sale.findFirst.mockResolvedValue({
        id: saleId,
        details: [],
        customer: null,
        payments: [],
      });

      const result = await service.findOne(saleId);
      expect(result).toBeDefined();
    });

    it('debe lanzar SALE_002 si no encuentra la venta', async () => {
      mockPrisma.sale.findFirst.mockResolvedValue(null);

      await expect(service.findOne(saleId)).rejects.toMatchObject({
        errorCode: 'SALE_002',
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('findAll', () => {
    it('debe filtrar por organizationId', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        { id: saleId, details: [], customer: null },
      ]);
      mockPrisma.sale.count.mockResolvedValue(1);

      await service.findAll();
      expect(mockPrisma.sale.count).toHaveBeenCalledWith({
        where: { organizationId: mockOrgId },
      });
    });

    it('debe filtrar por código o nombre de cliente', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([]);
      mockPrisma.sale.count.mockResolvedValue(0);

      await service.findAll({ search: '00012' });
      expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            AND: [
              {
                OR: [
                  { code: { contains: '00012', mode: 'insensitive' } },
                  {
                    customer: {
                      is: {
                        firstName: { contains: '00012', mode: 'insensitive' },
                      },
                    },
                  },
                  {
                    customer: {
                      is: {
                        lastName: { contains: '00012', mode: 'insensitive' },
                      },
                    },
                  },
                ],
              },
            ],
          }),
        }),
      );
    });
  });
});
