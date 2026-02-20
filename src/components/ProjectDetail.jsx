import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTabScroll } from '@/hooks/useTabScroll';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, useMotionValue, animate, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/lib/apiClient';
import { cn, fmtDate, fmtTime, tzDate } from '@/lib/utils';
import { useUpdateProject, useCreateProjectNote, useUpdateProjectNote, useDeleteProjectNote, useDeleteProjectPermanently } from '@/hooks/useMutations';
import {
  ChevronLeft, ChevronDown, MapPin, Calendar, User2,
  FileText, Receipt, StickyNote, LayoutDashboard, Send,
  Loader2, Trash2, DollarSign, CreditCard,
  Users, Plus, Pencil, TrendingUp, Package, Wallet, ArrowUpDown,
  Clock, Upload, File, Image, ExternalLink, X,
} from 'lucide-react';
import { useAppData, useSettings } from '@/hooks/useAppData';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateAssignment, useDeleteAssignment, useUpdateAssignment, useCreateTeamPayment, useUpdateTeamPayment, useDeleteTeamPayment, useCreateExpense, useUpdateExpense, useDeleteExpense } from '@/hooks/useMutations';
import ExpenseFormDialog from '@/components/ExpenseFormDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useProjectTypes } from '@/lib/projectTypes';
import { toast } from '@/components/ui/use-toast';
import { useProjectRoles } from '@/lib/projectRoles';
import { TEAM_ROLE_LABELS } from '@/lib/teamRoles';

const formatCurrency = (amount) => '$' + (parseFloat(amount) || 0).toFixed(2);
const formatDocNumber = (num) => '#' + String(num).padStart(5, '0');

