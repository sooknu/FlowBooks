import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/hooks/useAppData';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/lib/apiClient';
import {
  Plus, ArrowRight, ArrowUpRight, Aperture, Camera, Briefcase,
  Users, FileText, Receipt, Banknote, Wallet,
} from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import { useProjectTypes, COLOR_PALETTE } from '@/lib/projectTypes';

// ── Animation ────────────────────────────────────────────────────

const ease = [0.22, 1, 0.36, 1];

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.05 } } },
  item: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
  },
};

// ── Helpers ──────────────────────────────────────────────────────

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const fmtFull = (v) =>
  `$${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const todayStr = () =>
  fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' });

// ── Shared ───────────────────────────────────────────────────────

const card = 'content-card p-5 sm:p-6';

// ── Subcomponents ────────────────────────────────────────────────

const BigNumber = ({ value, label, size = 'default', tint, colorClass, breakdown }) => (
  <div className={cn('dash-fin', tint && `dash-fin--${tint}`)}>
    <p className={cn('dash-fin__value', size === 'hero' && 'dash-fin__value--hero', colorClass && `dash-fin__value--${colorClass}`)}>{value}</p>
    <p className="dash-fin__label">{label}</p>
    {breakdown && (
      <div className="dash-fin__breakdown">
        {breakdown.map((item, i) => (
          <div key={i} className="dash-fin__sub">
            <p className="dash-fin__sub-value">{item.value}</p>
            <p className="dash-fin__sub-label">{item.label}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

const STAT_ICONS = {
  Projects: Briefcase, Clients: Users, Quotes: FileText, Invoices: Receipt,
};

const StatCard = ({ label, value, onClick }) => {
  const Icon = STAT_ICONS[label] || Briefcase;
  return (
    <button onClick={onClick} className="content-card dash-stat">
      <div className="dash-stat__icon"><Icon /></div>
      <div className="dash-stat__body">
        <p className="dash-stat__value">{value}</p>
        <p className="dash-stat__label">{label}</p>
      </div>
    </button>
  );
};

const STATUS_STYLE = {
  lead: { label: 'Lead', color: 'text-surface-500', dot: 'bg-surface-400' },
  booked: { label: 'Booked', color: 'text-blue-500', dot: 'bg-blue-500' },
  shooting: { label: 'Shooting', color: 'text-rose-500', dot: 'bg-rose-500' },
  editing: { label: 'Editing', color: 'text-amber-500', dot: 'bg-amber-500' },
  delivered: { label: 'Delivered', color: 'text-emerald-500', dot: 'bg-emerald-500' },
  completed: { label: 'Completed', color: 'text-emerald-500', dot: 'bg-emerald-500' },
};

/** Normalize an upcomingProject object into the gig shape that GigCard expects */
const projectToGig = (p) => ({
  id: p.id,
  projectId: p.id,
  projectTitle: p.title,
  projectStatus: p.status,
  projectType: p.projectType,
  projectTypeId: p.projectTypeId,
  projectTypeLabel: p.projectTypeLabel,
  shootStartDate: p.shootStartDate,
  shootEndDate: p.shootEndDate,
  location: p.location,
  clientName: p.clientName,
  role: null,
});


const GigCard = ({ gig, onClick, getTypeColor }) => {
  const d = gig.shootStartDate ? new Date(gig.shootStartDate) : null;
  const endD = gig.shootEndDate ? new Date(gig.shootEndDate) : null;
  const daysAway = d ? Math.ceil((d - new Date()) / 86400000) : null;
  const isFuture = daysAway !== null && daysAway >= 0;
  const style = STATUS_STYLE[gig.projectStatus] || STATUS_STYLE.lead;
  const typeColor = getTypeColor(gig.projectTypeId || gig.projectType);

  const formatDateRange = () => {
    if (!d) return null;
    const opts = { month: 'short', day: 'numeric' };
    if (endD && endD.getTime() !== d.getTime()) {
      return `${fmtDate(gig.shootStartDate, opts)} – ${fmtDate(gig.shootEndDate, opts)}`;
    }
    return fmtDate(gig.shootStartDate, { ...opts, weekday: 'short' });
  };

  const dateStr = formatDateRange();
  const meta = [gig.clientName, gig.location].filter(Boolean);

  return (
    <button onClick={onClick} className="event-card-row group" data-status={gig.projectStatus || 'lead'}>
      <div className="event-card-row__body">
        <div className="event-card-row__header">
          <span className="event-card-row__title">{gig.projectTitle || 'Untitled Project'}</span>
        </div>

        <div className="event-card-row__meta">
          {gig.projectTypeLabel && (
            <span className={cn('event-card-row__pill', typeColor.pill)}>{gig.projectTypeLabel}</span>
          )}
          {meta.map((item, i) => (
            <span key={i} className="event-card-row__chip">{item}</span>
          ))}
        </div>
      </div>

      {d ? (
        <div className="event-card-row__date">
          <span className="event-card-row__date-month">{fmtDate(gig.shootStartDate, { month: 'short' })}</span>
          <span className="event-card-row__date-day">{d.getDate()}</span>
          <span className="event-card-row__date-year">{d.getFullYear()}</span>
        </div>
      ) : (
        <div className="event-card-row__date event-card-row__date--empty">
          <Camera className="w-4 h-4 text-muted-foreground" />
        </div>
      )}

      {/* Desktop-only: date range + status + countdown */}
      <div className="event-card-row__details">
        {dateStr && <span className="event-card-row__date-text">{dateStr}</span>}
        <span className={cn('event-card-row__status', style.color)}>{style.label}</span>
        {isFuture && daysAway !== null && (
          <span className="event-card-row__countdown">{daysAway === 0 ? 'Today' : `${daysAway}d away`}</span>
        )}
      </div>
    </button>
  );
};

const DocRow = ({ number, clientName, total, status, onClick }) => (
  <button onClick={onClick} className="dash-doc-row group">
    <span className="dash-doc-row__number">#{String(number).padStart(5, '0')}</span>
    <span className="dash-doc-row__name">{clientName || 'No Client'}</span>
    {status && (
      <span className={cn(
        'dash-doc-row__status',
        status === 'paid' ? 'text-emerald-400' : status === 'partial' ? 'text-amber-400' : 'text-orange-400',
      )}>{status}</span>
    )}
    <span className="dash-doc-row__total">${parseFloat(total).toFixed(2)}</span>
    <ArrowUpRight className="dash-doc-row__arrow" />
  </button>
);

const SectionLabel = ({ children, action }) => (
  <div className="dash-section">
    <h3 className="dash-section__title">{children}</h3>
    {action}
  </div>
);

const ViewAllLink = ({ onClick }) => (
  <button onClick={onClick} className="dash-section__action group/link">
    View all <ArrowRight className="w-3 h-3 group-hover/link:translate-x-0.5 transition-transform" />
  </button>
);

// ── Personal Stats (compact / prominent) ─────────────────────────

const PersonalStatsCard = ({ stats, compact }) => {
  const navigate = useNavigate();
  const hasAdvance = stats.advancesEnabled && (stats.advanceBalance || 0) > 0;
  const hasSalary = stats.salaryEnabled && (stats.salaryBalance || 0) > 0;

  return (
    <div className={card}>
      <SectionLabel>My earnings</SectionLabel>

      {compact ? (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 mt-3">
          <div>
            <p className="text-lg font-bold tabular-nums leading-none">{fmtFull(stats.myEarnings)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Earned</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums leading-none">{fmtFull(stats.myPending)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Pending</p>
          </div>
          {hasAdvance && (
            <button onClick={() => navigate('/finance')} className="hover:opacity-70 transition-opacity text-left">
              <p className="text-lg font-bold tabular-nums leading-none text-amber-600">{fmtFull(stats.advanceBalance)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Advance owed</p>
            </button>
          )}
          {hasSalary && (
            <button onClick={() => navigate('/salary')} className="hover:opacity-70 transition-opacity text-left">
              <p className="text-lg font-bold tabular-nums leading-none text-red-500">{fmtFull(stats.salaryBalance)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Salary owed</p>
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-8 sm:gap-12 mt-3">
            <BigNumber value={fmtFull(stats.myEarnings)} label="Total earned" />
            <BigNumber value={fmtFull(stats.myPending)} label="Pending payment" />
          </div>

          {(hasAdvance || hasSalary) && (
            <div className="space-y-2 mt-5 pt-5 border-t border-surface-100">
              {hasAdvance && (
                <button
                  onClick={() => navigate('/finance')}
                  className="content-card__row flex items-center gap-3 py-3 px-4 w-full text-left hover:bg-surface-100/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Banknote className="w-4 h-4 text-surface-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-700">Outstanding advance</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-amber-600 shrink-0">{fmtFull(stats.advanceBalance)}</p>
                </button>
              )}
              {hasSalary && (
                <button
                  onClick={() => navigate('/salary')}
                  className="content-card__row flex items-center gap-3 py-3 px-4 w-full text-left hover:bg-surface-100/60 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-surface-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-700">Salary owed to you</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-red-500 shrink-0">{fmtFull(stats.salaryBalance)}</p>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Daily Verse ─────────────────────────────────────────────────

const VERSES = [
  // ── Psalms ────────────────────────────────────────────────────
  'Psalm 1:1-3', 'Psalm 4:8', 'Psalm 5:3', 'Psalm 9:1-2', 'Psalm 16:11',
  'Psalm 18:2', 'Psalm 19:1', 'Psalm 19:14', 'Psalm 20:4', 'Psalm 23:1-3',
  'Psalm 23:4', 'Psalm 23:6', 'Psalm 25:4-5', 'Psalm 27:1', 'Psalm 27:4',
  'Psalm 27:13-14', 'Psalm 28:7', 'Psalm 29:11', 'Psalm 30:5', 'Psalm 31:24',
  'Psalm 32:8', 'Psalm 33:4-5', 'Psalm 34:4', 'Psalm 34:8', 'Psalm 34:18',
  'Psalm 37:4', 'Psalm 37:5', 'Psalm 37:23-24', 'Psalm 40:1-2', 'Psalm 42:11',
  'Psalm 46:1', 'Psalm 46:10', 'Psalm 51:10', 'Psalm 55:22', 'Psalm 56:3-4',
  'Psalm 62:1-2', 'Psalm 63:1', 'Psalm 66:16-17', 'Psalm 68:19', 'Psalm 71:14',
  'Psalm 73:26', 'Psalm 84:11', 'Psalm 86:5', 'Psalm 90:12', 'Psalm 91:1-2',
  'Psalm 91:11', 'Psalm 94:19', 'Psalm 95:1-2', 'Psalm 96:1-2', 'Psalm 100:4-5',
  'Psalm 103:1-2', 'Psalm 103:11-12', 'Psalm 107:1', 'Psalm 112:7', 'Psalm 118:6',
  'Psalm 118:24', 'Psalm 119:11', 'Psalm 119:105', 'Psalm 119:114', 'Psalm 121:1-2',
  'Psalm 126:3', 'Psalm 127:1', 'Psalm 130:5', 'Psalm 133:1', 'Psalm 138:8',
  'Psalm 139:14', 'Psalm 143:8', 'Psalm 145:18', 'Psalm 147:3',
  // ── Proverbs ──────────────────────────────────────────────────
  'Proverbs 2:6', 'Proverbs 3:3-4', 'Proverbs 3:5-6', 'Proverbs 3:9-10',
  'Proverbs 4:23', 'Proverbs 10:22', 'Proverbs 11:25', 'Proverbs 12:25',
  'Proverbs 13:12', 'Proverbs 14:26', 'Proverbs 15:1', 'Proverbs 15:13',
  'Proverbs 16:3', 'Proverbs 16:9', 'Proverbs 17:22', 'Proverbs 18:10',
  'Proverbs 19:21', 'Proverbs 22:6', 'Proverbs 27:17', 'Proverbs 31:25',
  // ── Isaiah ────────────────────────────────────────────────────
  'Isaiah 12:2', 'Isaiah 25:1', 'Isaiah 26:3', 'Isaiah 30:15', 'Isaiah 33:2',
  'Isaiah 35:4', 'Isaiah 40:8', 'Isaiah 40:29', 'Isaiah 40:31', 'Isaiah 41:10',
  'Isaiah 41:13', 'Isaiah 43:2', 'Isaiah 43:18-19', 'Isaiah 44:22', 'Isaiah 49:15-16',
  'Isaiah 53:5', 'Isaiah 54:10', 'Isaiah 54:17', 'Isaiah 55:8-9', 'Isaiah 55:12',
  'Isaiah 58:11', 'Isaiah 60:1', 'Isaiah 61:1', 'Isaiah 64:4', 'Isaiah 65:24',
  // ── Jeremiah ──────────────────────────────────────────────────
  'Jeremiah 1:5', 'Jeremiah 17:7-8', 'Jeremiah 29:11', 'Jeremiah 29:13',
  'Jeremiah 31:3', 'Jeremiah 32:17', 'Jeremiah 33:3',
  // ── Other OT ──────────────────────────────────────────────────
  'Genesis 1:27', 'Exodus 14:14', 'Deuteronomy 7:9', 'Deuteronomy 31:6',
  'Deuteronomy 31:8', 'Joshua 1:9', 'Joshua 24:15', '1 Samuel 16:7',
  'Nehemiah 8:10', 'Ecclesiastes 3:1', 'Ecclesiastes 3:11', 'Ecclesiastes 4:9-10',
  'Lamentations 3:22-23', 'Lamentations 3:25', 'Daniel 2:21', 'Micah 6:8',
  'Habakkuk 3:17-18', 'Zephaniah 3:17', 'Nahum 1:7', 'Malachi 3:10',
  // ── Matthew ───────────────────────────────────────────────────
  'Matthew 5:6', 'Matthew 5:8', 'Matthew 5:9', 'Matthew 5:14-16', 'Matthew 6:25-26',
  'Matthew 6:33', 'Matthew 7:7', 'Matthew 7:12', 'Matthew 11:28', 'Matthew 11:29-30',
  'Matthew 17:20', 'Matthew 19:26', 'Matthew 22:37-39', 'Matthew 28:20',
  // ── Mark / Luke ───────────────────────────────────────────────
  'Mark 9:23', 'Mark 10:27', 'Mark 11:24', 'Luke 1:37', 'Luke 1:78-79',
  'Luke 6:31', 'Luke 6:38', 'Luke 11:9-10', 'Luke 12:32',
  // ── John ──────────────────────────────────────────────────────
  'John 1:5', 'John 3:16', 'John 8:12', 'John 8:32', 'John 10:10',
  'John 10:27-28', 'John 13:34-35', 'John 14:1', 'John 14:6', 'John 14:27',
  'John 15:5', 'John 15:12', 'John 16:33',
  // ── Romans ────────────────────────────────────────────────────
  'Romans 5:1-2', 'Romans 5:3-4', 'Romans 5:8', 'Romans 6:23', 'Romans 8:1',
  'Romans 8:18', 'Romans 8:26', 'Romans 8:28', 'Romans 8:31', 'Romans 8:37-39',
  'Romans 10:17', 'Romans 12:2', 'Romans 12:9-10', 'Romans 12:12', 'Romans 15:13',
  // ── 1 & 2 Corinthians ────────────────────────────────────────
  '1 Corinthians 2:9', '1 Corinthians 10:13', '1 Corinthians 13:4-5',
  '1 Corinthians 13:7', '1 Corinthians 13:13', '1 Corinthians 15:58',
  '1 Corinthians 16:13', '2 Corinthians 1:3-4', '2 Corinthians 4:16-17',
  '2 Corinthians 4:18', '2 Corinthians 5:7', '2 Corinthians 5:17',
  '2 Corinthians 9:8', '2 Corinthians 12:9', '2 Corinthians 12:10',
  // ── Galatians / Ephesians ─────────────────────────────────────
  'Galatians 2:20', 'Galatians 5:22-23', 'Galatians 6:9',
  'Ephesians 2:8-9', 'Ephesians 2:10', 'Ephesians 3:16-17', 'Ephesians 3:20',
  'Ephesians 4:2-3', 'Ephesians 6:10-11',
  // ── Philippians / Colossians ──────────────────────────────────
  'Philippians 1:6', 'Philippians 2:3-4', 'Philippians 2:13', 'Philippians 3:13-14',
  'Philippians 4:4-5', 'Philippians 4:6-7', 'Philippians 4:8', 'Philippians 4:13',
  'Philippians 4:19', 'Colossians 3:2', 'Colossians 3:12', 'Colossians 3:14',
  'Colossians 3:15', 'Colossians 3:23',
  // ── 1 & 2 Thessalonians / Timothy / Titus ─────────────────────
  '1 Thessalonians 5:11', '1 Thessalonians 5:16-18', '2 Thessalonians 3:3',
  '1 Timothy 4:12', '1 Timothy 6:6', '2 Timothy 1:7', '2 Timothy 2:15',
  '2 Timothy 3:16-17', 'Titus 3:4-5',
  // ── Hebrews ───────────────────────────────────────────────────
  'Hebrews 4:16', 'Hebrews 10:23', 'Hebrews 10:35-36', 'Hebrews 11:1',
  'Hebrews 11:6', 'Hebrews 12:1-2', 'Hebrews 13:5-6', 'Hebrews 13:8',
  // ── James ─────────────────────────────────────────────────────
  'James 1:2-3', 'James 1:5', 'James 1:12', 'James 1:17', 'James 4:8',
  'James 4:10', 'James 5:16',
  // ── 1 & 2 Peter ───────────────────────────────────────────────
  '1 Peter 2:9', '1 Peter 3:15', '1 Peter 4:10', '1 Peter 5:6-7', '1 Peter 5:10',
  '2 Peter 1:3', '2 Peter 3:9',
  // ── 1 John / Jude / Revelation ────────────────────────────────
  '1 John 1:9', '1 John 3:1', '1 John 4:4', '1 John 4:7-8', '1 John 4:18',
  '1 John 5:4', 'Jude 1:24-25', 'Revelation 3:20', 'Revelation 21:4',
  // ── Additional ────────────────────────────────────────────────
  'Numbers 6:24-26', 'Ruth 1:16', '2 Chronicles 7:14', '2 Chronicles 15:7',
  'Job 19:25', 'Song of Solomon 2:11-12', 'Hosea 6:3', 'Joel 2:25',
  'Amos 5:24', 'Jonah 2:2', 'Zechariah 4:6', 'Psalm 8:1', 'Psalm 36:5-6',
  'Psalm 48:14', 'Psalm 57:10', 'Psalm 65:11', 'Psalm 85:10-11', 'Psalm 92:1-2',
  'Psalm 104:24', 'Psalm 115:1', 'Psalm 116:1-2', 'Psalm 146:5-6',
  'Psalm 150:6', 'Proverbs 8:11', 'Proverbs 20:24', 'Proverbs 24:16',
  'Isaiah 6:8', 'Isaiah 9:6', 'Isaiah 46:4', 'Isaiah 48:17',
];

const getDayOfYear = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
};

const DailyVerse = () => {
  const [verse, setVerse] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = 'daily_verse';

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.date === today && cached.text) {
        setVerse(cached);
        return;
      }
    } catch {}

    const ref = VERSES[getDayOfYear() % VERSES.length];
    fetch(`https://bible-api.com/${encodeURIComponent(ref)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.text) return;
        const clean = data.text.replace(/\n/g, ' ').trim();
        const entry = { date: today, text: clean, reference: data.reference };
        setVerse(entry);
        try { localStorage.setItem(cacheKey, JSON.stringify(entry)); } catch {}
      })
      .catch(() => {});
  }, []);

  if (!verse) return null;

  return (
    <motion.div
      variants={stagger.item}
      className="text-center py-8 max-w-lg mx-auto"
    >
      <p className="text-[13px] leading-relaxed text-surface-400 italic">
        "{verse.text}"
      </p>
      <p className="text-[11px] text-surface-300 mt-2 tracking-wide">
        {verse.reference}
      </p>
    </motion.div>
  );
};

