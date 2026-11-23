import { format } from 'date-fns';
import { ScoreBadge } from './ScoreBadge';
import { BehaviorScoreWithDetails, BehaviorCategory } from '@/types/database';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface RecentScoresTableProps {
  scores: BehaviorScoreWithDetails[];
  loading?: boolean;
}

const categoryLabels: Record<BehaviorCategory, string> = {
  discipline: 'Discipline',
  respect: 'Respect',
  attendance: 'Attendance',
  participation: 'Participation',
};

export function RecentScoresTable({ scores, loading }: RecentScoresTableProps) {
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('student_cumulative_scores' as any).select('*');
      if (data) {
        const map: Record<string, number> = {};
        for (const row of data as any[]) {
          map[row.student_id] = row.remaining_marks ?? 100;
        }
        setRemainingMap(map);
      }
    })();
  }, [scores]);

  if (loading) {
    return (
      <div className="d-flex flex-column gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="placeholder-glow bg-secondary-subtle rounded rounded-3 w-100" style={{ height: '2.5rem' }} />
        ))}
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center py-5 text-center">
        <p className="text-muted bd-fs-md">No behavior scores recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead>
          <tr className="border-bottom border-secondary-subtle">
            <th className="text-start text-muted bd-fs-sm fw-semibold">Student</th>
            <th className="text-start text-muted bd-fs-sm fw-semibold">Category</th>
            <th className="text-start text-muted bd-fs-sm fw-semibold">Score</th>
            <th className="text-start text-muted bd-fs-sm fw-semibold">Remaining</th>
            <th className="text-start text-muted bd-fs-sm fw-semibold">Date</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => (
            <tr key={score.id}>
              <td>
                <div>
                  <p className="fw-semibold text-main mb-0">
                    {score.student?.first_name} {score.student?.last_name}
                  </p>
                  <p className="text-muted bd-fs-sm mb-0">
                    {score.student?.class?.name || 'No class'}
                  </p>
                </div>
              </td>
              <td>
                <span className="badge text-bg-secondary">{categoryLabels[score.category]}</span>
              </td>
              <td>
                <ScoreBadge score={score.score} />
              </td>
              <td>
                {(() => {
                  const raw = remainingMap[score.student_id] ?? 100;
                  const r = Math.max(0, Math.min(100, raw));
                  const cls = r >= 50 ? 'text-success' : r >= 25 ? 'text-warning' : 'text-danger';
                  return <span className={cn('fw-semibold', cls)}>{r}/100</span>;
                })()}
              </td>
              <td className="text-muted bd-fs-sm">
                {format(new Date(score.score_date), 'MMM d, yyyy')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
