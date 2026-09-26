'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { localDb, type LocalSale } from '@/lib/sync/db';
import type { SaleItem, SalePayment, CreateSaleRequest } from '../models/pos.model';
import { PaymentMethod } from '../models/pos.model';
import { sileo } from 'sileo';
import { extractApiError } from '@/lib/api/extract-api-error';

interface SaleDetailModalProps {
  sale: LocalSale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHOD_LABELS: Record<number, string> = {
  [PaymentMethod.Cash]: 'Efectivo',
  [PaymentMethod.PagoMovil]: 'Pago Móvil',
  [PaymentMethod.Transfer]: 'Transferencia',
  [PaymentMethod.Card]: 'Tarjeta',
  [PaymentMethod.Mixed]: 'Mixto',
  [PaymentMethod.Credit]: 'Crédito',
};

export function SaleDetailModal({ sale, open, onOpenChange }: SaleDetailModalProps) {
  const { t, tp } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CreateSaleRequest | null>(null);
    const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [customerLabel, setCustomerLabel] = useState('');

  useEffect(() => {
    if (!open || !sale) return;

    const load = async () => {
      setLoading(true);
      try {
        let raw = sale.data;
        if (typeof raw === 'string') raw = JSON.parse(raw);
        const d = raw as CreateSaleRequest;
        setData(d);

        const items = Array.isArray(d.items) ? (d.items as SaleItem[]) : [];
        const ids = [...new Set(items.map((i) => i.productId))];
        const products = await localDb.products.bulkGet(ids);
        const names: Record<string, string> = {};
        for (const p of products) {
          if (p) names[p.id] = p.name;
        }
        setProductNames(names);

        if (typeof d.idCustomer === 'string' && d.idCustomer.length > 0) {
          const c = await localDb.customers.get(d.idCustomer);
          if (c) setCustomerLabel(`${c.firstName} ${c.lastName} · ${c.taxId}`);
        }
      } catch (err) {
        setData(null);
        sileo.error({ description: extractApiError(err) ?? 'Error al cargar detalles' });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, sale]);

  const items = data && Array.isArray(data.items) ? (data.items as SaleItem[]) : [];
  const hasWithholding = data && (data.withholdingAmount ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{data?.code}</DialogTitle>
          <DialogDescription className="sr-only">{t('pos.sales.detail')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-4">{t('pos.sales.error.load')}</p>
        ) : (
          <div className="space-y-3 text-sm">
            {customerLabel && (
              <p className="text-muted-foreground">{customerLabel}</p>
            )}

            <div className="border border-border/50 rounded-lg divide-y">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="font-medium">{productNames[item.productId] ?? `#${item.productId}`}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} × Bs. {item.unitPrice.toFixed(2)}</p>
                  </div>
                  <span className="font-semibold tabular-nums">Bs. {item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>{t('pos.cart.subtotal')}</span>
                <span className="tabular-nums">Bs. {(data.amount - (data.totalTax ?? 0)).toFixed(2)}</span>
              </div>
              {data.totalTax && data.totalTax > 0 && (
                <div className="flex justify-between">
                  <span>{t('pos.cart.tax')}</span>
                  <span className="tabular-nums">Bs. {data.totalTax.toFixed(2)}</span>
                </div>
              )}
              {hasWithholding && (
                <div className="flex justify-between text-destructive">
                  <span>{tp('pos.withholding.rate', { percentage: String(data.withholdingPercentage) })}</span>
                  <span className="tabular-nums">-Bs. {data.withholdingAmount!.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/50">
                <span>{t('pos.cart.totalVes')}</span>
                <span className="tabular-nums text-primary">Bs. {data.amount.toFixed(2)}</span>
              </div>
              {data.amountUsd > 0 && (
                <div className="flex justify-between">
                  <span>{t('pos.cart.totalUsd')}</span>
                  <span className="tabular-nums">$ {data.amountUsd.toFixed(2)}</span>
                </div>
              )}
              {data.exchangeRate > 0 && (
                <p className="text-right">
                  {tp('pos.cart.rate', { rate: data.exchangeRate.toFixed(2) })}
                </p>
              )}
            </div>

            {data.payments && data.payments.length > 0 && (
              <div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
                {data.payments.map((p: SalePayment, i: number) => (
                  <p key={i}>{METHOD_LABELS[p.method] ?? '—'}: {p.currency} {p.amount.toFixed(2)}</p>
                ))}
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              {t('pos.receipt.close')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
