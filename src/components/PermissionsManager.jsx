import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, RotateCcw, Users, ChevronDown, ChevronRight, X, Loader2 } from 'lucide-react';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import {
  useUpdateRolePermissions,
  useResetRolePermissions,
  useUpdateUserPermissions,
  useClearUserPermissions,
} from '@/hooks/useMutations';
import { cn } from '@/lib/utils';
import { TEAM_ROLE_LABELS } from '@/lib/teamRoles';

const ROLE_ORDER = ['owner', 'manager', 'lead', 'crew'];

function getMemberName(m) {
  return m.displayName || m.userName || m.firstName || m.userEmail || 'Unknown';
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-primary" : "bg-surface-200"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 shadow-sm",
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        )}
      />
    </button>
  );
}

function ThreeStateToggle({ value, onChange }) {
  // value: 'inherit' | 'grant' | 'deny'
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-0.5">
      <button
        type="button"
        onClick={() => onChange('inherit')}
        className={cn(
          "px-2 py-0.5 text-xs rounded-md transition-all",
          value === 'inherit' ? "bg-white text-surface-700 shadow-sm font-medium" : "text-surface-400 hover:text-surface-600"
        )}
      >
        Inherit
      </button>
      <button
        type="button"
        onClick={() => onChange('grant')}
        className={cn(
          "px-2 py-0.5 text-xs rounded-md transition-all",
          value === 'grant' ? "bg-emerald-500 text-white shadow-sm font-medium" : "text-surface-400 hover:text-surface-600"
        )}
      >
        Grant
      </button>
      <button
        type="button"
        onClick={() => onChange('deny')}
        className={cn(
          "px-2 py-0.5 text-xs rounded-md transition-all",
          value === 'deny' ? "bg-red-500 text-white shadow-sm font-medium" : "text-surface-400 hover:text-surface-600"
        )}
      >
        Deny
      </button>
    </div>
  );
}

