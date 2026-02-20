import React, { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, Users, Receipt,
  PieChart, ArrowUpRight, ChevronLeft,
  RefreshCw, Briefcase, UserCheck, Wallet,
  ArrowRight,
} from 'lucide-react';
import api from '@/lib/apiClient';
import { cn } from '@/lib/utils';

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];
const ML = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  { id: 'cash-flow', title: 'Cash Flow', icon: Wallet, accent: '#14b8a6', section: 'Financial' },
  { id: 'revenue-by-type', title: 'Revenue by Type', icon: Briefcase, accent: '#6366f1', section: 'Financial' },
  { id: 'top-clients', title: 'Top Clients', icon: Users, accent: '#3b82f6', section: 'Clients' },
  { id: 'client-profitability', title: 'Client Profitability', icon: TrendingUp, accent: '#10b981', section: 'Clients' },
  { id: 'repeat-clients', title: 'Repeat Clients', icon: UserCheck, accent: '#8b5cf6', section: 'Clients' },
  { id: 'income-summary', title: 'Income Summary', icon: DollarSign, accent: '#22c55e', section: 'Tax & Summary' },
  { id: 'expenses-by-category', title: 'Expenses by Category', icon: PieChart, accent: '#f59e0b', section: 'Tax & Summary' },
  { id: 'outstanding-balances', title: 'Outstanding Balances', icon: Receipt, accent: '#ef4444', section: 'Tax & Summary' },
];
const SECTIONS = ['Financial', 'Clients', 'Tax & Summary'];

