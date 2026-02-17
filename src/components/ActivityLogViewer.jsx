import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/apiClient';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { cn, fmtDate, fmtTime } from '@/lib/utils';
import {
  FileText, Receipt, Users, Package, Shield, Settings, DollarSign,
  Loader2, Pencil, Bug, X, Copy, Check,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const ENTITY_TYPES = [
  { value: '', label: 'All' },
  { value: 'quote', label: 'Quotes' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'client', label: 'Clients' },
  { value: 'product', label: 'Products' },
  { value: 'user', label: 'Users' },
  { value: 'settings', label: 'Settings' },
  { value: 'payment', label: 'Payments' },
  { value: 'error', label: 'Errors' },
];

const TIME_RANGES = [
  { value: '', label: 'All time' },
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

const ENTITY_ICONS = {
  quote: FileText,
  invoice: Receipt,
  client: Users,
  product: Package,
  user: Shield,
  settings: Settings,
  payment: DollarSign,
  error: Bug,
};

const ACTION_LABELS = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  approved: 'Approved',
  rejected: 'Rejected',
  settings_changed: 'Changed',
  emailed: 'Emailed',
  imported: 'Imported',
  frontend_error: 'Error',
};

const ACTION_DOT_COLORS = {
  created: 'bg-emerald-400',
  updated: 'bg-blue-400',
  deleted: 'bg-red-400',
  approved: 'bg-emerald-400',
  rejected: 'bg-red-400',
  settings_changed: 'bg-amber-400',
  emailed: 'bg-violet-400',
  imported: 'bg-cyan-400',
  frontend_error: 'bg-red-500',
};

const PAGE_SIZE = 20;

function formatTimestamp(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  // Under 1 hour: relative
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  // Same year: "Jan 5, 2:30 PM"
  const sameYear = date.getFullYear() === now.getFullYear();
  return fmtDate(dateString, {
    month: 'short',
    day: 'numeric',
    ...(!sameYear && { year: 'numeric' }),
  }) + ', ' + fmtTime(dateString, { hour: 'numeric', minute: '2-digit' });
}

export default function ActivityLogViewer() {
  const navigate = useNavigate();
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [timeRange, setTimeRange] = useState('');
  const [page, setPage] = useState(0);
  const [errorDetail, setErrorDetail] = useState(null);
  const [copied, setCopied] = useState(false);

  // Compute startDate from time range
  const startDate = useMemo(() => {
    if (!timeRange) return undefined;
    const d = new Date();
    d.setDate(d.getDate() - parseInt(timeRange));
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [timeRange]);

  const queryFilters = { entityType: entityTypeFilter, timeRange, page };

  const { data: result, isLoading } = useQuery({
    queryKey: queryKeys.activityLog.list(queryFilters),
    queryFn: async () => {
      const params = { page: String(page), pageSize: String(PAGE_SIZE) };
      if (entityTypeFilter) params.entityType = entityTypeFilter;
      if (startDate) params.startDate = startDate;
      return api.get('/activity-log', params);
    },
    placeholderData: keepPreviousData,
  });

  const entries = result?.data ?? [];
  const total = result?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Reset to page 0 when filters change
  const handleFilterChange = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const handleEntityClick = (entry) => {
    if (entry.action === 'deleted' || !entry.entityId) return;
    switch (entry.entityType) {
      case 'quote':
        navigate(`/quotes/${entry.entityId}`);
        break;
      case 'invoice':
        navigate(`/invoices/${entry.entityId}`);
        break;
      case 'client':
        navigate('/clients/' + entry.entityId);
        break;
      default:
        break;
    }
  };

  const isClickable = (entry) =>
    entry.action !== 'deleted' && entry.entityId && ['quote', 'invoice', 'client'].includes(entry.entityType);

  return (
    <div className="space-y-3">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Entity type filter */}
        <div className="flex gap-1 flex-wrap">
          {ENTITY_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => handleFilterChange(setEntityTypeFilter)(type.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                entityTypeFilter === type.value
                  ? "bg-accent text-accent-foreground"
                  : "text-surface-500 hover:text-surface-700 hover:bg-surface-100"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-surface-200 hidden sm:block" />

        {/* Time range filter */}
        <div className="flex gap-1">
          {TIME_RANGES.map(range => (
            <button
              key={range.value}
              onClick={() => handleFilterChange(setTimeRange)(range.value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                timeRange === range.value
                  ? "bg-surface-200 text-surface-800"
                  : "text-surface-500 hover:text-surface-700 hover:bg-surface-100"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-surface-500 text-sm">
            No activity found.
          </div>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th className="w-[18%]">Time</th>
                <th className="w-[38%]">Action</th>
                <th className="w-[22%]">User</th>
                <th className="w-[22%] hidden md:table-cell">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const EntityIcon = ENTITY_ICONS[entry.entityType] || Settings;
                const label = ACTION_LABELS[entry.action] || entry.action;
                const dotColor = ACTION_DOT_COLORS[entry.action] || 'bg-surface-500';
                const clickable = isClickable(entry);

                const isError = entry.entityType === 'error';
                const rowClickable = clickable || isError;

                return (
                  <tr
                    key={entry.id}
                    className={cn("group", rowClickable && "cursor-pointer")}
                    onClick={() => {
                      if (isError) setErrorDetail(entry);
                      else if (clickable) handleEntityClick(entry);
                    }}
                  >
                    {/* Time */}
                    <td>
                      <span className="text-surface-400 text-xs whitespace-nowrap tabular-nums">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </td>

                    {/* Action + entity */}
                    <td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative flex-shrink-0">
                          <EntityIcon className="w-3.5 h-3.5 text-surface-500" />
                          <span className={cn("absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-black/40", dotColor)} />
                        </div>
                        <span className="text-surface-400 flex-shrink-0">{label}</span>
                        {entry.entityLabel ? (
                          isError ? (
                            <span className="text-red-600 truncate">{entry.entityLabel}</span>
                          ) : clickable ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEntityClick(entry); }}
                              className="text-surface-700 hover:text-accent truncate transition-colors"
                            >
                              {entry.entityLabel}
                            </button>
                          ) : (
                            <span className="text-surface-400 truncate">{entry.entityLabel}</span>
                          )
                        ) : null}
                        {!entry.entityLabel && (
                          <span className="text-surface-500 truncate">{entry.entityType}</span>
                        )}
                      </div>
                    </td>

                    {/* User */}
                    <td>
                      <span className="text-surface-500 truncate block">{entry.userDisplayName}</span>
                    </td>

                    {/* Details */}
                    <td className="hidden md:table-cell">
                      {entry.details ? (
                        <span className="text-surface-500 truncate block text-xs">{entry.details}</span>
                      ) : (
                        <span className="text-surface-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination footer */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="First page"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2 text-surface-400 tabular-nums">
              {page + 1} / {totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-surface-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Last page"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {/* Error detail dialog */}
      <Dialog open={!!errorDetail} onOpenChange={(open) => { if (!open) { setErrorDetail(null); setCopied(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-surface-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <Bug className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Error Details</h3>
                <p className="text-[11px] text-surface-400">
                  {errorDetail?.userDisplayName} · {errorDetail ? formatTimestamp(errorDetail.createdAt) : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (!errorDetail) return;
                const text = `${errorDetail.entityLabel}\n\n${errorDetail.details || ''}`;
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-surface-500 hover:text-surface-700 hover:bg-surface-100 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Error message */}
            <div>
              <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1.5">Message</p>
              <p className="text-sm text-red-600 font-medium">{errorDetail?.entityLabel}</p>
            </div>
            {/* Stack trace + URL */}
            {errorDetail?.details && (
              <div>
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1.5">Stack Trace</p>
                <pre className="text-xs text-surface-600 bg-surface-50 border border-surface-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {errorDetail.details}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