function formatDate(d) {
  if (!d) return '—';
  return fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = tzDate(startDate);
  const e = tzDate(endDate);
  if (s.toDateString() === e.toDateString()) return null; // same day — not a range
  const days = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  let range;
  if (sameMonth) {
    range = `${fmtDate(startDate, { month: 'short' })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  } else if (sameYear) {
    range = `${fmtDate(startDate, { month: 'short', day: 'numeric' })} – ${fmtDate(endDate, { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
  } else {
    range = `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  return { range, days };
}

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatTimeRange(startTime, endTime) {
  if (!startTime) return null;
  if (endTime) return `${formatTime12(startTime)} – ${formatTime12(endTime)}`;
  return formatTime12(startTime);
}

const PROJECT_STATUSES = [
  { value: 'lead', label: 'Lead' },
  { value: 'booked', label: 'Booked' },
  { value: 'shooting', label: 'Shooting' },
  { value: 'editing', label: 'Editing' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS = {
  lead: 'text-surface-500',
  booked: 'text-blue-400',
  shooting: 'text-rose-400',
  editing: 'text-amber-400',
  delivered: 'text-emerald-400',
  completed: 'text-emerald-400',
  archived: 'text-surface-400',
};

const STATUS_BADGE_STYLES = {
  lead: { dot: 'bg-surface-400', bg: 'bg-surface-100', text: 'text-surface-400', ring: 'ring-surface-200' },
  booked: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-500', ring: 'ring-blue-200' },
  shooting: { dot: 'bg-rose-500 animate-pulse', bg: 'bg-rose-50', text: 'text-rose-500', ring: 'ring-rose-200' },
  editing: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-500', ring: 'ring-amber-200' },
  delivered: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-500', ring: 'ring-emerald-200' },
  completed: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-500', ring: 'ring-emerald-200' },
  archived: { dot: 'bg-surface-400', bg: 'bg-surface-100', text: 'text-surface-400', ring: 'ring-surface-200' },
};

const invoiceStatusColors = {
  paid: 'chip--success',
  partial: 'chip--warning',
  pending: 'chip--danger',
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'expenses', label: 'Expenses', icon: Wallet },
  { key: 'notes', label: 'Notes', icon: StickyNote },
];


// ─── Financial Card ──────────────────────────────────────────────────────────

const FinancialCard = ({ label, value, icon: Icon, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="content-card project-details p-4"
  >
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-surface-100">
        <Icon className="w-4 h-4 text-surface-400" />
      </div>
      <div>
        <p className="text-surface-400 text-xs">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  </motion.div>
);

// ─── Overview Tab ────────────────────────────────────────────────────────────

const OverviewTab = ({ project, isPrivileged, canSeePrices }) => {
  const navigate = useNavigate();
  const invoices = project.invoices || [];
  const expenses = project.expenses || [];

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
  const totalCredits = expenses.filter(e => e.type === 'credit').reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalCosts = expenses.filter(e => e.type !== 'credit').reduce((sum, e) => sum + (e.amount || 0), 0);

  const hasProjectPrice = project.projectPrice != null;
  const projectPrice = hasProjectPrice ? project.projectPrice : totalInvoiced;
  const openBalance = hasProjectPrice
    ? project.projectPrice - totalCredits
    : totalInvoiced - totalPaid;
  const totalIncome = hasProjectPrice ? project.projectPrice : totalInvoiced + totalCredits;
  const shootDatePassed = project.shootStartDate && new Date(project.shootStartDate) <= new Date();
  const profit = shootDatePassed ? totalIncome - totalCosts : 0;

  return (
    <div className="space-y-5">
      {/* Financial Summary — privileged only */}
      {isPrivileged && (
        <div className="grid grid-cols-3 gap-3">
          <FinancialCard label="Project Price" value={formatCurrency(projectPrice)} icon={DollarSign} delay={0} />
          <FinancialCard label="Open Balance" value={formatCurrency(openBalance)} icon={CreditCard} delay={0.05} />
          <FinancialCard label="Profit" value={formatCurrency(profit)} icon={TrendingUp} delay={0.1} />
        </div>
      )}

      {/* Sessions Card — timeline layout for multi-session projects */}
      {project.sessions?.length > 0 && (
        <div className="content-card overflow-hidden">
          <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[rgb(var(--surface-100))]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Sessions</h3>
              <span className="text-[11px] font-medium text-surface-400 tabular-nums">{project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="px-4 py-3 sm:px-5 sm:py-4">
            <div className="relative">
              {/* Timeline line */}
              {project.sessions.length > 1 && (
                <div className="absolute left-[7px] top-[10px] bottom-[10px] w-px bg-[rgb(var(--surface-200))]" />
              )}
              <div className="space-y-0">
                {project.sessions.map((s, i) => {
                  const isPast = s.sessionDate && new Date(s.sessionDate) < new Date(new Date().toDateString());
                  const isToday = s.sessionDate && new Date(s.sessionDate).toDateString() === new Date().toDateString();
                  return (
                    <div key={s.id || i} className="flex items-start gap-3 group relative py-2.5">
                      {/* Timeline dot */}
                      <div className={cn(
                        'w-[15px] h-[15px] rounded-full border-2 flex-shrink-0 mt-0.5 relative z-10 transition-colors',
                        isToday
                          ? 'border-blue-500 bg-blue-500'
                          : isPast
                            ? 'border-[rgb(var(--surface-300))] bg-[rgb(var(--surface-300))]'
                            : 'border-[rgb(var(--surface-300))] bg-[rgb(var(--glass-bg))]',
                      )} />
                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                        <span className={cn(
                          'text-sm font-semibold truncate',
                          isPast ? 'text-surface-400' : 'text-surface-800',
                        )}>
                          {s.label || `Session ${i + 1}`}
                        </span>
                        <div className="flex items-center gap-2 text-[13px] text-surface-500">
                          <span className="tabular-nums">{formatDate(s.sessionDate)}</span>
                          {s.startTime && (
                            <>
                              <span className="text-surface-300">·</span>
                              <span className="tabular-nums text-surface-400">{formatTimeRange(s.startTime, s.endTime)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Details — Notion-style property table */}
      <div className="content-card project-details">
        {project.description && (
          <div className="project-details__description">
            <p>{project.description}</p>
          </div>
        )}
        <div className="project-details__props">
          {(() => {
            if (project.sessions?.length > 0) return null;
            const dateRange = formatDateRange(project.shootStartDate, project.shootEndDate);
            if (dateRange) return (
              <div className="project-details__prop">
                <span className="project-details__prop-label"><Calendar className="project-details__prop-icon" /> Shoot</span>
                <span className="project-details__prop-value">
                  {dateRange.range}
                  <span className="project-details__prop-hint">{dateRange.days} days</span>
                </span>
              </div>
            );
            if (project.shootStartDate) {
              const timeRange = formatTimeRange(project.shootStartTime, project.shootEndTime);
              return (
                <div className="project-details__prop">
                  <span className="project-details__prop-label"><Calendar className="project-details__prop-icon" /> Shoot</span>
                  <span className="project-details__prop-value">
                    {formatDate(project.shootStartDate)}
                    {timeRange && <span className="project-details__prop-hint">{timeRange}</span>}
                  </span>
                </div>
              );
            }
            return null;
          })()}
          {project.deliveryDate && (
            <div className="project-details__prop">
              <span className="project-details__prop-label"><Send className="project-details__prop-icon" /> Delivery</span>
              <span className="project-details__prop-value">{formatDate(project.deliveryDate)}</span>
            </div>
          )}
          {(project.location || project.addressStreet || project.addressCity) && (() => {
            const addressParts = [project.addressStreet, project.addressCity, [project.addressState, project.addressZip].filter(Boolean).join(' ')].filter(Boolean);
            const addressLine = addressParts.join(', ');
            const mapsQuery = encodeURIComponent([project.location, addressLine].filter(Boolean).join(', '));
            return (
              <div className="project-details__prop">
                <span className="project-details__prop-label"><MapPin className="project-details__prop-icon" /> Location</span>
                <span className="project-details__prop-value">
                  {project.location && <span>{project.location}</span>}
                  {project.location && addressLine && <br />}
                  {addressLine && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">
                      {addressLine}
                    </a>
                  )}
                </span>
              </div>
            );
          })()}
          {project.projectTypeRel && (
            <div className="project-details__prop">
              <span className="project-details__prop-label"><Package className="project-details__prop-icon" /> Type</span>
              <span className="project-details__prop-value">{project.projectTypeRel.label}</span>
            </div>
          )}
          {project.client && (
            <div className="project-details__prop">
              <span className="project-details__prop-label"><User2 className="project-details__prop-icon" /> Client</span>
              <span className="project-details__prop-value">
                <a onClick={() => project.client?.id && navigate(`/clients/${project.client.id}`)} style={{ cursor: 'pointer' }}>
                  {project.client.company || `${project.client.firstName || ''} ${project.client.lastName || ''}`.trim() || '—'}
                </a>
              </span>
            </div>
          )}
          <div className="project-details__prop">
            <span className="project-details__prop-label"><Clock className="project-details__prop-icon" /> Created</span>
            <span className="project-details__prop-value">{formatDate(project.createdAt)}</span>
          </div>
          {invoices.length > 0 && (
            <div className="project-details__prop">
              <span className="project-details__prop-label"><Receipt className="project-details__prop-icon" /> Invoices</span>
              <span className="project-details__prop-value">
                {invoices.length}
                <span className="project-details__prop-hint">
                  ({invoices.filter(i => i.status === 'paid').length} paid)
                </span>
              </span>
            </div>
          )}
          {(project.quotes?.length > 0) && (
            <div className="project-details__prop">
              <span className="project-details__prop-label"><FileText className="project-details__prop-icon" /> Quotes</span>
              <span className="project-details__prop-value">
                {project.quotes.length}
                <span className="project-details__prop-hint">
                  ({project.quotes.filter(q => q.approved).length} approved)
                </span>
              </span>
            </div>
          )}
          {(project.assignments?.length > 0) && (
            <div className="project-details__prop">
              <span className="project-details__prop-label"><Users className="project-details__prop-icon" /> Team</span>
              <span className="project-details__prop-value">
                {project.assignments.map(a => a.teamMember?.user?.profile?.displayName || a.teamMember?.user?.name || a.teamMember?.name).filter(Boolean).join(', ') || `${project.assignments.length} assigned`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Line Items */}
      {(() => {
        const allItems = invoices.flatMap(inv => (inv.items || []).map(item => ({ ...item, invoiceNumber: inv.invoiceNumber })));
        if (!allItems.length) return null;
        return (
          <div className="content-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-2">
              <Package className="w-3.5 h-3.5" /> Items
            </h3>
            <div className="divide-y divide-surface-100">
              {allItems.map((item, i) => (
                <div key={item.id || i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-800 truncate">{item.name}</p>
                    {item.description && <p className="text-xs text-surface-400 truncate">{item.description}</p>}
                  </div>
                  {canSeePrices && (
                    <div className="flex items-center gap-4 ml-4 shrink-0 text-sm">
                      <span className="text-surface-400 tabular-nums">×{item.qty}</span>
                      <span className="font-semibold text-surface-700 tabular-nums w-20 text-right">{formatCurrency(item.total)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {invoices.length > 1 && (
              <p className="text-[10px] text-surface-400 pt-1">Across {invoices.length} invoices</p>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// ─── Quotes Tab ──────────────────────────────────────────────────────────────

const QuotesTab = ({ quotes, navigate, isPrivileged, project }) => {
  const handleNewQuote = () => {
    navigate('/quotes', { state: { projectToPreload: { id: project.id, clientId: project.clientId } } });
  };

  return (
    <div className="space-y-2">
      {isPrivileged && (
        <div className="flex justify-end">
          <button onClick={handleNewQuote} className="action-btn text-xs !px-3 !py-2">
            <Plus className="w-3.5 h-3.5 mr-1" /> New Quote
          </button>
        </div>
      )}
      {(!quotes || quotes.length === 0) ? (
        <div className="content-card p-12 text-center">
          <FileText className="w-10 h-10 text-surface-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-surface-600 mb-1">No quotes linked</h3>
          <p className="text-surface-400 text-sm">Quotes assigned to this project will appear here.</p>
        </div>
      ) : (
        quotes.map(q => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`content-card__row p-4 transition-shadow ${isPrivileged ? 'cursor-pointer hover:shadow-md' : ''}`}
            onClick={() => isPrivileged && navigate(`/quotes/${q.id}`)}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-surface-800">{formatDocNumber(q.quoteNumber)}</span>
                {q.clientName && <span className="text-surface-400 text-sm ml-2">{q.clientName}</span>}
              </div>
              <div className="flex items-center gap-3">
                {q.approvedAt && <span className="chip chip--success text-xs">Approved</span>}
                <span className="font-semibold">{formatCurrency(q.total)}</span>
                <span className="text-xs text-surface-400">{formatDate(q.createdAt)}</span>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
};

// ─── Invoices Tab ────────────────────────────────────────────────────────────

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DOC_ICON_MAP = {
  'application/pdf': { icon: FileText, color: 'text-red-500 bg-red-50 dark:bg-red-950' },
  'image/png': { icon: Image, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950' },
  'image/jpeg': { icon: Image, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950' },
  'image/heic': { icon: Image, color: 'text-violet-500 bg-violet-50 dark:bg-violet-950' },
  'image/heif': { icon: Image, color: 'text-violet-500 bg-violet-50 dark:bg-violet-950' },
};

const isImageMime = (mime) => mime?.startsWith('image/');

const PhotoLightbox = ({ doc, docs, onClose, onNavigate }) => {
  const allImages = docs.filter(d => isImageMime(d.mimeType));
  const currentIdx = allImages.findIndex(d => d.id === doc.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < allImages.length - 1;

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(allImages[currentIdx - 1]);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(allImages[currentIdx + 1]);
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [doc.id, hasPrev, hasNext]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="photo-lightbox__overlay"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="photo-lightbox__topbar" onClick={e => e.stopPropagation()}>
        <p className="photo-lightbox__filename">{doc.originalName}</p>
        <div className="flex items-center gap-2">
          <a
            href={`/api/storage/project-docs/file/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="photo-lightbox__btn"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button onClick={onClose} className="photo-lightbox__btn" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <motion.img
        key={doc.id}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.2 }}
        src={`/api/storage/project-docs/file/${doc.id}`}
        alt={doc.originalName}
        className="photo-lightbox__img"
        onClick={e => e.stopPropagation()}
      />

      {/* Nav arrows */}
      {hasPrev && (
        <button
          className="photo-lightbox__arrow photo-lightbox__arrow--left"
          onClick={e => { e.stopPropagation(); onNavigate(allImages[currentIdx - 1]); }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {hasNext && (
        <button
          className="photo-lightbox__arrow photo-lightbox__arrow--right"
          onClick={e => { e.stopPropagation(); onNavigate(allImages[currentIdx + 1]); }}
        >
          <ChevronDown className="w-6 h-6 -rotate-90" />
        </button>
      )}

      {/* Counter */}
      {allImages.length > 1 && (
        <div className="photo-lightbox__counter">
          {currentIdx + 1} / {allImages.length}
        </div>
      )}
    </motion.div>
  );
};

const ProjectDocuments = ({ projectId, isPrivileged }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);

  const { data: docs = [] } = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn: () => api.get(`/storage/project-docs/list/${projectId}`).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/storage/project-docs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      setConfirmDelete(null);
    },
  });

  const handleUpload = useCallback(async (fileList) => {
    if (!fileList?.length) return;
    setUploading(true);
    setUploadError(null);
    const files = Array.from(fileList);
    const count = files.length;
    try {
      for (const file of files) {
        await api.upload('/storage/project-documents', file, { projectId });
      }
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      toast({ title: `${count} file${count > 1 ? 's' : ''} uploaded` });
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err?.message || 'Upload failed');
      toast({ title: 'Upload failed', description: err?.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [projectId, queryClient]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('project-docs__drop--active');
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-surface-700">Documents</h4>
        {isPrivileged && (
          <>
            <button onClick={() => fileInputRef.current?.click()} className="action-btn text-xs !px-3 !py-1.5" disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,application/pdf"
              multiple
              onChange={(e) => { handleUpload(e.target.files); }}
            />
          </>
        )}
      </div>

      {/* Error message */}
      {uploadError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400 flex-1">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          <p className="text-xs text-blue-600 dark:text-blue-400">Uploading...</p>
        </div>
      )}

      {/* Drop zone + list */}
      {docs.length === 0 && !uploading ? (
        <div
          className="project-docs__drop"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('project-docs__drop--active'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('project-docs__drop--active')}
          onDrop={handleDrop}
          onClick={() => isPrivileged && fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-surface-300 mb-2" />
          <p className="text-sm text-surface-500 font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-surface-400 mt-1">PDF, JPG, PNG, HEIC — up to 10 MB</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence>
            {docs.map(doc => {
              const mapped = DOC_ICON_MAP[doc.mimeType] || { icon: File, color: 'text-surface-500 bg-surface-100' };
              const IconComp = mapped.icon;
              const isImage = isImageMime(doc.mimeType);
              const handleDocClick = () => {
                if (isImage) {
                  setViewingDoc(doc);
                } else {
                  window.open(`/api/storage/project-docs/file/${doc.id}`, '_blank');
                }
              };
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="project-docs__item project-docs__item--clickable"
                  onClick={handleDocClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleDocClick()}
                >
                  {/* Thumbnail for images, icon for others */}
                  {isImage ? (
                    <div className="project-docs__thumb">
                      <img
                        src={`/api/storage/project-docs/file/${doc.id}`}
                        alt=""
                        className="project-docs__thumb-img"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className={cn('project-docs__icon', mapped.color)}>
                      <IconComp className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{doc.originalName}</p>
                    <p className="text-xs text-surface-400">{formatFileSize(doc.fileSize)} · {fmtDate(doc.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {isPrivileged && (
                      confirmDelete === doc.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteMutation.mutate(doc.id)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-500 text-[#C8C6C2] hover:bg-red-600 transition-colors"
                          >
                            {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="icon-button">
                            <X className="w-3.5 h-3.5 text-surface-400" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(doc.id)} className="icon-button" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Mini drop zone when documents exist */}
          {isPrivileged && (
            <div
              className="project-docs__drop project-docs__drop--mini"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('project-docs__drop--active'); }}
              onDragLeave={(e) => e.currentTarget.classList.remove('project-docs__drop--active')}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 text-surface-400" />
              <span className="text-xs text-surface-400">Add more files</span>
            </div>
          )}
        </div>
      )}

      {/* Photo lightbox */}
      <AnimatePresence>
        {viewingDoc && isImageMime(viewingDoc.mimeType) && (
          <PhotoLightbox
            doc={viewingDoc}
            docs={docs}
            onClose={() => setViewingDoc(null)}
            onNavigate={setViewingDoc}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const InvoicesTab = ({ invoices, navigate, isPrivileged, project }) => {
  const handleNewInvoice = () => {
    navigate('/invoices', { state: { projectToPreload: { id: project.id, clientId: project.clientId } } });
  };

  return (
    <div className="space-y-6">
      {/* Invoices section */}
      <div className="space-y-2">
        {isPrivileged && (
          <div className="flex justify-end">
            <button onClick={handleNewInvoice} className="action-btn text-xs !px-3 !py-2">
              <Plus className="w-3.5 h-3.5 mr-1" /> New Invoice
            </button>
          </div>
        )}
        {(!invoices || invoices.length === 0) ? (
          <div className="content-card p-12 text-center">
            <Receipt className="w-10 h-10 text-surface-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-surface-600 mb-1">No invoices linked</h3>
            <p className="text-surface-400 text-sm">Invoices assigned to this project will appear here.</p>
          </div>
        ) : (
          invoices.map(inv => {
            const paidPercent = inv.total > 0 ? Math.min(100, (inv.paidAmount / inv.total) * 100) : 0;
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`content-card__row p-4 transition-shadow ${isPrivileged ? 'cursor-pointer hover:shadow-md' : ''}`}
                onClick={() => isPrivileged && navigate(`/invoices/${inv.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-surface-800">{formatDocNumber(inv.invoiceNumber)}</span>
                    <span className={`chip ${invoiceStatusColors[inv.status] || ''} text-xs capitalize`}>{inv.status}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(inv.total)}</p>
                      <p className="text-xs text-surface-400">Paid: {formatCurrency(inv.paidAmount)}</p>
                    </div>
                    {/* Progress bar */}
                    <div className="w-20 h-1.5 rounded-full bg-surface-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${inv.status === 'paid' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${paidPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-surface-400">{formatDate(inv.createdAt)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Documents section */}
      <div className="border-t border-surface-200 pt-5">
        <ProjectDocuments projectId={project.id} isPrivileged={isPrivileged} />
      </div>
    </div>
  );
};

// ─── Notes Tab ───────────────────────────────────────────────────────────────

const NoteCard = ({ note, projectId, currentUserId, isPrivileged }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const updateNote = useUpdateProjectNote();
  const deleteNote = useDeleteProjectNote();

  const isOwn = note.userId && note.userId === currentUserId;

  const handleSave = async () => {
    if (!editContent.trim() || editContent.trim() === note.content) {
      setIsEditing(false);
      return;
    }
    try {
      await updateNote.mutateAsync({ projectId, noteId: note.id, content: editContent.trim() });
      setIsEditing(false);
    } catch { /* handled by mutation */ }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
    if (e.key === 'Escape') { setEditContent(note.content); setIsEditing(false); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="content-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="glass-textarea w-full text-sm"
                rows={3}
                autoFocus
              />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={handleSave} className="action-btn !px-2.5 !py-1 text-xs" disabled={updateNote.isPending}>
                  {updateNote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </button>
                <button onClick={() => { setEditContent(note.content); setIsEditing(false); }} className="action-btn action-btn--secondary !px-2.5 !py-1 text-xs">Cancel</button>
                <span className="text-[10px] text-surface-400 ml-auto">Ctrl+Enter to save</span>
              </div>
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center justify-end gap-2 py-1">
              <span className="text-sm text-red-500 font-medium">Delete this note?</span>
              <button
                onClick={() => { deleteNote.mutate({ projectId, noteId: note.id }); setConfirmDelete(false); }}
                className="text-xs font-medium px-2.5 py-1 rounded-md bg-red-500 text-[#C8C6C2] hover:bg-red-600 transition-colors"
              >
                {deleteNote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="action-btn action-btn--secondary !px-2.5 !py-1 text-xs">Cancel</button>
            </div>
          ) : (
            <>
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-surface-400">
                <span>{note.createdBy}</span>
                <span>&middot;</span>
                <span>{fmtDate(note.createdAt)} {fmtTime(note.createdAt)}</span>
                {note.updatedAt && <span className="italic">(edited)</span>}
              </div>
            </>
          )}
        </div>
        {!isEditing && !confirmDelete && (
          <div className="flex items-center gap-1 shrink-0">
            {isOwn && (
              <button onClick={() => setIsEditing(true)} className="icon-button" title="Edit note">
                <Pencil className="w-3.5 h-3.5 text-blue-400" />
              </button>
            )}
            {(isOwn || isPrivileged) && (
              <button onClick={() => setConfirmDelete(true)} className="icon-button" title="Delete note">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const NotesTab = ({ projectId, isPrivileged }) => {
  const [noteContent, setNoteContent] = useState('');
  const createNote = useCreateProjectNote();
  const { user } = useAuth();

  const { data: notesRes, isLoading } = useQuery({
    queryKey: queryKeys.projects.notes(projectId),
    queryFn: () => api.get(`/projects/${projectId}/notes`),
    enabled: !!projectId,
  });

  const notes = notesRes?.data || [];

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    try {
      await createNote.mutateAsync({ projectId, content: noteContent.trim() });
      setNoteContent('');
    } catch { /* handled by mutation */ }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddNote} className="content-card p-4">
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          className="glass-textarea w-full mb-3"
          rows={3}
          placeholder="Add a project note..."
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="action-btn !px-3 !py-2 text-xs"
            disabled={!noteContent.trim() || createNote.isPending}
          >
            {createNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Add Note</>}
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map(note => (
            <NoteCard key={note.id} note={note} projectId={projectId} currentUserId={user?.id} isPrivileged={isPrivileged} />
          ))}
        </div>
      ) : (
        <div className="content-card p-8 text-center">
          <StickyNote className="w-8 h-8 text-surface-500 mx-auto mb-2" />
          <p className="text-surface-400 text-sm">No notes yet. Add one above.</p>
        </div>
      )}
    </div>
  );
};

// ─── Swipeable Payment Row ───────────────────────────────────────────────────

const PAYMENT_SWIPE_THRESHOLD = -120;

const SwipeablePaymentRow = ({ payment: p, index: i, isPrivileged, getMemberName, formatCurrency, formatDate, onEdit, onDelete }) => {
  const x = useMotionValue(0);

  const cardContent = (
    <div className="content-card__row p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-medium">{getMemberName(p)}</p>
          <p className="text-xs text-surface-400">{formatDate(p.paymentDate)}{p.paymentMethod ? ` · ${p.paymentMethod}` : ''}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`text-sm font-bold ${p.status === 'paid' ? 'text-emerald-400' : 'text-amber-400'}`}>{formatCurrency(p.amount)}</span>
        <span className={`chip text-xs ${p.status === 'paid' ? 'chip--success' : 'chip--warning'}`}>{p.status}</span>
        {isPrivileged && (
          <div className="hidden md:flex items-center gap-3">
            <button onClick={onEdit} className="icon-button" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="icon-button">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!isPrivileged) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
        {cardContent}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
      className="relative overflow-hidden rounded-xl md:overflow-visible">
      {/* Swipe actions behind */}
      <div className="absolute inset-0 flex items-stretch justify-end rounded-xl md:hidden">
        <button onClick={(e) => { e.stopPropagation(); animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 }); onEdit(); }}
          className="flex items-center justify-center w-[60px] bg-blue-500 text-[#C8C6C2]">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 }); onDelete(); }}
          className="flex items-center justify-center w-[60px] bg-red-500 text-[#C8C6C2]">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <motion.div
        className="relative z-10 swipe-card"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: PAYMENT_SWIPE_THRESHOLD, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < PAYMENT_SWIPE_THRESHOLD / 2) {
            animate(x, PAYMENT_SWIPE_THRESHOLD, { type: 'spring', stiffness: 300, damping: 30 });
          } else {
            animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
          }
        }}
      >
        {cardContent}
      </motion.div>
    </motion.div>
  );
};

// ─── Team Tab ───────────────────────────────────────────────────────────────

const TeamTab = ({ project, projectId, isPrivileged }) => {
  const { roles: assignmentRoles } = useProjectRoles();
  const [assignDialog, setAssignDialog] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [editAssignment, setEditAssignment] = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [assignForm, setAssignForm] = useState({ teamMemberId: '', role: '', daysWorked: '', hoursWorked: '', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ teamMemberId: '', amount: '', paymentDate: '', paymentMethod: '', status: 'paid', notes: '', advanceRepayment: '', salaryDeduction: '' });

  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();
  const createPayment = useCreateTeamPayment();
  const updatePayment = useUpdateTeamPayment();
  const deletePayment = useDeleteTeamPayment();

  const { data: teamList = [] } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data),
    enabled: isPrivileged,
  });

  const assignments = project.assignments || [];
  const payments = project.teamPayments || [];
  const teamCostPaid = project.teamCostPaid || 0;

  const assignedMemberIds = assignments.map(a => a.teamMemberId);
  const availableMembers = teamList.filter(m => !assignedMemberIds.includes(m.id) && m.isActive);

  const openAssignDialog = (assignment = null) => {
    if (assignment) {
      setEditAssignment(assignment);
      setAssignForm({
        teamMemberId: assignment.teamMemberId, role: assignment.role || '',
        daysWorked: assignment.daysWorked?.toString() || '',
        hoursWorked: assignment.hoursWorked?.toString() || '', notes: assignment.notes || '',
      });
    } else {
      setEditAssignment(null);
      setAssignForm({ teamMemberId: '', role: '', daysWorked: '', hoursWorked: '', notes: '' });
    }
    setAssignDialog(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      projectId,
      teamMemberId: assignForm.teamMemberId,
      role: assignForm.role || undefined,
      daysWorked: assignForm.daysWorked ? parseFloat(assignForm.daysWorked) : undefined,
      hoursWorked: assignForm.hoursWorked ? parseFloat(assignForm.hoursWorked) : undefined,
      notes: assignForm.notes || undefined,
    };
    try {
      if (editAssignment) {
        await updateAssignment.mutateAsync({ id: editAssignment.id, projectId, ...payload });
      } else {
        await createAssignment.mutateAsync(payload);
      }
      setAssignDialog(false);
    } catch { /* handled */ }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editPayment) {
        await updatePayment.mutateAsync({
          id: editPayment.id,
          projectId,
          teamMemberId: paymentForm.teamMemberId,
          amount: parseFloat(paymentForm.amount),
          paymentDate: paymentForm.paymentDate || undefined,
          paymentMethod: paymentForm.paymentMethod || undefined,
          status: paymentForm.status,
          notes: paymentForm.notes || undefined,
        });
      } else {
        await createPayment.mutateAsync({
          projectId,
          teamMemberId: paymentForm.teamMemberId,
          amount: parseFloat(paymentForm.amount),
          paymentDate: paymentForm.paymentDate || undefined,
          paymentMethod: paymentForm.paymentMethod || undefined,
          status: paymentForm.status,
          notes: paymentForm.notes || undefined,
          advanceRepayment: paymentForm.advanceRepayment ? parseFloat(paymentForm.advanceRepayment) : undefined,
          salaryDeduction: paymentForm.salaryDeduction ? parseFloat(paymentForm.salaryDeduction) : undefined,
        });
      }
      setPaymentDialog(false);
      setEditPayment(null);
      setPaymentForm({ teamMemberId: '', amount: '', paymentDate: '', paymentMethod: '', status: 'paid', notes: '', advanceRepayment: '', salaryDeduction: '' });
    } catch { /* handled */ }
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'assignment') {
      deleteAssignment.mutate({ id: deleteConfirm.id, projectId });
    } else {
      deletePayment.mutate({ id: deleteConfirm.id, projectId });
    }
    setDeleteConfirm(null);
  };

  const getMemberName = (a) => {
    const tm = a.teamMember;
    if (!tm) return '—';
    return tm.user?.profile?.displayName || tm.user?.name || tm.name || tm.user?.email || '—';
  };

  return (
    <div className="space-y-5">
      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-3">
        <FinancialCard label="Paid to Team" value={formatCurrency(teamCostPaid)} icon={Users} delay={0} />
      </div>

      {/* Assigned Crew */}
      <div className="content-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Assigned Crew ({assignments.length})</h3>
          {isPrivileged && (
            <button onClick={() => openAssignDialog()} className="action-btn text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Assign
            </button>
          )}
        </div>
        {assignments.length > 0 ? (
          <div className="space-y-2">
            {assignments.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="content-card__row p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={a.teamMember?.user?.image} />
                      <AvatarFallback className="text-[10px] bg-surface-200">{getMemberName(a).substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{getMemberName(a)}</p>
                      <div className="flex items-center gap-2 text-xs text-surface-400">
                        <span>{a.role || '—'}</span>
                        {(a.daysWorked || a.hoursWorked) && (
                          <span>{a.daysWorked ? `${a.daysWorked}d` : `${a.hoursWorked}h`}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isPrivileged && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openAssignDialog(a)} className="icon-button" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteConfirm({ type: 'assignment', id: a.id, label: getMemberName(a) })} className="icon-button" title="Remove"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  )}
                </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Users className="w-8 h-8 text-surface-400 mx-auto mb-2" />
            <p className="text-surface-400 text-sm">No crew assigned yet.</p>
          </div>
        )}
      </div>

      {/* Team Payments */}
      <div className="content-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider">Team Payments ({payments.length})</h3>
          {isPrivileged && assignments.length > 0 && (
            <button onClick={() => { const sd = project.shootStartDate; const defaultDate = sd ? new Date(sd).toISOString().slice(0, 10) : ''; setEditPayment(null); setPaymentForm({ teamMemberId: assignments[0]?.teamMemberId || '', amount: '', paymentDate: defaultDate, paymentMethod: '', status: 'paid', notes: '', advanceRepayment: '', salaryDeduction: '' }); setPaymentDialog(true); }}
              className="action-btn text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Record Payment
            </button>
          )}
        </div>
        {payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map((p, i) => (
              <SwipeablePaymentRow key={p.id} payment={p} index={i} isPrivileged={isPrivileged}
                getMemberName={getMemberName} formatCurrency={formatCurrency} formatDate={formatDate}
                onEdit={() => {
                  setEditPayment(p);
                  setPaymentForm({
                    teamMemberId: p.teamMemberId,
                    amount: p.amount?.toString() || '',
                    paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString().slice(0, 10) : '',
                    paymentMethod: p.paymentMethod || '',
                    status: p.status || 'paid',
                    notes: p.notes || '',
                    advanceRepayment: '',
                    salaryDeduction: '',
                  });
                  setPaymentDialog(true);
                }}
                onDelete={() => setDeleteConfirm({ type: 'payment', id: p.id, label: `${formatCurrency(p.amount)} to ${getMemberName(p)}` })}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <DollarSign className="w-8 h-8 text-surface-400 mx-auto mb-2" />
            <p className="text-surface-400 text-sm">No payments recorded.</p>
          </div>
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="glass-modal max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{editAssignment ? 'Edit Assignment' : 'Assign Crew Member'}</DialogTitle></DialogHeader>
          <form onSubmit={handleAssignSubmit} className="space-y-4 mt-2">
            {!editAssignment && (
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Team Member</label>
                <select value={assignForm.teamMemberId} onChange={e => setAssignForm(f => ({ ...f, teamMemberId: e.target.value }))} className="glass-input w-full" required>
                  <option value="">Select member...</option>
                  {availableMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.displayName || m.firstName || m.name || m.userName || m.userEmail || '—'} — {TEAM_ROLE_LABELS[m.role] || m.role}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Role</label>
              <select value={assignForm.role} onChange={e => setAssignForm(f => ({ ...f, role: e.target.value }))} className="glass-input w-full">
                <option value="">Select role...</option>
                {assignmentRoles.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Days</label>
                <input type="number" inputMode="decimal" step="0.5" value={assignForm.daysWorked} onChange={e => setAssignForm(f => ({ ...f, daysWorked: e.target.value }))} className="glass-input w-full" />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Hours</label>
                <input type="number" inputMode="decimal" step="0.5" value={assignForm.hoursWorked} onChange={e => setAssignForm(f => ({ ...f, hoursWorked: e.target.value }))} className="glass-input w-full" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Notes</label>
              <textarea value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} className="glass-textarea w-full" rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAssignDialog(false)} className="action-btn action-btn--secondary text-sm">Cancel</button>
              <button type="submit" className="action-btn text-sm" disabled={createAssignment.isPending || updateAssignment.isPending}>
                {editAssignment ? 'Update' : 'Assign'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent className="glass-modal max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{editPayment ? 'Edit Team Payment' : 'Record Team Payment'}</DialogTitle></DialogHeader>
          <form onSubmit={handlePaymentSubmit} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Team Member</label>
              <select value={paymentForm.teamMemberId} onChange={e => setPaymentForm(f => ({ ...f, teamMemberId: e.target.value }))} className="glass-input w-full" required>
                {assignments.map(a => (
                  <option key={a.teamMemberId} value={a.teamMemberId}>{getMemberName(a)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Amount ($)</label>
                <input type="number" inputMode="decimal" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} className="glass-input w-full" required />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Date</label>
                <input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(f => ({ ...f, paymentDate: e.target.value }))} className="glass-input w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Method</label>
                <input type="text" value={paymentForm.paymentMethod} onChange={e => setPaymentForm(f => ({ ...f, paymentMethod: e.target.value }))} className="glass-input w-full" placeholder="Cash, Zelle..." />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-500 mb-1 block">Status</label>
                <select value={paymentForm.status} onChange={e => setPaymentForm(f => ({ ...f, status: e.target.value }))} className="glass-input w-full">
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Notes</label>
              <textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} className="glass-textarea w-full" rows={2} />
            </div>
            {/* Apply toward advance — only if selected member has advancesEnabled (create only) */}
            {!editPayment && (() => {
              const selectedAssignment = assignments.find(a => a.teamMemberId === paymentForm.teamMemberId);
              if (selectedAssignment?.teamMember?.advancesEnabled) {
                return (
                  <div>
                    <label className="text-xs font-medium text-surface-500 mb-1 block">Apply toward advance ($)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max={paymentForm.amount || undefined}
                      value={paymentForm.advanceRepayment}
                      onChange={e => setPaymentForm(f => ({ ...f, advanceRepayment: e.target.value }))}
                      className="glass-input w-full"
                      placeholder="0.00"
                    />
                    <p className="text-[11px] text-surface-400 mt-1">Deduct from their advance balance</p>
                  </div>
                );
              }
              return null;
            })()}
            {/* Apply toward salary — only if selected member has salaryEnabled (create only) */}
            {!editPayment && (() => {
              const selectedAssignment = assignments.find(a => a.teamMemberId === paymentForm.teamMemberId);
              if (selectedAssignment?.teamMember?.salaryEnabled) {
                return (
                  <div>
                    <label className="text-xs font-medium text-surface-500 mb-1 block">Apply toward salary ($)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      max={paymentForm.amount || undefined}
                      value={paymentForm.salaryDeduction}
                      onChange={e => setPaymentForm(f => ({ ...f, salaryDeduction: e.target.value }))}
                      className="glass-input w-full"
                      placeholder="0.00"
                    />
                    <p className="text-[11px] text-surface-400 mt-1">Mark as salary paid (reduces balance owed)</p>
                  </div>
                );
              }
              return null;
            })()}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPaymentDialog(false)} className="action-btn action-btn--secondary text-sm">Cancel</button>
              <button type="submit" className="action-btn text-sm" disabled={createPayment.isPending || updatePayment.isPending}>{editPayment ? 'Update' : 'Record Payment'}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

const EXPENSE_SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest' },
  { value: 'date-asc', label: 'Oldest' },
  { value: 'amount-desc', label: 'Highest' },
  { value: 'amount-asc', label: 'Lowest' },
];

function sortExpenses(list, sortBy) {
  const sorted = [...list];
  const [field, dir] = sortBy.split('-');
  sorted.sort((a, b) => {
    const va = field === 'amount' ? (a.amount || 0) : new Date(a.expenseDate || a.createdAt).getTime();
    const vb = field === 'amount' ? (b.amount || 0) : new Date(b.expenseDate || b.createdAt).getTime();
    return dir === 'asc' ? va - vb : vb - va;
  });
  return sorted;
}

const ExpensesTab = ({ project, projectId, isPrivileged }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expenseSort, setExpenseSort] = useState('date-desc');

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const { data: categoriesData } = useQuery({
    queryKey: ['expense-categories', 'list'],
    queryFn: () => api.get('/expense-categories'),
    enabled: isPrivileged,
  });
  const categories = categoriesData?.data || [];

  const { data: vendorsData } = useQuery({
    queryKey: queryKeys.vendors.list(),
    queryFn: () => api.get('/vendors'),
    enabled: isPrivileged,
  });
  const vendorsList = vendorsData?.data || [];

  const expenses = project.expenses || [];
  const totalExpenses = expenses.filter(e => e.type !== 'credit').reduce((sum, e) => sum + (e.amount || 0), 0);
  const teamPaymentTotal = expenses.filter(e => e.teamPaymentId).reduce((s, e) => s + (e.amount || 0), 0);

  const handleSave = async (formData) => {
    try {
      if (editingExpense) {
        await updateExpense.mutateAsync({ id: editingExpense.id, ...formData });
      } else {
        await createExpense.mutateAsync({ ...formData, projectId });
      }
      setIsFormOpen(false);
      setEditingExpense(null);
    } catch { /* handled by mutation */ }
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExpense.mutateAsync(deleteTarget.id);
    } catch { /* handled */ }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      {isPrivileged && (
        <div className="grid grid-cols-2 gap-3">
          <FinancialCard label="Total Expenses" value={formatCurrency(totalExpenses)} icon={Wallet} delay={0} />
          <FinancialCard label="Team Payments" value={formatCurrency(teamPaymentTotal)} icon={Users} delay={0.05} />
        </div>
      )}

      {/* Expense list */}
      <div className="content-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
              All Expenses ({expenses.length})
            </h3>
            {expenses.length > 1 && (
              <select
                value={expenseSort}
                onChange={e => setExpenseSort(e.target.value)}
                className="text-[11px] text-surface-500 bg-surface-50 border border-surface-200 rounded-md px-2 py-1 outline-none cursor-pointer"
              >
                {EXPENSE_SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
          {isPrivileged && (
            <button
              onClick={() => { setEditingExpense(null); setIsFormOpen(true); }}
              className="action-btn text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Expense
            </button>
          )}
        </div>

        {expenses.length > 0 ? (
          <div className="space-y-2">
            {sortExpenses(expenses, expenseSort).map((expense, i) => (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="list-card list-card--accent p-3 flex items-center justify-between gap-3 cursor-pointer group"
                onClick={() => isPrivileged && handleEdit(expense)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-800 truncate">
                        {expense.description}
                      </span>
                      {expense.type === 'credit' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                          Credit
                        </span>
                      ) : expense.teamPaymentId ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                          <Users className="w-2.5 h-2.5" /> Team
                        </span>
                      ) : expense.category?.name ? (
                        <span className="text-[11px] text-surface-400 shrink-0">
                          {expense.category.name}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-400">
                      <span>{formatDate(expense.expenseDate)}</span>
                      {expense.vendor?.name && <><span>&middot;</span><span className="truncate">{expense.vendor.name}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-sm font-bold tabular-nums ${expense.type === 'credit' ? 'text-emerald-600' : 'text-surface-800'}`}>
                    {expense.type === 'credit' ? '+' : ''}{formatCurrency(expense.amount)}
                  </span>
                  {isPrivileged && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleEdit(expense)} className="icon-button !p-1.5">
                        <Pencil className="w-3.5 h-3.5 text-blue-400" />
                      </button>
                      <button onClick={() => setDeleteTarget(expense)} className="icon-button !p-1.5">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Wallet className="w-8 h-8 text-surface-300 mx-auto mb-2" />
            <p className="text-surface-400 text-sm">No expenses for this project yet.</p>
          </div>
        )}
      </div>

      {/* Form dialog */}
      <ExpenseFormDialog
        expense={editingExpense}
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) setEditingExpense(null);
          setIsFormOpen(open);
        }}
        categories={categories}
        vendors={vendorsList}
        onSave={handleSave}
        isPending={createExpense.isPending || updateExpense.isPending}
        fixedProjectId={projectId}
        isTeamPaymentLinked={!!editingExpense?.teamPaymentId}
        defaultDate={project?.shootStartDate}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.teamPaymentId ? 'team payment expense' : 'expense'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.teamPaymentId
                ? `This will also delete the linked team payment of ${formatCurrency(deleteTarget?.amount)}. This action cannot be undone.`
                : `This will permanently delete "${deleteTarget?.description}". This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-[#C8C6C2]">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const ProjectDetail = () => {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.backTo || '/projects';
  const [activeTab, setActiveTab] = useState('overview');
  const { tabsRef, scrollToTabs } = useTabScroll();
  const tabScrollRef = useRef(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const updateProject = useUpdateProject();
  const deleteProjectPermanently = useDeleteProjectPermanently();
  const { isPrivileged, canSeePrices, teamRole, can } = useAppData();
  const { user } = useAuth();
  const { getTypeColor } = useProjectTypes();
  const { roles: assignmentRoles } = useProjectRoles();

  const { data: settingsData } = useSettings();
  const mapsApiKey = settingsData?.google_maps_api_key;
  const mapsLoaded = useGoogleMaps(mapsApiKey);
  const [dynamicPhotoUrl, setDynamicPhotoUrl] = useState(null);
  const [streetViewUrl, setStreetViewUrl] = useState(null);

  const { data: projectRes, isLoading } = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => api.get('/projects/' + projectId),
    enabled: !!projectId,
  });

  const project = projectRes?.data;

  // Fetch Google Places photo dynamically if project has a placeId but no stored coverPhotoUrl
  useEffect(() => {
    if (!project?.placeId || project.coverPhotoUrl || !mapsLoaded) {
      setDynamicPhotoUrl(null);
      return;
    }
    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails({ placeId: project.placeId, fields: ['photos'] }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.photos?.length) {
        setDynamicPhotoUrl(place.photos[0].getUrl({ maxWidth: 1200 }));
      }
    });
  }, [project?.placeId, project?.coverPhotoUrl, mapsLoaded]);

  // Street View / satellite map fallback for hero photo
  useEffect(() => {
    if (!mapsApiKey || !project || project.coverPhotoUrl) {
      setStreetViewUrl(null);
      return;
    }
    const parts = [project.addressStreet, project.addressCity,
      [project.addressState, project.addressZip].filter(Boolean).join(' ')
    ].filter(Boolean);
    if (!parts.length) { setStreetViewUrl(null); return; }
    const addr = parts.join(', ');
    const encodedAddr = encodeURIComponent(addr);
    const key = encodeURIComponent(mapsApiKey);
    let cancelled = false;
    fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodedAddr}&key=${key}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.status === 'OK') {
          setStreetViewUrl(`https://maps.googleapis.com/maps/api/streetview?size=1200x600&location=${encodedAddr}&key=${key}`);
        } else {
          // No street view — fall back to satellite map
          setStreetViewUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddr}&zoom=18&size=1200x600&maptype=satellite&key=${key}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // On network error, still try satellite as it's very reliable
          setStreetViewUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddr}&zoom=18&size=1200x600&maptype=satellite&key=${key}`);
        }
      });
    return () => { cancelled = true; };
  }, [project?.addressStreet, project?.addressCity, project?.addressState, project?.addressZip, project?.coverPhotoUrl, mapsApiKey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-surface-500">Project not found.</p>
        <button onClick={() => navigate(backTo)} className="action-btn mt-4">Back to Projects</button>
      </div>
    );
  }

  const clientName = project.client
    ? `${project.client.firstName || ''} ${project.client.lastName || ''}`.trim()
    : '—';

  const canEdit = can('manage_projects');

  const handleStatusChange = (newStatus) => {
    updateProject.mutate({ id: project.id, status: newStatus });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      {/* Back button */}
      <button
        onClick={() => navigate(backTo)}
        className="flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors -mb-2"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Projects
      </button>

      {/* Header Card */}
      {(() => {
        const heroPhoto = project.coverPhotoUrl || dynamicPhotoUrl || streetViewUrl;
        return (
      <div
        className={cn('project-hero', heroPhoto && 'project-hero--has-photo')}
        data-status={project.status || 'lead'}
      >
        {heroPhoto && <div className="project-hero__image" style={{ backgroundImage: `url(${heroPhoto})` }} />}
        {heroPhoto && <div className="project-hero__photo-overlay" />}
        <div className="project-hero__layout">
          <div className="project-hero__body">
            {project.projectTypeRel && (
              <span className={cn('project-hero__pill', getTypeColor(project.projectTypeId || project.projectType).pill)}>
                {project.projectTypeRel.label}
              </span>
            )}
            <div className="project-hero__header">
              <h1 className="project-hero__title">{project.title}</h1>
            </div>
            <div className="project-hero__meta">
              {project.clientId && (
                <button
                  onClick={() => navigate(`/clients/${project.clientId}`)}
                  className="project-hero__meta-link"
                >
                  <User2 /> {clientName}
                </button>
              )}
              {(() => {
                if (project.sessions?.length > 0) {
                  const sorted = [...project.sessions].sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
                  return (
                    <>
                      <span className="project-hero__dot" />
                      <span className="project-hero__meta-item">
                        <Calendar /> {project.sessions.length} sessions · {formatDate(sorted[0].sessionDate)} – {formatDate(sorted[sorted.length - 1].sessionDate)}
                      </span>
                    </>
                  );
                }
                const dateRange = formatDateRange(project.shootStartDate, project.shootEndDate);
                if (dateRange) return (
                  <>
                    <span className="project-hero__dot" />
                    <span className="project-hero__meta-item">
                      <Calendar /> {dateRange.range} ({dateRange.days}d)
                    </span>
                  </>
                );
                if (project.shootStartDate) {
                  const timeRange = formatTimeRange(project.shootStartTime, project.shootEndTime);
                  return (
                    <>
                      <span className="project-hero__dot" />
                      <span className="project-hero__meta-item">
                        <Calendar /> {formatDate(project.shootStartDate)}
                        {timeRange && <> · {timeRange}</>}
                      </span>
                    </>
                  );
                }
                return null;
              })()}
              {project.location && (
                <>
                  <span className="project-hero__dot" />
                  <span className="project-hero__meta-item">
                    <MapPin /> {project.location}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="project-hero__actions">
            {canEdit && (
              <button onClick={() => navigate(`/projects/${projectId}/edit`)} className="project-hero__action-btn" title="Edit project">
                <Pencil className="w-4 h-4" />
              </button>
            )}

            {/* Status badge */}
            {(() => {
              const sty = STATUS_BADGE_STYLES[project.status] || STATUS_BADGE_STYLES.lead;
              return canEdit ? (
                <div className={cn('project-hero__status relative', sty.bg, sty.ring)}>
                  <span className={cn('project-hero__status-dot absolute left-3 top-1/2 -translate-y-1/2', sty.dot)} />
                  <select
                    value={project.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={cn('project-hero__status-select', sty.text)}
                    disabled={updateProject.isPending}
                  >
                    {PROJECT_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown className={cn('project-hero__status-chevron', sty.text)} />
                </div>
              ) : (
                <div className={cn('project-hero__status', sty.bg, sty.ring)}>
                  <span className={cn('project-hero__status-dot', sty.dot)} />
                  <span className={cn('project-hero__status-label', sty.text)}>
                    {PROJECT_STATUSES.find(s => s.value === project.status)?.label || project.status}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
        );
      })()}

      {/* Tab Navigation */}
      <div ref={tabsRef} className="scroll-mt-14 lg:scroll-mt-0">
        <div ref={tabScrollRef} className="nav-tabs flex gap-1 w-full md:w-fit overflow-x-auto overflow-y-hidden scrollbar-hide !border-b-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={(e) => { setActiveTab(tab.key); scrollToTabs(); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }}
              className={cn(
                "nav-tab relative flex items-center gap-1.5 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200 flex-shrink-0",
                activeTab === tab.key ? "nav-tab--active" : ""
              )}
            >
              <tab.icon className="w-3.5 h-3.5 hidden md:block" />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="project-tab-glass"
                  className="nav-tab__glass"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          ))}
        </div>
        {/* Bottom border spans full width */}
        <div className="border-b border-surface-200" />
        {/* Dot indicators — mobile only */}
        <div className="flex justify-center gap-1.5 pt-2 sm:hidden">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); scrollToTabs(); }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                activeTab === tab.key ? "bg-surface-500" : "bg-surface-200"
              )}
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      >
          {activeTab === 'overview' && <OverviewTab project={project} isPrivileged={isPrivileged} canSeePrices={canSeePrices} />}
          {activeTab === 'quotes' && <QuotesTab quotes={project.quotes} navigate={navigate} isPrivileged={isPrivileged} project={project} />}
          {activeTab === 'invoices' && <InvoicesTab invoices={project.invoices} navigate={navigate} isPrivileged={isPrivileged} project={project} />}
          {activeTab === 'team' && <TeamTab project={project} projectId={projectId} isPrivileged={isPrivileged} />}
          {activeTab === 'expenses' && <ExpensesTab project={project} projectId={projectId} isPrivileged={isPrivileged} />}
          {activeTab === 'notes' && <NotesTab projectId={projectId} isPrivileged={isPrivileged} />}
        </motion.div>

      {/* Danger zone — only for archived projects */}
      {project.status === 'archived' && can('delete_projects') && (
        <div className="mt-8 pt-6 border-t border-red-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-surface-600">Danger Zone</p>
              <p className="text-xs text-surface-400 mt-0.5">Permanently delete this project and all its notes and assignments.</p>
            </div>
            <button
              onClick={() => { setDeleteConfirmText(''); setShowDeleteDialog(true); }}
              className="text-xs text-red-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg border border-red-200 hover:border-red-300 hover:bg-red-50 self-start sm:self-auto flex-shrink-0"
            >
              Permanently Delete
            </button>
          </div>
        </div>
      )}

      {/* Type-to-confirm permanent delete dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) setShowDeleteDialog(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this project?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">This will permanently delete <strong>{project.title}</strong>, all notes, and crew assignments. Linked quotes and invoices will be unlinked but not deleted.</span>
              <span className="block">This action <strong>cannot be undone</strong>. Type <strong>DELETE</strong> to confirm:</span>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="glass-input w-full mt-2"
                autoFocus
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText !== 'DELETE' || deleteProjectPermanently.isPending}
              onClick={() => {
                deleteProjectPermanently.mutate(project.id, {
                  onSuccess: () => navigate(backTo),
                });
              }}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:pointer-events-none"
            >
              {deleteProjectPermanently.isPending ? 'Deleting...' : 'Delete Forever'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </motion.div>
  );
};

export default ProjectDetail;
