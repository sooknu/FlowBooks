import React, { createContext, useContext, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/authClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: loading } = authClient.useSession();

  const user = sessionData?.user ?? null;
  const session = sessionData?.session ?? null;

  // Clear all cached data when user identity changes (logout → login as different user)
  const prevUserIdRef = useRef(user?.id);
  useEffect(() => {
    const prevId = prevUserIdRef.current;
    const currentId = user?.id;
    if (prevId && currentId && prevId !== currentId) {
      queryClient.clear();
    }
    prevUserIdRef.current = currentId;
  }, [user?.id, queryClient]);

  const signUp = useCallback(async (email, password, options) => {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: options?.data?.name || email,
    });
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sign up Failed',
        description: error.message || 'Something went wrong',
      });
    }
    return { error };
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      const isVerificationError =
        error.code === 'EMAIL_NOT_VERIFIED' ||
        (error.message && error.message.toLowerCase().includes('email is not verified'));

      if (!isVerificationError) {
        toast({
          variant: 'destructive',
          title: 'Sign in Failed',
          description: error.message || 'Something went wrong',
        });
      }
      return { error, isVerificationError };
    }
    return { error };
  }, [toast]);

  const isImpersonating = !!session?.impersonatedBy;

  const stopImpersonating = useCallback(async () => {
    const { error } = await authClient.admin.stopImpersonating();
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to stop impersonating' });
      return;
    }
    queryClient.clear();
    window.location.href = '/dashboard';
  }, [toast, queryClient]);

  const signOut = useCallback(async () => {
    const { error } = await authClient.signOut();
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Sign out Failed',
        description: error.message || 'Something went wrong',
      });
    }
    // Clear all cached data so the next user doesn't see stale profile/settings
    queryClient.clear();
    return { error };
  }, [toast, queryClient]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isImpersonating,
      stopImpersonating,
      signUp,
      signIn,
      signOut,
    }),
    [user, session, loading, isImpersonating, stopImpersonating, signUp, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
