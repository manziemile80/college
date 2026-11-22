import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Enrollment, EnrollmentHistory, StudentWithClass, Class } from '@/types/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { History, Loader2, Search, UserPlus, UserMinus, ArrowLeftRight, CheckCircle } from 'lucide-react';

const currentYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'active': return <Badge className="bg-green-100 text-emerald-700">Active</Badge>;
    case 'transferred': return <Badge className="bg-amber-100 text-amber-700">Transferred</Badge>;
    case 'removed': return <Badge className="bg-red-100 text-red-800">Removed</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
};

export default function EnrollmentPage() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const isDOS = role === 'dos';
  const isTeacher = role === 'teacher';
  const canManage = isAdmin || isDOS || isTeacher;

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [classId, setClassId] = useState('');
  const [academicYear, setAcademicYear] = useState(currentYear());
  const [search, setSearch] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [allStudents, setAllStudents] = useState<StudentWithClass[]>([]);

  const [historyFor, setHistoryFor] = useState<Enrollment | null>(null);
  const [history, setHistory] = useState<EnrollmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [transferFor, setTransferFor] = useState<Enrollment | null>(null);
  const [transferClass, setTransferClass] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchClasses = useCallback(async () => {
    const [classesRes, csRes] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      isTeacher
        ? supabase.from('class_subjects').select('class_id').eq('teacher_id', user?.id || '')
        : Promise.resolve({ data: null }),
    ]);
    const classList = (classesRes.data as Class[]) || [];
    setClasses(classList);
    const assigned = csRes.data ? [...new Set((csRes.data as { class_id: string }[]).map((r) => r.class_id))] : [];
    setAssignedClassIds(assigned);
    const available = isTeacher ? classList.filter((c) => assigned.includes(c.id)) : classList;
    if (available.length > 0) setClassId((prev) => prev || available[0].id);
  }, [isTeacher, user?.id]);

  const fetchEnrollments = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, student:students(*, class:classes(*))')
        .eq('class_id', classId)
        .eq('academic_year', academicYear)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEnrollments((data as unknown as Enrollment[]) || []);
    } catch (e: any) {
      toast.error('Failed to load enrollments', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [classId, academicYear]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);
  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  useEffect(() => {
    if (!canManage) return;
    supabase
      .from('students')
      .select('*, class:classes(*)')
      .order('last_name')
      .then(({ data }) => setAllStudents((data as StudentWithClass[]) || []));
  }, [canManage]);

  const enrolledStudentIds = useMemo(
    () => new Set(enrollments.map((e) => e.student_id)),
    [enrollments]
  );

  const availableStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStudents
      .filter((s) => !enrolledStudentIds.has(s.id))
      .filter((s) => {
        if (!q) return true;
        return (
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
          s.student_id.toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [allStudents, enrolledStudentIds, search]);

  const availableClasses = useMemo(
    () => (isTeacher ? classes.filter((c) => assignedClassIds.includes(c.id)) : classes),
    [classes, isTeacher, assignedClassIds]
  );

  const handleEnroll = async (student: StudentWithClass) => {
    if (!user || !classId) return;
    setSaving(true);
    try {
      const existing = await supabase
        .from('enrollments')
        .select('id, status')
        .eq('student_id', student.id)
        .eq('class_id', classId)
        .eq('academic_year', academicYear)
        .maybeSingle();

      if (existing.data) {
        const { error } = await supabase
          .from('enrollments')
          .update({ status: 'active' })
          .eq('id', existing.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('enrollments').insert({
          student_id: student.id,
          class_id: classId,
          academic_year: academicYear,
          enrolled_by: user.id,
          status: 'active',
        });
        if (error) throw error;
      }
      await supabase.rpc('log_audit', {
        _action: 'enroll_student',
        _entity: 'enrollments',
        _details: { student_id: student.id, class_id: classId, academic_year: academicYear },
      });
      toast.success(`${student.first_name} ${student.last_name} enrolled`);
      fetchEnrollments();
    } catch (e: any) {
      toast.error('Failed to enroll student', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (enrollment: Enrollment) => {
    const studentName = enrollment.student
      ? `${enrollment.student.first_name} ${enrollment.student.last_name}`
      : 'this student';
    if (!confirm(`Remove ${studentName} from this class? Their enrollment history is kept.`)) return;
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'removed' })
        .eq('id', enrollment.id);
      if (error) throw error;
      await supabase.rpc('log_audit', { _action: 'remove_enrollment', _entity: 'enrollments', _entity_id: enrollment.id });
      toast.success('Enrollment removed');
      fetchEnrollments();
    } catch (e: any) {
      toast.error('Failed to remove enrollment', { description: e.message });
    }
  };

  const handleTransfer = async () => {
    if (!transferFor || !transferClass) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'transferred', class_id: transferClass })
        .eq('id', transferFor.id);
      if (error) throw error;
      await supabase.rpc('log_audit', {
        _action: 'transfer_enrollment',
        _entity: 'enrollments',
        _entity_id: transferFor.id,
        _details: { to_class_id: transferClass },
      });
      toast.success('Student transferred');
      setTransferFor(null);
      fetchEnrollments();
    } catch (e: any) {
      toast.error('Failed to transfer student', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (enrollment: Enrollment) => {
    setHistoryFor(enrollment);
    setHistoryLoading(true);
    const { data } = await supabase
      .from('enrollment_history')
      .select('*')
      .eq('enrollment_id', enrollment.id)
      .order('created_at', { ascending: false });
    setHistory((data as EnrollmentHistory[]) || []);
    setHistoryLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="School"
          title="Student Enrollment"
          description="Enroll students in classes, transfer between classes, and view enrollment history."
        />

        <div className="d-flex d-flex flex-column gap-3 sm:d-flex flex-row sm:align-items-end">
          <div className="space-y-2 sm:w-50">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {availableClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.grade_level})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:w-25">
            <Label>Academic year</Label>
            <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          </div>
        </div>

        {canManage && classId && (
          <Card>
            <CardHeader>
              <CardTitle className="d-flex align-items-center gap-2 fs-18"><UserPlus className="h-5 w-5 text-emerald-600" /> Enroll a student</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="position-relative max-w-sm">
                <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, student ID or registration number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {availableStudents.length === 0 ? (
                <p className="fs-13 text-slate-500">No matching students to enroll in this class for {academicYear}.</p>
              ) : (
                <div className="row gap-2 sm:col-6 lg:col-4">
                  {availableStudents.map((s) => (
                    <div key={s.id} className="d-flex align-items-center justify-content-between rounded-[10px] border border-slate-200 bg-white p-3">
                      <div className="min-w-0">
                        <p className="truncate fs-14 fw-medium text-slate-900">{s.first_name} {s.last_name}</p>
                        <p className="fs-12.5 text-slate-500">{s.student_id}</p>
                      </div>
                      <Button size="sm" onClick={() => handleEnroll(s)} disabled={saving}>
                        <UserPlus className="h-4 w-4 mr-1" />Enroll
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="fs-16">
              Enrollments â€” {classes.find((c) => c.id === classId)?.name || 'Select a class'} Â· {academicYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
            ) : enrollments.length === 0 ? (
              <div className="empty-state">
                <CheckCircle className="h-12 w-12 text-slate-400 mb-4" />
                <h3 className="fs-18 fw-semibold text-slate-900">No enrollments for this class and year yet.</h3>
                <p className="fs-13 text-slate-500">Enroll students above to get started.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="d-none sm:table-cell">Enrolled</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="fw-medium text-slate-900">
                        {e.student ? `${e.student.first_name} ${e.student.last_name}` : e.student_id}
                      </TableCell>
                      <TableCell className="fs-13 text-slate-500">{e.student?.student_id || 'â€”'}</TableCell>
                      <TableCell>{statusBadge(e.status)}</TableCell>
                      <TableCell className="d-none fs-13 text-slate-500 sm:table-cell">
                        {format(new Date(e.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-end">
                        {canManage && (
                          <div className="d-flex justify-content-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openHistory(e)} title="Enrollment history" aria-label="Enrollment history">
                              <History className="h-4 w-4" />
                            </Button>
                            {e.status === 'active' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setTransferFor(e); setTransferClass(''); }}
                                  title="Transfer to another class"
                                  aria-label="Transfer to another class"
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRemove(e)}
                                  title="Remove enrollment"
                                  aria-label="Remove enrollment"
                                >
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History dialog */}
      <Dialog open={!!historyFor} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Enrollment History</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="d-flex justify-content-center py-6"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : history.length === 0 ? (
            <p className="py-6 text-center fs-13 text-slate-500">No history recorded.</p>
          ) : (
            <div className="space-y-3 py-2">
              {history.map((h) => (
                <div key={h.id} className="d-flex align-items-start justify-content-between gap-3 border-bottom border-slate-200 pb-2 last:border-0">
                  <div>
                    <p className="fs-14 fw-medium capitalize text-slate-900">{h.action}</p>
                    <p className="fs-12.5 text-slate-500">{h.details}</p>
                  </div>
                  <p className="text-nowrap fs-12.5 text-slate-500">
                    {format(new Date(h.created_at), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={!!transferFor} onOpenChange={(open) => !open && setTransferFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Transfer Student</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Move to class</Label>
              <Select value={transferClass} onValueChange={setTransferClass}>
                <SelectTrigger><SelectValue placeholder="Select target class" /></SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => c.id !== transferFor?.class_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} ({c.grade_level})</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="fs-12.5 text-slate-500">
              The change is recorded in the enrollment history. Confirm before transferring.
            </p>
            <div className="d-flex justify-content-end gap-3">
              <Button variant="outline" onClick={() => setTransferFor(null)}>Cancel</Button>
              <Button onClick={handleTransfer} disabled={saving || !transferClass}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Transfer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}


