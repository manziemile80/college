import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DisciplineIncident, DisciplineRule, StudentWithClass } from '@/types/database';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Gavel, Loader2, Plus, ShieldCheck, XCircle, CheckCircle2, Search } from '@/lib/icons';
import { cn } from '@/lib/utils';

const MAX_SCORE = 40;

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending': return <span className="badge text-bg-warning bd-fs-sm">Pending</span>;
    case 'reviewed': return <span className="badge text-bg-success bd-fs-sm">Reviewed</span>;
    case 'dismissed': return <span className="badge text-bg-danger bd-fs-sm">Dismissed</span>;
    default: return <span className="badge text-bg-secondary bd-fs-sm">{status}</span>;
  }
};

const severityBadge = (severity: string) => {
  switch (severity) {
    case 'major': return <span className="badge text-bg-danger bd-fs-sm">Major</span>;
    case 'grave': return <span className="badge text-bg-danger bd-fs-sm">Grave</span>;
    default: return <span className="badge text-bg-secondary bd-fs-sm">Minor</span>;
  }
};

export default function Discipline() {
  const { role, user } = useAuth();
  const isDOD = role === 'dod';
  const isAdmin = role === 'admin';
  const isStaff = isAdmin || isDOD || role === 'teacher' || role === 'dos';
  const canReview = isAdmin || isDOD;
  const canManageRules = isAdmin || isDOD;

  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<DisciplineIncident[]>([]);
  const [rules, setRules] = useState<DisciplineRule[]>([]);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const [reportOpen, setReportOpen] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportStudent, setReportStudent] = useState('');
  const [reportRule, setReportRule] = useState('');
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportDesc, setReportDesc] = useState('');
  const [search, setSearch] = useState('');

  const [reviewIncident, setReviewIncident] = useState<DisciplineIncident | null>(null);
  const [reviewMarks, setReviewMarks] = useState('1');
  const [reviewFollowUp, setReviewFollowUp] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleCategory, setRuleCategory] = useState('discipline');
  const [ruleMarks, setRuleMarks] = useState('1');
  const [ruleSeverity, setRuleSeverity] = useState('minor');
  const [ruleDesc, setRuleDesc] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [incRes, rulesRes, studentsRes] = await Promise.all([
        supabase
          .from('discipline_incidents')
          .select('*, student:students(*, class:classes(*)), rule:discipline_rules(*)')
          .order('created_at', { ascending: false }),
        canManageRules
          ? supabase.from('discipline_rules').select('*').order('title')
          : Promise.resolve({ data: null }),
        isStaff
          ? supabase.from('students').select('*, class:classes(*)').order('last_name')
          : Promise.resolve({ data: null }),
      ]);
      setIncidents((incRes.data as unknown as DisciplineIncident[]) || []);
      setRules((rulesRes.data as DisciplineRule[]) || []);
      setStudents((studentsRes.data as StudentWithClass[]) || []);
    } catch (e: any) {
      toast.error('Failed to load discipline data', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [canManageRules, isStaff]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredIncidents = useMemo(
    () => (statusFilter === 'all' ? incidents : incidents.filter((i) => i.status === statusFilter)),
    [incidents, statusFilter]
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students.slice(0, 50);
    return students
      .filter(
        (s) =>
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
          s.student_id.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [students, search]);

  const handleReport = async () => {
    if (!reportStudent || !reportDesc.trim() || !user) {
      toast.error('Select a student and describe the incident');
      return;
    }
    setReportSaving(true);
    try {
      const student = students.find((s) => s.id === reportStudent);
      const { error } = await supabase.from('discipline_incidents').insert({
        student_id: reportStudent,
        class_id: student?.class_id || null,
        rule_id: reportRule || null,
        reported_by: user.id,
        incident_date: reportDate,
        description: reportDesc.trim(),
        status: 'pending',
      });
      if (error) throw error;
      await supabase.rpc('log_audit', {
        _action: 'report_discipline_incident',
        _entity: 'discipline_incidents',
        _details: { student_id: reportStudent, rule_id: reportRule || null },
      });
      toast.success('Incident reported for review');
      setReportOpen(false);
      setReportStudent('');
      setReportRule('');
      setReportDesc('');
      fetchAll();
    } catch (e: any) {
      toast.error('Failed to report incident', { description: e.message });
    } finally {
      setReportSaving(false);
    }
  };

  const openReview = (incident: DisciplineIncident) => {
    setReviewIncident(incident);
    setReviewMarks(String(incident.rule?.marks_deduction || 1));
    setReviewFollowUp('');
  };

  const applyReview = async (status: 'reviewed' | 'dismissed') => {
    if (!reviewIncident || !user) return;
    const marks = Math.max(0, Math.min(MAX_SCORE, parseInt(reviewMarks, 10) || 0));
    setReviewSaving(true);
    try {
      const { error } = await supabase
        .from('discipline_incidents')
        .update({
          status,
          marks_deducted: status === 'reviewed' ? marks : 0,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          follow_up: reviewFollowUp.trim() || null,
        })
        .eq('id', reviewIncident.id);
      if (error) throw error;

      if (status === 'reviewed' && marks > 0) {
        const existing = await supabase
          .from('behavior_scores')
          .select('*')
          .eq('student_id', reviewIncident.student_id)
          .eq('category', 'discipline')
          .eq('score_date', reviewIncident.incident_date)
          .maybeSingle();
        const currentDeduction = existing.data ? Math.abs(existing.data.score) : 0;
        const combined = Math.min(MAX_SCORE, currentDeduction + marks);
        let scoreId = existing.data?.id;
        if (existing.data) {
          const { data, error: updErr } = await supabase
            .from('behavior_scores')
            .update({
              score: -combined,
              teacher_id: user.id,
              notes: existing.data.notes
                ? `${existing.data.notes} | Incident: ${reviewIncident.description}`
                : `Incident: ${reviewIncident.description}`,
            })
            .eq('id', existing.data.id)
            .select('id')
            .single();
          if (updErr) throw updErr;
          scoreId = data?.id;
        } else {
          const { data, error: insErr } = await supabase
            .from('behavior_scores')
            .insert({
              student_id: reviewIncident.student_id,
              teacher_id: user.id,
              category: 'discipline',
              score: -combined,
              notes: `Incident: ${reviewIncident.description}`,
              score_date: reviewIncident.incident_date,
            })
            .select('id')
            .single();
          if (insErr) throw insErr;
          scoreId = data?.id;
        }
        await supabase
          .from('discipline_incidents')
          .update({ behavior_score_id: scoreId })
          .eq('id', reviewIncident.id);
      }

      await supabase.rpc('log_audit', {
        _action: status === 'reviewed' ? 'approve_discipline_incident' : 'dismiss_discipline_incident',
        _entity: 'discipline_incidents',
        _entity_id: reviewIncident.id,
        _details: { marks_deducted: status === 'reviewed' ? marks : 0 },
      });
      toast.success(status === 'reviewed' ? `Incident approved — ${marks} mark(s) deducted` : 'Incident dismissed');
      setReviewIncident(null);
      fetchAll();
    } catch (e: any) {
      toast.error('Failed to review incident', { description: e.message });
    } finally {
      setReviewSaving(false);
    }
  };

  const handleSaveRule = async () => {
    if (!ruleTitle.trim()) {
      toast.error('Rule title is required');
      return;
    }
    setRuleSaving(true);
    try {
      const { error } = await supabase.from('discipline_rules').insert({
        title: ruleTitle.trim(),
        description: ruleDesc.trim() || null,
        category: ruleCategory,
        marks_deduction: Math.max(1, Math.min(MAX_SCORE, parseInt(ruleMarks, 10) || 1)),
        severity: ruleSeverity,
        created_by: user?.id,
      });
      if (error) throw error;
      await supabase.rpc('log_audit', {
        _action: 'create_discipline_rule',
        _entity: 'discipline_rules',
        _details: { title: ruleTitle.trim() },
      });
      toast.success('Rule added');
      setRuleOpen(false);
      setRuleTitle('');
      setRuleDesc('');
      fetchAll();
    } catch (e: any) {
      toast.error('Failed to add rule', { description: e.message });
    } finally {
      setRuleSaving(false);
    }
  };

  const pendingCount = incidents.filter((i) => i.status === 'pending').length;

  const reportForm = (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Student</label>
        <div className="input-group">
          <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search student by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="form-select" value={reportStudent} onChange={(e) => setReportStudent(e.target.value)}>
          <option value="">Select student</option>
          {filteredStudents.map((s) => (
            <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_id})</option>
          ))}
        </select>
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Rule (optional)</label>
        <select className="form-select" value={reportRule} onChange={(e) => setReportRule(e.target.value)}>
          <option value="">No specific rule</option>
          {rules.filter((r) => r.is_active).map((r) => (
            <option key={r.id} value={r.id}>{r.title} (−{r.marks_deduction})</option>
          ))}
        </select>
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Date</label>
        <input type="date" className="form-control" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Description</label>
        <textarea rows={3} className="form-control" placeholder="What happened?" value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} />
      </div>
      <div className="d-flex justify-content-end gap-2 pt-2">
        <button type="button" className="btn btn-outline-secondary" onClick={() => setReportOpen(false)}>Cancel</button>
        <button type="button" className="btn btn-success" onClick={handleReport} disabled={reportSaving}>
          {reportSaving ? <><span className="spinner-border spinner-border-sm" /> Submitting...</> : 'Submit'}
        </button>
      </div>
    </div>
  );

  const ruleForm = (
    <div className="d-flex flex-column gap-4">
      <div className="d-flex flex-wrap gap-3">
        <div className="flex-fill">
          <label className="form-label">Title</label>
          <input className="form-control" placeholder="e.g. Late coming without excuse" value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} />
        </div>
        <div className="flex-fill">
          <label className="form-label">Category</label>
          <select className="form-select" value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
            <option value="discipline">Discipline</option>
            <option value="respect">Respect</option>
            <option value="attendance">Attendance</option>
            <option value="participation">Participation</option>
          </select>
        </div>
        <div className="flex-fill">
          <label className="form-label">Severity</label>
          <select className="form-select" value={ruleSeverity} onChange={(e) => setRuleSeverity(e.target.value)}>
            <option value="minor">Minor</option>
            <option value="major">Major</option>
            <option value="grave">Grave</option>
          </select>
        </div>
        <div className="flex-fill">
          <label className="form-label">Marks deducted (max {MAX_SCORE})</label>
          <input type="number" min={1} max={MAX_SCORE} className="form-control" value={ruleMarks} onChange={(e) => setRuleMarks(e.target.value)} />
        </div>
      </div>
      <div className="d-flex flex-column gap-2">
        <label className="form-label">Description</label>
        <textarea rows={2} className="form-control" value={ruleDesc} onChange={(e) => setRuleDesc(e.target.value)} />
      </div>
      <div className="d-flex justify-content-end gap-2 pt-2">
        <button type="button" className="btn btn-outline-secondary" onClick={() => setRuleOpen(false)}>Cancel</button>
        <button type="button" className="btn btn-success" onClick={handleSaveRule} disabled={ruleSaving}>
          {ruleSaving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : 'Save Rule'}
        </button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Records"
          title="Discipline"
          description={isStaff ? 'Report, review and follow up on student discipline incidents.' : 'Discipline incidents recorded for your records.'}
          actions={
            isStaff ? (
              <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => setReportOpen(true)}>
                <Plus /> Report Incident
              </button>
            ) : undefined
          }
        />

        {canManageRules && (
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between py-3">
              <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2">
                <Gavel className="text-success" /> Discipline Rules
              </h5>
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => setRuleOpen(true)}>
                <Plus /> Add Rule
              </button>
            </div>
            <div className="card-body">
              {rules.length === 0 ? (
                <p className="text-muted bd-fs-sm py-3 text-center">
                  No rules yet. Add rules so teachers can report incidents against them.
                </p>
              ) : (
                <div className="row g-3">
                  {rules.map((r) => (
                    <div key={r.id} className="col-12 col-sm-6 col-lg-4">
                      <div className="card h-100 d-flex flex-column gap-2 p-3">
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <p className="fw-semibold text-main mb-0">{r.title}</p>
                          {severityBadge(r.severity)}
                        </div>
                        <p className="text-muted bd-fs-sm mb-0">{r.description || 'No description'}</p>
                        <p className="text-danger fw-semibold bd-fs-sm mb-0">
                          −{r.marks_deduction} mark{r.marks_deduction > 1 ? 's' : ''} · {r.category}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header d-flex flex-column gap-3 border-bottom border-secondary-subtle py-3">
            <div className="d-flex align-items-center gap-3">
              <h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2">
                <ShieldCheck className="text-success" /> Incidents
              </h5>
              {isStaff && pendingCount > 0 && (
                <span className="badge text-bg-warning">{pendingCount} pending</span>
              )}
            </div>
            <ul className="nav nav-pills flex-wrap justify-content-center" role="tablist" aria-label="Incident status filter">
              {(['all', 'pending', 'reviewed', 'dismissed'] as const).map((v) => (
                <li className="nav-item" key={v}>
                  <button
                    type="button"
                    className={cn('nav-link bd-fs-sm', statusFilter === v ? 'active text-white' : 'text-secondary')}
                    onClick={() => setStatusFilter(v)}
                    aria-pressed={statusFilter === v}
                  >
                    {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-8">
                <span className="spinner-border spinner-border-lg text-success" role="status" />
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="empty-state">
                <XCircle className="fs-3 mb-3 text-secondary" />
                <p className="fw-semibold text-main mb-0">No incidents found.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="border-bottom border-secondary-subtle">
                      <th scope="col">Student</th>
                      <th scope="col">Date</th>
                      <th scope="col">Rule</th>
                      <th scope="col">Description</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-end">Marks</th>
                      {canReview && <th scope="col" className="text-end">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIncidents.map((i) => (
                      <tr key={i.id} className="border-bottom border-secondary-subtle">
                        <td className="fw-medium text-main">
                          {i.student ? `${i.student.first_name} ${i.student.last_name}` : '—'}
                        </td>
                        <td className="text-muted bd-fs-sm">{format(new Date(i.incident_date), 'MMM d, yyyy')}</td>
                        <td className="text-muted text-truncate">{i.rule?.title || '—'}</td>
                        <td className="text-truncate">{i.description}</td>
                        <td>{statusBadge(i.status)}</td>
                        <td className="text-end fw-semibold text-secondary">
                          {i.marks_deducted > 0 ? `−${i.marks_deducted}` : '—'}
                        </td>
                        {canReview && (
                          <td className="text-end">
                            {i.status === 'pending' ? (
                              <div className="d-flex justify-content-end gap-1">
                                <button
                                  type="button"
                                  className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                                  onClick={() => openReview(i)}
                                >
                                  <CheckCircle2 /> Review
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm d-inline-flex align-items-center"
                                  onClick={async () => {
                                    setReviewIncident(i);
                                    setReviewMarks('0');
                                    await applyReview('dismissed');
                                  }}
                                  aria-label="Dismiss"
                                >
                                  <XCircle />
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted bd-fs-sm">{i.follow_up || '—'}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Report Incident modal ── */}
        {reportOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Report Incident</h5>
                    <button type="button" className="btn-close" onClick={() => setReportOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body">{reportForm}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Review Incident modal ── */}
        {reviewIncident && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Review Incident</h5>
                    <button type="button" className="btn-close" onClick={() => setReviewIncident(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-4">
                    <div className="rounded-3 bg-secondary-subtle p-3 bd-fs-sm text-main">
                      <p className="fw-medium mb-0">
                        {reviewIncident.student ? `${reviewIncident.student.first_name} ${reviewIncident.student.last_name}` : 'Student'}
                      </p>
                      <p className="text-muted mt-1 mb-0">{reviewIncident.description}</p>
                      {reviewIncident.rule && (
                        <p className="text-muted bd-fs-sm mt-1 mb-0">
                          Rule: {reviewIncident.rule.title} (suggested −{reviewIncident.rule.marks_deduction})
                        </p>
                      )}
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Marks to deduct (max {MAX_SCORE})</label>
                      <input type="number" min={0} max={MAX_SCORE} className="form-control" value={reviewMarks} onChange={(e) => setReviewMarks(e.target.value)} />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Follow-up action (optional)</label>
                      <textarea rows={2} className="form-control" placeholder="e.g. Parent contacted, warning issued..." value={reviewFollowUp} onChange={(e) => setReviewFollowUp(e.target.value)} />
                    </div>
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setReviewIncident(null)}>Cancel</button>
                      <button type="button" className="btn btn-primary" onClick={() => applyReview('reviewed')} disabled={reviewSaving}>
                        {reviewSaving
                          ? <><span className="spinner-border spinner-border-sm" /> Applying...</>
                          : `Approve & Deduct ${Math.max(0, Math.min(MAX_SCORE, parseInt(reviewMarks, 10) || 0))}`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Add Rule modal ── */}
        {ruleOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Add Discipline Rule</h5>
                    <button type="button" className="btn-close" onClick={() => setRuleOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body">{ruleForm}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
