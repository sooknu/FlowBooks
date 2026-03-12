import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, Loader2, Sparkles, Send, Copy, Check } from 'lucide-react';
import { cn, fmtDate } from '@/lib/utils';
import api from '@/lib/apiClient';

export const getAnniversaryHeadline = (anniversary) => {
  const years = anniversary.yearsAgo;
  const name = anniversary.clientName || anniversary.projectTitle;
  const type = anniversary.projectType;
  const label = anniversary.projectTypeLabel || type;
  const yearStr = years === 1 ? '1 year' : `${years} years`;
  if (type === 'wedding') {
    const ordinal = years === 1 ? '1st' : years === 2 ? '2nd' : years === 3 ? '3rd' : `${years}th`;
    return `${name}'s ${ordinal} wedding anniversary`;
  }
  if (type === 'anniversary') {
    const ordinal = years === 1 ? '1st' : years === 2 ? '2nd' : years === 3 ? '3rd' : `${years}th`;
    return `${name}'s ${ordinal} anniversary`;
  }
  return `${yearStr} since ${name}'s ${label}`;
};

const AnniversaryBanner = ({ anniversary, navigate, saveScroll, onDismiss }) => {
  const [drafting, setDrafting] = useState(false);
  const [draftMessage, setDraftMessage] = useState(null);
  const [draftError, setDraftError] = useState(null);
  const [copied, setCopied] = useState(false);

  const headline = getAnniversaryHeadline(anniversary);

  const daysUntil = Math.round((new Date(anniversary.anniversaryDate) - new Date(new Date().toDateString())) / 86400000);

  const handleDraft = async (e) => {
    e.stopPropagation();
    if (draftMessage || draftError) {
      setDraftMessage(null);
      setDraftError(null);
      return;
    }
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await api.post('/ai/draft-congrats', {
        clientName: anniversary.clientName,
        projectTitle: anniversary.projectTitle,
        shootDate: anniversary.shootDate,
        yearsAgo: anniversary.yearsAgo,
        projectType: anniversary.projectType,
        projectTypeLabel: anniversary.projectTypeLabel,
      });
      setDraftMessage(res.message);
    } catch (err) {
      setDraftError(err?.message || 'Could not generate message. Check AI settings.');
    } finally {
      setDrafting(false);
    }
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(draftMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = (e) => {
    e.stopPropagation();
    const subject = encodeURIComponent(
      anniversary.projectType === 'wedding' || anniversary.projectType === 'anniversary'
        ? `Happy Anniversary!`
        : `Thinking of you!`
    );
    const body = encodeURIComponent(draftMessage || '');
    window.open(`mailto:${anniversary.clientEmail}?subject=${subject}&body=${body}`, '_self');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-0"
    >
      <div
        onClick={() => { saveScroll?.(); navigate(`/projects/${anniversary.projectId}`); }}
        className="flat-card p-4 flex items-center gap-3 border-l-4 border-l-pink-400 cursor-pointer hover:border-pink-500 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0">
          <Heart className="w-4 h-4 text-pink-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-800">
            {headline}{' — '}
            {daysUntil === 0 ? <span className="font-semibold text-pink-600">today!</span>
              : daysUntil === 1 ? <span className="font-semibold text-pink-600">tomorrow!</span>
              : <span className="font-semibold text-pink-600">{fmtDate(anniversary.anniversaryDate, { month: 'long', day: 'numeric' })}</span>}
          </p>
          <p className="text-xs text-surface-400 mt-0.5">
            {anniversary.projectTitle} — {fmtDate(anniversary.shootDate, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleDraft}
          disabled={drafting}
          className="action-btn text-xs flex-shrink-0"
        >
          {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
          <span className="hidden sm:inline">{draftMessage || draftError ? 'Close' : 'Draft Message'}</span>
          <span className="sm:hidden">{draftMessage || draftError ? 'Close' : 'Draft'}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
          className="p-1.5 rounded-md hover:bg-surface-100 text-surface-300 hover:text-surface-500 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* AI-drafted message panel */}
      <AnimatePresence>
        {draftMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flat-card p-4 rounded-t-none -mt-1 border-l-4 border-l-pink-200 space-y-3">
              <p className="text-sm text-surface-700 whitespace-pre-wrap leading-relaxed">{draftMessage}</p>
              <div className="flex items-center gap-2">
                {anniversary.clientEmail && (
                  <button onClick={handleSendEmail} className="action-btn text-xs">
                    <Send className="w-3.5 h-3.5 mr-1.5" /> Send Email
                  </button>
                )}
                <button onClick={handleCopy} className={cn(anniversary.clientEmail ? 'glass-button-secondary' : 'action-btn', 'text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5')}>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {draftError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flat-card p-3 rounded-t-none -mt-1 border-l-4 border-l-red-200">
              <p className="text-xs text-red-600">{draftError}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AnniversaryBanner;
