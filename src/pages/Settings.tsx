import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AuditLog } from '@/types/database';
import { format } from 'date-fns';
import { Bell, Shield, Database, MessageSquare, ScrollText, Loader2, User, Camera, Upload } from '@/lib/icons';

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth();
  const isAdmin = role === 'admin';
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(true);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = data.publicUrl;
      await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
      setAvatarUrl(url);
      await refreshProfile();
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      alert(err?.message || 'Failed to upload profile picture.');
    } finally {
      setUploadingAvatar(false);
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
    } catch (err: any) {
      alert(err?.message || 'Failed to save profile.');
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
    if (!isAdmin) return;
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setLogs((data as AuditLog[]) || []);
        setLogsLoading(false);
      });
  }, [isAdmin]);

  const settingCard = (
    icon: React.ReactNode,
    iconColor: string,
    title: string,
    description: string,
    id: string,
    label: string,
    checked: boolean,
    onCheckedChange: (v: boolean) => void,
  ) => (
    <div className="card">
      <div className="card-header d-flex align-items-start gap-3 py-3">
        <span className={`d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-${iconColor}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h5 className="fw-semibold text-main mb-0">{title}</h5>
          <p className="text-muted bd-fs-sm mb-0">{description}</p>
        </div>
      </div>
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between gap-4">
          <div className="min-w-0">
            <label htmlFor={id} className="fw-semibold text-main bd-fs-md">{label}</label>
            <p className="text-muted bd-fs-sm mb-0 mt-0">
              {id === 'sms-notifications' && 'Send SMS to parents when scores are updated'}
              {id === 'email-notifications' && 'Send email summaries to parents weekly'}
              {id === 'two-factor' && 'Require 2FA for admin accounts'}
              {id === 'session-timeout' && 'Auto-logout after 30 minutes of inactivity'}
            </p>
          </div>
          <input
            type="checkbox"
            className="form-switch"
            id={id}
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
          />
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Administration"
          title="Settings"
          description="Configure system preferences, notifications and security settings."
        />

        {/* My Profile */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-primary"><User className="fs-5" /></span>
            <div>
              <h5 className="fw-semibold text-main mb-0">My Profile</h5>
              <p className="text-muted bd-fs-sm mb-0">Manage your profile information and picture ({role})</p>
            </div>
          </div>
          <div className="card-body d-flex flex-column gap-4">
            <div className="d-flex align-items-center gap-4 flex-wrap">
              <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-secondary-subtle" style={{ width: '96px', height: '96px', overflow: 'hidden', borderRadius: '50%' }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  <User className="fs-2 text-secondary" />
                )}
              </div>
              <div className="d-flex flex-column gap-2">
                <p className="fw-semibold text-main mb-0">{profile?.full_name || user?.email}</p>
                <p className="text-muted bd-fs-sm mb-0">{role}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="d-none"
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                  style={{ borderRadius: '0.5rem' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? <><span className="spinner-border spinner-border-sm" /> Uploading...</> : <><Camera /> Change picture</>}
                </button>
              </div>
            </div>
            <form className="d-flex flex-column gap-3" onSubmit={handleSaveProfile}>
              <div>
                <label className="form-label">Full name</label>
                <input className="form-control" value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ borderRadius: '0.5rem' }} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ borderRadius: '0.5rem' }} />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="form-control" value={profile?.email ?? user?.email ?? ''} disabled style={{ borderRadius: '0.5rem' }} />
              </div>
              <div>
                <button type="submit" className="btn btn-success btn-sm" style={{ borderRadius: '0.5rem' }} disabled={savingProfile}>
                  {savingProfile ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : 'Save profile'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {isAdmin && (
          <>
        {/* Notifications */}
        <div className="d-flex flex-column gap-4">
          <div className="card">
            <div className="card-header d-flex align-items-start gap-3 py-3">
              <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-success"><Bell className="fs-5" /></span>
              <div>
                <h5 className="fw-semibold text-main mb-0">Notifications</h5>
                <p className="text-muted bd-fs-sm mb-0">Configure SMS and email notification settings</p>
              </div>
            </div>
            <div className="card-body d-flex flex-column gap-3">
              {settingCard(<Bell className="fs-5" />, 'success', 'SMS Notifications', 'Send SMS to parents when scores are updated', 'sms-notifications', 'SMS Notifications', smsEnabled, setSmsEnabled)}
              {settingCard(<MessageSquare className="fs-5" />, 'info', 'Email Notifications', 'Send email summaries to parents weekly', 'email-notifications', 'Email Notifications', emailEnabled, setEmailEnabled)}
            </div>
          </div>
        </div>

        {/* SMS Gateway */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-info"><MessageSquare className="fs-5" /></span>
            <div>
              <h5 className="fw-semibold text-main mb-0">SMS Gateway</h5>
              <p className="text-muted bd-fs-sm mb-0">Configure your SMS provider (Twilio / Africa's Talking)</p>
            </div>
          </div>
          <div className="card-body">
            <div className="rounded-3 bg-secondary-subtle p-4 bd-fs-sm text-secondary">
              <p className="mb-2">SMS gateway integration requires API keys. Please configure your SMS provider credentials to enable parent notifications.</p>
              <p className="mb-0">Supported providers: <span className="fw-medium">Twilio</span>, <span className="fw-medium">Africa's Talking</span></p>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-danger"><Shield className="fs-5" /></span>
            <div>
              <h5 className="fw-semibold text-main mb-0">Security</h5>
              <p className="text-muted bd-fs-sm mb-0">Manage security and access settings</p>
            </div>
          </div>
          <div className="card-body d-flex flex-column gap-3">
            {settingCard(<Shield className="fs-5" />, 'danger', 'Two-Factor Authentication', 'Require 2FA for admin accounts', 'two-factor', 'Two-Factor Authentication', twoFactor, setTwoFactor)}
            {settingCard(<Shield className="fs-5" />, 'danger', 'Session Timeout', 'Auto-logout after 30 minutes of inactivity', 'session-timeout', 'Session Timeout', sessionTimeout, setSessionTimeout)}
          </div>
        </div>

        {/* Database */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-info"><Database className="fs-5" /></span>
            <div>
              <h5 className="fw-semibold text-main mb-0">Database</h5>
              <p className="text-muted bd-fs-sm mb-0">Database information and maintenance</p>
            </div>
          </div>
          <div className="card-body">
            <div className="d-flex justify-content-between rounded-3 bg-secondary-subtle px-4 py-3">
              <span className="text-muted bd-fs-sm mb-0">Database Name</span>
              <span className="fw-semibold text-main bd-fs-sm mb-0">conduct</span>
            </div>
            <div className="d-flex justify-content-between rounded-3 bg-secondary-subtle px-4 py-3 mt-3">
              <span className="text-muted bd-fs-sm mb-0">Status</span>
              <span className="d-inline-flex align-items-center gap-1 bd-fs-sm fw-medium text-success">
                <span className="rounded-circle bg-success" style={{ width: '8px', height: '8px' }} />
                Connected
              </span>
            </div>
          </div>
        </div>

        {/* Audit logs */}
        <div className="card">
          <div className="card-header d-flex align-items-start gap-3 py-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-warning"><ScrollText className="fs-5" /></span>
            <div>
              <h5 className="fw-semibold text-main mb-0">System Activity Logs</h5>
              <p className="text-muted bd-fs-sm mb-0">Recent sensitive actions — role changes, enrollment changes and discipline reviews</p>
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
