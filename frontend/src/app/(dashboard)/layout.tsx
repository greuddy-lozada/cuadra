'use client';

import { ReactNode, useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useUiStore } from '@/stores/ui-store';
import { useTabsStore } from '@/stores/tabs-store';
import { navigationGroups, navigationConfig } from '@/config/navigation.config';
import { hasMinLevel } from '@/lib/auth/roles';
import { parsePlanFeatures } from '@/lib/parse-features';

import { useI18n } from '@/i18n';
import { UserNav } from '@/components/ui/user-nav';
import { Sidebar, SidebarBody, SidebarLink } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ServerLockLink } from '@/components/server-lock-link';
import { SyncIndicator } from '@/components/sync-indicator';
import { usePosNavLock } from '@/lib/sync/hooks/use-pos-nav-lock';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { OrgSwitcher } from '@/components/ui/org-switcher';
import { VisitedTabs } from '@/features/visited-tabs/visited-tabs';
import { LayoutDashboard, Users, UserCog, Truck, Building2, Package, Receipt, Tags, Store, ShoppingCart, DollarSign, ShieldCheck, Settings, CreditCard, Mail, ArrowLeftRight, Wallet, BarChart3, Banknote, HandCoins, ChevronDown, ChevronRight, AlertCircle, Sparkles } from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  users: Users,
  customers: UserCog,
  suppliers: Truck,
  companies: Building2,
  products: Package,
  taxes: Receipt,
  batches: Tags,
  stocks: Store,
  purchaseOrders: ShoppingCart,
  accountsPayable: Wallet,
  exchangeRates: DollarSign,
  roles: ShieldCheck,
  adminOrganizations: Building2,
  adminUsers: Users,
  adminPlans: CreditCard,
  adminInvites: Mail,
  adminApprovals: AlertCircle,
  settings: Settings,
  payments: Wallet,
  transactions: ArrowLeftRight,
  billing: CreditCard,
  syncConflicts: AlertCircle,
  reports: BarChart3,
  assistant: Sparkles,
  cashRegisters: Banknote,
  accountsReceivable: HandCoins,
};
const groupIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  compras: ShoppingCart,
  ventas: UserCog,
  inventario: Package,
  reports: BarChart3,
  admin: ShieldCheck,
  config: Settings,
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const {
    user,
    isAuthenticated,
    isLoading,
    currentOrg,
    effectiveRoleSlug,
    systemRoleSlug,
  } = useAuth();
  const { t, tp } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { lockNav } = usePosNavLock();
  const lockMessage = t('sync.posNavLocked');
  const isPosPage = pathname.startsWith('/pos');
  const isAssistantPage = pathname.startsWith('/assistant');
  const fillPage = isPosPage || isAssistantPage;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const storeTabs = useTabsStore((s) => s.tabs);
  const setLastVisitedPath = useUiStore(s => s.setLastVisitedPath);
  useEffect(() => {
    if (isAuthenticated && pathname) {
      setLastVisitedPath(pathname);
    }
  }, [isAuthenticated, pathname, setLastVisitedPath]);

  const addTab = useTabsStore(s => s.addTab);
  useEffect(() => {
    if (!isAuthenticated || !pathname) return;
    if (pathname === '/dashboard') return;
    const navItem = navigationConfig.find((item) => pathname.startsWith(item.path));
    if (navItem) {
      addTab({ path: navItem.path, key: navItem.key });
    }
  }, [pathname, isAuthenticated, addTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const userFeatures = parsePlanFeatures(currentOrg?.plan?.features);
  const isSystemRole =
    systemRoleSlug === 'master' || systemRoleSlug === 'admin';

  const roleForNavItem = (path: string, minLevel: number) =>
    path.startsWith('/admin') || minLevel >= 90
      ? systemRoleSlug
      : effectiveRoleSlug;

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const role = roleForNavItem(item.path, item.minLevel);
        if (isSystemRole && item.path.startsWith('/admin')) {
          return hasMinLevel(systemRoleSlug, item.minLevel);
        }
        if (isSystemRole) return true;
        return (
          hasMinLevel(role, item.minLevel) &&
          (!item.requiredFeature ||
            userFeatures.includes(item.requiredFeature))
        );
      }),
    }))
    .filter((group) => group.items.length > 0);

  const currentPage = navigationConfig.find((item) => pathname.startsWith(item.path));
  const pageTitle = currentPage ? t(currentPage.label) : '';
  const showWelcome = pathname === '/dashboard';

  const accessiblePaths = new Set<string>();
  accessiblePaths.add('/dashboard');
  visibleGroups.forEach((g) => g.items.forEach((item) => accessiblePaths.add(item.path)));
  const tabs = storeTabs.filter((tab) => accessiblePaths.has(tab.path));

  const toggleGroup = (gi: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gi)) next.delete(gi);
      else next.add(gi);
      return next;
    });
  };

  return (
    <TooltipProvider>
    <div className="soft-tech flex h-screen flex-col overflow-hidden bg-[#e4e9f2] text-[#1a2332] md:flex-row print:h-auto print:block print:overflow-visible">
      <div className="print:hidden p-3 md:pr-1">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
        <SidebarBody className="justify-between gap-6">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <div className="relative h-[44px] flex items-center">
              <div className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <h2 className="text-lg font-bold font-heading text-[#3e93c1]">Cuadra</h2>
                <p className="text-xs text-[#5a6578]">
                  {user?.firstName} {user?.lastName}
                </p>
              </div>
              <div className={`absolute inset-0 flex items-center transition-all duration-300 ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-[#3e93c1]" />
              </div>
            </div>
            <nav className="mt-6 flex flex-col gap-1">
              {visibleGroups.map((group, gi) => {
                const GroupIcon = group.key ? groupIconMap[group.key] : undefined;
                return (
                <div key={group.key} className="relative">
                  {group.label && (
                    <div className="relative h-[36px]">
                      <button
                        type="button"
                        onClick={() => toggleGroup(gi)}
                        className={`group/sidebar absolute inset-0 flex w-full items-center justify-between pl-1 pr-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold hover:text-foreground transition-colors overflow-hidden ${
                          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {GroupIcon && <GroupIcon className="h-5 w-5 shrink-0" />}
                          <span className="group-hover/sidebar:translate-x-1 transition duration-150">{t(group.label)}</span>
                        </span>
                        {expandedGroups.has(gi) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                      {GroupIcon && (
                        <div className={`absolute inset-0 flex items-center gap-2 py-2 pl-1 transition-all duration-300 ${
                          sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
                        }`}>
                          <GroupIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  )}
                  {group.label ? (
                    expandedGroups.has(gi) && (
                      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${
                        sidebarOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                      }`}>
                        <div className="flex flex-col gap-0.5 overflow-hidden min-h-0">
                        {group.items.map((item) => {
                          const active = pathname.startsWith(item.path);
                          return (
                            <ServerLockLink
                              key={item.path}
                              href={item.path}
                              locked={lockNav}
                              lockMessage={lockMessage}
                              className={`flex items-center gap-2 pl-1 pr-3 py-2 text-sm transition-colors overflow-hidden group/sidebar ${
                                active
                                  ? 'neo-nav-active rounded-xl font-medium'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {(() => { const Icon = iconMap[item.key] || LayoutDashboard; return <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#3e93c1]' : 'text-muted-foreground'}`} />; })()}
                              <span className="group-hover/sidebar:translate-x-1 transition duration-150">{t(item.label)}</span>
                            </ServerLockLink>
                          );
                        })}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col">
                      {group.items.map((item) => {
                        const Icon = iconMap[item.key] || LayoutDashboard;
                        const active = pathname.startsWith(item.path);
                        return (
                          <SidebarLink
                            key={item.path}
                            link={{
                              label: t(item.label),
                              href: item.path,
                              icon: <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-[#3e93c1]' : 'text-muted-foreground'}`} />,
                            }}
                            disabled={lockNav && !item.path.startsWith('/pos')}
                            lockMessage={lockMessage}
                            className={active
                              ? 'neo-nav-active rounded-xl font-medium'
                              : 'text-muted-foreground hover:text-foreground transition-colors'}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </nav>
          </div>
          {currentOrg && (
            <div className="border-t border-border/50 pt-3 px-3 relative min-h-[44px]">
              <div className={`transition-all duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <OrgSwitcher />
              </div>
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} title={currentOrg.name}>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground border border-border/50">
                  {currentOrg.name.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          )}
        </SidebarBody>
      </Sidebar>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden transition-[padding] duration-300 print:h-auto print:block print:overflow-visible" style={{ paddingRight: 'var(--panel-offset, 0px)' }}>
        <div data-app-header className="neo-raised mx-3 mt-3 mb-0 flex items-center justify-between rounded-2xl px-6 py-3 md:mx-5 md:px-6 shrink-0 relative print:hidden z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold font-heading text-[#3e93c1]">{pageTitle}</h1>
            {showWelcome && (
              <p className="text-sm text-[#5a6578] hidden sm:block">
                {tp('dashboard.welcome', { name: `${user?.firstName} ${user?.lastName}` })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <UserNav />
          </div>
        </div>
        <div className="px-4 md:px-6 pt-3 pb-1 shrink-0 print:hidden">
          <VisitedTabs iconMap={iconMap} tabs={tabs} />
        </div>
        <div className={`flex-1 overflow-x-hidden px-4 md:px-6 pb-6 pt-2 print:h-auto print:overflow-visible print:block print:px-4 print:pb-4 ${fillPage ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={`w-full h-full ${fillPage ? 'min-h-0' : ''} print:h-auto`}>
            <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-[#5a6578]">{t('common.loading')}</p></div>}>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </Suspense>
          </div>
        </div>
      </main>
    </div>
    </TooltipProvider>
  );
}
