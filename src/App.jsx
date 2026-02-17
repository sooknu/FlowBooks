import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  FolderKanban, CreditCard, FileCheck,
  Wallet, BarChart3,
} from 'lucide-react';
import AccountVerified from '@/components/AccountVerified';
import AuthGuard from '@/components/AuthGuard';
import AdminGuard from '@/components/AdminGuard';
import AppLayout from '@/components/AppLayout';
import ComingSoon from '@/components/ComingSoon';

// Lazy-loaded views
const Dashboard = React.lazy(() => import('@/components/Dashboard'));
const ClientsManager = React.lazy(() => import('@/components/ClientsManager'));
const ClientProfile = React.lazy(() => import('@/components/ClientProfile'));
const QuotesManager = React.lazy(() => import('@/components/QuotesManager'));
const InvoicesManager = React.lazy(() => import('@/components/InvoicesManager'));
const ProductsManager = React.lazy(() => import('@/components/ProductsManager'));
const ProfileManager = React.lazy(() => import('@/components/ProfileManager'));
const QuoteApprovalPage = React.lazy(() => import('@/components/QuoteApprovalPage'));
const PayOnlinePage = React.lazy(() => import('@/components/PayOnlinePage'));

// Settings sub-views
const SettingsLayout = React.lazy(() => import('@/components/SettingsLayout'));
const GeneralSettings = React.lazy(() => import('@/components/GeneralSettings'));
const CategoriesSettings = React.lazy(() => import('@/components/CategoriesSettings'));
const PaymentGatewayManager = React.lazy(() => import('@/components/PaymentGatewayManager'));
const EmailManager = React.lazy(() => import('@/components/EmailManager'));
const ActivityLogViewer = React.lazy(() => import('@/components/ActivityLogViewer'));
const TeamManager = React.lazy(() => import('@/components/TeamManager'));
const ProjectsManager = React.lazy(() => import('@/components/ProjectsManager'));
const ProjectDetail = React.lazy(() => import('@/components/ProjectDetail'));
const CalendarView = React.lazy(() => import('@/components/CalendarView'));
const ExpensesManager = React.lazy(() => import('@/components/ExpensesManager'));
const FinanceManager = React.lazy(() => import('@/components/FinanceManager'));
const SalaryManager = React.lazy(() => import('@/components/SalaryManager'));
const PermissionsManager = React.lazy(() => import('@/components/PermissionsManager'));
const BackupManager = React.lazy(() => import('@/components/BackupManager'));

const LazyFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const Lazy = ({ children }) => <Suspense fallback={<LazyFallback />}>{children}</Suspense>;

function App() {
  return (
    <Routes>
      {/* Public routes — no sidebar, no auth */}
      <Route path="/approve/:token" element={<Lazy><QuoteApprovalPage /></Lazy>} />
      <Route path="/pay/:token" element={<Lazy><PayOnlinePage /></Lazy>} />
      <Route path="/verified" element={<AccountVerified />} />

      {/* Auth boundary */}
      <Route element={<AuthGuard />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Lazy><Dashboard /></Lazy>} />

          {/* Projects */}
          <Route path="/projects" element={<Lazy><ProjectsManager /></Lazy>} />
          <Route path="/projects/:id" element={<Lazy><ProjectDetail /></Lazy>} />
          <Route path="/calendar" element={<Lazy><CalendarView /></Lazy>} />

          {/* Sales */}
          <Route path="/quotes" element={<Lazy><QuotesManager /></Lazy>} />
          <Route path="/quotes/:id" element={<Lazy><QuotesManager /></Lazy>} />
          <Route path="/invoices" element={<Lazy><InvoicesManager /></Lazy>} />
          <Route path="/invoices/:id" element={<Lazy><InvoicesManager /></Lazy>} />
          <Route path="/payments" element={<ComingSoon title="Payments" icon={CreditCard} description="Track all incoming payments across invoices." />} />
          <Route path="/contracts" element={<ComingSoon title="Contracts" icon={FileCheck} description="Create and manage client contracts and agreements." />} />

          {/* Management */}
          <Route path="/clients" element={<Lazy><ClientsManager /></Lazy>} />
          <Route path="/clients/:id" element={<Lazy><ClientProfile /></Lazy>} />
          <Route path="/services" element={<Lazy><ProductsManager /></Lazy>} />
          <Route path="/expenses" element={<Lazy><ExpensesManager /></Lazy>} />

          {/* Finance */}
          <Route path="/finance" element={<Lazy><FinanceManager /></Lazy>} />
          <Route path="/salary" element={<Lazy><SalaryManager /></Lazy>} />
          <Route path="/reports" element={<ComingSoon title="Reports" icon={BarChart3} description="Revenue reports, tax summaries, and business insights." />} />

          {/* Profile */}
          <Route path="/profile" element={<Lazy><ProfileManager /></Lazy>} />

          {/* Team (owner + manager — component handles its own role check) */}
          <Route path="/team" element={<Lazy><TeamManager /></Lazy>} />

          {/* Admin routes */}
          <Route element={<AdminGuard />}>
            <Route path="/permissions" element={<Lazy><PermissionsManager /></Lazy>} />
            <Route path="/activity" element={<Lazy><ActivityLogViewer /></Lazy>} />
            <Route path="/settings" element={<Lazy><SettingsLayout /></Lazy>}>
              <Route index element={<Navigate to="/settings/general" replace />} />
              <Route path="general" element={<Lazy><GeneralSettings /></Lazy>} />
              <Route path="categories" element={<Lazy><CategoriesSettings /></Lazy>} />
              <Route path="payments" element={<Lazy><PaymentGatewayManager /></Lazy>} />
              <Route path="email" element={<Lazy><EmailManager /></Lazy>} />
              <Route path="backup" element={<Lazy><BackupManager /></Lazy>} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
