import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Save, X } from 'lucide-react';

const StickySettingsBar = ({ isDirty, onSave, isPending }) => {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when dirty state changes (new edit after dismissal)
  useEffect(() => { if (!isDirty) setDismissed(false); }, [isDirty]);

  return (
    <AnimatePresence>
      {isDirty && !dismissed && (
        <motion.div
          initial={{ y: 72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 72, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-surface-200 bg-white/95 backdrop-blur-sm shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
        >
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-surface-500">Unsaved changes</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setDismissed(true)} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors" title="Dismiss">
                <X className="w-4 h-4" />
              </button>
              <button onClick={onSave} disabled={isPending} className="action-btn text-sm px-5 py-1.5">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                {isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StickySettingsBar;