// ── Card Data Extractors ─────────────────────────────
function cardData(id, r) {
  const pl = r.profitLoss || {};
  const rt = r.revenueTrend || {};
  const cf = r.cashFlow || {};
  switch (id) {
    case 'profit-loss': return { headline: fmt(pl.netProfit), label: 'Net Profit', sub: `${fmt(pl.totalRevenue)} rev · ${fmt((pl.totalExpenses||0)+(pl.totalTeamCosts||0)+(pl.totalSalary||0))} costs` };
    case 'revenue-trend': return { headline: fmt(rt.totalWithCredits), label: 'Total Income', sub: `${fmt(rt.total)} invoices · ${fmt((rt.totalWithCredits||0)-(rt.total||0))} credits` };
    case 'cash-flow': return { headline: fmt(cf.net), label: 'Net Cash Flow', sub: `${fmt(cf.totalIn)} in · ${fmt(cf.totalOut)} out` };
    case 'revenue-by-type': { const t = (r.revenueByType||[])[0]; return { headline: t?.typeLabel || '—', label: 'Top Type', sub: t ? `${fmt(t.revenue)} · ${t.count} projects` : 'No data' }; }
    case 'top-clients': { const c = (r.topClients||[])[0]; return { headline: c?.name || '—', label: 'Top Client', sub: c ? `${fmt(c.totalPaid)} paid` : 'No data' }; }
    case 'client-profitability': { const c = (r.clientProfitability||[])[0]; return { headline: c?.name || '—', label: 'Most Profitable', sub: c ? `${fmt(c.profit)} profit` : 'No data' }; }
    case 'repeat-clients': return { headline: `${r.repeatClients?.rate||0}%`, label: 'Repeat Rate', sub: `${r.repeatClients?.repeat||0} of ${r.repeatClients?.total||0} clients` };
    case 'income-summary': return { headline: fmt(r.incomeSummary?.total), label: 'Total Income', sub: 'Invoices + project credits' };
    case 'expenses-by-category': { const cats = r.expensesByCategory||[]; return { headline: fmt(cats.reduce((s,c)=>s+c.total,0)), label: 'Total Expenses', sub: `${cats.length} categories` }; }
    case 'outstanding-balances': return { headline: fmt(r.outstanding?.total), label: 'Total Outstanding', sub: `${r.outstanding?.invoices?.length||0} invoices · ${r.outstanding?.projects?.length||0} projects` };
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
    case 'cash-flow':
      return <ChartDualBars a={(r.cashFlow?.byMonth||[]).map(m=>m.moneyIn)} b={(r.cashFlow?.byMonth||[]).map(m=>m.moneyOut)} colorA="#14b8a6" colorB="#f87171" />;
    case 'revenue-by-type':
      return <ChartHBars items={(r.revenueByType||[]).map(t=>({ value: t.revenue, color: t.color || accent }))} />;
    case 'top-clients':
      return <ChartHBars items={(r.topClients||[]).slice(0,4).map((c,i)=>({ value: c.totalPaid, color: ['#3b82f6','#60a5fa','#93c5fd','#bfdbfe'][i] }))} />;
    case 'client-profitability':
      return <ChartHBars items={(r.clientProfitability||[]).slice(0,4).map((c,i)=>({ value: Math.max(c.profit,0), color: ['#10b981','#34d399','#6ee7b7','#a7f3d0'][i] }))} />;
    case 'repeat-clients':
      return <ChartDonut value={r.repeatClients?.rate||0} color="#8b5cf6" />;
    case 'income-summary':
      return <ChartBars data={(r.incomeSummary?.byMonth||[]).map(m=>m.amount)} color="#22c55e" />;
    case 'expenses-by-category':
      return <ChartHBars items={(r.expensesByCategory||[]).map(c=>({ value: c.total, color: c.color || accent }))} />;
    case 'outstanding-balances':
      return null;
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
    case 'cash-flow': {
      const cf = r.cashFlow || {};
      const months = (cf.byMonth || []).filter(m => m.moneyIn || m.moneyOut);
      let running = 0;
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(cf.totalIn)} label="Total In" accent={accent} />
            <Metric value={fmtD(cf.totalOut)} label="Total Out" accent={accent} />
            <Metric value={fmtD(cf.net)} label="Net Cash Flow" accent={accent} />
          </div>
          <DataTable
            headers={['Month', 'Money In', 'Money Out', 'Net', 'Running']}
            rows={months.map(m => {
              running += m.moneyIn - m.moneyOut;
              return [ML[m.month-1], fmtD(m.moneyIn), fmtD(m.moneyOut), fmtD(m.moneyIn-m.moneyOut), fmtD(running)];
            })}
            footer={['Total', fmtD(cf.totalIn), fmtD(cf.totalOut), fmtD(cf.net), '']}
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
                    <span className="rpt-detail__hbar-dot" style={{ background: t.color || accent }} />
                    <span>{t.typeLabel}</span>
                  </div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((t.revenue / (types[0]?.revenue || 1)) * 100, 3)}%`, background: t.color || accent }} />
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
    case 'top-clients': {
      const clients = r.topClients || [];
      return (
        <>
          {clients.length > 0 && (
            <div className="rpt-detail__hbars">
              {clients.slice(0, 10).map((c, i) => (
                <div key={i} className="rpt-detail__hbar-row">
                  <div className="rpt-detail__hbar-label"><span>{c.name}</span></div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((c.totalPaid / (clients[0]?.totalPaid || 1)) * 100, 3)}%`, background: accent }} />
                  </div>
                  <div className="rpt-detail__hbar-value">{fmtD(c.totalPaid)}</div>
                </div>
              ))}
            </div>
          )}
          <DataTable
            headers={['Client', 'Invoiced', 'Paid', 'Invoices']}
            rows={clients.map(c => [c.name, fmtD(c.totalInvoiced), fmtD(c.totalPaid), c.projectCount])}
          />
        </>
      );
    }
    case 'client-profitability': {
      const clients = r.clientProfitability || [];
      return (
        <>
          {clients.length > 0 && (
            <div className="rpt-detail__hbars">
              {clients.slice(0, 10).map((c, i) => (
                <div key={i} className="rpt-detail__hbar-row">
                  <div className="rpt-detail__hbar-label"><span>{c.name}</span></div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((Math.max(c.profit,0) / (Math.max(clients[0]?.profit,1) || 1)) * 100, 3)}%`, background: accent }} />
                  </div>
                  <div className="rpt-detail__hbar-value">{fmtD(c.profit)}</div>
                </div>
              ))}
            </div>
          )}
          <DataTable
            headers={['Client', 'Revenue', 'Expenses', 'Profit', 'Margin']}
            rows={clients.map(c => [c.name, fmtD(c.revenue), fmtD(c.expenses), fmtD(c.profit), c.revenue > 0 ? pct((c.profit/c.revenue)*100) : '—'])}
          />
        </>
      );
    }
    case 'repeat-clients': {
      const rc = r.repeatClients || {};
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={String(rc.total || 0)} label="Total Clients" accent={accent} />
            <Metric value={String(rc.repeat || 0)} label="Repeat Clients" accent={accent} />
            <Metric value={`${rc.rate || 0}%`} label="Repeat Rate" accent={accent} />
          </div>
          <div className="rpt-detail__donut-wrap">
            <svg viewBox="0 0 120 120" className="rpt-detail__donut">
              <circle cx="60" cy="60" r="48" fill="none" stroke="rgb(var(--surface-100))" strokeWidth="12" />
              <circle cx="60" cy="60" r="48" fill="none" stroke={accent} strokeWidth="12" opacity="0.7"
                strokeDasharray={`${(Math.min(rc.rate||0,100)/100)*2*Math.PI*48} ${2*Math.PI*48}`}
                strokeLinecap="round" transform="rotate(-90 60 60)" />
              <text x="60" y="55" textAnchor="middle" dominantBaseline="middle" fill="rgb(var(--surface-800))" fontSize="28" fontWeight="700">{rc.rate||0}%</text>
              <text x="60" y="75" textAnchor="middle" fill="rgb(var(--surface-400))" fontSize="11">repeat rate</text>
            </svg>
          </div>
          {(rc.repeatList||[]).length > 0 && (
            <div>
              <h3 className="rpt-detail__section-title">Repeat Clients ({rc.repeatList.length})</h3>
              <DataTable headers={['Client', 'Projects']} rows={rc.repeatList.map(c => [c.name, c.projectCount])} />
            </div>
          )}
          {(rc.oneTimeList||[]).length > 0 && (
            <div>
              <h3 className="rpt-detail__section-title">One-Time Clients ({rc.oneTimeList.length})</h3>
              <DataTable headers={['Client']} rows={rc.oneTimeList.map(c => [c.name])} />
            </div>
          )}
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
                    <span className="rpt-detail__hbar-dot" style={{ background: c.color || '#94a3b8' }} />
                    <span>{c.name}</span>
                  </div>
                  <div className="rpt-detail__hbar-track">
                    <div className="rpt-detail__hbar-fill" style={{ width: `${Math.max((c.total / (cats[0]?.total || 1)) * 100, 3)}%`, background: c.color || '#94a3b8' }} />
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
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color || '#94a3b8' }} />{c.name}
              </span>,
              fmtD(c.total), total > 0 ? pct((c.total/total)*100) : '—',
            ])}
            footer={['Total', fmtD(total), '100%']}
          />
        </>
      );
    }
    case 'outstanding-balances': {
      const o = r.outstanding || {};
      return (
        <>
          <div className="rpt-detail__metrics">
            <Metric value={fmtD(o.total)} label="Total Outstanding" accent={accent} />
            <Metric value={String((o.invoices||[]).length)} label="Unpaid Invoices" accent={accent} />
            <Metric value={String((o.projects||[]).length)} label="Projects with Balance" accent={accent} />
          </div>
          {(o.invoices||[]).length > 0 && (
            <div>
              <h3 className="rpt-detail__section-title">Unpaid Invoices</h3>
              <DataTable
                headers={['Invoice', 'Client', 'Total', 'Paid', 'Remaining', 'Days']}
                rows={o.invoices.map(i => [i.invoiceNumber||'—', i.clientName, fmtD(i.total), fmtD(i.paid), fmtD(i.remaining), i.daysOutstanding])}
              />
            </div>
          )}
          {(o.projects||[]).length > 0 && (
            <div>
              <h3 className="rpt-detail__section-title">Project Balances</h3>
              <DataTable
                headers={['Project', 'Price', 'Received', 'Remaining']}
                rows={o.projects.map(p => [p.title, fmtD(p.price), fmtD(p.received), fmtD(p.remaining)])}
              />
            </div>
          )}
        </>
      );
    }
    default: return <p className="text-surface-400 text-center py-8">Report not found.</p>;
  }
}

// ── Year Picker ──────────────────────────────────────
const YearPicker = ({ year, setYear }) => (
  <div className="rpt-year-picker">
    {YEARS.map(y => (
      <button key={y} onClick={() => setYear(y)} className={cn('rpt-year-btn', year === y && 'rpt-year-btn--active')}>{y}</button>
    ))}
  </div>
);

// ── Report Card ──────────────────────────────────────
function ReportCard({ report, data, year, index }) {
  const navigate = useNavigate();
  const { headline, label, sub } = cardData(report.id, data);
  const Icon = report.icon;

  return (
    <motion.button
      className="rpt-card"
      style={{ '--card-accent': report.accent, '--card-accent-bg': report.accent + '0a' }}
      onClick={() => navigate(`/reports/${report.id}?year=${year}`)}
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
function ReportDetailPage({ reportId, data, year, setYear }) {
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
          <button className="rpt-detail__back" onClick={() => navigate(`/reports?year=${year}`)}>
            <ChevronLeft className="w-4 h-4" />
            <span>Reports</span>
          </button>
          <YearPicker year={year} setYear={setYear} />
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
function ReportOverview({ data, year, setYear }) {
  return (
    <div className="rpt-page">
      <div className="rpt-page__header">
        <div>
          <h1 className="rpt-page__title">Reports</h1>
          <p className="rpt-page__subtitle">Financial insights & analytics</p>
        </div>
        <YearPicker year={year} setYear={setYear} />
      </div>

      {SECTIONS.map(section => {
        const reports = REPORTS.filter(r => r.section === section);
        return (
          <div key={section} className="rpt-section">
            <h2 className="rpt-section__label">{section}</h2>
            <div className="rpt-grid">
              {reports.map((report, i) => (
                <ReportCard key={report.id} report={report} data={data} year={year} index={i} />
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
  const year = parseInt(searchParams.get('year')) || currentYear;
  const setYear = (y) => setSearchParams({ year: y }, { replace: true });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', year],
    queryFn: () => api.get('/reports', { year }),
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
    return <ReportDetailPage reportId={reportId} data={data} year={year} setYear={setYear} />;
  }

  return <ReportOverview data={data} year={year} setYear={setYear} />;
}
