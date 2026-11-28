import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, scopedByStudents, scopedById, type Scope } from '@/lib/scope';
import { Student, Class, BehaviorCategory, BehaviorScoreWithDetails } from '@/types/database';
import { Plus, Search, ClipboardList, Eye, RotateCcw, Bell } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ScoreBadge } from '@/components/dashboard/ScoreBadge';
import { ScoreDetailsDialog } from '@/components/scores/ScoreDetailsDialog';
import { cn } from '@/lib/utils';

interface StudentWithClass extends Student {
  class?: Class | null;
}

const categoryLabels: Record<BehaviorCategory, string> = {
  discipline: 'Discipline',
  respect: 'Respect',
  attendance: 'Attendance',
  participation: 'Participation',
};

const categories: BehaviorCategory[] = ['discipline', 'respect', 'attendance', 'participation'];

export default function Scores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, roles, can } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const scopeKey = `${user?.id ?? ''}|${roles.slice().sort().join(',')}`;
  const isStaff = roles.some((r) => r === 'admin' || r === 'dos' || r === 'teacher');
  // DOD may read behaviour scores globally but cannot enter/reset them.
  const canRecord = can('scores.behavior.manage') && isStaff;
  const canReset = can('scores.behavior.manage') && roles.some((r) => r === 'admin' || r === 'dos');
  const [scores, setScores] = useState<BehaviorScoreWithDetails[]>([]);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [cumulativeMap, setCumulativeMap] = useState<Record<string, number>>({});
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsAddDialogOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [formLoading, setFormLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [selectedScore, setSelectedScore] = useState<BehaviorScoreWithDetails | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentPickerQuery, setStudentPickerQuery] = useState('');
  const [category, setCategory] = useState<BehaviorCategory>('discipline');
  const [score, setScore] = useState(1);
  const MAX_SCORE = 40;
  const [notes, setNotes] = useState('');
  const [scoreDate, setScoreDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    let cancelled = false;
    setScope(null);
    buildScope(supabase, user?.id, roles).then((s) => { if (!cancelled) setScope(s); });
    return () => { cancelled = true; };
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scope) void fetchData(scope);
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const isInScope = (studentId: string) => scope?.studentIds === null || !!scope?.studentIds?.includes(studentId);

  const fetchData = async (activeScope: Scope) => {
    try {
      if (activeScope.studentIds !== null && activeScope.studentIds.length === 0) {
        setScores([]);
        setStudents([]);
        setCumulativeMap({});
        setRemainingMap({});
        setLoading(false);
        return;
      }

      let scoresQuery = supabase
        .from('behavior_scores')
        .select('*, student:students(*, class:classes(*)), teacher:profiles(*)')
        .order('created_at', { ascending: false });
      if (activeScope.studentIds !== null) scoresQuery = scoresQuery.in('student_id', activeScope.studentIds);
      let studentsQuery = supabase.from('students').select('*, class:classes(*)').order('last_name');
      if (activeScope.studentIds !== null) studentsQuery = studentsQuery.in('id', activeScope.studentIds);

      const [scoresRes, studentsRes, cumRes] = await Promise.all([
        scoresQuery,
        studentsQuery,
        supabase.from('student_cumulative_scores' as any).select('*'),
      ]);

      if (scoresRes.data) {
        setScores(scopedByStudents(scoresRes.data as unknown as BehaviorScoreWithDetails[], activeScope));
      }
      if (studentsRes.data) {
        setStudents(scopedById(studentsRes.data as StudentWithClass[], activeScope.studentIds));
      }
      if (cumRes && (cumRes as any).data) {
        const map: Record<string, number> = {};
        const rmap: Record<string, number> = {};
        for (const row of scopedByStudents((cumRes as any).data as any[], activeScope) as any[]) {
          map[row.student_id] = row.cumulative_score ?? 0;
          rmap[row.student_id] = row.remaining_marks ?? 100;
        }
        setCumulativeMap(map);
        setRemainingMap(rmap);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  const handleAddScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canRecord || !isInScope(selectedStudent)) return;

    setFormLoading(true);

    try {
      const absScore = Math.min(Math.abs(score), MAX_SCORE);
      if (Math.abs(score) > MAX_SCORE) {
        toast.error(`Score cannot exceed ${MAX_SCORE}/${MAX_SCORE}`);
        setFormLoading(false);
        return;
      }
      const finalScore = -absScore;

      const { data: existing, error: existingErr } = await supabase
        .from('behavior_scores')
        .select('*')
        .eq('student_id', selectedStudent)
        .eq('category', category)
        .eq('score_date', scoreDate)
        .maybeSingle();
      if (existingErr) throw existingErr;

      let scoreData: any = null;
      let combinedDeduction = absScore;

      if (existing) {
        // A teacher must not overwrite a score recorded by another teacher.
        if (!roles.some((r) => r === 'admin' || r === 'dos') && existing.teacher_id !== user.id) {
          toast.error('This score was recorded by another teacher and cannot be changed.');
          setFormLoading(false);
          return;
        }
        const prevAbs = Math.abs(existing.score || 0);
        combinedDeduction = Math.min(prevAbs + absScore, MAX_SCORE);
        const mergedNotes = [existing.notes, notes].filter(Boolean).join(' | ') || null;
        const { data: updated, error: updErr } = await supabase
          .from('behavior_scores')
          .update({
            score: -combinedDeduction,
            notes: mergedNotes,
            teacher_id: user.id,
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (updErr) throw updErr;
        scoreData = updated;
      } else {
        const { data: inserted, error } = await supabase.from('behavior_scores').insert({
          student_id: selectedStudent,
          teacher_id: user.id,
          category,
          score: finalScore,
          notes: notes || null,
          score_date: scoreDate,
        }).select().single();
        if (error) throw error;
        scoreData = inserted;
      }

      if (scoreData) {
        try {
          await sendSmsNotification(scoreData.id, selectedStudent, -combinedDeduction, scoreDate);
        } catch (smsError) {
          console.error('SMS notification failed:', smsError);
        }
      }

      toast.success(existing ? 'Deduction updated for this date' : 'Marks deducted', {
        description: `${combinedDeduction}/${MAX_SCORE} deducted · Parents notified via SMS`,
      });
      setIsAddDialogOpen(false);
      resetForm();
      if (scope) void fetchData(scope);
    } catch (error: any) {
      toast.error('Failed to record score', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const sendSmsNotification = async (scoreId: string, studentId: string, scoreValue: number, date: string) => {
    const response = await supabase.functions.invoke('send-sms-notification', {
      body: { behaviorScoreId: scoreId, studentId, score: scoreValue, date },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    console.log('SMS notification response:', response.data);
  };

  const resetForm = () => {
    setSelectedStudent('');
    setCategory('discipline');
    setScore(1);
    setNotes('');
    setScoreDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleResetAllScores = async () => {
    if (!canReset) return;
    if (!confirm('Reset behavior scores for ALL students? This deletes all behavior score records (e.g., at the start of a new term). This cannot be undone.')) return;
    setResetLoading(true);
    try {
      const { error } = await supabase.from('behavior_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      toast.success('All behavior scores have been reset');
      if (scope) void fetchData(scope);
    } catch (e: any) {
      toast.error('Reset failed', { description: e.message });
    } finally {
      setResetLoading(false);
    }
  };

  const filteredScores = scores.filter((s) => {
    if (!s.student) return false;
    const fullName = `${s.student.first_name} ${s.student.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const selectedStudentObj = students.find((s) => s.id === selectedStudent);
  const previewRemaining =
    selectedStudent
      ? (remainingMap[selectedStudent] ?? 100) - Math.abs(score)
      : null;

  const pickerFiltered = students
    .filter((s) => {
      const q = studentPickerQuery.toLowerCase();
      return `${s.first_name} ${s.last_name} ${s.student_id} ${s.class?.name ?? ''}`.toLowerCase().includes(q);
    })
    .slice(0, 40);

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Records"
          title="Behavior Scores"
          description="Record and manage student behavior assessments."
          actions={(canReset || canRecord) ? (
            <div className="d-flex flex-wrap gap-2">
              {canReset && (
                <button type="button" className="btn btn-outline-danger d-inline-flex align-items-center gap-1" onClick={handleResetAllScores} disabled={resetLoading}>
                  {resetLoading ? <><span className="spinner-border spinner-border-sm" /> Resetting...</> : <><RotateCcw /> Reset Marks (New Term)</>}
                </button>
              )}
              {canRecord && (
                <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => setIsAddDialogOpen(true)}>
                  <Plus /> Record Score
                </button>
              )}
            </div>
          ) : undefined}
        />

        {/* Search */}
        <div className="input-group w-100 w-md-auto flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search by student name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search scores by student name"
          />
        </div>

        {/* Scores list */}
        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filteredScores.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center">
              <ClipboardList className="fs-3 mb-4 text-secondary" />
              <h3 className="fw-semibold text-main mb-2">No scores found</h3>
              <p className="text-secondary bd-fs-sm mb-0">
                {scope?.studentIds?.length === 0
                  ? 'No student records are linked to your account.'
                  : searchQuery ? 'Try adjusting your search' : 'Record your first behavior score to get started'}
              </p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr className="border-bottom border-secondary-subtle">
                    <th scope="col">Student</th>
                    <th scope="col">Category</th>
                    <th scope="col">Score</th>
                    <th scope="col">Date</th>
                    <th scope="col">Teacher</th>
                    <th scope="col" className="text-center">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScores.map((score) => (
                    <tr key={score.id} className="border-bottom border-secondary-subtle">
                      <td>
                        <div>
                          <p className="fw-medium text-main mb-0">
                            {score.student?.first_name} {score.student?.last_name}
                          </p>
                          <p className="text-muted bd-fs-sm mb-0">{score.student?.class?.name || 'No class'}</p>
                        </div>
                      </td>
                      <td>
                        <span className="badge text-bg-secondary">{categoryLabels[score.category]}</span>
                      </td>
                      <td><ScoreBadge score={score.score} /></td>
                      <td className="text-muted bd-fs-sm">{format(new Date(score.score_date), 'MMM d, yyyy')}</td>
                      <td className="text-muted bd-fs-sm">{score.teacher?.full_name || 'Unknown'}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
                          onClick={() => {
                            if (!isInScope(score.student_id)) return;
                            setSelectedScore(score);
                            setDetailsDialogOpen(true);
                          }}
                        >
                          <Eye /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Record Behavior Score modal ── */}
        {isAddDialogOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Record Behavior Score</h5>
                    <button type="button" className="btn-close" onClick={() => setIsAddDialogOpen(false)} aria-label="Close" />
                  </div>
                  <form className="modal-body d-flex flex-column gap-4" onSubmit={handleAddScore}>
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label className="form-label">Student</label>
                        <input
                          type="search"
                          className="form-control bd-search-input mb-2"
                          placeholder="Search by name, ID or class..."
                          value={studentPickerQuery}
                          onChange={(e) => setStudentPickerQuery(e.target.value)}
                          aria-label="Search student"
                        />
                        <select
                          className="form-select"
                          value={selectedStudent}
                          onChange={(e) => setSelectedStudent(e.target.value)}
                        >
                          <option value="">Search and select a student...</option>
                          {pickerFiltered.map((student) => {
                            const remaining = remainingMap[student.id] ?? 100;
                            return (
                              <option key={student.id} value={student.id}>
                                {student.first_name} {student.last_name} — {student.class?.name || 'No class'} ({remaining} pts)
                              </option>
                            );
                          })}
                        </select>
                        {selectedStudentObj && (
                          <div className="d-flex align-items-center gap-2 mt-2">
                            <span className="badge text-bg-success bg-success-subtle">{remainingMap[selectedStudent] ?? 100} pts remaining</span>
                          </div>
                        )}
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Category</label>
                        <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value as BehaviorCategory)}>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="rounded-3 bg-secondary-subtle p-3 bd-fs-sm text-secondary">
                      Every student starts the term with <span className="fw-semibold text-main">40/40</span> in each category. You can only <span className="fw-semibold text-danger">deduct</span> marks for misconduct.
                    </div>

                    <div className="d-flex flex-column gap-2">
                      <div className="d-flex align-items-center justify-content-between">
                        <label className="form-label mb-0">Points to deduct</label>
                        <span className="fw-bold text-danger bd-fs-lg">-{Math.abs(score)}</span>
                      </div>
                      <div className="d-flex align-items-center gap-3">
                        <input
                          type="range"
                          className="form-range flex-grow-1"
                          min={1}
                          max={MAX_SCORE}
                          step={1}
                          value={score}
                          onChange={(e) => setScore(Number(e.target.value))}
                          aria-label="Marks"
                        />
                        <input
                          type="number"
                          min={1}
                          max={MAX_SCORE}
                          value={score}
                          onChange={(e) => {
                            const raw = parseInt(e.target.value, 10);
                            if (Number.isNaN(raw)) { setScore(1); return; }
                            setScore(Math.max(1, Math.min(MAX_SCORE, raw)));
                          }}
                          className="form-control w-16 text-center"
                          aria-label="Marks"
                        />
                      </div>
                      <p className="text-muted bd-fs-sm">
                        Drag the slider or type marks (1–{MAX_SCORE}). Max is {MAX_SCORE}/{MAX_SCORE}.
                      </p>
                      {selectedStudent && (
                        <div className="d-flex align-items-center justify-content-between rounded-3 bg-secondary-subtle px-3 py-2 bd-fs-sm text-secondary">
                          <span>Current: <span className="fw-semibold text-main">{remainingMap[selectedStudent] ?? 100}</span> pts</span>
                          <span>After: <span className={cn('fw-semibold', (previewRemaining ?? 0) >= 50 ? 'text-success' : (previewRemaining ?? 0) >= 25 ? 'text-warning' : 'text-danger')}>{previewRemaining}</span> pts</span>
                        </div>
                      )}
                    </div>

                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label htmlFor="scoreDate" className="form-label">Date</label>
                        <input id="scoreDate" className="form-control" type="date" value={scoreDate} onChange={(e) => setScoreDate(e.target.value)} required />
                      </div>
                      <div className="col-12 col-md-6">
                        <label htmlFor="notes" className="form-label">Notes (Optional)</label>
                        <textarea id="notes" className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes..." rows={2} />
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2 rounded-3 bg-info-subtle px-3 py-2 bd-fs-sm text-info">
                      <Bell className="bd-fs-xs" />
                      <span>Parents will be notified via SMS</span>
                    </div>

                    <div className="d-flex justify-content-end gap-2 pt-1">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setIsAddDialogOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-success" disabled={formLoading || !selectedStudent}>
                        {formLoading ? <><span className="spinner-border spinner-border-sm" /> Recording...</> : 'Record Score'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Score details dialog */}
        <ScoreDetailsDialog
          score={selectedScore}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}
