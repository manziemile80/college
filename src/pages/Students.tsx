import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Student, Class, Parent, StudentParent } from '@/types/database';
import { Plus, Search, GraduationCap, Loader2, Users, Pencil, Trash2, Eye, ArrowUp } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LinkParentsDialog } from '@/components/students/LinkParentsDialog';
import { LinkStudentAccountDialog } from '@/components/students/LinkStudentAccountDialog';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface LinkedParent extends StudentParent {
  parent?: Parent;
}

interface StudentWithClass extends Student {
  class?: Class | null;
  student_parents?: LinkedParent[];
  cumulative_score?: number;
  remaining_marks?: number;
  entries_count?: number;
}

export default function Students() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'teacher';
  const isAdmin = role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('__all__');

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsAddDialogOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [formLoading, setFormLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentWithClass | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountStudent, setAccountStudent] = useState<StudentWithClass | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithClass | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [classId, setClassId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [status, setStatus] = useState('active');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [studentsRes, classesRes, cumRes] = await Promise.all([
        supabase
          .from('students')
          .select('*, class:classes(*), student_parents(*, parent:parents(*))')
          .order('last_name'),
        supabase.from('classes').select('*').order('name'),
        supabase.from('student_cumulative_scores' as any).select('*'),
      ]);

      if (studentsRes.data) {
        const cumMap = new Map<string, { cumulative_score: number; remaining_marks: number; entries_count: number }>();
        if (cumRes && (cumRes as any).data) {
          for (const row of (cumRes as any).data as any[]) {
            cumMap.set(row.student_id, {
              cumulative_score: row.cumulative_score ?? 0,
              remaining_marks: row.remaining_marks ?? 100,
              entries_count: row.entries_count ?? 0,
            });
          }
        }
        const merged = (studentsRes.data as StudentWithClass[]).map((s) => ({
          ...s,
          cumulative_score: cumMap.get(s.id)?.cumulative_score ?? 0,
          remaining_marks: cumMap.get(s.id)?.remaining_marks ?? 100,
          entries_count: cumMap.get(s.id)?.entries_count ?? 0,
        }));
        setStudents(merged);
      }
      if (classesRes.data) {
        setClasses(classesRes.data as Class[]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLinkDialog = (student: StudentWithClass) => {
    setSelectedStudent(student);
    setLinkDialogOpen(true);
  };

  const handleOpenEditDialog = (student: StudentWithClass) => {
    setEditingStudent(student);
    setFirstName(student.first_name);
    setLastName(student.last_name);
    setStudentId(student.student_id);
    setClassId(student.class_id || '');
    setDateOfBirth(student.date_of_birth || '');
    setStatus(student.status || 'active');
    setIsEditDialogOpen(true);
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setFormLoading(true);

    try {
      const { error } = await supabase
        .from('students')
        .update({
          first_name: firstName,
          last_name: lastName,
          student_id: studentId,
          class_id: classId || null,
          date_of_birth: dateOfBirth || null,
          status,
        })
        .eq('id', editingStudent.id);

      if (error) throw error;

      toast.success('Student updated successfully');
      setIsEditDialogOpen(false);
      setEditingStudent(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to update student', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const { error } = await supabase.from('students').insert({
        first_name: firstName,
        last_name: lastName,
        student_id: studentId,
        class_id: classId || null,
        date_of_birth: dateOfBirth || null,
      });

      if (error) throw error;

      toast.success('Student added successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to add student', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteStudent = async (student: StudentWithClass) => {
    if (!confirm(`Delete student ${student.first_name} ${student.last_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('students').delete().eq('id', student.id);
    if (error) return toast.error('Failed to delete', { description: error.message });
    toast.success('Student deleted');
    fetchData();
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setStudentId('');
    setClassId('');
    setDateOfBirth('');
    setStatus('active');
  };

  const filteredStudents = students.filter((student) => {
    const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      student.student_id.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (classFilter === '__all__') return true;
    return student.class?.id === classFilter;
  });

  const badgeForStatus = (status: string) =>
    status === 'active' ? 'badge-active' : status === 'graduated' ? 'badge-completed' : 'badge-rejected';

  const remainingCls = (r: number) => (r >= 50 ? 'text-emerald-700' : r >= 25 ? 'text-amber-700' : 'text-red-700');

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="School"
          title="Students"
          description="Manage student records â€” names, classes, enrollment dates and conduct summary."
          actions={canManage ? (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="g-2"><Plus className="h-4 w-4" />Add Student</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[calc(100%-1rem)]">
                <DialogHeader><DialogTitle className="fs-20 fw-semibold">Add New Student</DialogTitle></DialogHeader>
                <form onSubmit={handleAddStudent} className="mt-4 space-y-4">
                  <div className="row col-12 col-md-6 g-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studentId">Student ID</Label>
                    <Input id="studentId" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g., STU-2024-001" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="class">Class</Label>
                    <Select value={classId} onValueChange={setClassId}>
                      <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id}>{cls.name} - {cls.grade_level}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                  </div>
                  <div className="d-flex justify-content-end g-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={formLoading}>
                      {formLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Adding...</> : 'Add Student'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : undefined}
        />

        {/* Search + filters */}
        <div className="d-flex d-flex flex-column g-3 sm:d-flex flex-row sm:align-items-center">
          <div className="position-relative w-100 sm:max-w-xs">
            <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search students..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="d-flex flex-wrap align-items-center g-2">
            <button
              type="button"
              onClick={() => setClassFilter('__all__')}
              className={`rounded-circle border px-3.5 py-1.5 fs-13 fw-medium transition-colors ${
                classFilter === '__all__' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({students.length})
            </button>
            {classes.map((cls) => {
              const count = students.filter((s) => s.class?.id === cls.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => setClassFilter(cls.id)}
                  className={`rounded-circle border px-3.5 py-1.5 fs-13 fw-medium transition-colors ${
                    classFilter === cls.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cls.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : filteredStudents.length === 0 ? (
          <Card><CardContent className="d-flex d-flex flex-column align-items-center justify-content-center py-12">
            <GraduationCap className="h-12 w-12 text-slate-400 mb-4" />
            <h3 className="fs-18 fw-semibold text-slate-900">No students found</h3>
            <p className="fs-13 text-slate-500">{searchQuery ? 'Try adjusting your search' : 'Add your first student to get started'}</p>
          </CardContent></Card>
        ) : (
          <Card>
            <div class="table-responsive"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead className="text-end">Total Conduct</TableHead>
                  <TableHead className="text-end">Remaining</TableHead>
                  {canManage && <TableHead className="text-end">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="d-flex align-items-center g-3">
                        <div className="d-flex h-9 w-9 align-items-center justify-content-center rounded-circle bg-emerald-600 fs-sm fw-semibold text-white">
                          {student.first_name.charAt(0)}{student.last_name.charAt(0)}
                        </div>
                        <div>
                          <p className="fw-medium text-slate-900">{student.first_name} {student.last_name}</p>
                          <p className="fs-12.5 text-slate-500">{student.student_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{student.class?.name || 'Not assigned'}</TableCell>
                    <TableCell className="text-slate-600">{student.class?.grade_level || '-'}</TableCell>
                    <TableCell className="text-slate-500">{student.date_of_birth ? format(new Date(student.date_of_birth), 'MMM d, yyyy') : 'â€”'}</TableCell>
                    <TableCell className="text-end fw-semibold text-emerald-600">
                      {student.cumulative_score ?? 0}
                      <span className="ml-1 fs-12 fw-normal text-slate-500">({student.entries_count ?? 0})</span>
                    </TableCell>
                    <TableCell className="text-end">
                      <span className={`fw-bold ${remainingCls(student.remaining_marks ?? 100)}`}>
                        {student.remaining_marks ?? 100} / 100
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-end">
                        <div className="d-flex justify-content-end g-1.5">
                          <Button variant="outline" size="sm" onClick={() => handleOpenLinkDialog(student)} className="g-1.5">
                            <Users className="h-4 w-4" />Link
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(student)} className="g-1.5">
                            <Pencil className="h-4 w-4" />Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => {
                            setAccountStudent(student);
                            setAccountDialogOpen(true);
                          }} className="g-1.5">
                            <Eye className="h-4 w-4" />Account
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteStudent(student)} className="g-1.5">
                            <Trash2 className="h-4 w-4" />Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          </Card>
        )}

        {/* Status badges preview row */}
        {students.length > 0 && (
          <div className="d-flex flex-wrap g-2">
            <span className="rounded-circle bg-slate-100 px-3 py-1 fs-12.5 text-slate-600">
              Total: {students.length} students
            </span>
            <span className={cn('rounded-circle px-3 py-1 fs-12.5 fw-medium', badgeForStatus('active'))}>Active</span>
            <span className={cn('rounded-circle px-3 py-1 fs-12.5 fw-medium', badgeForStatus('inactive'))}>Inactive</span>
            {isAdmin && <span className={cn('rounded-circle px-3 py-1 fs-12.5 fw-medium', badgeForStatus('graduated'))}>Graduated</span>}
            <span className="d-inline-flex align-items-center g-1 rounded-circle bg-slate-100 px-3 py-1 fs-12.5 text-slate-600">
              <ArrowUp className="h-3 w-3 text-emerald-600" /> In conduct review
            </span>
          </div>
        )}

        {/* Edit Student Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) { setEditingStudent(null); resetForm(); }
        }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto w-[calc(100%-1rem)]">
            <DialogHeader><DialogTitle>Edit Student</DialogTitle></DialogHeader>
            <form onSubmit={handleEditStudent} className="mt-4 space-y-4">
              <div className="row col-12 col-md-6 g-4">
                <div className="space-y-2">
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input id="editFirstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input id="editLastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editStudentId">Student ID</Label>
                <Input id="editStudentId" value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editClass">Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.name} - {cls.grade_level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDob">Date of Birth</Label>
                <Input id="editDob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editStatus">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="graduated">Graduated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="d-flex justify-content-end g-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={formLoading}>{formLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {accountStudent && (
          <LinkStudentAccountDialog
            studentId={accountStudent.id}
            studentName={`${accountStudent.first_name} ${accountStudent.last_name}`}
            currentUserId={accountStudent.user_id ?? null}
            open={accountDialogOpen}
            onOpenChange={setAccountDialogOpen}
            onLinked={fetchData}
          />
        )}

        {selectedStudent && (
          <LinkParentsDialog
            studentId={selectedStudent.id}
            studentName={`${selectedStudent.first_name} ${selectedStudent.last_name}`}
            open={linkDialogOpen}
            onOpenChange={setLinkDialogOpen}
            onUpdate={fetchData}
          />
        )}
      </div>
    </DashboardLayout>
  );
}






