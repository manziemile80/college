import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BehaviorScoreWithDetails, BehaviorCategory } from '@/types/database';
import { ScoreBadge } from '@/components/dashboard/ScoreBadge';
import { SmsNotificationsPanel } from './SmsNotificationsPanel';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Score Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Student Info */}
          <div className="d-flex align-items-center g-3">
            <div className="d-flex h-12 w-12 align-items-center justify-content-center rounded-circle bg-primary text-primary-foreground fw-medium">
              {score.student?.first_name?.charAt(0)}
              {score.student?.last_name?.charAt(0)}
            </div>
            <div>
              <p className="fw-semibold">
                {score.student?.first_name} {score.student?.last_name}
              </p>
              <p className="fs-sm text-muted-foreground">
                {score.student?.class?.name || 'No class'}
              </p>
            </div>
          </div>

          {/* Score Info */}
          <div className="row col-6 g-4 rounded-lg bg-muted/50 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="fw-medium">{categoryLabels[score.category]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Score</p>
              <ScoreBadge score={score.score} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="fw-medium">
                {format(new Date(score.score_date), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Teacher</p>
              <p className="fw-medium">{score.teacher?.full_name || 'Unknown'}</p>
            </div>
          </div>

          {/* Notes */}
          {score.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="fs-sm bg-muted/50 rounded-lg p-3">{score.notes}</p>
            </div>
          )}

          <Separator />

          {/* SMS Notifications */}
          <div>
            <p className="fs-sm fw-medium mb-3">SMS Notifications</p>
            <SmsNotificationsPanel behaviorScoreId={score.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


