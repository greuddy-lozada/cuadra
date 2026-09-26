'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Receipt, Eye, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import apiClient from '@/lib/api/api-client';
import { localDb, type LocalSale } from '@/lib/sync/db';
import { PaymentMethod, type CreateSaleRequest, type SaleItem } from '../models/pos.model';

interface SaleHistoryProps {
  onSelectSale: (sale: LocalSale) => void;
  variant?: 'accordion' | 'sheet';
}

const PAGE_SIZE = 20;
const FETCH_LIMIT = 50;

interface ApiSaleRow {
  id: string;
  code?: string | null;
  date?: string | null;
  createdAt: string;
  amount?: number | null;
  amountUsd?: number | null;
  exchangeRate?: number | null;
  paymentMethod?: number | null;
  idCustomer?: string | null;
  totalTax?: number | null;
  totalTaxUsd?: number | null;
  withholdingPercentage?: number | null;
  withholdingAmount?: number | null;
  withholdingAmountUsd?: number | null;
  customer?: { firstName?: string | null; lastName?: string | null } | null;
  details?: Array<{
    idProduct: string;
    quantity?: number | null;
    unitPrice?: number | null;
    unitPriceUsd?: number | null;
    subtotal?: number | null;
    subtotalUsd?: number | null;
    taxName?: string | null;
    taxPercentage?: number | null;
    taxAmount?: number | null;
    taxAmountUsd?: number | null;
  }>;
}

function toHistorySale(sale: ApiSaleRow): LocalSale {
  const customerName = sale.customer
    ? `${sale.customer.firstName ?? ''} ${sale.customer.lastName ?? ''}`.trim()
    : undefined;
  const items: SaleItem[] = (sale.details ?? []).map((detail) => ({
    productId: detail.idProduct,
    quantity: Number(detail.quantity ?? 0),
    unitPrice: Number(detail.unitPrice ?? 0),
    unitPriceUsd: Number(detail.unitPriceUsd ?? 0),
    subtotal: Number(detail.subtotal ?? 0),
    subtotalUsd: Number(detail.subtotalUsd ?? 0),
    taxName: detail.taxName ?? undefined,
    taxPercentage: detail.taxPercentage ?? undefined,
    taxAmount: detail.taxAmount != null ? Number(detail.taxAmount) : undefined,
    taxAmountUsd: detail.taxAmountUsd != null ? Number(detail.taxAmountUsd) : undefined,
  }));
  const data: CreateSaleRequest = {
    code: sale.code ?? '',
    date: sale.date ?? sale.createdAt,
    amount: Number(sale.amount ?? 0),
    amountUsd: Number(sale.amountUsd ?? 0),
    exchangeRate: Number(sale.exchangeRate ?? 0),
    paymentMethod: sale.paymentMethod ?? PaymentMethod.Cash,
    status: 1,
    idCustomer: sale.idCustomer ?? undefined,
    customerName,
    items,
    totalTax: sale.totalTax != null ? Number(sale.totalTax) : undefined,
    totalTaxUsd: sale.totalTaxUsd != null ? Number(sale.totalTaxUsd) : undefined,
    withholdingPercentage: sale.withholdingPercentage ?? undefined,
    withholdingAmount: sale.withholdingAmount != null ? Number(sale.withholdingAmount) : undefined,
    withholdingAmountUsd: sale.withholdingAmountUsd != null ? Number(sale.withholdingAmountUsd) : undefined,
  };
  return { localId: sale.id, data, createdAt: sale.createdAt };
}

