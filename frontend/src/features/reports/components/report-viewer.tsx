'use client';

import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { extractApiError } from '@/lib/api/extract-api-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Printer, AlertCircle, Calendar, User, Hash, Download, RefreshCw } from 'lucide-react';
import { useReport } from '../hooks/use-reports';
import { useGenerateReport } from '../hooks/use-reports';
import { getReportTypeLabel, resolveReportLabel } from '../lib/report-labels';
import { sileo } from 'sileo';
import { BarChart } from './charts/bar-chart';

interface ReportViewerProps {
  reportId: string;
}

function formatCurrency(amount: number): string {
  return `Bs. ${amount.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString('es-VE', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Report Layout ───────────────────────────────────

interface ReportMetaItem {
  icon: React.ReactNode;
  label: string;
  value: string;
}

interface ReportLayoutProps {
  reportType: string;
  reportName: string;
  meta: ReportMetaItem[];
  children: React.ReactNode;
}

function ReportLayout({ reportType, reportName, meta, children }: ReportLayoutProps) {
  const { t } = useI18n();
  const { currentOrg } = useAuth();

  return (
    <div id="report-document" className="report-document print:block print:p-0">
      {/* Print-only header band */}
      <div className="report-band hidden print:flex">
        <span className="band-title">Cuadra</span>
        <span className="band-subtitle">{t('reports.title')}</span>
      </div>

      {/* Header */}
      <header className="report-header border-b-2 border-primary pb-6 mb-6 print:border-black">
        <h1 className="text-xl font-bold tracking-tight">
          {currentOrg?.name ?? 'Cuadra'}
        </h1>
        <h2 className="text-lg font-semibold text-muted-foreground mt-1">
          {reportType}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{reportName}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm text-muted-foreground report-meta">
          {meta.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              {item.icon}
              <span className="font-medium">{item.label}:</span>
              <span>{item.value}</span>
            </span>
          ))}
        </div>
      </header>

      {/* Body */}
      <div className="report-body space-y-8">{children}</div>

      {/* Footer */}
      <footer className="report-footer mt-10 pt-4 border-t border-border text-center text-xs text-muted-foreground print:border-gray-300">
        {t('reports.generatedBy')} Cuadra{' · '}{new Date().toLocaleDateString('es-VE')}
      </footer>
    </div>
  );
}

// ─── Report Table ────────────────────────────────────

interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: (v: unknown) => string;
}

interface ReportTableProps {
  rows: Record<string, unknown>[];
  columns: ReportColumn[];
  noDataMessage?: string;
}

function ReportTable({ rows, columns, noDataMessage }: ReportTableProps) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border rounded-lg">
        {noDataMessage ?? t('reports.noResults')}
      </div>
    );
  }

  return (
    <div className="report-table-wrapper overflow-x-auto rounded-lg border print:border-gray-300">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 print:bg-gray-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-3 px-4 font-semibold text-muted-foreground border-b print:text-black print:border-gray-300 ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-border/30 print:border-gray-200 ${i % 2 === 0 ? 'bg-muted/20 print:bg-gray-50' : ''}`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2.5 px-4 ${col.align === 'right' ? 'text-right' : ''}`}
                >
                  {col.format ? col.format(r[col.key]) : String(r[col.key] ?? '\u2014')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── KPI Summary Cards ───────────────────────────────

interface KpiCard {
  label: string;
  value: string;
  variant?: 'default' | 'warning' | 'destructive';
}

function KpiGrid({ cards }: { cards: KpiCard[] }) {
  return (
    <div className={`kpi-grid grid gap-3 sm:gap-4 grid-cols-2 ${cards.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} print:grid-cols-4`}>
      {cards.map((card) => (
        <div
          key={card.label}
          className="kpi-card rounded-lg border bg-card p-3 sm:p-4 print:border-gray-300 print:shadow-none"
        >
          <p className="kpi-label text-xs text-muted-foreground mb-1 print:text-gray-500">{card.label}</p>
          <p className={`kpi-value text-base sm:text-lg font-bold break-words ${
            card.variant === 'destructive' ? 'text-destructive' :
            card.variant === 'warning' ? 'text-amber-600' :
            'text-primary print:text-black'
          }`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Section Title ───────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="report-section-title text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-3 print:text-black">
      {children}
    </h3>
  );
}

// ─── Sales Summary Renderer ──────────────────────────

function SalesSummaryRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];

  const chartData = rows.map((r) => ({
    label: String(r.month || ''),
    value: Number(r.total_sales) || 0,
  }));

  const totals = rows.reduce<{ totalSales: number; totalRevenue: number; totalTax: number }>(
    (acc, r) => ({
      totalSales: acc.totalSales + (Number(r.total_sales) || 0),
      totalRevenue: acc.totalRevenue + (Number(r.total_revenue) || 0),
      totalTax: acc.totalTax + (Number(r.total_tax) || 0),
    }),
    { totalSales: 0, totalRevenue: 0, totalTax: 0 },
  );

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.totalSales'), value: String(totals.totalSales) },
          { label: t('reports.fields.totalRevenue'), value: formatCurrency(totals.totalRevenue) },
          { label: t('reports.fields.totalTax'), value: formatCurrency(totals.totalTax) },
        ]}
      />

      {chartData.length > 0 && (
        <div>
          <SectionTitle>{t('reports.charts.monthlySales')}</SectionTitle>
          <div className="print:hidden">
            <BarChart data={chartData} />
          </div>
        </div>
      )}

      <SectionTitle>{t('reports.fields.monthlyDetail')}</SectionTitle>
      <ReportTable
        rows={rows}
        columns={[
          { key: 'month', label: t('reports.fields.month') },
          { key: 'total_sales', label: t('reports.fields.salesCount'), align: 'right' },
          { key: 'total_revenue', label: t('reports.fields.revenue'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'total_tax', label: t('reports.fields.totalTax'), align: 'right', format: (v) => formatCurrency(Number(v)) },
        ]}
      />
    </>
  );
}

// ─── Sales By Customer Renderer ──────────────────────

function SalesByCustomerRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];

  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
  const totalCount = rows.reduce((sum, r) => sum + (Number(r.sales_count) || 0), 0);

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.totalCustomers'), value: String(rows.length) },
          { label: t('reports.fields.totalSales'), value: String(totalCount) },
          { label: t('reports.fields.totalAmount'), value: formatCurrency(totalAmount) },
        ]}
      />

      <ReportTable
        rows={rows}
        columns={[
          { key: 'customer_name', label: t('reports.fields.customer') },
          { key: 'sales_count', label: t('reports.fields.salesCount'), align: 'right' },
          { key: 'total_amount', label: t('reports.fields.totalAmount'), align: 'right', format: (v) => formatCurrency(Number(v)) },
        ]}
      />
    </>
  );
}

// ─── Sales By Product Renderer ───────────────────────

function SalesByProductRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];

  const totalRevenue = rows.reduce((sum, r) => sum + (Number(r.total_revenue) || 0), 0);
  const totalQuantity = rows.reduce((sum, r) => sum + (Number(r.quantity_sold) || 0), 0);

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.totalProducts'), value: String(rows.length) },
          { label: t('reports.fields.totalQuantity'), value: totalQuantity.toLocaleString() },
          { label: t('reports.fields.totalRevenue'), value: formatCurrency(totalRevenue) },
        ]}
      />

      <ReportTable
        rows={rows}
        columns={[
          { key: 'product_name', label: t('reports.fields.product') },
          { key: 'quantity_sold', label: t('reports.fields.quantity'), align: 'right' },
          { key: 'total_revenue', label: t('reports.fields.revenue'), align: 'right', format: (v) => formatCurrency(Number(v)) },
        ]}
      />
    </>
  );
}

// ─── Inventory Status Renderer ──────────────────────

function InventoryStatusRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];

  const totals = rows.reduce<{ totalProducts: number; totalStock: number; totalValue: number; lowStockCount: number }>(
    (acc, r) => ({
      totalProducts: acc.totalProducts + 1,
      totalStock: acc.totalStock + (Number(r.total_existence) || 0),
      totalValue: acc.totalValue + (Number(r.inventory_value) || 0),
      lowStockCount: acc.lowStockCount + (r.is_low_stock ? 1 : 0),
    }),
    { totalProducts: 0, totalStock: 0, totalValue: 0, lowStockCount: 0 },
  );

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.totalProducts'), value: String(totals.totalProducts) },
          { label: t('reports.fields.totalStock'), value: totals.totalStock.toLocaleString() },
          { label: t('reports.fields.totalInventoryValue'), value: formatCurrency(totals.totalValue) },
          { label: t('reports.fields.lowStockProducts'), value: String(totals.lowStockCount), variant: totals.lowStockCount > 0 ? 'destructive' : 'default' },
        ]}
      />

      <ReportTable
        rows={rows}
        columns={[
          { key: 'code', label: t('reports.fields.code') },
          { key: 'product_name', label: t('reports.fields.product') },
          { key: 'total_existence', label: t('reports.fields.stock'), align: 'right' },
          { key: 'price', label: t('reports.fields.price'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'inventory_value', label: t('reports.fields.inventoryValue'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'is_low_stock', label: t('reports.fields.lowStock'), align: 'right', format: (v) => v ? '\u26A0\uFE0F' : '\u2014' },
        ]}
      />
    </>
  );
}

// ─── Stock Movements Renderer ──────────────────────

function StockMovementsRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];

  const totalEntries = rows.reduce((sum, r) => sum + (Number(r.type) === 1 ? (Number(r.quantity) || 0) : 0), 0);
  const totalExits = rows.reduce((sum, r) => sum + (Number(r.type) === 2 ? (Number(r.quantity) || 0) : 0), 0);

  const typeLabel = (type: number): string => {
    if (type === 1) return t('reports.fields.movementEntry');
    if (type === 2) return t('reports.fields.movementExit');
    return String(type);
  };

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.totalMovements'), value: String(rows.length) },
          { label: t('reports.fields.movementEntry'), value: String(totalEntries) },
          { label: t('reports.fields.movementExit'), value: String(totalExits) },
        ]}
      />

      <ReportTable
        rows={rows}
        columns={[
          { key: 'date', label: t('reports.fields.date') },
          { key: 'product_name', label: t('reports.fields.product') },
          { key: 'batch_code', label: t('reports.fields.batch') },
          { key: 'type', label: t('reports.fields.movementType'), format: (v) => typeLabel(Number(v)) },
          { key: 'quantity', label: t('reports.fields.quantity'), align: 'right' },
          { key: 'balance_after', label: t('reports.fields.balance'), align: 'right' },
          { key: 'observation', label: t('reports.fields.observation') },
        ]}
      />
    </>
  );
}

function FiscalIvaRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];

  const totals = rows.reduce<{ sales: number; base: number; tax: number; total: number }>(
    (acc, r) => ({
      sales: acc.sales + (Number(r.sales_count) || 0),
      base: acc.base + (Number(r.taxable_base) || 0),
      tax: acc.tax + (Number(r.tax_amount) || 0),
      total: acc.total + (Number(r.total_with_tax) || 0),
    }),
    { sales: 0, base: 0, tax: 0, total: 0 },
  );

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.totalSales'), value: String(totals.sales) },
          { label: t('reports.fields.taxableBase'), value: formatCurrency(totals.base) },
          { label: t('reports.fields.totalTax'), value: formatCurrency(totals.tax) },
          { label: t('reports.fields.totalWithTax'), value: formatCurrency(totals.total) },
        ]}
      />
      <SectionTitle>{t('reports.fields.taxBreakdown')}</SectionTitle>
      <ReportTable
        rows={rows}
        columns={[
          { key: 'tax_name', label: t('reports.fields.taxName') },
          { key: 'tax_percentage', label: t('reports.fields.taxRate'), align: 'right', format: (v) => `${Number(v)}%` },
          { key: 'sales_count', label: t('reports.fields.salesCount'), align: 'right' },
          { key: 'taxable_base', label: t('reports.fields.taxableBase'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'tax_amount', label: t('reports.fields.totalTax'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'total_with_tax', label: t('reports.fields.totalWithTax'), align: 'right', format: (v) => formatCurrency(Number(v)) },
        ]}
      />
    </>
  );
}

function FiscalWithholdingRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];
  const totalWithheld = rows.reduce((sum, r) => sum + (Number(r.withheld_amount) || 0), 0);
  const totalBase = rows.reduce((sum, r) => sum + (Number(r.base_amount) || 0), 0);

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.records'), value: String(rows.length) },
          { label: t('reports.fields.taxableBase'), value: formatCurrency(totalBase) },
          { label: t('reports.fields.withheldAmount'), value: formatCurrency(totalWithheld) },
        ]}
      />
      <ReportTable
        rows={rows}
        columns={[
          { key: 'date', label: t('reports.fields.date'), format: (v) => v ? String(v).substring(0, 10) : '—' },
          { key: 'supplier_name', label: t('reports.fields.supplier') },
          { key: 'supplier_rif', label: t('reports.fields.rif') },
          { key: 'type', label: t('reports.fields.withholdingType') },
          { key: 'percentage', label: t('reports.fields.taxRate'), align: 'right', format: (v) => `${Number(v)}%` },
          { key: 'base_amount', label: t('reports.fields.taxableBase'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'withheld_amount', label: t('reports.fields.withheldAmount'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'document_number', label: t('reports.fields.documentNumber') },
          { key: 'period', label: t('reports.fields.period') },
        ]}
      />
    </>
  );
}

function agingLabel(bucket: unknown, t: (k: string) => string): string {
  if (bucket === 'overdue') return t('reports.fields.agingOverdue');
  if (bucket === 'current') return t('reports.fields.agingCurrent');
  return t('reports.fields.agingOpen');
}

function FinancialArRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];
  const totalBalance = rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
  const overdue = rows.filter((r) => r.aging_bucket === 'overdue').length;

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.records'), value: String(rows.length) },
          { label: t('reports.fields.balance'), value: formatCurrency(totalBalance) },
          { label: t('reports.fields.agingOverdue'), value: String(overdue), variant: overdue > 0 ? 'destructive' : 'default' },
        ]}
      />
      <ReportTable
        rows={rows}
        columns={[
          { key: 'customer_name', label: t('reports.fields.customer') },
          { key: 'sale_code', label: t('reports.fields.saleCode') },
          { key: 'issue_date', label: t('reports.fields.issueDate'), format: (v) => v ? String(v).substring(0, 10) : '—' },
          { key: 'due_date', label: t('reports.fields.dueDate'), format: (v) => v ? String(v).substring(0, 10) : '—' },
          { key: 'amount', label: t('reports.fields.totalAmount'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'credit', label: t('reports.fields.credit'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'balance', label: t('reports.fields.balance'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'aging_bucket', label: t('reports.fields.aging'), format: (v) => agingLabel(v, t) },
        ]}
      />
    </>
  );
}

function FinancialApRenderer({ results }: { results: Record<string, unknown> }) {
  const { t } = useI18n();
  const rows = (results.rows as Record<string, unknown>[]) || [];
  const totalBalance = rows.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
  const overdue = rows.filter((r) => r.aging_bucket === 'overdue').length;

  return (
    <>
      <KpiGrid
        cards={[
          { label: t('reports.fields.records'), value: String(rows.length) },
          { label: t('reports.fields.balance'), value: formatCurrency(totalBalance) },
          { label: t('reports.fields.agingOverdue'), value: String(overdue), variant: overdue > 0 ? 'destructive' : 'default' },
        ]}
      />
      <ReportTable
        rows={rows}
        columns={[
          { key: 'supplier_name', label: t('reports.fields.supplier') },
          { key: 'supplier_rif', label: t('reports.fields.rif') },
          { key: 'po_code', label: t('reports.fields.poCode') },
          { key: 'issue_date', label: t('reports.fields.issueDate'), format: (v) => v ? String(v).substring(0, 10) : '—' },
          { key: 'due_date', label: t('reports.fields.dueDate'), format: (v) => v ? String(v).substring(0, 10) : '—' },
          { key: 'amount', label: t('reports.fields.totalAmount'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'credit', label: t('reports.fields.credit'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'balance', label: t('reports.fields.balance'), align: 'right', format: (v) => formatCurrency(Number(v)) },
          { key: 'aging_bucket', label: t('reports.fields.aging'), format: (v) => agingLabel(v, t) },
        ]}
      />
    </>
  );
}

// ─── Render dispatcher ───────────────────────────────

function renderReport(type: string, results: Record<string, unknown>) {
  switch (type) {
    case 'sales_summary':
      return <SalesSummaryRenderer results={results} />;
    case 'sales_by_customer':
      return <SalesByCustomerRenderer results={results} />;
    case 'sales_by_product':
      return <SalesByProductRenderer results={results} />;
    case 'inventory_status':
      return <InventoryStatusRenderer results={results} />;
    case 'stock_movements':
      return <StockMovementsRenderer results={results} />;
    case 'fiscal_iva':
      return <FiscalIvaRenderer results={results} />;
    case 'fiscal_withholding':
      return <FiscalWithholdingRenderer results={results} />;
    case 'financial_ar':
      return <FinancialArRenderer results={results} />;
    case 'financial_ap':
      return <FinancialApRenderer results={results} />;
    default:
      return (
        <div className="rounded-lg border p-4 overflow-auto">
          <pre className="text-xs">{JSON.stringify(results, null, 2)}</pre>
        </div>
      );
  }
}

// ─── Utilities ──────────────────────────────────────

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) return;
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => {
      const v = r[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Report Viewer ──────────────────────────────

export function ReportViewer({ reportId }: ReportViewerProps) {
  const { t } = useI18n();
  const { data: report, isLoading } = useReport(reportId);
  const generateMutation = useGenerateReport();

  const handleRegenerate = async () => {
    if (!report) return;
    try {
      await generateMutation.mutateAsync({
        type: report.type,
        parameters: report.parameters as Record<string, unknown>,
      });
      sileo.success({ description: t('reports.created') });
    } catch (err) {
      sileo.error({ description: extractApiError(err) ?? t('reports.error.generate') });
    }
  };

  const handleCSV = () => {
    if (!report?.results) return;
    const rows = (report.results as Record<string, unknown>).rows as Record<string, unknown>[] | undefined;
    if (!rows || rows.length === 0) return;
    downloadCSV(rows, `${report.type}-${new Date().toISOString().substring(0, 10)}.csv`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t('reports.error.load')}</AlertDescription>
      </Alert>
    );
  }

  if (report.status === 'generating') {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">{t('reports.generating')}...</p>
      </div>
    );
  }

  if (report.status === 'failed') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t('reports.error.generate')}: {report.errorMessage}
        </AlertDescription>
      </Alert>
    );
  }

  const meta: ReportMetaItem[] = [];

  if (report.parameters) {
    const params = report.parameters as Record<string, unknown>;
    if (params.dateFrom || params.dateTo) {
      const period = [params.dateFrom, params.dateTo].filter(Boolean).join(' \u2013 ') || '\u2014';
      meta.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('reports.fields.period'), value: period });
    }
  }

  if (report.generatedAt) {
    meta.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: t('reports.fields.generatedAt'), value: formatDateTime(report.generatedAt) });
  }

  if (report.userName) {
    meta.push({ icon: <User className="h-3.5 w-3.5" />, label: t('reports.generatedBy'), value: report.userName });
  }

  meta.push({ icon: <Hash className="h-3.5 w-3.5" />, label: t('reports.fields.id'), value: report.id.substring(0, 8) });

  const reportTypeLabel = getReportTypeLabel(report.type, t);
  const displayName = resolveReportLabel(report.name, t);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-6 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={generateMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {t('reports.regenerate')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCSV}>
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" />
            {t('reports.print')}
          </Button>
        </div>
      </div>

      <ReportLayout reportType={reportTypeLabel} reportName={displayName} meta={meta}>
        {report.results ? renderReport(report.type, report.results) : (
          <p className="text-sm text-muted-foreground text-center py-12">{t('reports.noResults')}</p>
        )}
      </ReportLayout>
    </div>
  );
}
