import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Student, Class, Parent, StudentParent } from '@/types/database';
import { Plus, Search, GraduationCap, Loader2, Users, Pencil, Trash2, Eye, ArrowUp } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LinkParentsDialog } from '@/components/students/LinkParentsDialog';
import { LinkStudentAccountDialog } from '@/components/students/LinkStudentAccountDialog';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, scopedByStudents, scopedById, type Scope } from '@/lib/scope';
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
  const { role, roles, user, can } = useAuth();
  // Write actions require the DB-authoritative permission AND a record that is
  // inside the caller's scope (RLS is the final enforcement layer).
  const canManage = can('students.manage');
  const isAdmin = role === 'admin';
  const [scope, setScope] = useState<Scope | null>(null);
  const scopeKey = `${user?.id ?? ''}|${roles.slice().sort().join(',')}`;
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
      // Empty scope (e.g. a student account with no linked record) → no queries.
      if (activeScope.studentIds !== null && activeScope.studentIds.length === 0) {
        setStudents([]);
        setClasses([]);
        setLoading(false);
        return;
      }

      let studentsQuery = supabase
        .from('students')
        .select('*, class:classes(*), student_parents(*, parent:parents(*))')
        .order('last_name');
      if (activeScope.studentIds !== null) studentsQuery = studentsQuery.in('id', activeScope.studentIds);
      let classesQuery = supabase.from('classes').select('*').order('name');
      if (activeScope.classIds !== null && activeScope.classIds.length > 0) {
        classesQuery = classesQuery.in('id', activeScope.classIds);
      } else if (activeScope.classIds !== null) {
        classesQuery = supabase.from('classes').select('*').order('name').eq('id', '__none__');
      }

      const [studentsRes, classesRes, cumRes] = await Promise.all([
        studentsQuery,
        classesQuery,
        supabase.from('student_cumulative_scores' as any).select('*'),
      ]);

      if (studentsRes.data) {
        const cumRows = scopedByStudents((cumRes as any)?.data || [], activeScope);
        const cumMap = new Map<string, { cumulative_score: number; remaining_marks: number; entries_count: number }>();
        for (const row of cumRows as any[]) {
          cumMap.set(row.student_id, {
            cumulative_score: row.cumulative_score ?? 0,
            remaining_marks: row.remaining_marks ?? 100,
            entries_count: row.entries_count ?? 0,
          });
        }
        const allowed = studentsRes.data as StudentWithClass[];
        const merged = scopedById(allowed, activeScope.studentIds).map((s) => ({
          ...s,
          cumulative_score: cumMap.get(s.id)?.cumulative_score ?? 0,
          remaining_marks: cumMap.get(s.id)?.remaining_marks ?? 100,
          entries_count: cumMap.get(s.id)?.entries_count ?? 0,
        }));
        setStudents(merged);
      }
      if (classesRes.data) {
        setClasses(scopedById(classesRes.data as Class[], activeScope.classIds));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLinkDialog = (student: StudentWithClass) => {
    if (!canManage || !isInScope(student.id)) return;
    setSelectedStudent(student);
    setLinkDialogOpen(true);
  };

  const handleOpenEditDialog = (student: StudentWithClass) => {
    if (!canManage || !isInScope(student.id)) return;
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
    if (!canManage || !editingStudent || !isInScope(editingStudent.id)) return;
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
      if (scope) void fetchData(scope);
    } catch (error: any) {
      toast.error('Failed to update student', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || (scope?.classIds !== null && !scope?.classIds?.includes(classId))) return;
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
      if (scope) void fetchData(scope);
    } catch (error: any) {
      toast.error('Failed to add student', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteStudent = async (student: StudentWithClass) => {
    if (!canManage || !isInScope(student.id)) return;
    if (!confirm(`Delete student ${student.first_name} ${student.last_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('students').delete().eq('id', student.id);
    if (error) return toast.error('Failed to delete', { description: error.message });
    toast.success('Student deleted');
    if (scope) void fetchData(scope);
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

  const chipClass = (active: boolean) =>
    cn(
      'rounded-pill border px-3 py-1 bd-fs-sm fw-medium',
      active
        ? 'text-white bg-success border-success'
        : 'text-secondary bg-secondary-subtle border-secondary-subtle',
    );

  const remainingCls = (r: number) => (r >= 50 ? 'text-success' : r >= 25 ? 'text-warning' : 'text-danger');

  const studentFormFields = (
    firstNameValue: string, setFirstNameValue: (v: string) => void,
    lastNameValue: string, setLastNameValue: (v: string) => void,
    studentIdValue: string, setStudentIdValue: (v: string) => void,
    classIdValue: string, setClassIdValue: (v: string) => void,
    dobValue: string, setDobValue: (v: string) => void,
    classLabelPrefix: string,
  ) => (
    <>
      <div className="d-flex flex-wrap gap-3">
        <div className="flex-fill">
          <label htmlFor={`${classLabelPrefix}FirstName`} className="form-label">First Name</label>
          <input id={`${classLabelPrefix}FirstName`} className="form-control" value={firstNameValue} onChange={(e) => setFirstNameValue(e.target.value)} required />
        </div>
        <div className="flex-fill">
          <label htmlFor={`${classLabelPrefix}LastName`} className="form-label">Last Name</label>
          <input id={`${classLabelPrefix}LastName`} className="form-control" value={lastNameValue} onChange={(e) => setLastNameValue(e.target.value)} required />
        </div>
      </div>
      <div>
        <label htmlFor={`${classLabelPrefix}StudentId`} className="form-label">Student ID</label>
        <input id={`${classLabelPrefix}StudentId`} className="form-control" value={studentIdValue} onChange={(e) => setStudentIdValue(e.target.value)} placeholder="e.g., STU-2024-001" required />
      </div>
      <div>
        <label htmlFor={`${classLabelPrefix}Class`} className="form-label">Class</label>
        <select id={`${classLabelPrefix}Class`} className="form-select" value={classIdValue} onChange={(e) => setClassIdValue(e.target.value)}>
          <option value="">Select a class</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>{cls.name} - {cls.grade_level}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${classLabelPrefix}Dob`} className="form-label">Date of Birth</label>
        <input id={`${classLabelPrefix}Dob`} className="form-control" type="date" value={dobValue} onChange={(e) => setDobValue(e.target.value)} />
      </div>
    </>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="School"
          title="Students"
          description="Manage student records — names, classes, enrollment dates and conduct summary."
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={() => setIsAddDialogOpen(true)}>
              <Plus /> Add Student
            </button>
          ) : undefined}
        />

        {/* Search + class filters */}
        <div className="d-flex flex-wrap align-items-center gap-3">
          <div className="input-group w-100 w-md-auto flex-grow-1">
            <span className="input-group-text bg-white border-secondary-subtle">
              <Search className="bd-fs-md text-secondary" />
            </span>
            <input
              type="search"
              className="form-control border-secondary-subtle"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search students"
            />
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className={chipClass(classFilter === '__all__')} onClick={() => setClassFilter('__all__')}>
              All ({students.length})
            </button>
            {classes.map((cls) => {
              const count = students.filter((s) => s.class?.id === cls.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={cls.id}
                  type="button"
                  className={chipClass(classFilter === cls.id)}
                  onClick={() => setClassFilter(cls.id)}
                >
                  {cls.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" aria-label="Loading students" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center">
              <GraduationCap className="mb-4 fs-3 text-secondary" />
              <h3 className="fw-semibold text-main mb-2">No students found</h3>
              <p className="text-secondary bd-fs-sm mb-0">
                {scope?.studentIds?.length === 0
                  ? 'No student records are linked to your account.'
                  : searchQuery ? 'Try adjusting your search' : 'Add your first student to get started'}
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
                    <th scope="col">Class</th>
                    <th scope="col">Grade</th>
                    <th scope="col">DOB</th>
                    <th scope="col" className="text-end">Total Conduct</th>
                    <th scope="col" className="text-end">Remaining</th>
                    {canManage && <th scope="col" className="text-end">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="border-bottom border-secondary-subtle">
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <span className="bd-avatar bd-user-avatar sm d-inline-flex align-items-center justify-content-center">
                            {student.first_name.charAt(0)}{student.last_name.charAt(0)}
                          </span>
                          <div>
                            <p className="fw-medium text-main mb-0">{student.first_name} {student.last_name}</p>
                            <p className="text-muted bd-fs-sm mb-0">{student.student_id}</p>
                          </div>
                        </div>
                      </td>
                      <td>{student.class?.name || 'Not assigned'}</td>
                      <td className="text-secondary">{student.class?.grade_level || '-'}</td>
                      <td className="text-secondary">{student.date_of_birth ? format(new Date(student.date_of_birth), 'MMM d, yyyy') : '—'}</td>
                      <td className="text-end fw-semibold text-success">
                        {student.cumulative_score ?? 0}
                        <span className="ms-1 bd-fs-xs fw-normal text-secondary">({student.entries_count ?? 0})</span>
                      </td>
                      <td className="text-end">
                        <span className={cn('fw-bold', remainingCls(student.remaining_marks ?? 100))}>
                          {student.remaining_marks ?? 100} / 100
                        </span>
                      </td>
                      {canManage && (
                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-1">
                            <button className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" onClick={() => handleOpenLinkDialog(student)}>
                              <Users /> Link
                            </button>
                            <button className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => handleOpenEditDialog(student)}>
                              <Pencil /> Edit
                            </button>
                            <button className="btn btn-outline-info btn-sm d-inline-flex align-items-center gap-1" onClick={() => {
                              setAccountStudent(student);
                              setAccountDialogOpen(true);
                            }}>
                              <Eye /> Account
                            </button>
                            <button className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1" onClick={() => handleDeleteStudent(student)}>
                              <Trash2 /> Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Status badges summary row */}
        {students.length > 0 && (
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <span className="badge text-bg-secondary bd-fs-sm">Total: {students.length} students</span>
            <span className="badge text-bg-success bd-fs-sm">Active</span>
            <span className="badge text-bg-danger bd-fs-sm">Inactive</span>
            {isAdmin && <span className="badge text-bg-primary bd-fs-sm">Graduated</span>}
            <span className="d-inline-flex align-items-center gap-1 bd-fs-sm bg-secondary-subtle rounded-pill px-3 py-1 text-secondary">
              <ArrowUp className="text-success bd-fs-xs" /> In conduct review
            </span>
          </div>
        )}

        {/* ── Add Student modal ── */}
        {isAddDialogOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Add New Student</h5>
                    <button type="button" className="btn-close" onClick={() => setIsAddDialogOpen(false)} aria-label="Close" />
                  </div>
                  <form className="modal-body d-flex flex-column gap-4" onSubmit={handleAddStudent}>
                    {studentFormFields(
                      firstName, setFirstName, lastName, setLastName,
                      studentId, setStudentId, classId, setClassId,
                      dateOfBirth, setDateOfBirth, 'add',
                    )}
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setIsAddDialogOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-success" disabled={formLoading}>
                        {formLoading ? (
                          <>
                            <span className="spinner-border spinner-border-sm" /> Adding...
                          </>
                        ) : 'Add Student'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Edit Student modal ── */}
        {isEditDialogOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Edit Student</h5>
                    <button type="button" className="btn-close" onClick={() => { setIsEditDialogOpen(false); setEditingStudent(null); resetForm(); }} aria-label="Close" />
                  </div>
                  <form className="modal-body d-flex flex-column gap-4" onSubmit={handleEditStudent}>
                    {studentFormFields(
                      firstName, setFirstName, lastName, setLastName,
                      studentId, setStudentId, classId, setClassId,
                      dateOfBirth, setDateOfBirth, 'edit',
                    )}
                    <div>
                      <label htmlFor="editStatus" className="form-label">Status</label>
                      <select id="editStatus" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="graduated">Graduated</option>
                      </select>
                    </div>
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => { setIsEditDialogOpen(false); setEditingStudent(null); resetForm(); }}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={formLoading}>
                        {formLoading ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {accountStudent && (
          <LinkStudentAccountDialog
            studentId={accountStudent.id}
            studentName={`${accountStudent.first_name} ${accountStudent.last_name}`}
            currentUserId={accountStudent.user_id ?? null}
            open={accountDialogOpen}
            onOpenChange={setAccountDialogOpen}
            onLinked={() => { if (scope) void fetchData(scope); }}
          />
        )}

        {selectedStudent && (
          <LinkParentsDialog
            studentId={selectedStudent.id}
            studentName={`${selectedStudent.first_name} ${selectedStudent.last_name}`}
            open={linkDialogOpen}
            onOpenChange={setLinkDialogOpen}
            onUpdate={() => { if (scope) void fetchData(scope); }}
          />
        )}

      </div>
    </DashboardLayout>
  );
}
