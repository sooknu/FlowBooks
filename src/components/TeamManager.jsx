import React, { useState, useMemo, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Plus, Pencil, Trash2, Users, UserPlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useAppData } from '@/hooks/useAppData';
import { useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember } from '@/hooks/useMutations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { TEAM_ROLES, TEAM_ROLE_LABELS } from '@/lib/teamRoles';

const LazyUsersManager = React.lazy(() => import('@/components/UsersManager'));

const EMPTY_FORM = {
  userId: '',
  name: '',
  role: 'crew',
  paymentMethod: '',
  notes: '',
  advancesEnabled: false,
  salaryEnabled: false,
  weeklySalary: '',
};

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-cyan-100 text-cyan-700',
  'bg-pink-100 text-pink-700',
];

function avatarColor(id) {
  let hash = 0;
  for (let i = 0; i < (id || '').length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Derive display fields from flat API response
function memberDisplay(m) {
  const name = m.displayName || m.userName || [m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.userEmail || 'Unknown';
  const email = m.userEmail || '';
  const image = m.avatarUrl || m.userImage || null;
  const isLinked = !!m.userId;
  return { name, email, image, isLinked };
}

const TeamManager = () => {
  const { teamRole, teamMemberId, isPrivileged, can } = useAppData();
  const isOwner = teamRole === 'owner';
  const canApproveUsers = can('approve_users');

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'members');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);

  // Queries
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data),
    enabled: isPrivileged,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: isPrivileged && dialogOpen,
  });

  // Mutations
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMember = useDeleteTeamMember();
  const isSaving = createMember.isPending || updateMember.isPending;

  // Filter out users who are already team members (for "Add Member" dropdown)
  const availableUsers = useMemo(() => {
    const memberUserIds = new Set(teamMembers.map(m => m.userId));
    return allUsers.filter(u => !memberUserIds.has(u.id));
  }, [allUsers, teamMembers]);

  // Tabs config
  const tabs = useMemo(() => {
    const t = [{ key: 'members', label: 'Team Members', icon: Users }];
    if (canApproveUsers) t.push({ key: 'accounts', label: 'User Accounts', icon: Shield });
    return t;
  }, [canApproveUsers]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const openAddDialog = () => {
    setEditingMember(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (member) => {
    setEditingMember(member);
    setFormData({
      userId: member.userId || '',
      name: member.name || memberDisplay(member).name || '',
      role: member.role,
      paymentMethod: member.paymentMethod ?? '',
      notes: member.notes ?? '',
      advancesEnabled: member.advancesEnabled ?? false,
      salaryEnabled: member.salaryEnabled ?? false,
      weeklySalary: member.weeklySalary ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      userId: formData.userId || null,
      name: formData.name || null,
      role: formData.role,
      paymentMethod: formData.paymentMethod || null,
      notes: formData.notes || null,
      advancesEnabled: formData.advancesEnabled,
      salaryEnabled: formData.salaryEnabled,
      weeklySalary: formData.weeklySalary !== '' ? Number(formData.weeklySalary) : null,
    };

    try {
      if (editingMember) {
        await updateMember.mutateAsync({ id: editingMember.id, ...payload });
      } else {
        if (!payload.name?.trim()) return;
        await createMember.mutateAsync(payload);
      }
      setDialogOpen(false);
      setEditingMember(null);
      setFormData(EMPTY_FORM);
    } catch { /* handled by mutation onError */ }
  };

  const confirmDelete = (member) => {
    setMemberToDelete(member);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!memberToDelete) return;
    try {
      await deleteMember.mutateAsync(memberToDelete.id);
    } catch { /* handled by mutation onError */ }
    setDeleteDialogOpen(false);
    setMemberToDelete(null);
  };

  // ─── Access denied ─────────────────────────────────────────────────────────

  if (!isPrivileged) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-surface-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-surface-400 text-sm">You do not have permission to view this page.</p>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-surface-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            <p className="text-surface-400 text-sm">
              {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {activeTab === 'members' && (
          <button onClick={openAddDialog} className="action-btn py-1.5 px-4 text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add Member
          </button>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="nav-tabs flex gap-1 w-full md:w-fit relative">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "nav-tab relative flex items-center gap-1.5 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200",
                activeTab === tab.key ? "nav-tab--active" : ""
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="team-tab-glass"
                  className="nav-tab__glass"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      >
          {activeTab === 'members' && (
            <>
              {teamLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-surface-400" />
                </div>
              ) : teamMembers.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <UserPlus className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                  <p className="text-surface-400 text-sm">No team members yet. Click "Add Member" to get started.</p>
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  {teamMembers.map((member, index) => {
                    const d = memberDisplay(member);
                    const isSelf = member.id === teamMemberId;
                    const isMemberOwner = member.role === 'owner';
                    const canEdit = isOwner || !isMemberOwner;
                    const canDelete = !isSelf && (isOwner || !isMemberOwner);

                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                        className="user-row group"
                      >
                        <Avatar className="user-row__avatar">
                          {d.image && <AvatarImage src={d.image} alt={d.name} />}
                          <AvatarFallback className={cn("text-[10px] font-semibold w-full h-full flex items-center justify-center", avatarColor(member.id))}>
                            {getInitials(d.name)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="user-row__body">
                          <div className="flex items-center gap-2">
                            <span className="user-row__name">{d.name}</span>
                            {member.isActive === false && (
                              <span className="user-row__inactive">Inactive</span>
                            )}
                            {!d.isLinked && (
                              <span className="user-row__inactive">No account</span>
                            )}
                          </div>
                          {d.email && (
                            <p className="user-row__email">{d.email}</p>
                          )}
                        </div>

                        <div className="user-row__meta">
                          <span className="user-row__badge">
                            {TEAM_ROLE_LABELS[member.role] || member.role}
                          </span>
                        </div>

                        <div className="user-row__actions">
                          {canEdit && (
                            <button onClick={() => openEditDialog(member)} className="user-row__action" title="Edit member">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => confirmDelete(member)} className="user-row__action user-row__action--danger" title="Remove member">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'accounts' && canApproveUsers && (
            <Suspense fallback={
              <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-surface-400" />
              </div>
            }>
              <LazyUsersManager />
            </Suspense>
          )}
        </motion.div>

      {/* ─── Add / Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-modal sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingMember ? `Edit — ${memberDisplay(editingMember).name}` : 'Add Team Member'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-surface-400 mb-1 block">Name *</label>
              <input
                type="text"
                placeholder="Team member name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="glass-input w-full"
                required
              />
            </div>

            {/* User account link (optional) */}
            {!editingMember && (
              <div>
                <label className="text-xs font-medium text-surface-400 mb-1 block">Link to User Account <span className="text-surface-300">(optional)</span></label>
                <select
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  className="glass-input w-full"
                >
                  <option value="">No user account</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.displayName || u.display_name || u.name || u.email}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-surface-400 mt-1">You can link a user account later during approval</p>
              </div>
            )}

            {/* Role */}
            <div>
              <label className="text-xs font-medium text-surface-400 mb-1 block">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="glass-input w-full"
                disabled={!isOwner && editingMember?.id === teamMemberId}
              >
                {TEAM_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {!isOwner && editingMember?.id === teamMemberId && (
                <p className="text-[11px] text-surface-400 mt-1">You cannot change your own role</p>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs font-medium text-surface-400 mb-1 block">Payment Method</label>
              <input
                type="text"
                placeholder="e.g. Zelle, Venmo, Cash"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="glass-input w-full"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-surface-400 mb-1 block">Notes</label>
              <textarea
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="glass-input w-full min-h-[80px] resize-y"
                rows={3}
              />
            </div>

            {/* Advances toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.advancesEnabled}
                onChange={e => setFormData({ ...formData, advancesEnabled: e.target.checked })}
                className="rounded border-surface-300 text-primary w-4 h-4"
              />
              <span className="text-sm text-surface-600">Enable advances tracking</span>
            </label>

            {/* Salary toggle + amount */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.salaryEnabled}
                onChange={e => setFormData({ ...formData, salaryEnabled: e.target.checked })}
                className="rounded border-surface-300 text-primary w-4 h-4"
              />
              <span className="text-sm text-surface-600">Enable salary tracking</span>
            </label>
            {formData.salaryEnabled && (
              <div>
                <label className="text-xs font-medium text-surface-400 mb-1 block">Weekly Salary ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 500"
                  value={formData.weeklySalary}
                  onChange={(e) => setFormData({ ...formData, weeklySalary: e.target.value })}
                  className="glass-input w-full"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDialogOpen(false)} className="action-btn action-btn--secondary py-1.5 px-4 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="action-btn py-1.5 px-4 text-sm flex items-center gap-1.5">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingMember ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingMember ? 'Update' : 'Add Member'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ────────────────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-semibold">
                {memberToDelete ? memberDisplay(memberToDelete).name : 'this member'}
              </span>{' '}
              from the team? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="action-btn action-btn--danger">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamManager;
