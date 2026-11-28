import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, Profile } from '@/types/database';
import {
  type Permission,
  hasPermission,
  permissionsForRoles,
} from '@/lib/permissions';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Backwards-compatible primary role. */
  role: AppRole | null;
  /** All roles assigned to this user (multi-role supported). */
  roles: AppRole[];
  /** Effective permissions from `role_permissions` (DB-authoritative). */
  permissions: string[];
  loading: boolean;
  can: (permission: Permission | string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.user) {
          setTimeout(() => { void fetchUserData(currentSession.user.id); }, 0);
        } else {
          clearIdentity();
        }
        setLoading(false);
      },
    );

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      if (existingSession?.user) {
        void fetchUserData(existingSession.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearIdentity = () => {
    setProfile(null);
    setRole(null);
    setRoles([]);
    setPermissions([]);
  };

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileData) setProfile(profileData as Profile);

      // All roles — a user may hold several (e.g. teacher + dos).
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      const assigned = (roleData || []).map((r: any) => r.role as AppRole);
      setRoles(assigned);
      setRole(assigned[0] ?? null);

      // Database-authoritative permissions, with a safe default fallback when
      // the migration/RPC is not available yet.
      const { data: permData } = await supabase.rpc('current_user_permissions');
      setPermissions(
        Array.isArray(permData) && permData.length
          ? (permData as string[])
          : permissionsForRoles(assigned),
      );
    } catch (error) {
      console.error('Error fetching user data:', error);
      setPermissions(permissionsForRoles(roles));
    } finally {
      setLoading(false);
    }
  }, [roles]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchUserData(user.id);
  }, [user, fetchUserData]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  // Sign-up never grants elevated roles: the database trigger assigns the
  // default (viewer) role and an administrator grants additional roles.
  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearIdentity();
    // Tell any mounted auth forms to clear their fields immediately.
    window.dispatchEvent(new Event('auth:signed-out'));
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, role, roles, permissions, loading,
      can: (permission) => hasPermission(permissions, permission),
      signIn, signUp, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
