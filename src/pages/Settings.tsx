import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AuditLog } from '@/types/database';
import { format } from 'date-fns';
import { Bell, Shield, ShieldCheck, ScrollText, User, Camera } from '@/lib/icons';
import { fileToAvatarDataUrl } from '@/lib/avatar';
import { toast } from 'sonner';

export default function Settings() {
  const { user, profile, role, roles, permissions, refreshProfile } = useAuth();
  const isAdmin = role === 'admin' || roles.includes('admin');

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: dataUrl })
        .eq('user_id', user.id);
      if (error) throw error;
      setAvatarUrl(dataUrl);
      await refreshProfile();
      toast.success('Profile picture updated');
    } catch (err: any) {
      console.error('Avatar update failed:', err);
      toast.error('Failed to update profile picture', { description: err?.message });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone: phone || null })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success('Profile saved');
    } catch (err: any) {
      toast.error('Failed to save profile', { description: err?.message });
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    setAvatarUrl(profile?.avatar_url ?? null);
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  useEffect(() => {
    if (!isAdmin) {
      setLogsLoading(false);
      return;
    }
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) toast.error('Failed to load activity logs', { description: error.message });
        setLogs((data as AuditLog[]) || []);
        setLogsLoading(false);
      });
  }, [isAdmin]);

  const permissionModules = permissions.reduce<Record<string, string[]>>((acc, permission) => {
    const module = permission.split('.')[0];
    (acc[module] ||= []).push(permission);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Account"
          title="Settings"
          description="Manage your profile, review your access, and check recent system activity."
        />

        {/* My Profile */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-primary">
              <User className="fs-5" />
            </span>
            <div>
              <h5 className="fw-semibold text-main mb-0">My Profile</h5>
              <p className="text-muted bd-fs-sm mb-0">Manage your profile information and picture</p>
            </div>
          </div>
          <div className="card-body d-flex flex-column gap-4">
            <div className="d-flex align-items-center gap-4 flex-wrap">
              <div
                className="bd-user-avatar d-inline-flex align-items-center justify-content-center rounded-circle bg-secondary-subtle"
                style={{ width: '96px', height: '96px' }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="bd-avatar-img" />
                ) : (
                  <User className="fs-2 text-secondary" />
                )}
              </div>
              <div className="d-flex flex-column gap-2">
                <p className="fw-semibold text-main mb-0">{profile?.full_name || user?.email}</p>
                <p className="text-muted bd-fs-sm mb-0">{role || 'No role'}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="d-none"
                  onChange={handleAvatarUpload}
                  aria-label="Upload profile picture"
                />
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                  style={{ borderRadius: '0.5rem' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? (
                    <><span className="spinner-border spinner-border-sm" /> Uploading…</>
                  ) : (
                    <><Camera /> Change picture</>
                  )}
                </button>
              </div>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={handleSaveProfile}>
              <div>
                <label className="form-label">Full name</label>
                <input
                  className="form-control"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ borderRadius: '0.5rem' }}
                />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input
                  className="form-control"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ borderRadius: '0.5rem' }}
                />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input
                  className="form-control"
                  value={profile?.email ?? user?.email ?? ''}
                  disabled
                  style={{ borderRadius: '0.5rem' }}
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="btn btn-success btn-sm"
                  style={{ borderRadius: '0.5rem' }}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <><span className="spinner-border spinner-border-sm" /> Saving…</>
                  ) : (
                    'Save profile'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* My roles & permissions — read-only */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-success">
              <ShieldCheck className="fs-5" />
            </span>
            <div>
              <h5 className="fw-semibold text-main mb-0">My roles &amp; permissions</h5>
              <p className="text-muted bd-fs-sm mb-0">
                Read-only — access is granted by your role assignments in the database.
              </p>
            </div>
          </div>
          <div className="card-body d-flex flex-column gap-4">
            <div>
              <p className="fw-semibold text-main bd-fs-sm mb-2">Roles ({roles.length})</p>
              <div className="d-flex flex-wrap gap-2">
                {roles.length === 0 ? (
                  <span className="text-muted bd-fs-sm">No roles assigned.</span>
                ) : (
                  roles.map((r) => (
                    <span key={r} className="badge text-bg-primary d-inline-flex align-items-center gap-1">
                      <Shield /> {r}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="fw-semibold text-main bd-fs-sm mb-2">Effective permissions ({permissions.length})</p>
              {permissions.length === 0 ? (
                <p className="text-muted bd-fs-sm mb-0">No permissions are currently granted.</p>
              ) : (
                Object.entries(permissionModules)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([module, keys]) => (
                    <div className="mb-3" key={module}>
                      <p className="text-muted bd-fs-sm mb-1 text-capitalize fw-medium">{module}</p>
                      <div className="d-flex flex-wrap gap-2">
                        {keys.sort().map((key) => (
                          <span key={key} className="badge bg-light text-dark border bd-fs-sm">{key}</span>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>

        {/* Notifications — informational only; no saving controls */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-info">
              <Bell className="fs-5" />
            </span>
            <div>
              <h5 className="fw-semibold text-main mb-0">Notifications</h5>
              <p className="text-muted bd-fs-sm mb-0">Informational — there are no per-user delivery preferences yet</p>
            </div>
          </div>
          <div className="card-body d-flex align-items-center justify-content-between gap-3 flex-wrap">
            <p className="text-secondary bd-fs-sm mb-0" style={{ maxWidth: '46rem' }}>
              In-app notifications are delivered automatically for relevant activity (marks, announcements,
              discipline, certificates and stock alerts). Delivery rules are set by the school administrator;
              this page does not store notification preferences.
            </p>
            <Link to="/notifications" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1">
              <Bell /> View my notifications
            </Link>
          </div>
        </div>

        {/* Audit logs — unchanged admin viewer */}
        {isAdmin && (
          <div className="card">
            <div className="card-header d-flex align-items-start gap-3 py-3">
              <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-warning">
                <ScrollText className="fs-5" />
              </span>
              <div>
                <h5 className="fw-semibold text-main mb-0">System Activity Logs</h5>
                <p className="text-muted bd-fs-sm mb-0">
                  Recent sensitive actions — role changes, enrollment changes and discipline reviews
                </p>
              </div>
            </div>
            <div className="card-body p-0">
              {logsLoading ? (
                <div className="d-flex align-items-center justify-content-center py-10">
                  <span className="spinner-border spinner-border-lg text-success" role="status" />
                </div>
              ) : logs.length === 0 ? (
                <div className="empty-state">
                  <ScrollText className="empty-state-icon text-secondary" />
                  <p className="text-secondary mb-0">No activity recorded yet.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr className="border-bottom border-secondary-subtle">
                        <th scope="col">When</th>
                        <th scope="col">Action</th>
                        <th scope="col">Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-bottom border-secondary-subtle">
                          <td className="text-nowrap text-muted bd-fs-sm">
                            {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                          </td>
                          <td className="fw-medium text-main bd-fs-sm text-capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </td>
                          <td className="text-muted bd-fs-sm">{log.entity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
