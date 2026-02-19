import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Loader2, X, Users, Plus, ChevronDown, MapPin, Calendar, DollarSign, FileText, Save } from 'lucide-react';
import { useClientsCatalog, useAppData } from '@/hooks/useAppData';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateProject, useUpdateProject } from '@/hooks/useMutations';
import { queryKeys } from '@/lib/queryKeys';
import { useProjectTypes } from '@/lib/projectTypes';
import { useProjectRoles } from '@/lib/projectRoles';
import { TEAM_ROLE_LABELS } from '@/lib/teamRoles';
import api from '@/lib/apiClient';

export const PROJECT_STATUSES = [
  { value: 'lead', label: 'Lead' },
  { value: 'booked', label: 'Booked' },
  { value: 'shooting', label: 'Shooting' },
  { value: 'editing', label: 'Editing' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP'];

const EMPTY_FORM = {
  title: '', clientId: '', projectTypeId: '', status: 'lead',
  shootStartDate: '', shootEndDate: '', deliveryDate: '',
  location: '', addressStreet: '', addressCity: '', addressState: 'CA', addressZip: '',
  description: '', projectPrice: '',
};

function getMemberName(m) {
  return m.displayName || m.firstName || m.name || m.userName || m.userEmail || '—';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

const Section = ({ icon: Icon, title, children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.3 }}
    className="content-card"
  >
    <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
      <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-surface-500" />
      </div>
      <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">{title}</h2>
    </div>
    <div className="px-5 pb-5 space-y-4">
      {children}
    </div>
  </motion.div>
);

// ─── ProjectForm ─────────────────────────────────────────────────────────────

const ProjectForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClientsCatalog();
  const { isPrivileged } = useAppData();
  const { user } = useAuth();
  const { types: projectTypes, getTypeById } = useProjectTypes();
  const { roles: assignmentRoles } = useProjectRoles();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isEdit = !!id;

  // Load existing project for edit mode
  const { data: projectRes, isLoading } = useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => api.get(`/projects/${id}`),
    enabled: isEdit,
  });
  const project = projectRes?.data;

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
  const [teamAssignments, setTeamAssignments] = useState([]);
  const [showAvailable, setShowAvailable] = useState(false);
  const availableRef = useRef(null);

  // Populate form for edit mode or apply defaults for create
  useEffect(() => {
    if (isEdit && project) {
      const hasEnd = !!project.shootEndDate;
      setIsMultiDay(hasEnd);
      setDeliveryAutoSet(false);
      setForm({
        title: project.title || '',
        clientId: project.clientId || '',
        projectTypeId: project.projectTypeId || '',
        status: project.status || 'lead',
        shootStartDate: project.shootStartDate ? new Date(project.shootStartDate).toISOString().split('T')[0] : '',
        shootEndDate: hasEnd ? new Date(project.shootEndDate).toISOString().split('T')[0] : '',
        deliveryDate: project.deliveryDate ? new Date(project.deliveryDate).toISOString().split('T')[0] : '',
        location: project.location || '',
        addressStreet: project.addressStreet || '',
        addressCity: project.addressCity || '',
        addressState: project.addressState || '',
        addressZip: project.addressZip || '',
        description: project.description || '',
        projectPrice: project.projectPrice != null ? project.projectPrice.toString() : '',
      });
      if (project.assignments) {
        setTeamAssignments(project.assignments.map(a => ({
          teamMemberId: a.teamMemberId,
          role: a.role || '',
          name: a.teamMember?.user?.profile?.displayName || a.teamMember?.user?.name || a.teamMember?.name || a.teamMember?.user?.email || '—',
          existingId: a.id,
        })));
      }
    } else if (!isEdit) {
      const shootDate = searchParams.get('shootDate');
      setForm({ ...EMPTY_FORM, ...(shootDate ? { shootStartDate: shootDate } : {}) });
      setIsMultiDay(false);
      setDeliveryAutoSet(false);
      setTeamAssignments([]);
    }
  }, [isEdit, project]);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const filteredClients = clients.filter(c => {
    const name = `${c.firstName || ''} ${c.lastName || ''} ${c.company || ''} ${c.email || ''}`.toLowerCase();
    return name.includes(clientSearch.toLowerCase());
  });
  const selectedClient = clients.find(c => c.id === form.clientId);

  // Team assignment helpers
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

        // Handle assignment changes
        const existingIds = (project.assignments || []).map(a => a.id);
        const currentExistingIds = teamAssignments.filter(a => a.existingId).map(a => a.existingId);
        const removedIds = existingIds.filter(id => !currentExistingIds.includes(id));
        for (const rid of removedIds) {
          await api.delete(`/assignments/${rid}`).catch(() => {});
        }
        const newAssignments = teamAssignments.filter(a => !a.existingId);
        for (const a of newAssignments) {
          await api.post('/assignments', { projectId: project.id, teamMemberId: a.teamMemberId, role: a.role || undefined }).catch(() => {});
        }
        for (const a of teamAssignments.filter(a => a.existingId)) {
          const orig = (project.assignments || []).find(o => o.id === a.existingId);
          if (orig && orig.role !== a.role) {
            await api.put(`/assignments/${a.existingId}`, { role: a.role || undefined }).catch(() => {});
          }
        }
        if (removedIds.length || newAssignments.length) {
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
        }
        navigate(`/projects/${project.id}`);
      } else {
        const newProject = await createProject.mutateAsync(payload);
        if (teamAssignments.length > 0 && newProject?.id) {
          await Promise.all(teamAssignments.map(a =>
            api.post('/assignments', { projectId: newProject.id, teamMemberId: a.teamMemberId, role: a.role || undefined }).catch(() => {})
          ));
          queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
        }
        navigate(`/projects/${newProject?.id || ''}`);
      }
    } catch {
      // Mutation error handlers show toasts
    }
  };

  const isPending = createProject.isPending || updateProject.isPending;

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-surface-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/projects/${id}` : '/projects')}
            className="flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-semibold text-surface-800">
            {isEdit ? 'Edit Project' : 'New Project'}
          </h1>
        </div>
        <button
          type="submit"
          disabled={isPending || !form.title.trim()}
          className="action-btn text-sm flex items-center gap-2"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? 'Save Changes' : 'Create Project'}
        </button>
      </motion.div>

      {/* ─── Details Section ─── */}
      <Section icon={FileText} title="Details" delay={0.05}>
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
        <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setShowClientDropdown(false); }}>
          <label className="text-xs font-medium text-surface-600 mb-1 block">Client</label>
          <input
            type="text"
            value={showClientDropdown ? clientSearch : (selectedClient ? `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim() : '')}
            onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
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
            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto glass-card shadow-lg rounded-lg border border-surface-200">
              {filteredClients.length === 0 ? (
                <div className="px-3 py-2 text-sm text-surface-400">No clients found</div>
              ) : (
                filteredClients.slice(0, 20).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-surface-100 transition-colors flex justify-between"
                    onClick={() => {
                      setForm({ ...form, clientId: c.id });
                      setClientSearch('');
                      setShowClientDropdown(false);
                    }}
                  >
                    <span className="font-medium">{c.firstName} {c.lastName}</span>
                    {c.company && <span className="text-surface-400 text-xs">{c.company}</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Type + Status */}
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

        <div>
          <label className="text-xs font-medium text-surface-600 mb-1 block">Description</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="glass-input w-full resize-none" rows={3} placeholder="Project notes or details..." />
        </div>
      </Section>

      {/* ─── Schedule Section ─── */}
      <Section icon={Calendar} title="Schedule" delay={0.1}>
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

        <div className={`grid gap-3 ${isMultiDay ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                  updates.deliveryDate = d.toISOString().split('T')[0];
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
      </Section>

      {/* ─── Location Section ─── */}
      <Section icon={MapPin} title="Location" delay={0.15}>
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
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-surface-600 mb-1 block">Zip</label>
            <input type="text" value={form.addressZip} onChange={e => setForm({ ...form, addressZip: e.target.value })} className="glass-input w-full" placeholder="33101" />
          </div>
        </div>
      </Section>

      {/* ─── Pricing Section ─── */}
      <Section icon={DollarSign} title="Pricing" delay={0.2}>
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
      </Section>

      {/* ─── Team Section (privileged only) ─── */}
      {isPrivileged && (
        <Section icon={Users} title="Team" delay={0.25}>
          {/* Assigned members */}
          {teamAssignments.length > 0 && (
            <div className="space-y-1.5">
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
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-50 border border-surface-100">
                      <div className="w-7 h-7 rounded-full bg-surface-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-surface-500">{getInitials(a.name)}</span>
                      </div>
                      <span className="text-sm font-medium text-surface-700 truncate flex-1 min-w-0">{a.name}</span>
                      <select
                        value={a.role}
                        onChange={e => updateMemberRole(a.teamMemberId, e.target.value)}
                        className="text-[11px] font-medium bg-white border border-surface-200 rounded-md px-1.5 py-1 text-surface-600 focus:outline-none focus:ring-1 focus:ring-teal-300 flex-shrink-0"
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

          {/* Available members */}
          {teamMembers.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-3">No team members yet</p>
          ) : availableMembers.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-2">All members assigned</p>
          ) : (
            <div>
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
        </Section>
      )}

      {/* Bottom save button (mobile) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="md:hidden"
      >
        <button
          type="submit"
          disabled={isPending || !form.title.trim()}
          className="action-btn text-sm w-full flex items-center justify-center gap-2 py-3"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? 'Save Changes' : 'Create Project'}
        </button>
      </motion.div>
    </form>
  );
};

export default ProjectForm;
