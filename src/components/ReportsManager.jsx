import React, { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, Users,
  PieChart, ArrowUpRight, ChevronLeft,
  RefreshCw, Briefcase,
  ArrowRight,
} from 'lucide-react';
import api from '@/lib/apiClient';
import { cn } from '@/lib/utils';

const currentYear = new Date().getFullYear();
const ML = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FILTERS = [
  { id: 'all', label: 'All Time' },
  { id: 'last-year', label: 'Last Year' },
  { id: 'ytd', label: 'Year to Date' },
];

function getDateParams(filter) {
  switch (filter) {
    case 'all':
      return { startDate: '2000-01-01', endDate: '2100-01-01' };
    case 'last-year':
      return { year: currentYear - 1 };
    case 'ytd':
    default: {
      const today = new Date();
      today.setDate(today.getDate() + 1);
      return { startDate: `${currentYear}-01-01`, endDate: today.toISOString().slice(0, 10) };
    }
  }
}

// Map Tailwind color names (stored in DB) to hex for inline styles
const COLOR_HEX = {
  pink: '#ec4899', blue: '#3b82f6', emerald: '#10b981', violet: '#8b5cf6',
  amber: '#f59e0b', rose: '#f43f5e', sky: '#0ea5e9', teal: '#14b8a6',
  orange: '#f97316', slate: '#64748b', indigo: '#6366f1', cyan: '#06b6d4',
};
const toHex = (c) => (c && COLOR_HEX[c]) || c || null;

const fmt = (n) => {
  if (!n && n !== 0) return '$0';
  const abs = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (abs >= 1000) return s + '$' + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return s + '$' + abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtD = (n) => {
  const v = n || 0;
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const pct = (n) => `${(n || 0).toFixed(0)}%`;

// ── Report Registry ──────────────────────────────────
const REPORTS = [
  { id: 'profit-loss', title: 'Profit & Loss', icon: TrendingUp, accent: '#10b981', section: 'Financial' },
  { id: 'revenue-trend', title: 'Revenue Trend', icon: ArrowUpRight, accent: '#3b82f6', section: 'Financial' },
  { id: 'revenue-by-type', title: 'Revenue by Type', icon: Briefcase, accent: '#6366f1', section: 'Financial' },
  { id: 'income-summary', title: 'Income Summary', icon: DollarSign, accent: '#22c55e', section: 'Tax & Summary' },
  { id: 'expenses-by-category', title: 'Expenses by Category', icon: PieChart, accent: '#f59e0b', section: 'Tax & Summary' },

  { id: 'team-payments', title: 'Team Payments', icon: Users, accent: '#f97316', section: 'Team' },
];
const SECTIONS = ['Financial', 'Tax & Summary', 'Team'];

// ── Card Data Extractors ─────────────────────────────
function cardData(id, r) {
  const pl = r.profitLoss || {};
  const rt = r.revenueTrend || {};
  switch (id) {
    case 'profit-loss': return { headline: fmt(pl.netProfit), label: 'Net Profit', sub: `${fmt(pl.totalRevenue)} rev · ${fmt((pl.totalExpenses||0)+(pl.totalTeamCosts||0)+(pl.totalSalary||0))} costs` };
    case 'revenue-trend': return { headline: fmt(rt.totalWithCredits), label: 'Total Income', sub: `${fmt(rt.total)} invoices · ${fmt((rt.totalWithCredits||0)-(rt.total||0))} credits` };
    case 'revenue-by-type': { const t = (r.revenueByType||[])[0]; return { headline: t?.typeLabel || '—', label: 'Top Type', sub: t ? `${fmt(t.revenue)} · ${t.count} projects` : 'No data' }; }
    case 'income-summary': return { headline: fmt(r.incomeSummary?.total), label: 'Total Income', sub: 'Invoices + project credits' };
    case 'expenses-by-category': { const cats = r.expensesByCategory||[]; return { headline: fmt(cats.reduce((s,c)=>s+c.total,0)), label: 'Total Expenses', sub: `${cats.length} categories` }; }

    case 'team-payments': { const tp = r.teamPaymentBreakdown||{}; return { headline: fmt(tp.totalPaid), label: 'Total Paid', sub: `${tp.memberCount||0} members · ${(tp.byMember||[]).reduce((s,m)=>s+m.jobCount,0)} jobs` }; }
    default: return { headline: '—', label: '', sub: '' };
  }
}

// ── SVG Mini Charts ──────────────────────────────────
const ChartBars = ({ data, color, h = 48 }) => {
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const w = 200, bw = w / data.length - 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="rpt-chart-svg" preserveAspectRatio="none">
      {data.map((v, i) => {
        const bh = (v / max) * h * 0.85;
        return <rect key={i} x={i*(bw+2)} y={h-bh} width={bw} height={bh} fill={color} rx={2} opacity={0.55} />;
      })}
    </svg>
  );
};

const ChartDualBars = ({ a, b, colorA, colorB, h = 48 }) => {
  if (!a?.length) return null;
  const max = Math.max(...a, ...b, 1);
  const w = 200, bw = (w / a.length - 3) / 2;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="rpt-chart-svg" preserveAspectRatio="none">
      {a.map((v, i) => {
        const ah = (v / max) * h * 0.85, bh = ((b[i]||0) / max) * h * 0.85;
        const x = i * (bw * 2 + 3);
        return (
          <g key={i}>
            <rect x={x} y={h-ah} width={bw} height={ah} fill={colorA} rx={1.5} opacity={0.6} />
            <rect x={x+bw+1} y={h-bh} width={bw} height={bh} fill={colorB} rx={1.5} opacity={0.45} />
          </g>
        );
      })}
    </svg>
  );
};

