import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, Reorder, motion, useDragControls } from 'framer-motion';
import { FolderKanban, GripVertical, Plus, X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { useProjectTypes, COLOR_PALETTE, COLOR_LABELS } from '@/lib/projectTypes';
import { queryKeys } from '@/lib/queryKeys';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import api from '@/lib/apiClient';

function slugify(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const colorNames = Object.keys(COLOR_PALETTE);

const ColorPicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-lg border border-surface-200 flex items-center justify-center hover:border-surface-300 transition-colors"
          title={COLOR_LABELS[value] || 'Choose color'}
        >
          <span className={cn('w-4 h-4 rounded-full', COLOR_PALETTE[value]?.dot || 'bg-amber-500')} />
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
              {value === name && <Check className="w-3 h-3 text-[#C8C6C2]" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const TypeRow = ({ type: t, index: i, onUpdate, onRemove }) => {
  const controls = useDragControls();
  const colors = COLOR_PALETTE[t.color] || COLOR_PALETTE.amber;

  return (
    <Reorder.Item
      value={t}
      dragListener={false}
      dragControls={controls}
      className="grid grid-cols-[24px_40px_1fr_1fr_32px] sm:grid-cols-[24px_40px_1fr_1fr_120px_32px] gap-x-3 items-center select-none"
    >
      {/* Drag handle */}
      <div
        className="flex justify-center cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={(e) => controls.start(e)}
      >
        <GripVertical className="w-4 h-4 text-surface-300" />
      </div>

      {/* Color swatch */}
      <div className="flex justify-center">
        <ColorPicker value={t.color} onChange={(c) => onUpdate(i, 'color', c)} />
      </div>

      {/* Label input */}
      <input
        type="text"
        value={t.label}
        onChange={(e) => onUpdate(i, 'label', e.target.value)}
        className="glass-input w-full text-sm"
        placeholder="e.g. Wedding"
      />

      {/* Preview chip */}
      <div className="flex items-center">
        {t.label ? (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border',
            colors.bg, colors.text, colors.border,
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
            {t.label}
          </span>
        ) : (
          <span className="text-xs text-surface-300">—</span>
        )}
      </div>

      {/* Slug */}
      <span className="text-xs text-surface-400 font-mono truncate hidden sm:block">
        {t.slug || '—'}
      </span>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onRemove(i)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        title="Remove type"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </Reorder.Item>
  );
};

const ProjectTypesManager = () => {
  const queryClient = useQueryClient();
  const { types: fetchedTypes } = useProjectTypes();
  const [types, setTypes] = useState([]);
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync local state when fetched data changes
  useEffect(() => {
    const normalized = fetchedTypes.map(t => ({
      id: t.id || null,
      slug: t.slug || t.value || '',
      label: t.label || '',
      color: t.color || 'amber',
      sortOrder: t.sortOrder ?? 0,
    }));
    setTypes(normalized);
    setSavedJson(JSON.stringify(normalized));
  }, [fetchedTypes]);

  const isDirty = useMemo(() => JSON.stringify(types) !== savedJson, [types, savedJson]);

  const addType = () => {
    setTypes(prev => [...prev, { id: null, slug: '', label: '', color: 'slate', sortOrder: prev.length }]);
  };

  const updateType = useCallback((index, field, val) => {
    setTypes(prev => prev.map((t, i) => {
      if (i !== index) return t;
      const updated = { ...t, [field]: val };
      if (field === 'label') updated.slug = slugify(val);
      return updated;
    }));
  }, []);

  const removeType = useCallback((index) => {
    setTypes(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    const valid = types.filter(t => t.label.trim() && t.slug.trim());
    if (valid.length === 0) return;

    setSaving(true);
    try {
      // Parse saved state to diff
      const savedTypes = JSON.parse(savedJson);
      const savedById = {};
      for (const t of savedTypes) {
        if (t.id) savedById[t.id] = t;
      }

      // Determine creates, updates, deletes
      const currentIds = new Set(valid.filter(t => t.id).map(t => t.id));

      // Delete removed types
      for (const t of savedTypes) {
        if (t.id && !currentIds.has(t.id)) {
          await api.delete(`/project-types/${t.id}`);
        }
      }

      // Create or update
      for (let i = 0; i < valid.length; i++) {
        const t = valid[i];
        if (!t.id) {
          // New type
          await api.post('/project-types', { slug: t.slug, label: t.label, color: t.color, sortOrder: i });
        } else {
          // Check if changed
          const saved = savedById[t.id];
          if (saved && (saved.slug !== t.slug || saved.label !== t.label || saved.color !== t.color || saved.sortOrder !== i)) {
            await api.put(`/project-types/${t.id}`, { slug: t.slug, label: t.label, color: t.color, sortOrder: i });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.all });
      toast({ title: "Project types saved successfully!" });
    } catch {
      // apiClient handles error toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="glass-card p-6">
        {/* Section header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-surface-100 rounded-xl flex items-center justify-center">
            <FolderKanban className="w-[18px] h-[18px] text-surface-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-surface-800">Project Types</h3>
            <p className="text-sm text-surface-400">Define the types of projects your team works on</p>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[24px_40px_1fr_1fr_32px] sm:grid-cols-[24px_40px_1fr_1fr_120px_32px] gap-x-3 px-1 mb-2">
          <span />
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider text-center">Color</span>
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Label</span>
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Preview</span>
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider hidden sm:block">Slug</span>
          <span />
        </div>

        {/* Type rows */}
        <Reorder.Group axis="y" values={types} onReorder={setTypes} className="space-y-2">
          {types.map((t, i) => (
            <TypeRow key={t.id || `new-${i}`} type={t} index={i} onUpdate={updateType} onRemove={removeType} />
          ))}
        </Reorder.Group>

        {types.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-surface-400">No project types defined</p>
            <p className="text-xs text-surface-300 mt-1">Add your first type below</p>
          </div>
        )}

        {/* Add button */}
        <div className="mt-4 pt-4 border-t border-surface-100">
          <button
            type="button"
            onClick={addType}
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Type
          </button>
        </div>
      </div>

      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={saving} />
    </motion.div>
  );
};

export default ProjectTypesManager;