export function SaleHistory({ onSelectSale, variant = 'accordion' }: SaleHistoryProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [allSales, setAllSales] = useState<LocalSale[]>([]);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const local = await localDb.sales.orderBy('id').reverse().toArray();
      let remote: LocalSale[] = [];
      try {
        const params: Record<string, string | number> = { page: 1, limit: FETCH_LIMIT };
        const q = query.trim();
        if (q) params.search = q;
        if (fromDate) params.from = new Date(`${fromDate}T00:00:00`).toISOString();
        if (toDate) params.to = new Date(`${toDate}T23:59:59.999`).toISOString();
        const response = await apiClient.get<{ data: ApiSaleRow[] }>('/sales', { params });
        remote = (response.data.data ?? []).map(toHistorySale);
      } catch {
        if (local.length === 0) setLoadError(true);
      }

      const remoteCodes = new Set(
        remote
          .map((sale) => (sale.data as CreateSaleRequest).code)
          .filter((code) => code.length > 0),
      );
      const pending = local.filter((sale) => {
        const code = (sale.data as CreateSaleRequest).code ?? '';
        return code.length === 0 || !remoteCodes.has(code);
      });
      const merged = [...pending, ...remote];
      setAllSales(merged);

      const names: Record<string, string> = {};
      for (const sale of merged) {
        const data = sale.data as CreateSaleRequest;
        if (data.idCustomer && data.customerName) names[data.idCustomer] = data.customerName;
      }
      const missingIds = [...new Set(
        merged
          .map((sale) => (sale.data as CreateSaleRequest).idCustomer)
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && !names[id]),
      )];
      if (missingIds.length > 0) {
        const customers = await localDb.customers.bulkGet(missingIds);
        for (const customer of customers) {
          if (customer) names[customer.id] = `${customer.firstName} ${customer.lastName}`;
        }
      }
      setCustomerNames(names);
    } finally {
      setLoading(false);
    }
  }, [query, fromDate, toDate]);

  useEffect(() => {
    if (variant !== 'sheet' && !open) return;
    const timer = setTimeout(() => { void loadAll(); }, 300);
    return () => clearTimeout(timer);
  }, [variant, open, loadAll]);

  const filtered = useCallback(() => {
    let result = allSales;

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(s => {
        const data = s.data as CreateSaleRequest;
        if ((data.code ?? '').toLowerCase().includes(q)) return true;
        if (data.customerName?.toLowerCase().includes(q)) return true;
        if (data.idCustomer && customerNames[data.idCustomer]?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    if (fromDate) {
      const from = new Date(`${fromDate}T00:00:00`).getTime();
      result = result.filter(s => {
        const data = s.data as CreateSaleRequest;
        return data.date ? new Date(data.date).getTime() >= from : true;
      });
    }

    if (toDate) {
      const to = new Date(`${toDate}T23:59:59.999`).getTime();
      result = result.filter(s => {
        const data = s.data as CreateSaleRequest;
        return data.date ? new Date(data.date).getTime() <= to : true;
      });
    }

    return result;
  }, [allSales, query, fromDate, toDate, customerNames]);

  useEffect(() => {
    setPage(1);
  }, [query, fromDate, toDate]);

  const paged = useCallback(() => {
    const f = filtered();
    const end = page * PAGE_SIZE;
    setHasMore(end < f.length);
    return f.slice(0, end);
  }, [filtered, page]);

  useEffect(() => {
    setSales(paged());
  }, [paged]);

  const content = (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('pos.sales.search')}
            className="pl-7 h-8 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {(fromDate || toDate || query) && (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setQuery(''); setFromDate(''); setToDate(''); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="date"
          className="h-8 text-xs"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          title={t('pos.sales.fromDate')}
        />
        <Input
          type="date"
          className="h-8 text-xs"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          title={t('pos.sales.toDate')}
        />
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {loading && sales.length === 0 && <p className="text-sm text-muted-foreground p-2 text-center">{t('common.loading')}</p>}
        {!loading && sales.length === 0 && (
          <p className="text-sm text-muted-foreground p-2 text-center">
            {loadError ? t('pos.sales.error.load') : t('pos.sales.empty')}
          </p>
        )}
        {sales.map(s => {
          const data = s.data as CreateSaleRequest;
          const custLabel = data.customerName || (data.idCustomer ? customerNames[data.idCustomer] : '') || '';
          const time = data.date ? new Date(data.date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
          return (
            <div
              key={s.localId || s.id}
              className="text-sm flex justify-between items-center p-1.5 rounded hover:bg-muted/50 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onSelectSale(s); }}
              title={t('pos.sales.detail')}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs shrink-0">#{data.code}</span>
                <span className="text-muted-foreground truncate">{custLabel}</span>
              </div>
              <span className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-xs text-muted-foreground">{time}</span>
                <span className="text-xs font-medium tabular-nums">Bs. {data.amount?.toFixed(2)}</span>
              </span>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setPage(p => p + 1)}>
          {t('pos.sales.loadMore')}
        </Button>
      )}
    </div>
  );

  return variant === 'sheet' ? content : (
    <div className="border border-border/50 rounded-lg">
      <Button variant="ghost" className="w-full justify-between" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2"><Receipt className="h-4 w-4" />{t('pos.sales.title')}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {open && <div className="p-2 space-y-2 border-t border-border/50">{content}</div>}
    </div>
  );
}
