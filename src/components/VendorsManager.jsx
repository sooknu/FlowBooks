import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Store, Plus, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { queryKeys } from '@/lib/queryKeys';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import api from '@/lib/apiClient';

const VendorsManager = () => {
  const queryClient = useQueryClient();
  const { data: fetchedData } = useQuery({
    queryKey: queryKeys.vendors.list(),
    queryFn: () => api.get('/vendors'),
  });

  const [vendors, setVendors] = useState([]);
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetched = fetchedData?.data || [];
    const normalized = fetched.map(v => ({
      id: v.id || null,
      name: v.name || '',
      sortOrder: v.sortOrder ?? 0,
    }));
    setVendors(normalized);
    setSavedJson(JSON.stringify(normalized));
  }, [fetchedData]);

  const isDirty = useMemo(() => JSON.stringify(vendors) !== savedJson, [vendors, savedJson]);

  const addVendor = () => {
    setVendors(prev => [...prev, { id: null, name: '', sortOrder: prev.length }]);
  };

  const updateVendor = useCallback((index, val) => {
    setVendors(prev => prev.map((v, i) => i === index ? { ...v, name: val } : v));
  }, []);

  const removeVendor = useCallback((index) => {
    setVendors(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    const valid = vendors.filter(v => v.name.trim());
    if (valid.length === 0) return;

    setSaving(true);
    try {
      const savedVendors = JSON.parse(savedJson);
      const savedById = {};
      for (const v of savedVendors) {
        if (v.id) savedById[v.id] = v;
      }

      const currentIds = new Set(valid.filter(v => v.id).map(v => v.id));

      // Delete removed vendors
      for (const v of savedVendors) {
        if (v.id && !currentIds.has(v.id)) {
          await api.delete(`/vendors/${v.id}`);
        }
      }

      // Create or update
      for (let i = 0; i < valid.length; i++) {
        const v = valid[i];
        if (!v.id) {
          await api.post('/vendors', { name: v.name, sortOrder: i });
        } else {
          const saved = savedById[v.id];
          if (saved && (saved.name !== v.name || saved.sortOrder !== i)) {
            await api.put(`/vendors/${v.id}`, { name: v.name, sortOrder: i });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all });
      toast({ title: "Vendors saved!" });
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
            <Store className="w-[18px] h-[18px] text-surface-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-surface-800">Vendors</h3>
            <p className="text-sm text-surface-400">Define vendors for tracking who you pay</p>
          </div>
        </div>

        {/* Vendor rows */}
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {vendors.map((v, i) => (
              <motion.div
                key={v.id || `new-${i}`}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-3"
              >
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => updateVendor(i, e.target.value)}
                  className="glass-input flex-1 text-sm"
                  placeholder="e.g. Adobe, B&H Photo"
                />

                <button
                  type="button"
                  onClick={() => removeVendor(i)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  title="Remove vendor"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {vendors.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-surface-400">No vendors defined</p>
              <p className="text-xs text-surface-300 mt-1">Add your first vendor below</p>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-surface-100">
          <button
            type="button"
            onClick={addVendor}
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Vendor
          </button>
        </div>
      </div>

      <div className="pb-16" />
      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={saving} />
    </motion.div>
  );
};

export default VendorsManager;