const ChartLine = ({ data, color, h = 48 }) => {
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const w = 200;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * w, y: h - (v / max) * h * 0.8 - 4 }));
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i-1].x + pts[i].x) / 2;
    path += ` C ${cx} ${pts[i-1].y}, ${cx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  const fill = path + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="rpt-chart-svg" preserveAspectRatio="none">
      <defs><linearGradient id={`lg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0.02" />
      </linearGradient></defs>
      <path d={fill} fill={`url(#lg-${color.replace('#','')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
};

const ChartHBars = ({ items, maxVal }) => {
  if (!items?.length) return null;
  const mx = maxVal || Math.max(...items.map(i => i.value), 1);
  return (
    <div className="rpt-hbar-mini">
      {items.slice(0, 4).map((item, i) => (
        <div key={i} className="rpt-hbar-mini__row">
          <div className="rpt-hbar-mini__bar" style={{ width: `${Math.max((item.value / mx) * 100, 3)}%`, background: item.color || 'rgb(var(--surface-300))' }} />
        </div>
      ))}
    </div>
  );
};

const ChartDonut = ({ value, color }) => {
  const r = 16, circ = 2 * Math.PI * r, filled = (Math.min(value, 100) / 100) * circ;
  return (
    <svg viewBox="0 0 40 40" className="rpt-donut-mini">
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgb(var(--surface-100))" strokeWidth="5" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(-90 20 20)" opacity="0.7" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" fill="rgb(var(--surface-700))"
        fontSize="10" fontWeight="600">{value}%</text>
    </svg>
  );
};

// ── Card Mini Chart Selector ─────────────────────────
function CardChart({ id, r, accent }) {
  const pl = r.profitLoss?.byMonth || [];
  switch (id) {
    case 'profit-loss':
      return <ChartDualBars a={pl.map(m=>m.revenue)} b={pl.map(m=>m.expenses+m.teamCosts+m.salary)} colorA="#10b981" colorB="#f87171" />;
    case 'revenue-trend':
      return <ChartLine data={(r.revenueTrend?.byMonth||[]).map(m=>m.invoiceRevenue+m.creditRevenue)} color="#3b82f6" />;
    case 'revenue-by-type':
      return <ChartHBars items={(r.revenueByType||[]).map(t=>({ value: t.revenue, color: toHex(t.color) || accent }))} />;
    case 'income-summary':
      return <ChartBars data={(r.incomeSummary?.byMonth||[]).map(m=>m.amount)} color="#22c55e" />;
    case 'expenses-by-category':
      return <ChartHBars items={(r.expensesByCategory||[]).map(c=>({ value: c.total, color: toHex(c.color) || accent }))} />;
    case 'team-payments':
      return <ChartBars data={r.teamPaymentBreakdown?.byMonth||[]} color="#f97316" />;
    default: return null;
  }
}

// ── Data Table ───────────────────────────────────────
const DataTable = ({ headers, rows, footer }) => (
  <div className="rpt-table-wrap">
    <table className="rpt-table">
      <thead><tr>{headers.map((h,i) => <th key={i} className={i > 0 ? 'text-right' : ''}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell,j) => <td key={j} className={j > 0 ? 'text-right tabular-nums' : ''}>{cell}</td>)}</tr>
        ))}
      </tbody>
      {footer && <tfoot><tr>{footer.map((cell,i) => <td key={i} className={cn('font-semibold', i > 0 && 'text-right tabular-nums')}>{cell}</td>)}</tr></tfoot>}
    </table>
  </div>
);

// ── Metric Card ──────────────────────────────────────
const Metric = ({ value, label, accent }) => (
  <div className="rpt-metric" style={{ '--metric-accent': accent }}>
    <div className="rpt-metric__value">{value}</div>
    <div className="rpt-metric__label">{label}</div>
  </div>
);

// ── Detail Page Renderers ────────────────────────────
function DetailContent({ id, r, accent }) {
  switch (id) {
    case 'profit-loss': {
      const pl = r.profitLoss || {};
      const months = (pl.byMonth || []).filter(m => m.revenue || m.expenses || m.teamCosts || m.salary);
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(pl.totalRevenue)} label="Revenue" accent={accent} />
            <Metric value={fmtD(pl.totalExpenses)} label="Expenses" accent={accent} />
            <Metric value={fmtD(pl.totalTeamCosts)} label="Team Costs" accent={accent} />
            <Metric value={fmtD(pl.totalSalary)} label="Salary" accent={accent} />
          </div>
          <DataTable
            headers={['Month', 'Revenue', 'Expenses', 'Team', 'Salary', 'Net']}
            rows={months.map(m => [ML[m.month-1], fmtD(m.revenue), fmtD(m.expenses), fmtD(m.teamCosts), fmtD(m.salary), fmtD(m.revenue-m.expenses-m.teamCosts-m.salary)])}
            footer={['Total', fmtD(pl.totalRevenue), fmtD(pl.totalExpenses), fmtD(pl.totalTeamCosts), fmtD(pl.totalSalary), fmtD(pl.netProfit)]}
          />
        </>
      );
    }
    case 'revenue-trend': {
      const rt = r.revenueTrend || {};
      const months = (rt.byMonth || []).filter(m => m.invoiceRevenue || m.creditRevenue);
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(rt.total)} label="Invoice Revenue" accent={accent} />
            <Metric value={fmtD((rt.totalWithCredits||0)-(rt.total||0))} label="Credit Revenue" accent={accent} />
            <Metric value={fmtD(rt.totalWithCredits)} label="Total Income" accent={accent} />
          </div>
          <DataTable
            headers={['Month', 'Invoice Revenue', 'Credits', 'Total']}
            rows={months.map(m => [ML[m.month-1], fmtD(m.invoiceRevenue), fmtD(m.creditRevenue), fmtD(m.invoiceRevenue+m.creditRevenue)])}
            footer={['Total', fmtD(rt.total), fmtD((rt.totalWithCredits||0)-(rt.total||0)), fmtD(rt.totalWithCredits)]}
          />
        </>
      );
    }
    case 'revenue-by-type': {
      const types = r.revenueByType || [];
      const total = types.reduce((s,t) => s + t.revenue, 0);
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(total)} label="Total Revenue" accent={accent} />
            <Metric value={String(types.length)} label="Project Types" accent={accent} />
            <Metric value={String(types.reduce((s,t) => s + t.count, 0))} label="Total Projects" accent={accent} />
          </div>
          {types.length > 0 && (
            <div className="rpt-detail__hbars">
              {types.map((t, i) => (
                <div key={i} className="rpt-detail__hbar-row">
                  <div className="rpt-detail__hbar-label">
                    <span className="rpt-detail__hbar-dot" style={{ background: toHex(t.color) || accent }} />
                    <span>{t.typeLabel}</span>
                  </div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((t.revenue / (types[0]?.revenue || 1)) * 100, 3)}%`, background: toHex(t.color) || accent }} />
                  </div>
                  <div className="rpt-detail__hbar-value">{fmtD(t.revenue)}</div>
                </div>
              ))}
            </div>
          )}
          <DataTable
            headers={['Project Type', 'Revenue', 'Projects', 'Avg / Project']}
            rows={types.map(t => [t.typeLabel, fmtD(t.revenue), t.count, fmtD(t.count > 0 ? t.revenue / t.count : 0)])}
          />
        </>
      );
    }
    case 'income-summary': {
      const is = r.incomeSummary || {};
      const months = (is.byMonth || []).filter(m => m.amount > 0);
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(is.total)} label="Total Income" accent={accent} />
            <Metric value={fmtD(months.length > 0 ? is.total / months.length : 0)} label="Monthly Average" accent={accent} />
          </div>
          <DataTable
            headers={['Month', 'Income']}
            rows={months.map(m => [ML[m.month-1], fmtD(m.amount)])}
            footer={['Total', fmtD(is.total)]}
          />
        </>
      );
    }
    case 'expenses-by-category': {
      const cats = r.expensesByCategory || [];
      const total = cats.reduce((s,c) => s + c.total, 0);
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(total)} label="Total Expenses" accent={accent} />
            <Metric value={String(cats.length)} label="Categories" accent={accent} />
          </div>
          {cats.length > 0 && (
            <div className="rpt-detail__hbars">
              {cats.map((c, i) => (
                <div key={i} className="rpt-detail__hbar-row">
                  <div className="rpt-detail__hbar-label">
                    <span className="rpt-detail__hbar-dot" style={{ background: toHex(c.color) || '#94a3b8' }} />
                    <span>{c.name}</span>
                  </div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((c.total / (cats[0]?.total || 1)) * 100, 3)}%`, background: toHex(c.color) || '#94a3b8' }} />
                  </div>
                  <div className="rpt-detail__hbar-value">{fmtD(c.total)}</div>
                </div>
              ))}
            </div>
          )}
          <DataTable
            headers={['Category', 'Total', '% of Total']}
            rows={cats.map(c => [
              <span key={c.categoryId} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: toHex(c.color) || '#94a3b8' }} />{c.name}
              </span>,
              fmtD(c.total), total > 0 ? pct((c.total/total)*100) : '—',
            ])}
            footer={['Total', fmtD(total), '100%']}
          />
        </>
      );
    }
    case 'team-payments': {
      const tp = r.teamPaymentBreakdown || {};
      const members = tp.byMember || [];
      const methods = tp.byMethod || [];
      const totalJobs = members.reduce((s, m) => s + m.jobCount, 0);
      const methodTotal = methods.reduce((s, m) => s + m.total, 0);
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(tp.totalPaid)} label="Total Paid" accent={accent} />
            <Metric value={String(tp.memberCount || 0)} label="Team Members" accent={accent} />
            <Metric value={String(totalJobs)} label="Total Jobs" accent={accent} />
            <Metric value={fmtD(totalJobs > 0 ? tp.totalPaid / totalJobs : 0)} label="Avg per Job" accent={accent} />
          </div>
          {members.length > 0 && (
            <div className="rpt-detail__hbars">
              {members.map((m, i) => (
                <div key={i} className="rpt-detail__hbar-row">
                  <div className="rpt-detail__hbar-label">
                    <span>{m.name}</span>
                  </div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((m.totalPaid / (members[0]?.totalPaid || 1)) * 100, 3)}%`, background: accent }} />
                  </div>
                  <div className="rpt-detail__hbar-value">{fmtD(m.totalPaid)}</div>
                </div>
              ))}
            </div>
          )}
          <DataTable
            headers={['Member', 'Role', 'Total Paid', 'Jobs', 'Avg / Job']}
            rows={members.map(m => [m.name, m.role, fmtD(m.totalPaid), m.jobCount, fmtD(m.avgPerJob)])}
            footer={['Total', '', fmtD(tp.totalPaid), totalJobs, fmtD(totalJobs > 0 ? tp.totalPaid / totalJobs : 0)]}
          />
          {methods.length > 0 && (
            <div>
              <h3 className="rpt-detail__section-title">By Payment Method</h3>
              <DataTable
                headers={['Method', 'Total', '% of Total']}
                rows={methods.map(m => [m.method, fmtD(m.total), methodTotal > 0 ? pct((m.total / methodTotal) * 100) : '—'])}
                footer={['Total', fmtD(methodTotal), '100%']}
              />
            </div>
          )}
        </>
      );
    }
    default: return <p className="text-surface-400 text-center py-8">Report not found.</p>;
  }
}

