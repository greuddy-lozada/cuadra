'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { stockService } from '@/features/stocks/services/stock.service';
import { KardexMovement } from '@/features/stocks/models/stock.model';
import { useI18n } from '@/i18n';

const PAGE_SIZE = 20;

export function KardexPanel({ productId }: { productId: string }) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const kardex = useQuery({
    queryKey: ['stocks', 'kardex', productId, page],
    queryFn: () => stockService.getKardex(productId, page, PAGE_SIZE),
  });

  if (kardex.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (kardex.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('stocks.kardex.error')}</AlertDescription>
      </Alert>
    );
  }

  const rows = kardex.data?.rows ?? [];
  if (rows.length === 0) {
    return <EmptyState title={t('stocks.kardex.empty')} className="py-10" />;
  }

  const totalPages = kardex.data?.totalPages ?? 1;
  const dateLocale = locale === 'en' ? 'en-US' : 'es-VE';

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('stocks.kardex.date')}</TableHead>
            <TableHead>{t('stocks.kardex.document')}</TableHead>
            <TableHead>{t('stocks.kardex.type')}</TableHead>
            <TableHead className="text-right">{t('stocks.kardex.entry')}</TableHead>
            <TableHead className="text-right">{t('stocks.kardex.exit')}</TableHead>
            <TableHead className="text-right">{t('stocks.kardex.balance')}</TableHead>
            <TableHead>{t('stocks.kardex.observation')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">
                {new Date(row.createdAt).toLocaleString(dateLocale)}
              </TableCell>
              <TableCell>{t(`stocks.kardex.doc.${row.document}`)}</TableCell>
              <TableCell>{movementType(row, t)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.entry ?? ''}</TableCell>
              <TableCell className="text-right tabular-nums">{row.exit ?? ''}</TableCell>
              <TableCell className="text-right tabular-nums">{row.balanceAfter ?? ''}</TableCell>
              <TableCell>{row.observation ?? ''}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  );
}

function movementType(row: KardexMovement, t: (key: string) => string): string {
  if (row.exit != null) return t('stocks.kardex.exit');
  return t('stocks.kardex.entry');
}