export default function PermissionsManager() {
  const [selectedRole, setSelectedRole] = useState('manager');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({});
  const [pendingUserChanges, setPendingUserChanges] = useState({});
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [expandedRoleGroups, setExpandedRoleGroups] = useState([]);
  const [expandedUserGroups, setExpandedUserGroups] = useState([]);

  const updateRolePerms = useUpdateRolePermissions();
  const resetRolePerms = useResetRolePermissions();
  const updateUserPerms = useUpdateUserPermissions();
  const clearUserPerms = useClearUserPermissions();

  // Fetch permission metadata
  const { data: keysData } = useQuery({
    queryKey: queryKeys.permissions.keys(),
    queryFn: () => api.get('/permissions/keys').then(r => r.data),
  });

  // Fetch role defaults matrix
  const { data: defaultsData, isLoading: defaultsLoading } = useQuery({
    queryKey: queryKeys.permissions.defaults(),
    queryFn: () => api.get('/permissions/defaults').then(r => r.data),
  });

  // Fetch team members for user override selector
  const { data: teamMembers = [] } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data),
  });

  // Fetch user-specific overrides when a user is selected
  const { data: userOverrideData } = useQuery({
    queryKey: queryKeys.permissions.user(selectedUserId),
    queryFn: () => api.get(`/permissions/user/${selectedUserId}`).then(r => r.data),
    enabled: !!selectedUserId,
  });

  const meta = keysData?.meta || [];
  const groups = keysData?.groups || [];
  const matrix = defaultsData?.matrix || {};
  const hardcodedDefaults = defaultsData?.hardcodedDefaults || {};

  // Group permissions by group
  const groupedPermissions = useMemo(() => {
    const grouped = {};
    for (const g of groups) {
      grouped[g] = meta.filter(m => m.group === g);
    }
    return grouped;
  }, [meta, groups]);

  // Current values for selected role: matrix[role] merged with pending changes
  const currentRolePerms = useMemo(() => {
    const base = matrix[selectedRole] || {};
    return { ...base, ...pendingChanges };
  }, [matrix, selectedRole, pendingChanges]);

  // Check if current has changes from what's in matrix
  const hasRoleChanges = Object.keys(pendingChanges).length > 0;

  const handleRoleToggle = useCallback((key, value) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveRoleChanges = useCallback(async () => {
    await updateRolePerms.mutateAsync({ role: selectedRole, permissions: pendingChanges });
    setPendingChanges({});
  }, [selectedRole, pendingChanges, updateRolePerms]);

  const handleResetRole = useCallback(async () => {
    await resetRolePerms.mutateAsync(selectedRole);
    setPendingChanges({});
  }, [selectedRole, resetRolePerms]);

  const handleRoleChange = useCallback((role) => {
    setSelectedRole(role);
    setPendingChanges({});
  }, []);

  const toggleRoleGroup = useCallback((group) => {
    setExpandedRoleGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  }, []);

  const toggleUserGroup = useCallback((group) => {
    setExpandedUserGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  }, []);

  // User overrides
  const userOverrides = userOverrideData?.overrides || {};
  const userTeamRole = userOverrideData?.teamRole || null;

  const currentUserOverrides = useMemo(() => {
    return { ...userOverrides, ...pendingUserChanges };
  }, [userOverrides, pendingUserChanges]);

  const hasUserChanges = Object.keys(pendingUserChanges).length > 0;

  const handleUserOverrideChange = useCallback((key, threeState) => {
    if (threeState === 'inherit') {
      setPendingUserChanges(prev => ({ ...prev, [key]: null }));
    } else {
      setPendingUserChanges(prev => ({ ...prev, [key]: threeState === 'grant' }));
    }
  }, []);

  const getThreeStateValue = useCallback((key) => {
    const v = currentUserOverrides[key];
    if (v === true) return 'grant';
    if (v === false) return 'deny';
    return 'inherit';
  }, [currentUserOverrides]);

  const handleSaveUserChanges = useCallback(() => {
    updateUserPerms.mutate(
      { userId: selectedUserId, permissions: pendingUserChanges },
      { onSuccess: () => setPendingUserChanges({}) }
    );
  }, [selectedUserId, pendingUserChanges, updateUserPerms]);

  const handleClearUserOverrides = useCallback(() => {
    clearUserPerms.mutate(selectedUserId, {
      onSuccess: () => setPendingUserChanges({}),
    });
  }, [selectedUserId, clearUserPerms]);

  const handleUserSelect = useCallback((userId) => {
    setSelectedUserId(userId);
    setPendingUserChanges({});
    setShowUserDropdown(false);
  }, []);

  const selectedMember = teamMembers.find(m => m.userId === selectedUserId);

  // Compute effective value for user override display
  const getEffectiveValue = useCallback((key) => {
    const override = currentUserOverrides[key];
    if (override === true) return true;
    if (override === false) return false;
    // Inherit from role
    if (userTeamRole && matrix[userTeamRole]) {
      return matrix[userTeamRole][key] ?? false;
    }
    return false;
  }, [currentUserOverrides, userTeamRole, matrix]);

  // Check if role has any differences from hardcoded defaults
  const roleHasOverrides = useMemo(() => {
    if (!matrix[selectedRole] || !hardcodedDefaults[selectedRole]) return false;
    const m = matrix[selectedRole];
    const d = hardcodedDefaults[selectedRole];
    return Object.keys(m).some(k => m[k] !== d[k]);
  }, [matrix, hardcodedDefaults, selectedRole]);

  const overrideCount = Object.keys(userOverrides).length;

  if (defaultsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Role Defaults ── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface-100 rounded-xl">
              <Shield className="w-5 h-5 text-surface-400" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-800">Role Defaults</h3>
              <p className="text-xs text-surface-400 mt-0.5">Configure what each role can do by default</p>
            </div>
          </div>
          {selectedRole !== 'owner' && roleHasOverrides && (
            <button
              onClick={handleResetRole}
              disabled={resetRolePerms.isPending}
              className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to defaults
            </button>
          )}
        </div>

        {/* Role pills */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {ROLE_ORDER.map(role => (
            <button
              key={role}
              onClick={() => handleRoleChange(role)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-all",
                selectedRole === role
                  ? "bg-surface-800 text-white font-medium shadow-sm"
                  : "bg-surface-100 text-surface-500 hover:bg-surface-200"
              )}
            >
              {TEAM_ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {selectedRole === 'owner' && (
          <div className="rounded-lg bg-surface-50 border border-surface-100 p-4 text-sm text-surface-500">
            <p className="font-medium text-surface-600 mb-1">Owner has all permissions</p>
            <p className="text-xs">The owner/admin role always has full access. This cannot be changed to prevent lockout.</p>
          </div>
        )}

        {selectedRole !== 'owner' && (
          <div className="space-y-2">
            {groups.map(group => {
              const perms = groupedPermissions[group] || [];
              if (perms.length === 0) return null;
              const enabledCount = perms.filter(p => currentRolePerms[p.key]).length;
              const isOpen = expandedRoleGroups.includes(group);
              return (
                <div key={group} className="border border-surface-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleRoleGroup(group)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <ChevronRight className={cn(
                        "w-4 h-4 text-surface-400 transition-transform duration-200",
                        isOpen && "rotate-90"
                      )} />
                      <span className="text-sm font-medium text-surface-700">{group}</span>
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      enabledCount === perms.length ? "bg-emerald-50 text-emerald-600" :
                      enabledCount > 0 ? "bg-amber-50 text-amber-600" :
                      "bg-surface-100 text-surface-400"
                    )}>
                      {enabledCount}/{perms.length}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 space-y-0.5 border-t border-surface-100">
                          {perms.map(p => {
                            const isOn = currentRolePerms[p.key] ?? false;
                            const isDefault = hardcodedDefaults[selectedRole]?.[p.key];
                            const isModified = pendingChanges[p.key] !== undefined
                              ? pendingChanges[p.key] !== (matrix[selectedRole]?.[p.key] ?? isDefault)
                              : (matrix[selectedRole]?.[p.key] !== undefined && matrix[selectedRole]?.[p.key] !== isDefault);
                            return (
                              <div
                                key={p.key}
                                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-50 transition-colors"
                              >
                                <div className="flex-1 min-w-0 mr-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-surface-700">{p.label}</span>
                                    {isModified && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-medium">Modified</span>
                                    )}
                                  </div>
                                  {p.description && (
                                    <p className="text-xs text-surface-400 mt-0.5">{p.description}</p>
                                  )}
                                </div>
                                <Toggle
                                  checked={isOn}
                                  onChange={(v) => handleRoleToggle(p.key, v)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Save bar */}
            <AnimatePresence>
              {hasRoleChanges && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center justify-end gap-3 pt-4 border-t border-surface-100"
                >
                  <button
                    onClick={() => setPendingChanges({})}
                    className="px-4 py-2 text-sm text-surface-500 hover:text-surface-700 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveRoleChanges}
                    disabled={updateRolePerms.isPending}
                    className="action-btn px-4 py-2 text-sm"
                  >
                    {updateRolePerms.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── User Overrides ── */}
      <div className="glass-card p-6 overflow-visible">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-surface-100 rounded-xl">
            <Users className="w-5 h-5 text-surface-400" />
          </div>
          <div>
            <h3 className="font-semibold text-surface-800">User Overrides</h3>
            <p className="text-xs text-surface-400 mt-0.5">Grant or deny individual permissions per user, overriding their role defaults</p>
          </div>
        </div>

        {/* User selector */}
        <div className="relative mb-6">
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="glass-input w-full text-left flex items-center justify-between"
          >
            <span className={selectedMember ? "text-surface-700" : "text-surface-400"}>
              {selectedMember
                ? getMemberName(selectedMember)
                : 'Select a team member...'}
            </span>
            <ChevronDown className={cn("w-4 h-4 text-surface-400 transition-transform", showUserDropdown && "rotate-180")} />
          </button>

          {selectedMember && selectedUserId && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 rounded-md bg-surface-100 text-surface-500 font-medium">
                {TEAM_ROLE_LABELS[userTeamRole] || 'No Role'}
              </span>
              {overrideCount > 0 && (
                <span className="text-xs text-surface-400">
                  {overrideCount} override{overrideCount !== 1 ? 's' : ''} active
                </span>
              )}
            </div>
          )}

          <AnimatePresence>
            {showUserDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 mt-1 w-full bg-white border border-surface-200 rounded-xl shadow-lg max-h-60 overflow-y-auto"
              >
                {teamMembers.filter(m => m.role !== 'owner').map(m => (
                  <button
                    key={m.userId}
                    onClick={() => handleUserSelect(m.userId)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-surface-50 transition-colors",
                      selectedUserId === m.userId && "bg-surface-50"
                    )}
                  >
                    <span className="text-sm text-surface-700">
                      {getMemberName(m)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-surface-100 text-surface-500">
                      {TEAM_ROLE_LABELS[m.role]}
                    </span>
                  </button>
                ))}
                {teamMembers.filter(m => m.role !== 'owner').length === 0 && (
                  <div className="px-4 py-3 text-sm text-surface-400">No team members to configure</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User permission overrides */}
        {selectedUserId && (
          <div className="space-y-2">
            {selectedUserId && overrideCount > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleClearUserOverrides}
                  disabled={clearUserPerms.isPending}
                  className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all overrides
                </button>
              </div>
            )}

            {groups.map(group => {
              const perms = groupedPermissions[group] || [];
              if (perms.length === 0) return null;
              const allowedCount = perms.filter(p => getEffectiveValue(p.key)).length;
              const overriddenInGroup = perms.filter(p => currentUserOverrides[p.key] !== undefined && currentUserOverrides[p.key] !== null).length;
              const isOpen = expandedUserGroups.includes(group);
              return (
                <div key={group} className="border border-surface-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleUserGroup(group)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <ChevronRight className={cn(
                        "w-4 h-4 text-surface-400 transition-transform duration-200",
                        isOpen && "rotate-90"
                      )} />
                      <span className="text-sm font-medium text-surface-700">{group}</span>
                      {overriddenInGroup > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                          {overriddenInGroup} override{overriddenInGroup !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      allowedCount === perms.length ? "bg-emerald-50 text-emerald-600" :
                      allowedCount > 0 ? "bg-amber-50 text-amber-600" :
                      "bg-surface-100 text-surface-400"
                    )}>
                      {allowedCount}/{perms.length}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 space-y-0.5 border-t border-surface-100">
                          {perms.map(p => {
                            const threeState = getThreeStateValue(p.key);
                            const effective = getEffectiveValue(p.key);
                            return (
                              <div
                                key={p.key}
                                className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-50 transition-colors"
                              >
                                <div className="flex-1 min-w-0 mr-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-surface-700">{p.label}</span>
                                    <span className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                      effective ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                                    )}>
                                      {effective ? 'Allowed' : 'Denied'}
                                    </span>
                                  </div>
                                </div>
                                <ThreeStateToggle
                                  value={threeState}
                                  onChange={(v) => handleUserOverrideChange(p.key, v)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* Save bar */}
            <AnimatePresence>
              {hasUserChanges && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center justify-end gap-3 pt-4 border-t border-surface-100"
                >
                  <button
                    onClick={() => setPendingUserChanges({})}
                    className="px-4 py-2 text-sm text-surface-500 hover:text-surface-700 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSaveUserChanges}
                    disabled={updateUserPerms.isPending}
                    className="action-btn px-4 py-2 text-sm"
                  >
                    {updateUserPerms.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {!selectedUserId && (
          <div className="rounded-lg bg-surface-50 border border-surface-100 p-4 text-sm text-surface-400 text-center">
            Select a team member above to configure their individual permissions
          </div>
        )}
      </div>
    </div>
  );
}
