import { format } from 'date-fns';
import { ScoreBadge } from './ScoreBadge';
import { BehaviorScoreWithDetails, BehaviorCategory } from '@/types/database';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-[10px] bg-slate-100" />
        ))}
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="d-flex d-flex flex-column align-items-center justify-content-center py-12 text-center">
        <p className="fs-14 text-slate-500">No behavior scores recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200">
      <div class="table-responsive"><table className="w-100">
        <thead>
          <tr className="border-bottom border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-start fs-13 fw-semibold text-slate-500">Student</th>
            <th className="px-4 py-3 text-start fs-13 fw-semibold text-slate-500">Category</th>
            <th className="px-4 py-3 text-start fs-13 fw-semibold text-slate-500">Score</th>
            <th className="px-4 py-3 text-start fs-13 fw-semibold text-slate-500">Remaining</th>
            <th className="px-4 py-3 text-start fs-13 fw-semibold text-slate-500">Date</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => (
            <tr key={score.id} className="border-bottom border-slate-200 last:border-0 hover:bg-slate-50/50">
              <td className="px-4 py-4">
                <div>
                  <p className="fs-14 fw-medium text-slate-900">
                    {score.student?.first_name} {score.student?.last_name}
                  </p>
                  <p className="fs-13 text-slate-500">
                    {score.student?.class?.name || 'No class'}
                  </p>
                </div>
              </td>
              <td className="px-4 py-4">
                <span className="rounded-[8px] bg-slate-100 px-2.5 py-1 fs-13 fw-medium text-slate-700">
                  {categoryLabels[score.category]}
                </span>
              </td>
              <td className="px-4 py-4">
                <ScoreBadge score={score.score} />
              </td>
              <td className="px-4 py-4">
                {(() => {
                  const raw = remainingMap[score.student_id] ?? 100;
                  const r = Math.max(0, Math.min(100, raw));
                  const cls = r >= 50 ? 'text-emerald-700' : r >= 25 ? 'text-amber-700' : 'text-red-700';
                  return <span className={`fs-13 fw-semibold ${cls}`}>{r}/100</span>;
                })()}
              </td>
              <td className="px-4 py-4 fs-13 text-slate-500">
                {format(new Date(score.score_date), 'MMM d, yyyy')}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}



