import { BehaviorScoreWithDetails, BehaviorCategory } from '@/types/database';
import { ScoreBadge } from '@/components/dashboard/ScoreBadge';
import { SmsNotificationsPanel } from './SmsNotificationsPanel';
import { format } from 'date-fns';

interface ScoreDetailsDialogProps {
  score: BehaviorScoreWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categoryLabels: Record<BehaviorCategory, string> = {
  discipline: 'Discipline',
  respect: 'Respect',
  attendance: 'Attendance',
  participation: 'Participation',
};

export function ScoreDetailsDialog({
  score,
  open,
  onOpenChange,
}: ScoreDetailsDialogProps) {
  if (!score) return null;

  return (
    <>
      <div className="bd-modal-backdrop" />
      <div className="bd-modal show">
        <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
              <h5 className="modal-title fw-semibold text-main mb-0">Score Details</h5>
              <button type="button" className="btn-close" onClick={() => onOpenChange(false)} aria-label="Close" />
            </div>
            <div className="modal-body d-flex flex-column gap-4">
              {/* Student Info */}
              <div className="d-flex align-items-center gap-3">
                <span className="bd-avatar bd-user-avatar">
                  {score.student?.first_name?.charAt(0)}
                  {score.student?.last_name?.charAt(0)}
                </span>
                <div>
                  <p className="fw-semibold text-main mb-0">
                    {score.student?.first_name} {score.student?.last_name}
                  </p>
                  <p className="text-muted bd-fs-sm mb-0">
                    {score.student?.class?.name || 'No class'}
                  </p>
                </div>
              </div>

              {/* Score Info */}
              <div className="row g-3">
                <div className="col-6 col-sm-6">
                  <p className="text-muted bd-fs-sm mb-1">Category</p>
                  <span className="badge text-bg-secondary">{categoryLabels[score.category]}</span>
                </div>
                <div className="col-6 col-sm-6">
                  <p className="text-muted bd-fs-sm mb-1">Score</p>
                  <ScoreBadge score={score.score} />
                </div>
                <div className="col-6 col-sm-6">
                  <p className="text-muted bd-fs-sm mb-1">Date</p>
                  <p className="fw-medium text-main mb-0">
                    {format(new Date(score.score_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="col-6 col-sm-6">
                  <p className="text-muted bd-fs-sm mb-1">Teacher</p>
                  <p className="fw-medium text-main mb-0">{score.teacher?.full_name || 'Unknown'}</p>
                </div>
              </div>

              {/* Notes */}
              {score.notes && (
                <div>
                  <p className="text-muted bd-fs-sm mb-1">Notes</p>
                  <p className="bd-fs-sm bg-secondary-subtle rounded-3 p-3 mb-0">{score.notes}</p>
                </div>
              )}

              <hr className="border-secondary-subtle" />

              {/* SMS Notifications */}
              <div>
                <p className="fw-medium text-main mb-3">SMS Notifications</p>
                <SmsNotificationsPanel behaviorScoreId={score.id} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
