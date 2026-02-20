import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';
import { fmtDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateUser, useUpdateUser, useDeleteUser, useVerifyUser, useResendVerification, useApproveUser, useRejectUser } from '@/hooks/useMutations';
import { Edit2, Trash2, Shield, User, Loader2, Send, KeyRound, CheckCircle2, AlertCircle, Mail, ShieldCheck, Clock, UserCheck, UserX, LogIn } from 'lucide-react';
import { authClient } from '@/lib/authClient';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import PasswordInput from '@/components/ui/PasswordInput';

const TEAM_ROLES = [
  { value: '', label: 'No team role' },
  { value: 'manager', label: 'Manager' },
  { value: 'lead', label: 'Lead' },
  { value: 'crew', label: 'Crew' },
];

const UsersManager = () => {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => api.get('/users').then(r => r.data),
  });
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ email: '', password: '', role: 'user', firstName: '', lastName: '', displayName: '' });
  const { data: unlinkedMembers = [] } = useQuery({
    queryKey: queryKeys.team.unlinked(),
    queryFn: () => api.get('/team/unlinked').then(r => r.data),
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [pendingRoles, setPendingRoles] = useState({});
  const [pendingLinks, setPendingLinks] = useState({});

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const verifyUser = useVerifyUser();
  const resendVerification = useResendVerification();
  const approveUser = useApproveUser();
  const rejectUser = useRejectUser();
  const [impersonatingId, setImpersonatingId] = useState(null);
  const isSubmitting = createUser.isPending || updateUser.isPending;

  const handleImpersonate = async (userId) => {
    setImpersonatingId(userId);
    const { error } = await authClient.admin.impersonateUser({ userId });
    if (error) {
      toast({ title: 'Failed to impersonate', description: error.message || 'Something went wrong', variant: 'destructive' });
      setImpersonatingId(null);
      return;
    }
    window.location.href = '/dashboard';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        if (formData.password && formData.password.length < 6) {
          toast({ title: "Password must be at least 6 characters", variant: "destructive" });
          return;
        }
        await updateUser.mutateAsync({
          id: editingUser.id,
          role: formData.role,
          firstName: formData.firstName,
          lastName: formData.lastName,
          displayName: formData.displayName,
          ...(formData.password ? { password: formData.password } : {}),
        });
      } else {
        if (!formData.password || formData.password.length < 6) {
          toast({ title: "Password must be at least 6 characters", variant: "destructive" });
          return;
        }
        await createUser.mutateAsync({
          email: formData.email,
          password: formData.password,
          role: formData.role,
          name: formData.displayName || formData.email,
        });
      }
      resetForm();
    } catch { /* handled by mutation onError */ }
  };

  const confirmDelete = (id) => {
    setUserToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    const target = users.find(u => u.id === userToDelete);
    if (target?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      toast({ title: "Cannot delete the only admin user", variant: "destructive" });
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      return;
    }

    try {
      await deleteUser.mutateAsync(userToDelete);
    } catch { /* handled by mutation onError */ }
    setIsDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      role: user.role,
      firstName: user.firstName || user.first_name || '',
      lastName: user.lastName || user.last_name || '',
      displayName: user.displayName || user.display_name || '',
    });
    setIsFormVisible(true);
  };

  const handleVerify = (id) => verifyUser.mutate(id);
  const handleResendVerification = (id) => resendVerification.mutate(id);
  const handleApprove = (id) => approveUser.mutate({ id, teamRole: pendingRoles[id] || '', linkTeamMemberId: pendingLinks[id] || '' });
  const handleReject = (id) => rejectUser.mutate(id);

  const pendingUsers = users.filter(u => !u.approved);
  const approvedUsers = users.filter(u => u.approved);

  const resetForm = () => {
    setFormData({ email: '', password: '', role: 'user', firstName: '', lastName: '', displayName: '' });
    setEditingUser(null);
    setIsFormVisible(false);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Users</h2>
          <p className="text-surface-400 text-sm">Manage application users and permissions</p>
        </div>
        <button onClick={() => { resetForm(); setIsFormVisible(!isFormVisible); }} className="action-btn py-1.5 px-4 text-sm">{isFormVisible ? 'Cancel' : 'Create User'}</button>
      </div>

      {isFormVisible && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 mb-6">
          <h3 className="text-xl font-bold mb-4">{editingUser ? 'Edit User' : 'Create New User'}</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" placeholder="First Name" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="glass-input w-full py-1.5" />
              <input type="text" placeholder="Last Name" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="glass-input w-full py-1.5" />
              <input type="text" placeholder="Display Name" value={formData.displayName} onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} className="glass-input w-full py-1.5" />
              <input type="email" placeholder="Email *" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="glass-input w-full py-1.5" required disabled={editingUser} />
              <PasswordInput placeholder={editingUser ? "New Password (optional)" : "Password *"} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="glass-input w-full py-1.5 pr-9" />
              <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="glass-input w-full py-1.5" disabled={editingUser?.id === currentUser.id}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="submit" className="action-btn py-1.5 px-4 text-sm" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> :
                editingUser ? <><KeyRound className="w-4 h-4 mr-2" /> Update User</> : <><Send className="w-4 h-4 mr-2" /> Create User</>}
              </button>
              <button type="button" onClick={resetForm} className="action-btn action-btn--secondary py-1.5 px-4 text-sm">Cancel</button>
            </div>
          </form>
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          {/* Pending Approval Section */}
          {pendingUsers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pending Approval ({pendingUsers.length})</h3>
              </div>

              {/* Mobile: card-based layout */}
              <div className="md:hidden space-y-3">
                {pendingUsers.map((u, index) => (
                  <motion.div key={u.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="rounded-xl border border-amber-200 bg-[rgb(var(--glass-bg))] p-4 space-y-3"
                  >
                    {/* User info */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-surface-900 truncate">{u.displayName || u.display_name || u.email}</p>
                        <p className="text-[13px] text-surface-500 truncate mt-0.5">{u.email}</p>
                      </div>
                    </div>

                    {/* Status row */}
                    <div className="flex items-center gap-3 text-[11.5px]">
                      <span className="user-row__verified">
                        {u.emailVerified
                          ? <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Verified</span>
                          : <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Unverified</span>
                        }
                      </span>
                      <span className="text-surface-300">&middot;</span>
                      <span className="text-surface-400">{fmtDate(u.createdAt || u.created_at)}</span>
                    </div>

                    {/* Selects row */}
                    <div className="flex gap-2">
                      {unlinkedMembers.length > 0 && (
                        <select
                          value={pendingLinks[u.id] || ''}
                          onChange={(e) => {
                            setPendingLinks(prev => ({ ...prev, [u.id]: e.target.value }));
                            if (e.target.value) {
                              const member = unlinkedMembers.find(m => m.id === e.target.value);
                              if (member) setPendingRoles(prev => ({ ...prev, [u.id]: member.role }));
                            }
                          }}
                          className="glass-input text-sm !py-2.5 !px-3 !rounded-lg flex-1 min-w-0"
                        >
                          <option value="">Link member...</option>
                          {unlinkedMembers.map(m => (
                            <option key={m.id} value={m.id}>{m.name || 'Unnamed'}</option>
                          ))}
                        </select>
                      )}
                      {!pendingLinks[u.id] && (
                        <select
                          value={pendingRoles[u.id] || ''}
                          onChange={(e) => setPendingRoles(prev => ({ ...prev, [u.id]: e.target.value }))}
                          className="glass-input text-sm !py-2.5 !px-3 !rounded-lg flex-1 min-w-0"
                        >
                          {TEAM_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(u.id)} disabled={approveUser.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-lg text-[14px] font-semibold bg-surface-900 text-[#C8C6C2] active:bg-surface-800 transition-colors"
                      >
                        {approveUser.isPending && approveUser.variables?.id === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserCheck className="w-4 h-4" /> Approve</>}
                      </button>
                      <button onClick={() => handleReject(u.id)} disabled={rejectUser.isPending}
                        className="flex items-center justify-center gap-1.5 h-11 px-5 rounded-lg text-[14px] font-medium text-surface-500 border border-surface-200 active:bg-red-50 active:text-red-500 active:border-red-200 transition-colors"
                      >
                        {rejectUser.isPending && rejectUser.variables === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Desktop: table-style rows */}
              <div className="hidden md:block border border-border rounded-lg overflow-hidden">
                {pendingUsers.map((u, index) => (
                  <motion.div key={u.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="user-row user-row--pending !py-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="user-row__body">
                      <p className="user-row__name truncate">{u.displayName || u.display_name || u.email}</p>
                      <p className="user-row__email">{u.email}</p>
                    </div>
                    <div className="user-row__meta">
                      <span className="user-row__verified shrink-0">
                        {u.emailVerified
                          ? <span className="text-emerald-500 flex items-center gap-0.5"><CheckCircle2 />Verified</span>
                          : <span className="text-amber-500 flex items-center gap-0.5"><AlertCircle />Unverified</span>
                        }
                      </span>
                      <span className="user-row__date">{fmtDate(u.createdAt || u.created_at)}</span>
                    </div>
                    <div className="user-row__approve-actions hidden md:flex">
                      {unlinkedMembers.length > 0 && (
                        <select
                          value={pendingLinks[u.id] || ''}
                          onChange={(e) => {
                            setPendingLinks(prev => ({ ...prev, [u.id]: e.target.value }));
                            if (e.target.value) {
                              const member = unlinkedMembers.find(m => m.id === e.target.value);
                              if (member) setPendingRoles(prev => ({ ...prev, [u.id]: member.role }));
                            }
                          }}
                          className="glass-input text-xs !py-1.5 !px-2.5 w-[140px]"
                        >
                          <option value="">Link member...</option>
                          {unlinkedMembers.map(m => (
                            <option key={m.id} value={m.id}>{m.name || 'Unnamed'}</option>
                          ))}
                        </select>
                      )}
                      {!pendingLinks[u.id] && (
                        <select
                          value={pendingRoles[u.id] || ''}
                          onChange={(e) => setPendingRoles(prev => ({ ...prev, [u.id]: e.target.value }))}
                          className="glass-input text-xs !py-1.5 !px-2.5 w-[130px]"
                        >
                          {TEAM_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      )}
                      <button onClick={() => handleApprove(u.id)} disabled={approveUser.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-surface-900 text-[#C8C6C2] hover:bg-surface-800 transition-colors"
                      >
                        {approveUser.isPending && approveUser.variables?.id === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><UserCheck className="w-3 h-3" /> Approve</>}
                      </button>
                      <button onClick={() => handleReject(u.id)} disabled={rejectUser.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-surface-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        {rejectUser.isPending && rejectUser.variables === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Active Users */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Active Users ({approvedUsers.length})</h3>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              {approvedUsers.map((u, index) => {
                const canModify = !u.isSuperAdmin && u.id !== currentUser.id;
                const iconBg = u.isSuperAdmin ? 'bg-amber-50' : u.role === 'admin' ? 'bg-violet-50' : 'bg-surface-100';
                const iconColor = u.isSuperAdmin ? 'text-amber-600' : u.role === 'admin' ? 'text-violet-600' : 'text-surface-400';
                return (
                  <motion.div key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.03 }}
                    className="user-row group"
                  >
                    <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
                      {u.isSuperAdmin ? <ShieldCheck className={`w-4 h-4 ${iconColor}`} /> : u.role === 'admin' ? <Shield className={`w-4 h-4 ${iconColor}`} /> : <User className={`w-4 h-4 ${iconColor}`} />}
                    </div>

                    <div className="user-row__body">
                      <div className="flex items-center gap-2">
                        <p className="user-row__name truncate">{u.displayName || u.display_name || u.email}</p>
                        <span className={`user-row__badge ${u.isSuperAdmin ? 'user-row__badge--super' : u.role === 'admin' ? 'user-row__badge--admin' : ''}`}>
                          {u.isSuperAdmin ? 'Owner' : u.role}
                        </span>
                      </div>
                      <p className="user-row__email">{u.email}</p>
                    </div>

                    <div className="user-row__meta">
                      <span className="user-row__verified">
                        {u.emailVerified
                          ? <span className="text-emerald-500 flex items-center gap-0.5"><CheckCircle2 />Verified</span>
                          : <span className="text-amber-500 flex items-center gap-0.5"><AlertCircle />Unverified</span>
                        }
                      </span>
                      <span className="user-row__date">{fmtDate(u.createdAt || u.created_at)}</span>
                    </div>

                    <div className="user-row__actions">
                      {!u.emailVerified && (
                        <>
                          <button onClick={() => handleVerify(u.id)} disabled={verifyUser.isPending} className="user-row__action user-row__action--success" title="Verify email">
                            {verifyUser.isPending && verifyUser.variables === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleResendVerification(u.id)} disabled={resendVerification.isPending} className="user-row__action" title="Resend verification">
                            {resendVerification.isPending && resendVerification.variables === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          </button>
                        </>
                      )}
                      {canModify && (
                        <button onClick={() => handleImpersonate(u.id)} disabled={impersonatingId === u.id} className="user-row__action user-row__action--warning" title="Login as user">
                          {impersonatingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {!u.isSuperAdmin && (
                        <button onClick={() => handleEdit(u)} className="user-row__action" title="Edit user">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canModify && (
                        <button onClick={() => confirmDelete(u.id)} className="user-row__action user-row__action--danger" title="Delete user">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user "{users.find(u => u.id === userToDelete)?.displayName || users.find(u => u.id === userToDelete)?.email}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersManager;
