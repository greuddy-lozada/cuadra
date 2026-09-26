import { AssistantTools } from './assistant-tools';
import type { AssistantActor } from './assistant-tools';

const orgId = '11111111-1111-1111-1111-111111111111';

function actor(orgRole: string): AssistantActor {
  return { userId: 'user-1', organizationId: orgId, orgRole };
}

function toolsWith(overrides: Record<string, unknown> = {}) {
  const prisma = {
    sale: { aggregate: jest.fn() },
    user: { findMany: jest.fn() },
    ...(overrides.prisma as object),
  };
  const reports = { generate: jest.fn(), ...(overrides.reports as object) };
  const sales = { findAll: jest.fn(), ...(overrides.sales as object) };
  const receivables = {
    findAll: jest.fn(),
    ...(overrides.receivables as object),
  };
  const rest = {
    getOverview: jest.fn(),
    findAll: jest.fn(),
    findSessions: jest.fn(),
  };
  const tools = new AssistantTools(
    prisma as never,
    { getOverview: rest.getOverview } as never,
    reports as never,
    sales as never,
    { findAll: jest.fn() } as never,
    { findAll: jest.fn() } as never,
    { findSessions: jest.fn() } as never,
    receivables as never,
    { findAll: jest.fn() } as never,
  );
  return { tools, prisma, reports, sales, receivables };
}

describe('AssistantTools', () => {
  it('rejects an unknown tool without calling services', async () => {
    const { tools, reports, sales } = toolsWith();
    await expect(
      tools.execute('drop_table', {}, actor('manager')),
    ).resolves.toEqual({
      error: 'UNKNOWN_TOOL',
    });
    expect(reports.generate).not.toHaveBeenCalled();
    expect(sales.findAll).not.toHaveBeenCalled();
  });

  it('ignores an organization id sent by the model', async () => {
    const { tools, prisma, sales } = toolsWith();
    prisma.sale.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { amount: 20 },
    });
    sales.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    await tools.execute(
      'summarize_sales',
      { organizationId: 'evil-org', from: '2026-09-01', to: '2026-09-02' },
      actor('employee'),
    );
    await tools.execute(
      'list_sales',
      { organizationId: 'evil-org', search: 'ana' },
      actor('employee'),
    );

    const where = prisma.sale.aggregate.mock.calls[0][0].where;
    expect(where.organizationId).toBe(orgId);
    expect(
      JSON.stringify(prisma.sale.aggregate.mock.calls[0][0]),
    ).not.toContain('evil-org');
    expect(sales.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'ana', limit: 20 }),
    );
    expect(sales.findAll.mock.calls[0][0].organizationId).toBeUndefined();
  });

  it('blocks an employee from receivables and report generation', async () => {
    const { tools, reports, receivables } = toolsWith();
    await expect(
      tools.execute('list_receivables', {}, actor('employee')),
    ).resolves.toEqual({ error: 'FORBIDDEN' });
    await expect(
      tools.execute(
        'generate_report',
        { type: 'fiscal_iva' },
        actor('employee'),
      ),
    ).resolves.toEqual({ error: 'FORBIDDEN' });
    expect(receivables.findAll).not.toHaveBeenCalled();
    expect(reports.generate).not.toHaveBeenCalled();
  });

  it('rejects an unknown report type before generating', async () => {
    const { tools, reports } = toolsWith();
    await expect(
      tools.execute(
        'generate_report',
        { type: 'libro_ventas' },
        actor('manager'),
      ),
    ).resolves.toEqual({ error: 'UNKNOWN_REPORT' });
    expect(reports.generate).not.toHaveBeenCalled();
  });
});
