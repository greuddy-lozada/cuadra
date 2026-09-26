import {
  LayoutDashboard,
  Users,
  UserCog,
  Store,
  Building2,
  Receipt,
  Package,
  Tags,
  Truck,
  ShoppingCart,
  DollarSign,
  Settings,
  ShieldCheck,
  CreditCard,
  Mail,
  ArrowLeftRight,
  Wallet,
  AlertCircle,
  Keyboard,
  BarChart3,
  Banknote,
  HandCoins,
  Sparkles,
} from 'lucide-react';
import type { FeatureFlag } from '@/lib/feature-flags';

export interface NavItem {
  key: string;
  /** i18n key under `nav.*` (e.g. `nav.dashboard`) */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  minLevel: number;
  requiredFeature?: FeatureFlag;
}

export interface NavGroup {
  key?: string;
  /** i18n key under `nav.group.*` */
  label?: string;
  items: NavItem[];
}

export const navigationGroups: NavGroup[] = [
  {
    key: 'main',
    items: [
      { key: 'dashboard', label: 'nav.dashboard', icon: LayoutDashboard, path: '/dashboard', minLevel: 40 },
      { key: 'assistant', label: 'nav.assistant', icon: Sparkles, path: '/assistant', minLevel: 40 },
    ],
  },
  {
    key: 'compras',
    label: 'nav.group.compras',
    items: [
      { key: 'suppliers', label: 'nav.suppliers', icon: Truck, path: '/suppliers', minLevel: 60 },
      { key: 'purchaseOrders', label: 'nav.purchaseOrders', icon: ShoppingCart, path: '/purchase-orders', minLevel: 60 },
      { key: 'accountsPayable', label: 'nav.accountsPayable', icon: Wallet, path: '/accounts-payable', minLevel: 40, requiredFeature: 'purchase_orders' },
      { key: 'exchangeRates', label: 'nav.exchangeRates', icon: DollarSign, path: '/exchange-rates', minLevel: 40 },
    ],
  },
  {
    key: 'inventario',
    label: 'nav.group.inventario',
    items: [
      { key: 'products', label: 'nav.products', icon: Package, path: '/products', minLevel: 40, requiredFeature: 'products' },
      { key: 'categories', label: 'nav.categories', icon: Tags, path: '/categories', minLevel: 40, requiredFeature: 'products' },
      { key: 'taxes', label: 'nav.taxes', icon: Receipt, path: '/taxes', minLevel: 60, requiredFeature: 'products' },
      { key: 'batches', label: 'nav.batches', icon: Tags, path: '/batches', minLevel: 40, requiredFeature: 'inventory' },
      { key: 'stocks', label: 'nav.stocks', icon: Store, path: '/stocks', minLevel: 40, requiredFeature: 'inventory' },
    ],
  },
  {
    key: 'ventas',
    label: 'nav.group.ventas',
    items: [
      { key: 'customers', label: 'nav.customers', icon: UserCog, path: '/customers', minLevel: 40 },
      { key: 'pos', label: 'nav.pos', icon: ShoppingCart, path: '/pos', minLevel: 40 },
      { key: 'accountsReceivable', label: 'nav.accountsReceivable', icon: HandCoins, path: '/accounts-receivable', minLevel: 40, requiredFeature: 'sales' },
      { key: 'cashRegisters', label: 'nav.cashRegisters', icon: Banknote, path: '/cash-registers', minLevel: 60 },
    ],
  },
  {
    key: 'reports',
    label: 'nav.group.reports',
    items: [
      { key: 'reports', label: 'nav.reports', icon: BarChart3, path: '/reports', minLevel: 40 },
    ],
  },
  {
    key: 'admin',
    label: 'nav.group.admin',
    items: [
      { key: 'users', label: 'nav.users', icon: Users, path: '/users', minLevel: 60 },
      { key: 'companies', label: 'nav.companies', icon: Building2, path: '/companies', minLevel: 100 },
      { key: 'roles', label: 'nav.roles', icon: ShieldCheck, path: '/roles', minLevel: 100 },
      { key: 'adminOrganizations', label: 'nav.adminOrganizations', icon: Building2, path: '/admin/organizations', minLevel: 90 },
      { key: 'adminUsers', label: 'nav.adminUsers', icon: Users, path: '/admin/users', minLevel: 90 },
      { key: 'adminPlans', label: 'nav.adminPlans', icon: CreditCard, path: '/admin/plans', minLevel: 90 },
      { key: 'adminInvites', label: 'nav.adminInvites', icon: Mail, path: '/admin/invites', minLevel: 90 },
      { key: 'adminApprovals', label: 'nav.adminApprovals', icon: AlertCircle, path: '/admin/approvals', minLevel: 100 },
      { key: 'adminSubscriptionPayments', label: 'nav.adminSubscriptionPayments', icon: CreditCard, path: '/admin/subscription-payments', minLevel: 90 },
    ],
  },
  {
    key: 'config',
    label: 'nav.group.config',
    items: [
      { key: 'settings', label: 'nav.settings', icon: Settings, path: '/settings', minLevel: 60 },
      { key: 'shortcuts', label: 'nav.shortcuts', icon: Keyboard, path: '/settings/shortcuts', minLevel: 40 },
      { key: 'payments', label: 'nav.payments', icon: Wallet, path: '/settings/payments', minLevel: 60 },
      { key: 'transactions', label: 'nav.transactions', icon: ArrowLeftRight, path: '/settings/payments/transactions', minLevel: 40 },
      { key: 'billing', label: 'nav.billing', icon: CreditCard, path: '/billing', minLevel: 40 },
      { key: 'syncConflicts', label: 'nav.syncConflicts', icon: AlertCircle, path: '/settings/sync/conflicts', minLevel: 60 },
    ],
  },
];

export const navigationConfig: NavItem[] = navigationGroups.flatMap((g) => g.items);
