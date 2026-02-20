import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/apiClient';
import { authClient } from '@/lib/authClient';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useProfile, useSettings } from '@/hooks/useAppData';
import { useUpdateProfile, useUploadAvatar, useUnlinkAccount } from '@/hooks/useMutations';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Upload, User, KeyRound, Save, Mail, Phone, Globe, UserSquare, Link2, Unlink, ExternalLink, Camera, Fingerprint, Plus, Trash2 } from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPhoneNumber, fmtDate } from '@/lib/utils';

const PROVIDER_LABELS = {
  oidc: 'OpenID Connect',
  google: 'Google',
};

const ProfileField = ({ icon: Icon, label, children }) => (
  <div>
    <label className="flex items-center text-xs font-medium text-surface-400 mb-1.5 uppercase tracking-wider">
      <Icon className="w-3.5 h-3.5 mr-1.5 opacity-60" />{label}
    </label>
    {children}
  </div>
);

const ProfileManager = () => {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: appSettings } = useSettings();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const unlinkAccount = useUnlinkAccount();
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState(null);
  const { data: linkedAccounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: queryKeys.profile.accounts(),
    queryFn: () => api.get('/users/me/accounts').then(r => r.data || []),
  });

  const { data: passkeys = [], isLoading: loadingPasskeys, refetch: refetchPasskeys } = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const res = await authClient.passkey.listUserPasskeys();
      return res.data || [];
    },
  });

  const handleAddPasskey = async () => {
    setIsAddingPasskey(true);
    try {
      const { data, error: err } = await authClient.passkey.addPasskey();
      if (err) {
        toast({ title: err.message || 'Failed to register passkey', variant: 'destructive' });
      } else {
        toast({ title: 'Passkey registered!' });
        refetchPasskeys();
      }
    } catch {
      toast({ title: 'Passkey registration cancelled', variant: 'destructive' });
    }
    setIsAddingPasskey(false);
  };

  const handleDeletePasskey = async (id) => {
    setDeletingPasskeyId(id);
    try {
      const { error: err } = await authClient.passkey.deletePasskey({ id });
      if (err) {
        toast({ title: err.message || 'Failed to delete passkey', variant: 'destructive' });
      } else {
        toast({ title: 'Passkey removed' });
        refetchPasskeys();
      }
    } catch {
      toast({ title: 'Failed to delete passkey', variant: 'destructive' });
    }
    setDeletingPasskeyId(null);
  };

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    displayName: '',
    phone: '',
    website: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        firstName: profile.firstName || profile.first_name || '',
        lastName: profile.lastName || profile.last_name || '',
        displayName: profile.displayName || profile.display_name || '',
        phone: profile.phone || '',
        website: profile.website || '',
      });
    }
  }, [profile]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneInputChange = useCallback((e) => {
    const input = e.target.value;
    const cleaned = ('' + input).replace(/\D/g, '');
    if (cleaned.length <= 10) {
      setFormData(prev => ({ ...prev, phone: cleaned }));
    }
  }, []);

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarUpload = (file) => {
    if (!file) return;
    uploadAvatar.mutate(file);
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync(formData);
    } catch { /* handled by mutation onError */ }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (!passwordData.currentPassword) {
      toast({ title: "Current password is required", variant: "destructive" });
      return;
    }
    if (passwordData.password !== passwordData.confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (passwordData.password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.password,
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message || 'Failed to update password');
      toast({ title: "Password updated successfully!" });
      setPasswordData({ currentPassword: '', password: '', confirmPassword: '' });
    } catch (error) {
      toast({ title: "Failed to update password", description: error.message, variant: "destructive" });
    }
    setIsUpdatingPassword(false);
  };

  const handleUnlink = (providerId) => {
    unlinkAccount.mutate(providerId);
  };

  const handleLinkOidc = () => {
    window.location.href = '/api/oidc/authorize';
  };

  const avatarFallback = (profile?.displayName || profile?.display_name)
    ? (profile.displayName || profile.display_name).substring(0, 2).toUpperCase()
    : user?.email?.substring(0, 2).toUpperCase() || '??';

  const displayName = profile?.displayName || profile?.display_name || user?.email || '';

  const oidcEnabled = appSettings?.oidc_enabled === 'true';
  const googleEnabled = appSettings?.google_enabled === 'true';
  const oidcProviderName = appSettings?.oidc_provider_name || 'OpenID';
  const isOidcLinked = linkedAccounts.some(a => a.providerId === 'oidc');
  const isGoogleLinked = linkedAccounts.some(a => a.providerId === 'google');

  if (profileLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-surface-400" /></div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ width: '100%', display: 'block' }}
    >
      <div className="hidden md:block mb-6">
        <h2 className="text-3xl font-bold mb-1">My Profile</h2>
        <p className="text-surface-400 text-sm">Manage your personal information and settings.</p>
      </div>

      {/* ── Profile Card: Avatar + Identity + Fields ── */}
      <div className="glass-card" style={{ width: '100%', display: 'block' }}>
        {/* Avatar header band */}
        <div className="p-6 pb-4 text-center border-b border-border" style={{ width: '100%' }}>
          <div className="relative inline-block mb-3">
            <Avatar className="h-24 w-24 border-2 border-border">
              <AvatarImage src={profile?.avatarUrl || profile?.avatar_url} alt="User avatar" />
              <AvatarFallback className="text-3xl">{avatarFallback}</AvatarFallback>
            </Avatar>
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-surface-100 border border-border cursor-pointer hover:bg-surface-200 transition-colors"
            >
              <input id="avatar-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleAvatarUpload(e.target.files[0])} disabled={uploadAvatar.isPending} />
              {uploadAvatar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin text-surface-500" /> : <Camera className="w-3.5 h-3.5 text-surface-500" />}
            </label>
          </div>
          <p className="font-semibold text-surface-800">{displayName}</p>
          <p className="text-xs text-surface-400">{user?.email}</p>
        </div>

        {/* Profile fields */}
        <form onSubmit={handleProfileUpdate} style={{ width: '100%', display: 'block' }}>
          <div className="p-6" style={{ width: '100%', display: 'block' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProfileField icon={User} label="First Name">
                <input name="firstName" value={formData.firstName} onChange={handleInputChange} className="glass-input w-full" placeholder="Your first name" />
              </ProfileField>
              <ProfileField icon={User} label="Last Name">
                <input name="lastName" value={formData.lastName} onChange={handleInputChange} className="glass-input w-full" placeholder="Your last name" />
              </ProfileField>
              <ProfileField icon={UserSquare} label="Display Name">
                <input name="displayName" value={formData.displayName} onChange={handleInputChange} className="glass-input w-full" placeholder="Your display name" />
              </ProfileField>
              <ProfileField icon={Mail} label="Email">
                <input value={user?.email || ''} className="glass-input w-full opacity-60 cursor-not-allowed" readOnly />
              </ProfileField>
              <ProfileField icon={Phone} label="Phone">
                <input name="phone" value={formatPhoneNumber(formData.phone)} onChange={handlePhoneInputChange} className="glass-input w-full" placeholder="(123) 456-7890" />
              </ProfileField>
              <ProfileField icon={Globe} label="Website">
                <input name="website" value={formData.website} onChange={handleInputChange} className="glass-input w-full" placeholder="https://example.com" />
              </ProfileField>
            </div>
          </div>
          <div className="px-6 pb-6 pt-2 flex justify-end">
            <button type="submit" className="action-btn" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              <span>{updateProfile.isPending ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ── Linked Accounts ── */}
      <div className="glass-card p-6 mt-6" style={{ width: '100%' }}>
        <h3 className="text-xl font-bold mb-1">Linked Accounts</h3>
        <p className="text-surface-400 text-sm mb-4">Connect external login providers to your account.</p>

        {loadingAccounts ? (
          <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3" style={{ width: '100%' }}>
            {oidcEnabled && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-100">
                    <ExternalLink className="w-4 h-4 text-surface-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{oidcProviderName}</p>
                    <p className="text-xs text-surface-400">
                      {isOidcLinked
                        ? `Linked (${linkedAccounts.find(a => a.providerId === 'oidc')?.accountId?.slice(0, 16)}...)`
                        : 'Not linked'}
                    </p>
                  </div>
                </div>
                {isOidcLinked ? (
                  <button
                    onClick={() => handleUnlink('oidc')}
                    disabled={unlinkAccount.isPending}
                    className="action-btn action-btn--secondary py-1.5 px-3 text-sm text-red-400 hover:text-red-300"
                  >
                    {unlinkAccount.isPending && unlinkAccount.variables === 'oidc' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Unlink className="w-3.5 h-3.5 mr-1.5" />Unlink</>}
                  </button>
                ) : (
                  <button onClick={handleLinkOidc} className="action-btn py-1.5 px-3 text-sm">
                    <Link2 className="w-3.5 h-3.5 mr-1.5" />Link
                  </button>
                )}
              </div>
            )}

            {googleEnabled && (
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[rgb(var(--glass-bg))]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-sm">Google</p>
                    <p className="text-xs text-surface-400">
                      {isGoogleLinked
                        ? `Linked (${linkedAccounts.find(a => a.providerId === 'google')?.accountId?.slice(0, 16)}...)`
                        : 'Not linked'}
                    </p>
                  </div>
                </div>
                {isGoogleLinked ? (
                  <button
                    onClick={() => handleUnlink('google')}
                    disabled={unlinkAccount.isPending}
                    className="action-btn action-btn--secondary py-1.5 px-3 text-sm text-red-400 hover:text-red-300"
                  >
                    {unlinkAccount.isPending && unlinkAccount.variables === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Unlink className="w-3.5 h-3.5 mr-1.5" />Unlink</>}
                  </button>
                ) : (
                  <button onClick={() => { window.location.href = '/api/google/authorize'; }} className="action-btn py-1.5 px-3 text-sm">
                    <Link2 className="w-3.5 h-3.5 mr-1.5" />Link
                  </button>
                )}
              </div>
            )}

            {!oidcEnabled && !googleEnabled && linkedAccounts.length === 0 && (
              <p className="text-sm text-surface-400">No external login providers are configured. Contact your administrator to enable OpenID Connect or Google login.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Passkeys ── */}
      <div className="glass-card p-6 mt-6" style={{ width: '100%' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold mb-1">Passkeys</h3>
            <p className="text-surface-400 text-sm">Use biometrics or a security key to sign in without a password.</p>
          </div>
        </div>

        {loadingPasskeys ? (
          <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {passkeys.map(pk => (
              <div key={pk.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-surface-100">
                    <Fingerprint className="w-4 h-4 text-surface-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{pk.name || 'Passkey'}</p>
                    <p className="text-xs text-surface-400">
                      Added {fmtDate(pk.createdAt)}
                      {pk.deviceType === 'multiDevice' ? ' — synced' : ' — device-bound'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePasskey(pk.id)}
                  disabled={deletingPasskeyId === pk.id}
                  className="p-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove passkey"
                >
                  {deletingPasskeyId === pk.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}

            <button
              onClick={handleAddPasskey}
              disabled={isAddingPasskey}
              className="action-btn py-2 px-4 text-sm"
            >
              {isAddingPasskey ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Register Passkey
            </button>
          </div>
        )}
      </div>

      {/* ── Change Password ── */}
      <div className="glass-card p-6 mt-6" style={{ width: '100%' }}>
        <h3 className="text-xl font-bold mb-4">Change Password</h3>
        <form onSubmit={handlePasswordUpdate} style={{ width: '100%', display: 'block' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 md:max-w-[calc(50%-0.5rem)]">
              <PasswordInput
                name="currentPassword"
                placeholder="Current Password"
                value={passwordData.currentPassword}
                onChange={handlePasswordChange}
                className="glass-input w-full pr-9"
                required
              />
            </div>
            <PasswordInput
              name="password"
              placeholder="New Password"
              value={passwordData.password}
              onChange={handlePasswordChange}
              className="glass-input w-full pr-9"
              required
            />
            <PasswordInput
              name="confirmPassword"
              placeholder="Confirm New Password"
              value={passwordData.confirmPassword}
              onChange={handlePasswordChange}
              className="glass-input w-full pr-9"
              required
            />
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="action-btn" disabled={isUpdatingPassword}>
                {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                <span>{isUpdatingPassword ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default ProfileManager;
