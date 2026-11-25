import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, Check } from '@/lib/icons';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: 'info' | 'success' | 'warning' | 'danger';
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const dotColor: Record<AppNotification['category'], string> = {
  info: 'bg-sky-500',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
};

export function NotificationsMenu() {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications((data as AppNotification[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
    if (!userId) return;

    // Show newly published notifications live, without a page reload.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as AppNotification;
          setNotifications((current) =>
            current.some((n) => n.id === row.id) ? current : [row, ...current].slice(0, 30),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, userId]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);

  const unread = notifications.filter((n) => !n.is_read).length;

  const markRead = (id: string) => {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    void supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (!error) {
      setNotifications((current) => current.map((n) => ({ ...n, is_read: true })));
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[26rem] overflow-hidden flex flex-col bg-white rounded-xl shadow-xl border border-slate-200 dark:bg-slate-800 dark:border-slate-700 z-50">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                onClick={markAllRead}
              >
                <Check className="w-3.5 h-3.5" /> Mark all as read
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet</p>
            ) : (
              notifications.map((notification) => {
                const content = (
                  <div className="flex gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/60">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor[notification.category] || dotColor.info}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm truncate ${notification.is_read ? 'font-normal text-slate-600 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-slate-100'}`}>
                          {notification.title}
                        </p>
                        {!notification.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );

                return notification.link ? (
                  <Link
                    key={notification.id}
                    to={notification.link}
                    onClick={() => {
                      markRead(notification.id);
                      setOpen(false);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={notification.id}
                    type="button"
                    className="w-full text-left"
                    onClick={() => markRead(notification.id)}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
