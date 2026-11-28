import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Bell, CheckCircle, Check, Clock, RefreshCw, XCircle } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/** The notifications table is newer than the generated client types. */
const db = supabase as any;

interface NotificationRow {
  id: string;
  user_id: string | null;
  role: string | null;
  title: string;
  body: string;
  kind: string;
  entity: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

const kindBadge: Record<string, string> = {
  certificate: 'text-bg-success',
  marks: 'text-bg-primary',
  discipline: 'text-bg-danger',
  announcement: 'text-bg-info',
  stock: 'text-bg-warning',
  assignment: 'text-bg-secondary',
  quiz: 'text-bg-secondary',
  info: 'text-bg-light text-dark border',
};

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await db
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setNotifications((data as NotificationRow[]) || []);
    } catch (err: any) {
      console.error('Failed to load notifications:', err);
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const visible = useMemo(
    () => (unreadOnly ? notifications.filter((n) => !n.is_read) : notifications),
    [notifications, unreadOnly],
  );

  const markRead = async (notification: NotificationRow) => {
    if (notification.is_read) return;
    setBusyId(notification.id);
    try {
      const { error: updateError } = await db
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notification.id)
        .eq('user_id', user?.id ?? '');
      if (updateError) throw updateError;
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
      );
    } catch (err: any) {
      toast.error('Failed to mark notification as read', { description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const { error: updateError } = await db
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (updateError) throw updateError;
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success(`${unreadCount} notification(s) marked as read`);
    } catch (err: any) {
      toast.error('Failed to mark all as read', { description: err?.message });
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Account"
          title="Notifications"
          description="Updates about your marks, announcements, discipline, certificates and stock alerts."
          actions={
            <>
              <span className="badge text-bg-warning d-inline-flex align-items-center gap-1">
                <Bell /> {unreadCount} unread
              </span>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                disabled={markingAll || unreadCount === 0}
                onClick={markAllRead}
              >
                {markingAll ? (
                  <><span className="spinner-border spinner-border-sm" /> Updating…</>
                ) : (
                  <><Check /> Mark all as read</>
                )}
              </button>
            </>
          }
        />

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="btn-group" role="group" aria-label="Notification filter">
            <button
              type="button"
              className={cn('btn btn-sm', !unreadOnly ? 'btn-success' : 'btn-outline-secondary')}
              onClick={() => setUnreadOnly(false)}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              className={cn('btn btn-sm', unreadOnly ? 'btn-success' : 'btn-outline-secondary')}
              onClick={() => setUnreadOnly(true)}
            >
              Unread ({unreadCount})
            </button>
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw /> Refresh
          </button>
        </div>

        <div className="card">
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-8">
                <Bell className="fs-3 text-success" />
                <span className="visually-hidden">Loading notifications…</span>
              </div>
            ) : error ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-10 text-center gap-2">
                <XCircle className="fs-3 text-danger" />
                <p className="fw-medium text-main mb-0">Could not load notifications</p>
                <p className="text-muted bd-fs-sm mb-2">{error}</p>
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void load()}>
                  <RefreshCw /> Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-10 text-center">
                <Bell className="fs-3 mb-4 text-secondary" />
                <h3 className="fw-semibold text-main mb-2">
                  {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
                </h3>
                <p className="text-secondary bd-fs-sm mb-0">
                  {unreadOnly
                    ? 'You are all caught up.'
                    : 'Notifications will appear here when there is activity relevant to you.'}
                </p>
              </div>
            ) : (
              <div className="list-group list-group-flush">
                {visible.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'list-group-item d-flex align-items-start gap-3 py-3',
                      !notification.is_read && 'bg-light-subtle',
                    )}
                  >
                    <span
                      className={cn(
                        'd-inline-flex align-items-center justify-content-center rounded-circle p-2 flex-shrink-0',
                        notification.is_read ? 'text-secondary bg-secondary-subtle' : 'text-primary bg-primary-subtle',
                      )}
                    >
                      {notification.is_read ? <CheckCircle /> : <Bell />}
                    </span>
                    <div className="min-w-0 flex-grow-1">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <p className="fw-semibold text-main bd-fs-md mb-0">{notification.title}</p>
                        <span className={cn('badge bd-fs-sm', kindBadge[notification.kind] || 'text-bg-secondary')}>
                          {notification.kind}
                        </span>
                        {!notification.is_read && <span className="badge text-bg-primary bd-fs-sm">New</span>}
                      </div>
                      <p className="text-secondary bd-fs-sm mt-1 mb-1">{notification.body}</p>
                      <div className="d-flex align-items-center gap-2 text-muted bd-fs-sm flex-wrap">
                        <Clock className="fs-6" />
                        <span>{format(new Date(notification.created_at), 'MMM d, yyyy HH:mm')}</span>
                        {notification.entity && <span className="text-capitalize">· {notification.entity.replace(/_/g, ' ')}</span>}
                      </div>
                    </div>
                    {!notification.is_read && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm flex-shrink-0 d-inline-flex align-items-center gap-1"
                        disabled={busyId === notification.id}
                        onClick={() => markRead(notification)}
                        title="Mark as read"
                      >
                        {busyId === notification.id ? (
                          <><span className="spinner-border spinner-border-sm" /> Saving…</>
                        ) : (
                          <><Check /> Read</>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
