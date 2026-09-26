'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n';
import { sileo } from 'sileo';
import { useReports, useDeleteReport } from '../hooks/use-reports';
import { ReportCard } from './report-card';
import { ReportGenerator } from './report-generator';
import { ReportViewer } from './report-viewer';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SlideForm } from '@/components/ui/slide-form';
import { extractApiError } from '@/lib/api/extract-api-error';
import { BarChart3, ClipboardList, FileText, Landmark, Scale } from 'lucide-react';
import { getReportTypeLabel } from '../lib/report-labels';

const CATEGORIES = [
  { key: 'sales', label: 'reports.categories.sales', icon: BarChart3 },
  { key: 'inventory', label: 'reports.categories.inventory', icon: ClipboardList },
  { key: 'fiscal', label: 'reports.categories.fiscal', icon: Scale },
  { key: 'financial', label: 'reports.categories.financial', icon: Landmark },
] as const;

const PANEL_WIDTH = 720;

export function ReportsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportFromQuery = searchParams.get('report');
  const [activeCategory, setActiveCategory] = useState<string>(CATEGORIES[0].key);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(reportFromQuery);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const { data, isLoading, refetch } = useReports({ limit: 100 });
  const deleteMutation = useDeleteReport();

  const allReports = useMemo(() => data?.data ?? [], [data]);
  const reports = useMemo(
    () => allReports.filter((r) => r.category === activeCategory),
    [allReports, activeCategory],
  );
  const reportCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allReports) counts[r.category] = (counts[r.category] || 0) + 1;
    return counts;
  }, [allReports]);

  const selectedReport = useMemo(
    () => allReports.find((r) => r.id === selectedReportId) ?? null,
    [allReports, selectedReportId],
  );

  useEffect(() => {
    if (reportFromQuery) setSelectedReportId(reportFromQuery);
  }, [reportFromQuery]);

  const panelOpen = !!selectedReportId;

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedReportId(null);
        if (searchParams.get('report')) router.replace('/reports');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, router, searchParams]);

  const handleGenerated = (reportId?: string) => {
    refetch();
    sileo.success({ description: t('reports.created') });
    if (reportId) setSelectedReportId(reportId);
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;
    try {
      await deleteMutation.mutateAsync(reportToDelete);
      sileo.success({ description: t('reports.deleted') });
    } catch (err) {
      sileo.error({ description: extractApiError(err) ?? t('reports.error.delete') });
    }
    setReportToDelete(null);
    if (selectedReportId === reportToDelete) setSelectedReportId(null);
  };

  const panelTitle = selectedReport
    ? getReportTypeLabel(selectedReport.type, t)
    : t('reports.title');

  return (
    <SlideForm
      open={panelOpen}
      title={panelTitle}
      onClose={() => {
        setSelectedReportId(null);
        if (searchParams.get('report')) router.replace('/reports');
      }}
      panelWidth={PANEL_WIDTH}
      panel={
        selectedReportId ? (
          <div className="-m-1">
            <ReportViewer reportId={selectedReportId} />
          </div>
        ) : null
      }
    >
      <div className="max-w-4xl mx-auto pb-8">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border mb-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = reportCounts[cat.key] ?? 0;
            const active = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.key);
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  active
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(cat.label)}
                {count > 0 && (
                  <span
                    className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${
                      active ? 'bg-primary/15' : 'bg-muted'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
          <ReportGenerator category={activeCategory} onGenerated={handleGenerated} />

          <div className="px-4 pb-4 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('reports.generatedReports')}
            </h3>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : reports.length > 0 ? (
              <div className="space-y-2">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    selected={report.id === selectedReportId}
                    onView={(id) => setSelectedReportId(id)}
                    onDelete={(id) => setReportToDelete(id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">{t('reports.empty.title')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('reports.empty.description')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!reportToDelete}
        title={t('reports.deleteConfirm')}
        message={t('reports.deleteConfirmDesc')}
        onConfirm={handleDelete}
        onCancel={() => setReportToDelete(null)}
        loading={deleteMutation.isPending}
      />
    </SlideForm>
  );
}