// ── Main Dashboard (unified) ────────────────────────────────────

const VIEW_TO_PATH = {
  quotes: '/quotes', invoices: '/invoices', clients: '/clients',
  settings: '/settings', projects: '/projects',
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userProfile, can } = useAppData();

  const { getTypeColor } = useProjectTypes();

  const { data: stats, isLoading } = useQuery({
    queryKey: queryKeys.stats.dashboard(),
    queryFn: () => api.get('/stats/dashboard'),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] gap-3">
        <Aperture className="w-8 h-8 text-muted-foreground animate-spin" style={{ animationDuration: '3s' }} />
      </div>
    );
  }

  const userName = userProfile?.displayName || userProfile?.firstName || user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  // Data presence gates (backend only sends what the user is permitted to see)
  const hasFinancials = stats?.totalRevenue !== undefined;
  const hasCounts = stats?.clientsCount !== undefined;
  const hasTeamMember = stats?.hasTeamMember;
  const showCompactPersonal = hasFinancials; // compact if they can see the big financial hero
  const showActionButtons = can('edit_quotes') || can('edit_invoices');

  // Financials
  const totalRevenue = stats?.totalRevenue || 0;
  const grossSales = stats?.grossSales || 0;
  const pendingPayments = stats?.pendingPayments || 0;
  const totalExpenses = stats?.totalExpenses || 0;
  const businessExpenses = stats?.businessExpenses || 0;
  const teamPaymentExpenses = stats?.teamPaymentExpenses || 0;
  const totalCredits = stats?.totalCredits || 0;
  const customerPayments = stats?.customerPayments || 0;
  const otherIncome = stats?.otherIncome || 0;
  const totalPaidSalary = stats?.totalPaidSalary || 0;
  const profit = totalCredits - totalExpenses - totalPaidSalary;
  const salaryByMember = stats?.salaryByMember || [];

  // Entity counts
  const countStats = hasCounts ? [
    { label: 'Projects', value: stats.projectsCount, view: 'projects' },
    { label: 'Clients', value: stats.clientsCount, view: 'clients' },
    { label: 'Quotes', value: stats.quotesCount, view: 'quotes' },
    { label: 'Invoices', value: stats.invoicesCount, view: 'invoices' },
  ] : [];

  // Upcoming projects (admin-style)
  const upcomingProjects = stats?.upcomingProjects || [];

  // Recent docs
  const recentQuotes = stats?.recentQuotes || [];
  const recentInvoices = stats?.recentInvoices || [];
  const hasRecentDocs = recentQuotes.length > 0 || recentInvoices.length > 0;

  // My gigs (projects I'm assigned to as a team member)
  const myAssignments = stats?.myAssignments || [];
  const now = new Date();
  const upcomingGigs = myAssignments.filter(a => a.shootStartDate && new Date(a.shootStartDate) >= now);
  const recentGigs = [...myAssignments].sort((a, b) => {
    const da = a.shootStartDate ? new Date(a.shootStartDate) : new Date(0);
    const db_ = b.shootStartDate ? new Date(b.shootStartDate) : new Date(0);
    return db_ - da;
  });

  return (
    <motion.div className="space-y-5" variants={stagger.container} initial="initial" animate="animate">
      {/* 1. Greeting hero */}
      <motion.div variants={stagger.item}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight">
              {greeting()}, {userName}
            </h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">{todayStr()}</p>
          </div>
          {showActionButtons && (
            <div className="flex items-center gap-2.5 flex-wrap sm:mt-1">
              {can('edit_quotes') && (
                <button onClick={() => navigate('/quotes')} className="action-btn">
                  <Plus className="action-btn__icon" /> New Quote
                </button>
              )}
              {can('edit_invoices') && (
                <button onClick={() => navigate('/invoices')} className="action-btn">
                  <Plus className="action-btn__icon" /> New Invoice
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* 2. Financial hero */}
      {hasFinancials && (
        <motion.div variants={stagger.item} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="content-card">
              <BigNumber
                value={fmtFull(profit)}
                label="Net profit"
                size="hero"
                tint={profit < 0 ? 'red' : profit > 0 ? 'green' : 'neutral'}
                colorClass={profit < 0 ? 'red' : profit > 0 ? 'green' : ''}
              />
            </div>
            <button className="content-card text-left w-full cursor-pointer hover:ring-1 hover:ring-surface-200 transition-shadow" onClick={() => navigate('/projects?financial=balanceOwed')}>
              <BigNumber
                value={fmtFull(pendingPayments)}
                label="Awaiting payment"
                tint={pendingPayments > 0 ? 'red' : 'neutral'}
                colorClass={pendingPayments > 0 ? 'red' : ''}
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="content-card">
              <BigNumber
                value={fmtFull(totalCredits)}
                label="Revenue collected"
                tint="green"
                colorClass="green"
                breakdown={[
                  { value: fmtFull(customerPayments), label: 'Payments' },
                  { value: fmtFull(otherIncome), label: 'Other' },
                ]}
              />
            </div>
            <button className="content-card text-left w-full cursor-pointer hover:ring-1 hover:ring-surface-200 transition-shadow" onClick={() => navigate('/expenses')}>
              <BigNumber
                value={fmtFull(totalExpenses)}
                label="Total expenses"
                tint={totalExpenses > 0 ? 'red' : 'neutral'}
                colorClass={totalExpenses > 0 ? 'red' : ''}
                breakdown={[
                  { value: fmtFull(businessExpenses), label: 'Expenses' },
                  { value: fmtFull(teamPaymentExpenses), label: 'Team' },
                ]}
              />
            </button>
          </div>
        </motion.div>
      )}

      {/* 3. Salary owed */}
      {salaryByMember.length > 0 && (
        <motion.div variants={stagger.item} className={card}>
          <SectionLabel action={<ViewAllLink onClick={() => navigate('/salary')} />}>
            Salary owed
          </SectionLabel>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 mt-3">
            {salaryByMember.map(m => (
              <button key={m.name} onClick={() => navigate('/salary')} className="dash-salary-row">
                <p className="dash-salary-row__value">{fmtFull(m.owed)}</p>
                <p className="dash-salary-row__name">{m.name}</p>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* 4. Personal stats */}
      {hasTeamMember && (
        <motion.div variants={stagger.item}>
          <PersonalStatsCard stats={stats} compact={showCompactPersonal} />
        </motion.div>
      )}

      {/* 5. Entity counts */}
      {hasCounts && (
        <motion.div variants={stagger.item}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {countStats.map(stat => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                onClick={() => navigate(VIEW_TO_PATH[stat.view] || `/${stat.view}`)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* 6. Upcoming shoots (admin-style) */}
      {upcomingProjects.length > 0 && (
        <motion.div variants={stagger.item}>
          <SectionLabel action={<ViewAllLink onClick={() => navigate('/projects')} />}>
            Upcoming shoots
          </SectionLabel>
          <div className="grid gap-2.5 mt-2">
            {upcomingProjects.map(project => (
              <GigCard
                key={project.id}
                gig={projectToGig(project)}
                getTypeColor={getTypeColor}
                onClick={() => navigate(`/projects/${project.id}`)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* 7. My gigs (anyone with teamMemberId) */}
      {hasTeamMember && myAssignments.length > 0 && (
        <>
          {upcomingGigs.length > 0 && (
            <motion.div variants={stagger.item}>
              <SectionLabel>Upcoming gigs</SectionLabel>
              <div className="grid gap-2.5 mt-2">
                {upcomingGigs.slice(0, 5).map(gig => (
                  <GigCard key={gig.id} gig={gig} getTypeColor={getTypeColor} onClick={() => navigate(`/projects/${gig.projectId}`)} />
                ))}
              </div>
            </motion.div>
          )}

          <motion.div variants={stagger.item}>
            <SectionLabel action={<ViewAllLink onClick={() => navigate('/projects?mine=true')} />}>
              My recent projects
            </SectionLabel>
            {recentGigs.length > 0 ? (
              <div className="grid gap-2.5 mt-2">
                {recentGigs.slice(0, 5).map(gig => (
                  <GigCard key={gig.id} gig={gig} getTypeColor={getTypeColor} onClick={() => navigate(`/projects/${gig.projectId}`)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">No projects yet</p>
            )}
          </motion.div>
        </>
      )}

      {/* 8. Recent quotes + invoices */}
      {hasRecentDocs && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recentQuotes.length > 0 && (
            <motion.div variants={stagger.item} className={card}>
              <SectionLabel action={<ViewAllLink onClick={() => navigate('/quotes')} />}>
                Recent quotes
              </SectionLabel>
              <div>
                {recentQuotes.map(q => (
                  <DocRow
                    key={q.id}
                    number={q.quoteNumber}
                    clientName={q.clientName}
                    total={q.total}
                    onClick={() => navigate(`/quotes/${q.id}`)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {recentInvoices.length > 0 && (
            <motion.div variants={stagger.item} className={card}>
              <SectionLabel action={<ViewAllLink onClick={() => navigate('/invoices')} />}>
                Recent invoices
              </SectionLabel>
              <div>
                {recentInvoices.map(inv => (
                  <DocRow
                    key={inv.id}
                    number={inv.invoiceNumber}
                    clientName={inv.clientName}
                    total={inv.total}
                    status={inv.status}
                    onClick={() => navigate('/invoices', { state: { invoiceToLoad: inv } })}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* 9. Daily verse */}
      <DailyVerse />
    </motion.div>
  );
};

export default Dashboard;
