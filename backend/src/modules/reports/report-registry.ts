import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../shared/prisma/prisma.service';

export interface ParamField {
  key: string;
  label: string;
  type: 'date' | 'dateRange' | 'select' | 'multiSelect' | 'number';
  required: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
}

export interface ReportDefinition {
  type: string;
  category: 'sales' | 'inventory' | 'fiscal' | 'financial';
  name: string;
  description: string;
  parameters: ParamField[];
  query: (
    orgId: string,
    params: Record<string, unknown>,
    prisma: PrismaService,
  ) => Promise<unknown>;
}

function salesSummaryQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;

  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND s.date >= ${dateFrom}::timestamptz AND s.date <= ${dateTo}::timestamptz`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      to_char(s.date, 'YYYY-MM') AS month,
      COUNT(*)::int AS total_sales,
      COALESCE(SUM(s.amount), 0) AS total_revenue,
      COALESCE(SUM(s.total_tax), 0) AS total_tax
    FROM sales s
    WHERE s.organization_id = ${orgId}::uuid
      AND s.deleted_at IS NULL
      ${dateFilter}
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `;
}

function salesByCustomerQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;

  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND s.date >= ${dateFrom}::timestamptz AND s.date <= ${dateTo}::timestamptz`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      c.id,
      c.first_name || ' ' || c.last_name AS customer_name,
      COUNT(s.id)::int AS sales_count,
      COALESCE(SUM(s.amount), 0) AS total_amount
    FROM sales s
    JOIN customers c ON c.id = s.id_customer
    WHERE s.organization_id = ${orgId}::uuid
      AND s.deleted_at IS NULL
      AND c.deleted_at IS NULL
      ${dateFilter}
    GROUP BY c.id, c.first_name, c.last_name
    ORDER BY total_amount DESC
    LIMIT 20
  `;
}

function salesByProductQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;

  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND s.date >= ${dateFrom}::timestamptz AND s.date <= ${dateTo}::timestamptz`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      p.id,
      p.name AS product_name,
      SUM(sd.quantity)::int AS quantity_sold,
      COALESCE(SUM(sd.subtotal), 0) AS total_revenue
    FROM sale_details sd
    JOIN sales s ON s.id = sd.id_sale
    JOIN products p ON p.id = sd.id_product
    WHERE s.organization_id = ${orgId}::uuid
      AND s.deleted_at IS NULL
      AND p.deleted_at IS NULL
      ${dateFilter}
    GROUP BY p.id, p.name
    ORDER BY total_revenue DESC
    LIMIT 20
  `;
}

function inventoryStatusQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const lowStockThreshold = Number(params.lowStockThreshold) || 10;
  const onlyLowStock =
    params.onlyLowStock === true || params.onlyLowStock === 'true';

  const lowStockFilter = onlyLowStock
    ? Prisma.sql`AND p.total_existence <= ${lowStockThreshold}`
    : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      p.id,
      p.code,
      p.name AS product_name,
      p.total_existence,
      p.price,
      ROUND(p.price * p.total_existence, 2) AS inventory_value,
      CASE WHEN p.total_existence <= ${lowStockThreshold} THEN true ELSE false END AS is_low_stock
    FROM products p
    WHERE p.organization_id = ${orgId}::uuid
      AND p.deleted_at IS NULL
      AND p.available = true
      ${lowStockFilter}
    ORDER BY p.total_existence ASC
    LIMIT 100
  `;
}

function stockMovementsQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;

  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND sd.created_at >= ${dateFrom}::timestamptz AND sd.created_at <= ${dateTo}::timestamptz`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      DATE(sd.created_at) AS date,
      p.name AS product_name,
      COALESCE(b.code, '—') AS batch_code,
      sd.type,
      sd.quantity,
      sd.balance_after,
      sd.observation
    FROM stock_details sd
    JOIN stocks s ON s.id = sd.id_stock
    JOIN products p ON p.id = s.id_product
    LEFT JOIN batches b ON b.id = s.id_batch
    WHERE s.organization_id = ${orgId}::uuid
      AND s.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND sd.balance_after IS NOT NULL
      ${dateFilter}
    ORDER BY sd.created_at DESC
    LIMIT 200
  `;
}

/** IVA del período — excluye anuladas. Incluye DRAFT mientras ISSUED no sea el default del POS. */
function fiscalIvaQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;
  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND s.date >= ${dateFrom}::timestamptz AND s.date < (${dateTo}::date + interval '1 day')`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      COALESCE(sd.tax_name, 'Sin impuesto') AS tax_name,
      COALESCE(sd.tax_percentage, 0) AS tax_percentage,
      COUNT(DISTINCT s.id)::int AS sales_count,
      COALESCE(SUM(sd.subtotal), 0) AS taxable_base,
      COALESCE(SUM(sd.tax_amount), 0) AS tax_amount,
      COALESCE(SUM(sd.subtotal), 0) + COALESCE(SUM(sd.tax_amount), 0) AS total_with_tax
    FROM sale_details sd
    JOIN sales s ON s.id = sd.id_sale
    WHERE s.organization_id = ${orgId}::uuid
      AND s.deleted_at IS NULL
      AND (s.status IS NULL OR s.status <> 'ANNULLED')
      ${dateFilter}
    GROUP BY sd.tax_name, sd.tax_percentage
    ORDER BY tax_percentage DESC, tax_name
  `;
}

function fiscalWithholdingQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;
  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND w.created_at >= ${dateFrom}::timestamptz AND w.created_at < (${dateTo}::date + interval '1 day')`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      w.id,
      COALESCE(sup.company_name, '') AS supplier_name,
      COALESCE(sup.tax_id, '') AS supplier_rif,
      w.type,
      w.percentage,
      w.base_amount,
      w.withheld_amount,
      COALESCE(w.document_number, '') AS document_number,
      COALESCE(w.period, '') AS period,
      w.created_at::date AS date
    FROM withholding_records w
    JOIN suppliers sup ON sup.id = w.id_supplier
    WHERE w.organization_id = ${orgId}::uuid
      AND w.deleted_at IS NULL
      AND (sup.deleted_at IS NULL)
      ${dateFilter}
    ORDER BY w.created_at DESC
    LIMIT 200
  `;
}

function financialArQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;
  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND COALESCE(ar.issue_date, ar.created_at) >= ${dateFrom}::timestamptz AND COALESCE(ar.issue_date, ar.created_at) < (${dateTo}::date + interval '1 day')`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      ar.id,
      COALESCE(c.first_name || ' ' || c.last_name, '—') AS customer_name,
      COALESCE(s.code, '') AS sale_code,
      ar.issue_date::date AS issue_date,
      ar.due_date::date AS due_date,
      COALESCE(ar.amount, 0) AS amount,
      COALESCE(ar.credit, 0) AS credit,
      COALESCE(ar.amount, 0) - COALESCE(ar.credit, 0) AS balance,
      ar.status,
      CASE
        WHEN ar.due_date IS NULL THEN 'open'
        WHEN ar.due_date::date < CURRENT_DATE AND (COALESCE(ar.amount, 0) - COALESCE(ar.credit, 0)) > 0 THEN 'overdue'
        ELSE 'current'
      END AS aging_bucket
    FROM accounts_receivable ar
    LEFT JOIN sales s ON s.id = ar.id_sale
    LEFT JOIN customers c ON c.id = s.id_customer
    WHERE ar.organization_id = ${orgId}::uuid
      AND ar.deleted_at IS NULL
      ${dateFilter}
    ORDER BY ar.due_date ASC NULLS LAST, ar.created_at DESC
    LIMIT 200
  `;
}

function financialApQuery(
  orgId: string,
  params: Record<string, unknown>,
  prisma: PrismaService,
) {
  const dateFrom = params.dateFrom as string | undefined;
  const dateTo = params.dateTo as string | undefined;
  const dateFilter =
    dateFrom && dateTo
      ? Prisma.sql`AND COALESCE(ap.issue_date, ap.created_at) >= ${dateFrom}::timestamptz AND COALESCE(ap.issue_date, ap.created_at) < (${dateTo}::date + interval '1 day')`
      : Prisma.sql``;

  return prisma.$queryRaw`
    SELECT
      ap.id,
      COALESCE(sup.company_name, '') AS supplier_name,
      COALESCE(sup.tax_id, '') AS supplier_rif,
      COALESCE(po.code, '') AS po_code,
      ap.issue_date::date AS issue_date,
      ap.due_date::date AS due_date,
      COALESCE(ap.amount, 0) AS amount,
      COALESCE(ap.credit, 0) AS credit,
      COALESCE(ap.amount, 0) - COALESCE(ap.credit, 0) AS balance,
      ap.status,
      CASE
        WHEN ap.due_date IS NULL THEN 'open'
        WHEN ap.due_date::date < CURRENT_DATE AND (COALESCE(ap.amount, 0) - COALESCE(ap.credit, 0)) > 0 THEN 'overdue'
        ELSE 'current'
      END AS aging_bucket
    FROM accounts_payable ap
    JOIN purchase_orders po ON po.id = ap.id_purchase_order
    JOIN suppliers sup ON sup.id = po.id_supplier
    WHERE ap.organization_id = ${orgId}::uuid
      AND ap.deleted_at IS NULL
      ${dateFilter}
    ORDER BY ap.due_date ASC NULLS LAST, ap.created_at DESC
    LIMIT 200
  `;
}

const DATE_PARAMS: ParamField[] = [
  {
    key: 'dateFrom',
    label: 'reports.params.dateFrom',
    type: 'date',
    required: false,
  },
  {
    key: 'dateTo',
    label: 'reports.params.dateTo',
    type: 'date',
    required: false,
  },
];

export const reportRegistry: ReportDefinition[] = [
  {
    type: 'sales_summary',
    category: 'sales',
    name: 'reports.types.salesSummary',
    description: 'reports.types.salesSummaryDesc',
    parameters: [
      {
        key: 'dateFrom',
        label: 'reports.params.dateFrom',
        type: 'date',
        required: false,
      },
      {
        key: 'dateTo',
        label: 'reports.params.dateTo',
        type: 'date',
        required: false,
      },
    ],
    query: salesSummaryQuery,
  },
  {
    type: 'sales_by_customer',
    category: 'sales',
    name: 'reports.types.salesByCustomer',
    description: 'reports.types.salesByCustomerDesc',
    parameters: [
      {
        key: 'dateFrom',
        label: 'reports.params.dateFrom',
        type: 'date',
        required: false,
      },
      {
        key: 'dateTo',
        label: 'reports.params.dateTo',
        type: 'date',
        required: false,
      },
    ],
    query: salesByCustomerQuery,
  },
  {
    type: 'sales_by_product',
    category: 'sales',
    name: 'reports.types.salesByProduct',
    description: 'reports.types.salesByProductDesc',
    parameters: [
      {
        key: 'dateFrom',
        label: 'reports.params.dateFrom',
        type: 'date',
        required: false,
      },
      {
        key: 'dateTo',
        label: 'reports.params.dateTo',
        type: 'date',
        required: false,
      },
    ],
    query: salesByProductQuery,
  },
  {
    type: 'inventory_status',
    category: 'inventory',
    name: 'reports.types.inventoryStatus',
    description: 'reports.types.inventoryStatusDesc',
    parameters: [
      {
        key: 'lowStockThreshold',
        label: 'reports.params.lowStockThreshold',
        type: 'number',
        required: false,
        defaultValue: 10,
      },
      {
        key: 'onlyLowStock',
        label: 'reports.params.onlyLowStock',
        type: 'select',
        required: false,
        options: [
          { value: 'false', label: 'reports.params.allProducts' },
          { value: 'true', label: 'reports.params.lowStockOnly' },
        ],
      },
    ],
    query: inventoryStatusQuery,
  },
  {
    type: 'stock_movements',
    category: 'inventory',
    name: 'reports.types.stockMovements',
    description: 'reports.types.stockMovementsDesc',
    parameters: [
      {
        key: 'dateFrom',
        label: 'reports.params.dateFrom',
        type: 'date',
        required: false,
      },
      {
        key: 'dateTo',
        label: 'reports.params.dateTo',
        type: 'date',
        required: false,
      },
    ],
    query: stockMovementsQuery,
  },
  {
    type: 'fiscal_iva',
    category: 'fiscal',
    name: 'reports.types.fiscalIva',
    description: 'reports.types.fiscalIvaDesc',
    parameters: DATE_PARAMS,
    query: fiscalIvaQuery,
  },
  {
    type: 'fiscal_withholding',
    category: 'fiscal',
    name: 'reports.types.fiscalWithholding',
    description: 'reports.types.fiscalWithholdingDesc',
    parameters: DATE_PARAMS,
    query: fiscalWithholdingQuery,
  },
  {
    type: 'financial_ar',
    category: 'financial',
    name: 'reports.types.financialAr',
    description: 'reports.types.financialArDesc',
    parameters: DATE_PARAMS,
    query: financialArQuery,
  },
  {
    type: 'financial_ap',
    category: 'financial',
    name: 'reports.types.financialAp',
    description: 'reports.types.financialApDesc',
    parameters: DATE_PARAMS,
    query: financialApQuery,
  },
];
