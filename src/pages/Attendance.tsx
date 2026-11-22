import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarCheck, Loader2, Save, Search } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Student { id: string; first_name: string; last_name: string; student_id: string; }
interface ClassRow { id: string; name: string; }
type Status = 'present' | 'absent' | 'late' | 'excused';

const statusBadge = (status: Status) => {
  switch (status) {
    case 'present': return <Badge className="bg-green-100 text-emerald-700">Present</Badge>;
    case 'absent': return <Badge variant="destructive">Absent</Badge>;
    case 'late': return <Badge className="bg-amber-100 text-amber-800">Late</Badge>;
    case 'excused': return <Badge className="bg-blue-100 text-blue-900">Excused</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
};

const statusLabel = (s: Status) => s[0].toUpperCase() + s.slice(1);

export default function Attendance() {
  const { user, role } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classId, setClassId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = role === 'admin' || role === 'teacher';

  useEffect(() => {
    supabase.from('classes').select('id, name').order('name').then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); return; }
    supabase.from('students').select('id, first_name, last_name, student_id').eq('class_id', classId).order('last_name').then(({ data }) => setStudents(data || []));
  }, [classId]);

  useEffect(() => {
    if (!classId || !date) return;
    fetchAttendance();
  }, [classId, date]);

  const fetchAttendance = async () => {
    setLoading(true);
    const { data: studs } = await supabase.from('students').select('id').eq('class_id', classId);
    const ids = (studs || []).map((s) => s.id);
    if (ids.length === 0) { setStatuses({}); setLoading(false); return; }
    const { data } = await supabase.from('attendance').select('student_id, status').in('student_id', ids).eq('attendance_date', date);
    const map: Record<string, Status> = {};
    ids.forEach((id) => { map[id] = 'present'; });
    (data || []).forEach((r: any) => { map[r.student_id] = r.status; });
    setStatuses(map);
    setLoading(false);
  };

  const setStatus = (id: string, s: Status) => setStatuses((p) => ({ ...p, [id]: s }));

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
    const rows = Object.entries(statuses).map(([student_id, status]) => ({
      student_id, class_id: classId, attendance_date: date, status, recorded_by: user.id,
    }));
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'student_id,attendance_date' });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Attendance saved for ${rows.length} student(s)`);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) => `${s.first_name} ${s.last_name} ${s.student_id}`.toLowerCase().includes(q));
  }, [students, search]);

  const summary = useMemo(() => {
    const counts: Record<Status, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    Object.values(statuses).forEach((s) => counts[s]++);
    return counts;
  }, [statuses]);

  const total = summary.present + summary.absent + summary.late + summary.excused;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Records"
          title="Attendance"
          description="Record daily attendance for your class."
        />

        {/* Filters */}
        <div className="row gap-4 sm:col-6 lg:col-3">
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {classId && (
          <Card>
            <CardHeader>
              <div className="d-flex d-flex flex-column gap-3 sm:d-flex flex-row sm:align-items-center sm:justify-content-between">
                <div>
                  <CardTitle className="fs-16">Roll Call</CardTitle>
                  <p className="mt-1 fs-13 text-slate-500">
                    Attendance taken on <span className="fw-semibold text-slate-900">{format(new Date(date), 'EEEE, MMMM d, yyyy')}</span>
                  </p>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <div className="d-flex gap-3 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 fs-13 text-slate-600">
                    <span>Present: {summary.present}</span>
                    <span>Absent: {summary.absent}</span>
                    <span>Late: {summary.late}</span>
                    <span>Excused: {summary.excused}</span>
                    <span>Total: {total}</span>
                  </div>
                  <div className="position-relative">
                    <Search className="position-absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student..." className="w-48 pl-8" />
                  </div>
                  {canEdit && (
                    <Button onClick={saveAll} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="d-flex justify-content-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
              ) : filtered.length === 0 ? (
                <div className="empty-state"><CalendarCheck className="h-10 w-10 text-slate-400 mb-3" /><p className="fs-14 text-slate-500">No students in this class</p></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead className="text-end">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="fw-medium text-slate-900">{s.first_name} {s.last_name}</TableCell>
                        <TableCell className="fs-13 text-slate-500">{s.student_id}</TableCell>
                        <TableCell className="text-end">
                          {canEdit ? (
                            <Select value={statuses[s.id] || 'present'} onValueChange={(v) => setStatus(s.id, v as Status)}>
                              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="present">Present</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="late">Late</SelectItem>
                                <SelectItem value="excused">Excused</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            statusBadge(statuses[s.id] || 'present')
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status legend */}
        <div className="d-flex flex-wrap align-items-center gap-3">
          {(['present', 'absent', 'late', 'excused'] as const).map((s) => (
            <span key={s} className="d-inline-flex align-items-center gap-1.5 fs-13 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-circle bg-slate-100" />{statusLabel(s)}
            </span>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}



