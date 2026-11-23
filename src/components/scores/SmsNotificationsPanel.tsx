import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SmsStatusBadge } from './SmsStatusBadge';
import { Loader2, MessageSquare, RefreshCw } from '@/lib/icons';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface SmsNotification {
  id: string;
  phone_number: string;
  message: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  parent?: {
    full_name: string;
  };
}

interface SmsNotificationsPanelProps {
  behaviorScoreId: string;
}

export function SmsNotificationsPanel({ behaviorScoreId }: SmsNotificationsPanelProps) {
  const [notifications, setNotifications] = useState<SmsNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, [behaviorScoreId]);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('sms_notifications')
        .select('*, parent:parents(full_name)')
        .eq('behavior_score_id', behaviorScoreId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data as SmsNotification[]);
    } catch (error) {
      console.error('Error fetching SMS notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (notification: SmsNotification) => {
    setResendingId(notification.id);
    try {
      // Delete the old failed notification
      await supabase
        .from('sms_notifications')
        .delete()
        .eq('id', notification.id);

      // Get the behavior score to get student info
      const { data: scoreData } = await supabase
        .from('behavior_scores')
        .select('student_id, score, score_date')
        .eq('id', behaviorScoreId)
        .single();

      if (!scoreData) {
        throw new Error('Score not found');
      }

      // Call the edge function to resend
      const response = await supabase.functions.invoke('send-sms-notification', {
        body: {
          behaviorScoreId: behaviorScoreId,
          studentId: scoreData.student_id,
          score: scoreData.score,
          date: scoreData.score_date,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('SMS resent successfully');
      fetchNotifications();
    } catch (error: any) {
      console.error('Error resending SMS:', error);
      toast.error('Failed to resend SMS', { description: error.message });
    } finally {
      setResendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-4">
        <span className="spinner-border spinner-border-sm text-secondary" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return <p className="text-muted bd-fs-sm py-2 mb-0">No SMS notifications sent yet</p>;
  }

  return (
    <div className="d-flex flex-column gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="card d-flex align-items-center justify-content-between gap-3 p-3"
        >
          <div className="d-flex flex-grow-1 align-items-center gap-2 min-w-0">
            <MessageSquare className="text-secondary" />
            <div className="min-w-0">
              <span className="fw-medium text-main bd-fs-sm">
                {notification.parent?.full_name || 'Unknown Parent'}
              </span>
              <p className="text-secondary bd-fs-sm mb-0">{notification.phone_number}</p>
              {notification.sent_at && (
                <p className="text-secondary bd-fs-sm mb-0">
                  Sent: {format(new Date(notification.sent_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
              {notification.error_message && (
                <p className="text-danger bd-fs-sm mb-0">Error: {notification.error_message}</p>
              )}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {notification.status === 'failed' && (
              <button
                type="button"
                className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                onClick={() => handleResend(notification)}
                disabled={resendingId === notification.id}
              >
                {resendingId === notification.id ? (
                  <><span className="spinner-border spinner-border-sm" /> Resending...</>
                ) : (
                  <><RefreshCw /> Resend</>
                )}
              </button>
            )}
            <SmsStatusBadge status={notification.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
