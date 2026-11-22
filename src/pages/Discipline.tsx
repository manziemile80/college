import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DisciplineIncident, DisciplineRule, StudentWithClass } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Gavel, Loader2, Plus, ShieldCheck, XCircle, CheckCircle2, Users2 } from 'lucide-react';

const MAX_SCORE = 40;

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending': return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
    case 'reviewed': return <Badge className="bg-green-100 text-emerald-700">Reviewed</Badge>;
    case 'dismissed': return <Badge className="bg-red-100 text-red-800">Dismissed</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
};

const severityBadge = (severity: string) => {
  switch (severity) {
    case 'major': return <Badge variant="destructive">Major</Badge>;
    case 'grave': return <Badge variant="destructive">Grave</Badge>;
    default: return <Badge variant="secondary">Minor</Badge>;
  }
};

export default function Discipline() {
  const { role, profile, user } = useAuth();
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

  // Report incident dialog
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportStudent, setReportStudent] = useState('');
  const [reportRule, setReportRule] = useState('');
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportDesc, setReportDesc] = useState('');
  const [search, setSearch] = useState('');

  // Review dialog
  const [reviewIncident, setReviewIncident] = useState<DisciplineIncident | null>(null);
  const [reviewMarks, setReviewMarks] = useState('1');
  const [reviewFollowUp, setReviewFollowUp] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  // Rule dialog
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
      toast.success(status === 'reviewed' ? `Incident approved â€” ${marks} mark(s) deducted` : 'Incident dismissed');
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

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Records"
          title="Discipline"
          description={isStaff ? 'Report, review and follow up on student discipline incidents.' : 'Discipline incidents recorded for your records.'}
          actions={
            isStaff ? (
              <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" /> Report Incident</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader><DialogTitle>Report Incident</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label>Student</Label>
                      <div className="position-relative">
                        <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search student by name or ID..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Select value={reportStudent} onValueChange={setReportStudent}>
                        <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                        <SelectContent>
                          {filteredStudents.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.first_name} {s.last_name} ({s.student_id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Rule (optional)</Label>
                      <Select value={reportRule} onValueChange={setReportRule}>
                        <SelectTrigger><SelectValue placeholder="No specific rule" /></SelectTrigger>
                        <SelectContent>
                          {rules.filter((r) => r.is_active).map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.title} (âˆ’{r.marks_deduction})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea rows={3} placeholder="What happened?" value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} />
                    </div>
                    <div className="d-flex justify-content-end gap-3">
                      <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                      <Button onClick={handleReport} disabled={reportSaving}>
                        {reportSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : undefined}
        />

        {canManageRules && (
          <Card>
            <CardHeader className="d-flex d-flex flex-row align-items-center justify-content-between">
              <CardTitle className="d-flex align-items-center gap-2 fs-18">
                <Gavel className="h-5 w-5 text-emerald-600" /> Discipline Rules
              </CardTitle>
              <Button size="sm" onClick={() => setRuleOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <p className="fs-13 text-slate-500 py-4 text-center">
                  No rules yet. Add rules so teachers can report incidents against them.
                </p>
              ) : (
                <div className="row gap-3 sm:col-6 lg:col-4">
                  {rules.map((r) => (
                    <div key={r.id} className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                      <div className="d-flex align-items-start justify-content-between gap-2">
                        <p className="fs-14 fw-medium text-slate-900">{r.title}</p>
                        {severityBadge(r.severity)}
                      </div>
                      <p className="mt-1 fs-12.5 text-slate-500 line-clamp-2">{r.description || 'No description'}</p>
                      <p className="mt-2 fs-12.5 fw-medium text-red-600">
                        âˆ’{r.marks_deduction} mark{r.marks_deduction > 1 ? 's' : ''} Â· {r.category}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="d-flex d-flex flex-column gap-3 sm:d-flex flex-row sm:align-items-center sm:justify-content-between">
            <CardTitle className="d-flex align-items-center gap-2 fs-18">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Incidents
              {isStaff && pendingCount > 0 && (
                <span className="rounded-circle bg-amber-100 px-2.5 py-0.5 fs-12 fw-medium text-amber-800">{pendingCount} pending</span>
              )}
            </CardTitle>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
                <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
            ) : filteredIncidents.length === 0 ? (
              <div className="empty-state"><XCircle className="h-10 w-10 text-slate-400 mb-3" /><p className="fs-14 text-slate-500">No incidents found.</p></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="d-none md:table-cell">Rule</TableHead>
                    <TableHead className="d-none lg:table-cell">Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-end">Marks</TableHead>
                    {canReview && <TableHead className="text-end">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIncidents.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="fw-medium text-slate-900">
                        {i.student ? `${i.student.first_name} ${i.student.last_name}` : 'â€”'}
                      </TableCell>
                      <TableCell className="fs-13 text-slate-500">{format(new Date(i.incident_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="d-none max-w-[160px] truncate md:table-cell">{i.rule?.title || 'â€”'}</TableCell>
                      <TableCell className="d-none max-w-[240px] truncate lg:table-cell">{i.description}</TableCell>
                      <TableCell>{statusBadge(i.status)}</TableCell>
                      <TableCell className="text-end fw-medium text-slate-600">
                        {i.marks_deducted > 0 ? `âˆ’${i.marks_deducted}` : 'â€”'}
                      </TableCell>
                      {canReview && (
                        <TableCell className="text-end">
                          {i.status === 'pending' ? (
                            <div className="d-flex justify-content-end gap-2">
                              <Button size="sm" variant="edit" onClick={() => openReview(i)} className="gap-1.5">
                                <CheckCircle2 className="h-4 w-4" /> Review
                              </Button>
                              <Button size="icon" variant="destructive" onClick={async () => {
                                setReviewIncident(i);
                                setReviewMarks('0');
                                await applyReview('dismissed');
                              }} aria-label="Dismiss">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="fs-12.5 text-slate-500">{i.follow_up || 'â€”'}</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Report incident dialog */}
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Report Incident</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Student</Label>
                <div className="position-relative">
                  <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search student by name or ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={reportStudent} onValueChange={setReportStudent}>
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {filteredStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.student_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rule (optional)</Label>
                <Select value={reportRule} onValueChange={setReportRule}>
                  <SelectTrigger><SelectValue placeholder="No specific rule" /></SelectTrigger>
                  <SelectContent>
                    {rules.filter((r) => r.is_active).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.title} (âˆ’{r.marks_deduction})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={3} placeholder="What happened?" value={reportDesc} onChange={(e) => setReportDesc(e.target.value)} />
              </div>
              <div className="d-flex justify-content-end gap-3">
                <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                <Button onClick={handleReport} disabled={reportSaving}>
                  {reportSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Review dialog */}
        <Dialog open={!!reviewIncident} onOpenChange={(open) => !open && setReviewIncident(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Review Incident</DialogTitle></DialogHeader>
            {reviewIncident && (
              <div className="space-y-4 mt-2">
                <div className="rounded-[10px] bg-slate-50 p-3 fs-13 text-slate-900">
                  <p className="fw-medium">
                    {reviewIncident.student
                      ? `${reviewIncident.student.first_name} ${reviewIncident.student.last_name}`
                      : 'Student'}
                  </p>
                  <p className="mt-1 text-slate-500">{reviewIncident.description}</p>
                  {reviewIncident.rule && (
                    <p className="mt-1 fs-12.5 text-slate-500">
                      Rule: {reviewIncident.rule.title} (suggested âˆ’{reviewIncident.rule.marks_deduction})
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Marks to deduct (max {MAX_SCORE})</Label>
                  <Input type="number" min={0} max={MAX_SCORE} value={reviewMarks} onChange={(e) => setReviewMarks(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Follow-up action (optional)</Label>
                  <Textarea rows={2} placeholder="e.g. Parent contacted, warning issued..." value={reviewFollowUp} onChange={(e) => setReviewFollowUp(e.target.value)} />
                </div>
                <div className="d-flex justify-content-end gap-3">
                  <Button variant="outline" onClick={() => setReviewIncident(null)}>Cancel</Button>
                  <Button onClick={() => applyReview('reviewed')} disabled={reviewSaving}>
                    {reviewSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Approve & Deduct ${Math.max(0, Math.min(MAX_SCORE, parseInt(reviewMarks, 10) || 0))}`}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add rule dialog */}
        <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add Discipline Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input placeholder="e.g. Late coming without excuse" value={ruleTitle} onChange={(e) => setRuleTitle(e.target.value)} />
              </div>
              <div className="row col-6 gap-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={ruleCategory} onValueChange={setRuleCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discipline">Discipline</SelectItem>
                      <SelectItem value="respect">Respect</SelectItem>
                      <SelectItem value="attendance">Attendance</SelectItem>
                      <SelectItem value="participation">Participation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={ruleSeverity} onValueChange={setRuleSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="grave">Grave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Marks deducted (max {MAX_SCORE})</Label>
                <Input type="number" min={1} max={MAX_SCORE} value={ruleMarks} onChange={(e) => setRuleMarks(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={2} value={ruleDesc} onChange={(e) => setRuleDesc(e.target.value)} />
              </div>
              <div className="d-flex justify-content-end gap-3">
                <Button variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveRule} disabled={ruleSaving}>
                  {ruleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Rule'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}


