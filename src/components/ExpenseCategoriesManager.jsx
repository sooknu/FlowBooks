import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Wallet, Plus, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { COLOR_PALETTE, COLOR_LABELS } from '@/lib/projectTypes';
import { queryKeys } from '@/lib/queryKeys';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import api from '@/lib/apiClient';

const colorNames = Object.keys(COLOR_PALETTE);

const ColorPicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const palette = COLOR_PALETTE[value] || COLOR_PALETTE.amber;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center hover:border-surface-300 transition-colors"
          title={COLOR_LABELS[value] || 'Choose color'}
        >
          <span className={cn('w-4 h-4 rounded-full', palette.dot)} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto p-3">
        <p className="text-[11px] font-medium text-surface-500 mb-2">Choose color</p>
        <div className="grid grid-cols-6 gap-1.5">
          {colorNames.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => { onChange(name); setOpen(false); }}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-all',
                COLOR_PALETTE[name].dot,
                value === name ? 'ring-2 ring-offset-2 ring-surface-400 scale-110' : 'hover:scale-110',
              )}
              title={COLOR_LABELS[name]}
            >
              {value === name && <Check className="w-3 h-3 text-white" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ExpenseCategoriesManager = () => {
  const queryClient = useQueryClient();
  const { data: fetchedData } = useQuery({
    queryKey: queryKeys.expenseCategories.list(),
    queryFn: () => api.get('/expense-categories'),
  });

  const [categories, setCategories] = useState([]);
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetched = fetchedData?.data || [];
    const normalized = fetched.map(c => ({
      id: c.id || null,
      name: c.name || '',
      color: c.color || 'amber',
      sortOrder: c.sortOrder ?? 0,
    }));
    setCategories(normalized);
    setSavedJson(JSON.stringify(normalized));
  }, [fetchedData]);

  const isDirty = useMemo(() => JSON.stringify(categories) !== savedJson, [categories, savedJson]);

  const addCategory = () => {
    setCategories(prev => [...prev, { id: null, name: '', color: 'slate', sortOrder: prev.length }]);
  };

  const updateCategory = useCallback((index, field, val) => {
    setCategories(prev => prev.map((c, i) => i === index ? { ...c, [field]: val } : c));
  }, []);

  const removeCategory = useCallback((index) => {
    setCategories(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    const valid = categories.filter(c => c.name.trim());
    if (valid.length === 0) return;

    setSaving(true);
    try {
      const savedCategories = JSON.parse(savedJson);
      const savedById = {};
      for (const c of savedCategories) {
        if (c.id) savedById[c.id] = c;
      }

      const currentIds = new Set(valid.filter(c => c.id).map(c => c.id));

      // Delete removed categories
      for (const c of savedCategories) {
        if (c.id && !currentIds.has(c.id)) {
          await api.delete(`/expense-categories/${c.id}`);
        }
      }

      // Create or update
      for (let i = 0; i < valid.length; i++) {
        const c = valid[i];
        if (!c.id) {
          await api.post('/expense-categories', { name: c.name, color: c.color, sortOrder: i });
        } else {
          const saved = savedById[c.id];
          if (saved && (saved.name !== c.name || saved.color !== c.color || saved.sortOrder !== i)) {
            await api.put(`/expense-categories/${c.id}`, { name: c.name, color: c.color, sortOrder: i });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories.all });
      toast({ title: "Expense categories saved!" });
    } catch {
      // apiClient handles error toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-surface-100 rounded-xl flex items-center justify-center">
            <Wallet className="w-[18px] h-[18px] text-surface-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-surface-800">Expense Categories</h3>
            <p className="text-sm text-surface-400">Define categories for tracking business expenses</p>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[40px_1fr_1fr_32px] gap-x-3 px-1 mb-2">
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider text-center">Color</span>
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Name</span>
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Preview</span>
          <span />
        </div>

        {/* Category rows */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {categories.map((c, i) => {
              const colors = COLOR_PALETTE[c.color] || COLOR_PALETTE.amber;
              return (
                <motion.div
                  key={c.id || `new-${i}`}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="grid grid-cols-[40px_1fr_1fr_32px] gap-x-3 items-center"
                >
                  <div className="flex justify-center">
                    <ColorPicker value={c.color} onChange={(col) => updateCategory(i, 'color', col)} />
                  </div>

                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateCategory(i, 'name', e.target.value)}
                    className="glass-input w-full text-sm"
                    placeholder="e.g. Equipment"
                  />

                  <div className="flex items-center">
                    {c.name ? (
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border',
                        colors.bg, colors.text, colors.border,
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
                        {c.name}
                      </span>
                    ) : (
                      <span className="text-xs text-surface-300">—</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeCategory(i)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove category"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {categories.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-surface-400">No expense categories defined</p>
              <p className="text-xs text-surface-300 mt-1">Add your first category below</p>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-surface-100">
          <button
            type="button"
            onClick={addCategory}
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={saving} />
    </motion.div>
  );
};

export default ExpenseCategoriesManager;
