import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Reorder, motion, useDragControls } from 'framer-motion';
import { Users, GripVertical, Plus, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useProjectRoles } from '@/lib/projectRoles';
import { queryKeys } from '@/lib/queryKeys';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import api from '@/lib/apiClient';

const RoleRow = ({ role: r, index: i, onUpdate, onRemove }) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={r}
      dragListener={false}
      dragControls={controls}
      className="grid grid-cols-[24px_1fr_32px] gap-x-3 items-center select-none"
    >
      <div
        className="flex justify-center cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={(e) => controls.start(e)}
      >
        <GripVertical className="w-4 h-4 text-surface-300" />
      </div>

      <input
        type="text"
        value={r.label}
        onChange={(e) => onUpdate(i, 'label', e.target.value)}
        className="glass-input w-full text-sm"
        placeholder="e.g. Lead Photo"
      />

      <button
        type="button"
        onClick={() => onRemove(i)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        title="Remove role"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </Reorder.Item>
  );
};

const ProjectRolesManager = () => {
  const queryClient = useQueryClient();
  const { roles: fetchedRoles } = useProjectRoles();
  const [roles, setRoles] = useState([]);
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const normalized = fetchedRoles.map(r => ({
      id: r.id || null,
      label: r.label || '',
      sortOrder: r.sortOrder ?? 0,
    }));
    setRoles(normalized);
    setSavedJson(JSON.stringify(normalized));
  }, [fetchedRoles]);

  const isDirty = useMemo(() => JSON.stringify(roles) !== savedJson, [roles, savedJson]);

  const addRole = () => {
    setRoles(prev => [...prev, { id: null, label: '', sortOrder: prev.length }]);
  };

  const updateRole = useCallback((index, field, val) => {
    setRoles(prev => prev.map((r, i) => i !== index ? r : { ...r, [field]: val }));
  }, []);

  const removeRole = useCallback((index) => {
    setRoles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = async () => {
    const valid = roles.filter(r => r.label.trim());
    if (valid.length === 0) return;

    setSaving(true);
    try {
      const savedRoles = JSON.parse(savedJson);
      const savedById = {};
      for (const r of savedRoles) {
        if (r.id) savedById[r.id] = r;
      }

      const currentIds = new Set(valid.filter(r => r.id).map(r => r.id));

      // Delete removed roles
      for (const r of savedRoles) {
        if (r.id && !currentIds.has(r.id)) {
          await api.delete(`/project-roles/${r.id}`);
        }
      }

      // Create or update
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        if (!r.id) {
          await api.post('/project-roles', { label: r.label, sortOrder: i });
        } else {
          const saved = savedById[r.id];
          if (saved && (saved.label !== r.label || saved.sortOrder !== i)) {
            await api.put(`/project-roles/${r.id}`, { label: r.label, sortOrder: i });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.projectRoles.all });
      toast({ title: "Project roles saved successfully!" });
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
            <Users className="w-[18px] h-[18px] text-surface-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-surface-800">Project Roles</h3>
            <p className="text-sm text-surface-400">Define assignment roles for project team members</p>
          </div>
        </div>

        <div className="grid grid-cols-[24px_1fr_32px] gap-x-3 px-1 mb-2">
          <span />
          <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Label</span>
          <span />
        </div>

        <Reorder.Group axis="y" values={roles} onReorder={setRoles} className="space-y-2">
          {roles.map((r, i) => (
            <RoleRow key={r.id || `new-${i}`} role={r} index={i} onUpdate={updateRole} onRemove={removeRole} />
          ))}
        </Reorder.Group>

        {roles.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-surface-400">No project roles defined</p>
            <p className="text-xs text-surface-300 mt-1">Add your first role below</p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-surface-100">
          <button
            type="button"
            onClick={addRole}
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Role
          </button>
        </div>
      </div>

      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={saving} />
    </motion.div>
  );
};

export default ProjectRolesManager;
