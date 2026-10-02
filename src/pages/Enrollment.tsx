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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { History, Loader2, Search, UserPlus, UserMinus, ArrowLeftRight } from 'lucide-react';

const currentYear = () => {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-success/15 text-success">Active</Badge>;
    case 'transferred':
      return <Badge className="bg-warning/15 text-warning">Transferred</Badge>;
    case 'removed':
      return <Badge className="bg-muted text-muted-foreground">Removed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
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
    // Default select first available class
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

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // Students available for enrolling: not already enrolled in this class/year
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
      // Re-activate a previous enrollment for the same class/year if it exists
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
      await supabase.rpc('log_audit', {
        _action: 'remove_enrollment',
        _entity: 'enrollments',
        _entity_id: enrollment.id,
      });
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
          description="Enroll students in classes, transfer them between classes, and keep a full history of changes."
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:w-1/2">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {availableClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.grade_level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:w-1/4">
            <Label>Academic year</Label>
            <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} />
          </div>
        </div>

        {/* Enroll new students (class picker only) */}
        {canManage && classId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4" /> Enroll a student
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, student ID or registration number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {availableStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matching students to enroll in this class for {academicYear}.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availableStudents.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {s.first_name} {s.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.student_id}</p>
                      </div>
                      <Button size="sm" onClick={() => handleEnroll(s)} disabled={saving}>
                        <UserPlus className="h-4 w-4 mr-1" /> Enroll
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Enrolled list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Enrollments — {classes.find((c) => c.id === classId)?.name || 'Select a class'} · {academicYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : enrollments.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No enrollments for this class and year yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Enrolled</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">
                          {e.student
                            ? `${e.student.first_name} ${e.student.last_name}`
                            : e.student_id}
                        </TableCell>
                        <TableCell>{e.student?.student_id || '—'}</TableCell>
                        <TableCell>{statusBadge(e.status)}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {format(new Date(e.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openHistory(e)}
                                title="Enrollment history"
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              {e.status === 'active' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Transfer to another class"
                                    onClick={() => {
                                      setTransferFor(e);
                                      setTransferClass('');
                                    }}
                                  >
                                    <ArrowLeftRight className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    title="Remove enrollment"
                                    onClick={() => handleRemove(e)}
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History dialog */}
      <Dialog open={!!historyFor} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enrollment History</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No history recorded.</p>
          ) : (
            <div className="space-y-3 py-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium capitalize text-foreground">{h.action}</p>
                    <p className="text-xs text-muted-foreground">{h.details}</p>
                  </div>
                  <p className="whitespace-nowrap text-xs text-muted-foreground">
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
          <DialogHeader>
            <DialogTitle>Transfer Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Move to class</Label>
              <Select value={transferClass} onValueChange={setTransferClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target class" />
                </SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => c.id !== transferFor?.class_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.grade_level})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              The change is recorded in the enrollment history. Confirm before transferring.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setTransferFor(null)}>
                Cancel
              </Button>
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
