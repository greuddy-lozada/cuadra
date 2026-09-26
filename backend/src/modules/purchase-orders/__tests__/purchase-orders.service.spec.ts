import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { PurchaseOrdersService } from '../purchase-orders.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ContextService } from '../../tenant/context.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { StocksService } from '../../stocks/stocks.service';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;

  const mockOrgId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const poId = '00000000-0000-0000-0000-000000000001';
  const mockContext = { getCurrent: () => ({ organizationId: mockOrgId }) };

  const mockPrisma = {
    purchaseOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    purchaseOrderDet: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    company: { findFirst: jest.fn() },
    stock: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    stockDet: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    withholdingRecord: {
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    accountsPayable: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockAuditLog = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContextService, useValue: mockContext },
        { provide: AuditLogService, useValue: mockAuditLog },
        {
          provide: StocksService,
          useValue: { receive: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('debe filtrar por organizationId', async () => {
      mockPrisma.purchaseOrder.findMany.mockResolvedValue([
        { id: poId, details: [], supplier: null },
      ]);
      mockPrisma.purchaseOrder.count.mockResolvedValue(1);

      await service.findAll();
      expect(mockPrisma.purchaseOrder.count).toHaveBeenCalledWith({
        where: { organizationId: mockOrgId },
      });
    });
  });

  describe('update', () => {
    const updateDto = { code: 'OC-001-UPD' };

    it('debe lanzar PO_001 si la orden está recibida (RECEIVED)', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: poId,
        status: 'RECEIVED',
        details: [],
        withholdingRecords: [],
        supplier: null,
      });

      await expect(service.update(poId, updateDto)).rejects.toMatchObject({
        errorCode: 'PO_001',
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('debe permitir modificar una orden en estado DRAFT', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: poId,
        status: 'DRAFT',
        details: [],
        withholdingRecords: [],
        supplier: null,
      });
      mockPrisma.company.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            purchaseOrder: {
              update: jest
                .fn()
                .mockResolvedValue({ id: poId, code: 'OC-001-UPD' }),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.update(poId, updateDto);
      expect(result.data.code).toBe('OC-001-UPD');
      expect(mockAuditLog.log).toHaveBeenCalledWith({
        organizationId: mockOrgId,
        action: 'UPDATE',
        entity: 'PurchaseOrder',
        entityId: poId,
      });
    });

    it('debe lanzar PO_002 si la orden no existe', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(null);

      await expect(service.update(poId, updateDto)).rejects.toMatchObject({
        errorCode: 'PO_002',
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('findOne', () => {
    it('debe retornar la orden con relaciones incluidas', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: poId,
        details: [],
        supplier: null,
        accountsPayables: [],
      });

      const result = await service.findOne(poId);
      expect(result).toBeDefined();
    });

    it('debe lanzar PO_002 si no encuentra la orden', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(null);

      await expect(service.findOne(poId)).rejects.toMatchObject({
        errorCode: 'PO_002',
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('create', () => {
    it('debe crear una orden con status DRAFT', async () => {
      const dto = {
        idSupplier: '00000000-0000-0000-0000-000000000099',
        code: 'OC-001',
        date: '2026-01-01',
        amount: 1000,
        amountUsd: 20,
      } as CreatePurchaseOrderDto;
      mockPrisma.purchaseOrder.create.mockResolvedValue({
        id: poId,
        ...dto,
        status: 'DRAFT',
        details: [],
        supplier: null,
      });

      await service.create(dto);
      expect(mockAuditLog.log).toHaveBeenCalledWith({
        organizationId: mockOrgId,
        action: 'CREATE',
        entity: 'PurchaseOrder',
        entityId: poId,
      });
    });
  });
});