// ── Filter Picker ────────────────────────────────────
const FilterPicker = ({ filter, setFilter }) => (
  <div className="rpt-year-picker">
    {FILTERS.map(f => (
      <button key={f.id} onClick={() => setFilter(f.id)} className={cn('rpt-year-btn', filter === f.id && 'rpt-year-btn--active')}>{f.label}</button>
    ))}
  </div>
);

// ── Report Card ──────────────────────────────────────
function ReportCard({ report, data, filter, index }) {
  const navigate = useNavigate();
  const { headline, label, sub } = cardData(report.id, data);
  const Icon = report.icon;

  return (
    <motion.button
      className="rpt-card"
      style={{ '--card-accent': report.accent, '--card-accent-bg': report.accent + '0a' }}
      onClick={() => navigate(`/reports/${report.id}?filter=${filter}`)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <div className="rpt-card__top">
        <div className="rpt-card__icon-wrap">
          <Icon className="w-4 h-4" />
        </div>
        <span className="rpt-card__title">{report.title}</span>
        <ArrowRight className="rpt-card__arrow w-3.5 h-3.5" />
      </div>
      <div className="rpt-card__body">
        <div className="rpt-card__headline">{headline}</div>
        <div className="rpt-card__label">{label}</div>
      </div>
      <div className="rpt-card__chart">
        <CardChart id={report.id} r={data} accent={report.accent} />
      </div>
      <div className="rpt-card__sub">{sub}</div>
    </motion.button>
  );
}

// ── Detail Page ──────────────────────────────────────
function ReportDetailPage({ reportId, data, filter, setFilter }) {
  const navigate = useNavigate();
  const report = REPORTS.find(r => r.id === reportId);
  if (!report) return <p className="text-center py-8 text-surface-400">Report not found.</p>;

  const { headline, label } = cardData(report.id, data);
  const Icon = report.icon;

  return (
    <div className="rpt-page">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        {/* Header */}
        <div className="rpt-detail__header">
          <button className="rpt-detail__back" onClick={() => navigate(`/reports?filter=${filter}`)}>
            <ChevronLeft className="w-4 h-4" />
            <span>Reports</span>
          </button>
          <FilterPicker filter={filter} setFilter={setFilter} />
        </div>

        {/* Hero */}
        <div className="rpt-detail__hero" style={{ '--card-accent': report.accent, '--card-accent-bg': report.accent + '08' }}>
          <div className="rpt-detail__hero-icon">
            <Icon className="w-5 h-5" />
          </div>
          <h1 className="rpt-detail__hero-title">{report.title}</h1>
          <div className="rpt-detail__hero-headline">{headline}</div>
          <div className="rpt-detail__hero-label">{label}</div>
        </div>

        {/* Content */}
        <div className="rpt-detail__content">
          <DetailContent id={reportId} r={data} accent={report.accent} />
        </div>
      </motion.div>
    </div>
  );
}

// ── Overview Page ────────────────────────────────────
function ReportOverview({ data, filter, setFilter }) {
  return (
    <div className="rpt-page">
      <div className="rpt-page__header">
        <div>
          <h1 className="rpt-page__title">Reports</h1>
          <p className="rpt-page__subtitle">Financial insights & analytics</p>
        </div>
        <FilterPicker filter={filter} setFilter={setFilter} />
      </div>

      {SECTIONS.map(section => {
        const reports = REPORTS.filter(r => r.section === section);
        return (
          <div key={section} className="rpt-section">
            <h2 className="rpt-section__label">{section}</h2>
            <div className="rpt-grid">
              {reports.map((report, i) => (
                <ReportCard key={report.id} report={report} data={data} filter={filter} index={i} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────
export default function ReportsManager() {
  const { reportId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'ytd';
  const setFilter = (f) => setSearchParams({ filter: f }, { replace: true });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', filter],
    queryFn: () => api.get('/reports', getDateParams(filter)),
  });

  if (error) {
    const is403 = error?.status === 403;
    return (
      <div className="rpt-page">
        <div className="text-center py-20 text-surface-500">
          {is403 ? 'You do not have permission to view financial reports.' : `Unable to load reports: ${error?.message || 'Unknown error'}`}
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="rpt-page">
        <div className="flex items-center justify-center gap-3 py-20">
          <RefreshCw className="w-5 h-5 animate-spin text-surface-400" />
          <span className="text-surface-400 text-sm">Loading reports...</span>
        </div>
      </div>
    );
  }

  if (reportId) {
    return <ReportDetailPage reportId={reportId} data={data} filter={filter} setFilter={setFilter} />;
  }

  return <ReportOverview data={data} filter={filter} setFilter={setFilter} />;
}
