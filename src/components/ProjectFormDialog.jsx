import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X, Users, Plus, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useClientsCatalog, useAppData } from '@/hooks/useAppData';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateProject, useUpdateProject } from '@/hooks/useMutations';
import { queryKeys } from '@/lib/queryKeys';
import { useProjectTypes } from '@/lib/projectTypes';
import { useProjectRoles } from '@/lib/projectRoles';
import { TEAM_ROLE_LABELS } from '@/lib/teamRoles';
import api from '@/lib/apiClient';
import { toDateInput } from '@/lib/utils';

export const PROJECT_STATUSES = [
  { value: 'lead', label: 'Lead' },
  { value: 'booked', label: 'Booked' },
  { value: 'shooting', label: 'Shooting' },
  { value: 'editing', label: 'Editing' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
];

const EMPTY_FORM = { title: '', clientId: '', projectTypeId: '', status: 'lead', shootStartDate: '', shootEndDate: '', deliveryDate: '', location: '', addressStreet: '', addressCity: '', addressState: 'CA', addressZip: '', description: '', projectPrice: '' };

function getMemberName(m) {
  return m.displayName || m.firstName || m.name || m.userName || m.userEmail || '—';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/**
 * Shared project create/edit dialog.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {function} props.onOpenChange
 * @param {Object|null} props.project - existing project to edit, or null for create
 * @param {Object} [props.defaultValues] - defaults for new projects (e.g. { shootStartDate: '2026-03-15' })
 */
const ProjectFormDialog = ({ open, onOpenChange, project, defaultValues }) => {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClientsCatalog();
  const { isPrivileged } = useAppData();
  const { user } = useAuth();
  const { types: projectTypes, getTypeById } = useProjectTypes();
  const { roles: assignmentRoles } = useProjectRoles();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isEdit = !!project;

  // Team members list (privileged only)
  const { data: teamMembers = [] } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data || []),
    enabled: isPrivileged,
    staleTime: 5 * 60_000,
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [deliveryAutoSet, setDeliveryAutoSet] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState([]); // [{ teamMemberId, role, name, existingId? }]
  const [showAvailable, setShowAvailable] = useState(false);
  const availableRef = useRef(null);

  useEffect(() => {
    if (project) {
      const hasEnd = !!project.shootEndDate;
      setIsMultiDay(hasEnd);
      setDeliveryAutoSet(false);
      setForm({
        title: project.title || '',
        clientId: project.clientId || '',
        projectTypeId: project.projectTypeId || '',
        status: project.status || 'lead',
        shootStartDate: project.shootStartDate ? toDateInput(project.shootStartDate) : '',
        shootEndDate: hasEnd ? toDateInput(project.shootEndDate) : '',
        deliveryDate: project.deliveryDate ? toDateInput(project.deliveryDate) : '',
        location: project.location || '',
        addressStreet: project.addressStreet || '',
        addressCity: project.addressCity || '',
        addressState: project.addressState || '',
        addressZip: project.addressZip || '',
        description: project.description || '',
        projectPrice: project.projectPrice != null ? project.projectPrice.toString() : '',
      });
      // Pre-populate existing assignments
      if (project.assignments) {
        setTeamAssignments(project.assignments.map(a => ({
          teamMemberId: a.teamMemberId,
          role: a.role || '',
          name: a.teamMember?.user?.name || a.teamMember?.name || a.teamMember?.user?.email || '—',
          existingId: a.id,
        })));
      } else {
        setTeamAssignments([]);
      }
    } else {
      setForm({ ...EMPTY_FORM, ...defaultValues });
      setIsMultiDay(false);
      setDeliveryAutoSet(false);
      setTeamAssignments([]);
    }
  }, [project, open]);

  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const clientPickerRef = useRef(null);

  // Reset dropdown state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setClientSearch('');
      setShowClientDropdown(false);
      setShowNewClient(false);
      setShowAvailable(false);
    }
  }, [open]);

  // Close client dropdown on click/touch outside
  useEffect(() => {
    if (!showClientDropdown) return;
    const handleOutside = (e) => {
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target)) {
        setShowClientDropdown(false);
        setShowNewClient(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [showClientDropdown]);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    try {
      const parts = newClientName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ') || null;
      const res = await api.post('/clients', { firstName, lastName, email: newClientEmail.trim() || null });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.catalog() });
      setForm(prev => ({ ...prev, clientId: res.data.id }));
      setClientSearch('');
      setNewClientName('');
      setNewClientEmail('');
      setShowNewClient(false);
      setShowClientDropdown(false);
    } catch (err) {
      console.error('Failed to create client', err);
    } finally {
      setCreatingClient(false);
    }
  };

  const filteredClients = clients.filter(c => {
    const name = `${c.firstName || ''} ${c.lastName || ''} ${c.company || ''} ${c.email || ''}`.toLowerCase();
    return name.includes(clientSearch.toLowerCase());
  });

  const selectedClient = clients.find(c => c.id === form.clientId);

  // Available team members (active, not already assigned)
  const assignedIds = teamAssignments.map(a => a.teamMemberId);
  const availableMembers = teamMembers.filter(m => m.isActive && !assignedIds.includes(m.id));

  const addMember = (member) => {
    const defaultRole = member.role && member.role !== 'owner' && member.role !== 'manager' ? member.role : '';
    setTeamAssignments(prev => [...prev, {
      teamMemberId: member.id,
      role: defaultRole,
      name: getMemberName(member),
    }]);
  };

  const removeMember = (teamMemberId) => {
    setTeamAssignments(prev => prev.filter(a => a.teamMemberId !== teamMemberId));
  };

  const updateMemberRole = (teamMemberId, role) => {
    setTeamAssignments(prev => prev.map(a =>
      a.teamMemberId === teamMemberId ? { ...a, role } : a
    ));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    const payload = {
      ...form,
      clientId: form.clientId || null,
      projectTypeId: form.projectTypeId || null,
      projectType: getTypeById(form.projectTypeId)?.slug || null,
      shootStartDate: form.shootStartDate || null,
      shootEndDate: isMultiDay && form.shootEndDate ? form.shootEndDate : null,
      deliveryDate: form.deliveryDate || null,
      projectPrice: form.projectPrice ? parseFloat(form.projectPrice) : null,
    };

    try {
      if (isEdit) {
        await updateProject.mutateAsync({ id: project.id, ...payload });

        // Handle assignment changes for edit mode
        const existingIds = (project.assignments || []).map(a => a.id);
        const currentExistingIds = teamAssignments.filter(a => a.existingId).map(a => a.existingId);

        // Delete removed assignments
        const removedIds = existingIds.filter(id => !currentExistingIds.includes(id));
        for (const id of removedIds) {
          await api.delete(`/assignments/${id}`).catch(() => {});
        }

        // Create new assignments
        const newAssignments = teamAssignments.filter(a => !a.existingId);
        for (const a of newAssignments) {
          await api.post('/assignments', {
            projectId: project.id,
            teamMemberId: a.teamMemberId,
            role: a.role || undefined,
          }).catch(() => {});
        }

        // Update roles on existing assignments that changed
        for (const a of teamAssignments.filter(a => a.existingId)) {
          const orig = (project.assignments || []).find(o => o.id === a.existingId);
          if (orig && orig.role !== a.role) {
            await api.put(`/assignments/${a.existingId}`, { role: a.role || undefined }).catch(() => {});
          }
        }

        if (removedIds.length || newAssignments.length) {
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
        }

        onOpenChange(false);
      } else {
        const newProject = await createProject.mutateAsync(payload);

        // Create assignments for the new project
        if (teamAssignments.length > 0 && newProject?.id) {
          await Promise.all(teamAssignments.map(a =>
            api.post('/assignments', {
              projectId: newProject.id,
              teamMemberId: a.teamMemberId,
              role: a.role || undefined,
            }).catch(() => {})
          ));
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
        }

        onOpenChange(false);
      }
    } catch {
      // Mutation error handlers show toasts
    }
  };

  const isPending = createProject.isPending || updateProject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card fixed inset-0 translate-x-0 translate-y-0 top-0 left-0 max-h-full w-full rounded-none sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:rounded-lg flex flex-col overflow-hidden">
        <DialogHeader className="border-b border-surface-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] pb-4">
          <DialogTitle>{isEdit ? 'Edit Project' : 'New Project'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="glass-input w-full"
                placeholder="e.g. Smith Wedding"
                required
                autoFocus
              />
            </div>

            {/* Client picker */}
            <div className="relative" ref={clientPickerRef}>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Client</label>
              <input
                type="text"
                value={showClientDropdown ? clientSearch : (selectedClient ? `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim() : '')}
                onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); setShowNewClient(false); }}
                onFocus={() => setShowClientDropdown(true)}
                className="glass-input w-full"
                placeholder="Search clients... (optional)"
              />
              {form.clientId && !showClientDropdown && (
                <button type="button" onClick={() => { setForm({ ...form, clientId: '' }); setClientSearch(''); setShowClientDropdown(true); }} className="absolute right-3 top-[calc(50%+8px)] -translate-y-1/2 text-surface-400 hover:text-surface-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {showClientDropdown && (
                <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto glass-card shadow-lg rounded-lg border border-surface-200">
                  {!showNewClient ? (
                    <>
                      {filteredClients.length === 0 && clientSearch.trim() ? (
                        <div className="px-3 py-2.5 text-sm text-surface-400">No clients match "{clientSearch}"</div>
                      ) : (
                        filteredClients.slice(0, 20).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface-100 active:bg-surface-100 transition-colors flex justify-between"
                            onClick={() => {
                              setForm({ ...form, clientId: c.id });
                              setClientSearch('');
                              setShowClientDropdown(false);
                            }}
                          >
                            <span className="font-medium text-surface-700">{c.firstName} {c.lastName}</span>
                            {c.company && <span className="text-surface-400 text-xs">{c.company}</span>}
                          </button>
                        ))
                      )}
                      {/* Create new client button */}
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface-100 active:bg-surface-100 transition-colors flex items-center gap-2 text-blue-600 dark:text-blue-400 border-t border-surface-100 font-medium"
                        onClick={() => { setShowNewClient(true); setNewClientName(clientSearch.trim()); setNewClientEmail(''); }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Create new client{clientSearch.trim() ? `: "${clientSearch.trim()}"` : ''}
                      </button>
                    </>
                  ) : (
                    /* Inline new client mini-form */
                    <div className="p-3 space-y-2.5">
                      <p className="text-xs font-semibold text-surface-600 uppercase tracking-wider">New Client</p>
                      <input
                        type="text"
                        value={newClientName}
                        onChange={e => setNewClientName(e.target.value)}
                        className="glass-input w-full text-sm"
                        placeholder="Full name *"
                        autoFocus
                      />
                      <input
                        type="email"
                        value={newClientEmail}
                        onChange={e => setNewClientEmail(e.target.value)}
                        className="glass-input w-full text-sm"
                        placeholder="Email (optional)"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!newClientName.trim() || creatingClient}
                          onClick={handleCreateClient}
                          className="action-btn text-xs flex-1 justify-center"
                        >
                          {creatingClient ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create & Select'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewClient(false)}
                          className="text-xs text-surface-400 hover:text-surface-600 transition-colors px-2"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type + Status row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-surface-600 mb-1 block">Type</label>
                <select
                  value={form.projectTypeId}
                  onChange={e => setForm({ ...form, projectTypeId: e.target.value })}
                  className="glass-input w-full"
                >
                  <option value="">None</option>
                  {projectTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600 mb-1 block">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  className="glass-input w-full"
                >
                  {PROJECT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Shoot date row */}
            <div className="space-y-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isMultiDay}
                  onChange={e => {
                    setIsMultiDay(e.target.checked);
                    if (!e.target.checked) setForm(prev => ({ ...prev, shootEndDate: '' }));
                  }}
                  className="rounded border-surface-300"
                />
                <span className="text-xs text-surface-500">Multi-day shoot</span>
              </label>
              <div>
                <label className="text-xs font-medium text-surface-600 mb-1 block">Shoot Date</label>
                <input
                  type="date"
                  value={form.shootStartDate}
                  onChange={e => {
                    const val = e.target.value;
                    const updates = { ...form, shootStartDate: val };
                    if (val && (!form.deliveryDate || deliveryAutoSet)) {
                      const d = new Date(val);
                      d.setDate(d.getDate() + 28);
                      updates.deliveryDate = toDateInput(d);
                      setDeliveryAutoSet(true);
                    }
                    setForm(updates);
                  }}
                  className="glass-input w-full"
                />
              </div>
              {isMultiDay && (
                <div>
                  <label className="text-xs font-medium text-surface-600 mb-1 block">End Date</label>
                  <input
                    type="date"
                    value={form.shootEndDate}
                    min={form.shootStartDate || undefined}
                    onChange={e => setForm({ ...form, shootEndDate: e.target.value })}
                    className="glass-input w-full"
                  />
                </div>
              )}

              {/* Delivery date */}
              <div>
                <label className="text-xs font-medium text-surface-600 mb-1 block">Delivery Date</label>
                <input
                  type="date"
                  value={form.deliveryDate}
                  onChange={e => {
                    setForm({ ...form, deliveryDate: e.target.value });
                    setDeliveryAutoSet(false);
                  }}
                  className="glass-input w-full"
                />
                {deliveryAutoSet && form.deliveryDate && (
                  <p className="text-[10px] text-surface-400 mt-0.5">Auto-set to 4 weeks after shoot</p>
                )}
              </div>
            </div>

            {/* Location & Address */}
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Location Name</label>
              <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="glass-input w-full" placeholder="e.g. The Grand Venue" />
            </div>
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Street Address</label>
              <input type="text" value={form.addressStreet} onChange={e => setForm({ ...form, addressStreet: e.target.value })} className="glass-input w-full" placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-medium text-surface-600 mb-1 block">City</label>
                <input type="text" value={form.addressCity} onChange={e => setForm({ ...form, addressCity: e.target.value })} className="glass-input w-full" placeholder="Miami" />
              </div>
              <div className="col-span-1">
                <label className="text-xs font-medium text-surface-600 mb-1 block">State</label>
                <select value={form.addressState} onChange={e => setForm({ ...form, addressState: e.target.value })} className="glass-input w-full">
                  <option value="">—</option>
                  {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-surface-600 mb-1 block">Zip</label>
                <input type="text" value={form.addressZip} onChange={e => setForm({ ...form, addressZip: e.target.value })} className="glass-input w-full" placeholder="33101" />
              </div>
            </div>

            {/* Project Price */}
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Project Price</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.projectPrice}
                onChange={e => setForm({ ...form, projectPrice: e.target.value })}
                className="glass-input w-full"
                placeholder="Total amount owed by client (optional)"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-surface-600 mb-1 block">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="glass-input w-full resize-none" rows={2} placeholder="Project notes or details..." />
            </div>

            {/* ─── Team Section (privileged only) ─── */}
            {isPrivileged && (
              <div className="pt-2">
                <div className="border-t border-surface-150 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-lg bg-surface-100 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-surface-400" />
                    </div>
                    <span className="text-xs font-semibold text-surface-600 uppercase tracking-wider">Team</span>
                  </div>

                  {/* Assigned members */}
                  {teamAssignments.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      <AnimatePresence mode="popLayout">
                        {teamAssignments.map(a => (
                          <motion.div
                            key={a.teamMemberId}
                            layout
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-50 border border-surface-100">
                              <div className="w-7 h-7 rounded-full bg-surface-200 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-bold text-surface-500">{getInitials(a.name)}</span>
                              </div>
                              <span className="text-sm font-medium text-surface-700 truncate flex-1 min-w-0">{a.name}</span>
                              <select
                                value={a.role}
                                onChange={e => updateMemberRole(a.teamMemberId, e.target.value)}
                                className="text-[11px] font-medium bg-[rgb(var(--glass-bg))] border border-surface-200 rounded-md px-1.5 py-1 text-surface-600 focus:outline-none focus:ring-1 focus:ring-teal-300 flex-shrink-0"
                              >
                                <option value="">Role...</option>
                                {assignmentRoles.map(r => <option key={r.label} value={r.label}>{r.label}</option>)}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeMember(a.teamMemberId)}
                                className="p-1 rounded text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Available members — collapsible */}
                  {teamMembers.length === 0 ? (
                    <p className="text-xs text-surface-400 text-center py-3">No team members yet</p>
                  ) : availableMembers.length === 0 ? (
                    <p className="text-xs text-surface-400 text-center py-2">All members assigned</p>
                  ) : (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => setShowAvailable(!showAvailable)}
                        className="w-full flex items-center justify-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 border border-dashed border-teal-300 hover:border-teal-400 hover:bg-teal-50 rounded-lg px-3 py-2.5 transition-colors"
                      >
                        <Plus className={`w-4 h-4 transition-transform duration-200 ${showAvailable ? 'rotate-45' : ''}`} />
                        {showAvailable ? 'Hide members' : `Add members (${availableMembers.length})`}
                      </button>
                      <AnimatePresence>
                        {showAvailable && (
                          <motion.div
                            ref={availableRef}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            onAnimationComplete={(def) => {
                              if (def.height === 'auto') {
                                availableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }
                            }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1 mt-1.5">
                              {availableMembers.map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => addMember(m)}
                                  className="w-full text-left p-2 rounded-lg hover:bg-teal-50 border border-dashed border-surface-200 hover:border-teal-300 transition-colors flex items-center gap-2"
                                >
                                  <div className="w-7 h-7 rounded-full bg-surface-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-bold text-surface-500">{getInitials(getMemberName(m))}</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-surface-600 truncate">{getMemberName(m)}</p>
                                  </div>
                                  <span className="text-[10px] text-surface-400 flex-shrink-0">{TEAM_ROLE_LABELS[m.role] || m.role}</span>
                                  <Plus className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 flex-shrink-0 gap-3 border-t border-surface-100 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || !form.title.trim()}>
              {isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isEdit ? 'Update' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFormDialog;
