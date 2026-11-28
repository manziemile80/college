import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, type Scope } from '@/lib/scope';
import { Class } from '@/types/database';
import { Plus, Search, BookOpen, Users, Trash2, Pencil, ArrowUpRight } from '@/lib/icons';
import Forbidden from './Forbidden';
import { toast } from 'sonner';

const VIEW_ROLES = ['admin', 'dos', 'teacher', 'student', 'parent', 'viewer'];

export default function Classes() {
  const { user, roles, can, loading: authLoading } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const denied = roles.length > 0 && !roles.some((r) => VIEW_ROLES.includes(r));
  const isStaffRole = roles.some((r) => r === 'admin' || r === 'dos' || r === 'teacher');
  const canManage = can('classes.manage') && isStaffRole;
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString());

  const [editing, setEditing] = useState<Class | null>(null);
  const [editName, setEditName] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editYear, setEditYear] = useState('');

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [fromClass, setFromClass] = useState<string>('');
  const [toClass, setToClass] = useState<string>('');
  const [promoting, setPromoting] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number>(0);

  useEffect(() => {
    if (authLoading || denied) return;
    let active = true;
    buildScope(supabase, user?.id, roles).then((s) => {
      if (active) setScope(s);
    });
    return () => { active = false; };
  }, [authLoading, denied, user?.id, roles]);

  useEffect(() => {
    if (scope) void fetchData(scope);
  }, [scope]);

  const fetchData = async (currentScope: Scope) => {
    try {
      // An empty scope means "no records" — never let .in([]) widen the query.
      if (currentScope.classIds !== null && currentScope.classIds.length === 0) {
        setClasses([]);
        setStudentCounts({});
        return;
      }

      let query = supabase.from('classes').select('*').order('name');
      if (currentScope.classIds !== null) query = query.in('id', currentScope.classIds);
      const { data: classesData, error } = await query;
      if (error) throw error;

      const visible = (classesData as Class[]) || [];
      setClasses(visible);

      const counts: Record<string, number> = {};
      for (const cls of visible) {
        const { count } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id);
        counts[cls.id] = count || 0;
      }
      setStudentCounts(counts);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  // Teachers may only touch the classes they teach; admin/DOS are unrestricted.
  const canEditClass = (cls: Class) =>
    canManage && (scope?.classIds == null || scope.classIds.includes(cls.id));

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setFormLoading(true);

    try {
      const { error } = await supabase.from('classes').insert({
        name,
        grade_level: gradeLevel,
        academic_year: academicYear,
        teacher_id: user?.id || null,
      });

      if (error) throw error;

      toast.success('Class created successfully');
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to create class', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setGradeLevel('');
    setAcademicYear(new Date().getFullYear().toString());
  };

  const handleDeleteClass = async (cls: Class) => {
    if (!canEditClass(cls)) return;
    if (!confirm(`Delete class "${cls.name}"? Students linked to it will be unassigned.`)) return;
    const { error } = await supabase.from('classes').delete().eq('id', cls.id);
    if (error) return toast.error('Failed to delete', { description: error.message });
    toast.success('Class deleted');
    fetchData();
  };

  const openEdit = (cls: Class) => {
    setEditing(cls);
    setEditName(cls.name);
    setEditGrade(cls.grade_level);
    setEditYear(cls.academic_year);
  };

  const handleEditSave = async () => {
    if (!editing || !canEditClass(editing)) return;
    const { error } = await supabase
      .from('classes')
      .update({ name: editName, grade_level: editGrade, academic_year: editYear })
      .eq('id', editing.id);
    if (error) return toast.error('Failed to update', { description: error.message });
    toast.success('Class updated');
    setEditing(null);
    fetchData();
  };

  useEffect(() => {
    if (!fromClass) { setEligibleCount(0); return; }
    setEligibleCount(studentCounts[fromClass] || 0);
  }, [fromClass, studentCounts]);

  const handlePromote = async () => {
    if (!canManage) return;
    if (!fromClass || !toClass || fromClass === toClass) {
      return toast.error('Select different source and destination classes');
    }
    if (scope?.classIds != null &&
        (!scope.classIds.includes(fromClass) || !scope.classIds.includes(toClass))) {
      return toast.error('You can only promote students between your assigned classes');
    }
    if (!confirm(`Promote ALL ${eligibleCount} student(s) from this class to the new class?`)) return;
    setPromoting(true);
    const { error, count } = await supabase
      .from('students')
      .update({ class_id: toClass }, { count: 'exact' })
      .eq('class_id', fromClass);
    setPromoting(false);
    if (error) return toast.error('Promotion failed', { description: error.message });
    toast.success(`Promoted ${count ?? eligibleCount} student(s)`);
    setPromoteOpen(false);
    setFromClass(''); setToClass('');
    fetchData();
  };

  const filteredClasses = classes.filter((cls) =>
    cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cls.grade_level.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (denied) return <Forbidden />;

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="School"
          title="Classes"
          description="Manage class sections, grades, student counts and year assignments."
          actions={canManage ? (
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary d-inline-flex align-items-center gap-1"
                onClick={() => setPromoteOpen(true)}
              >
                <ArrowUpRight /> Promote Students
              </button>
              <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={() => setIsAddDialogOpen(true)}>
                <Plus /> Add Class
              </button>
            </div>
          ) : undefined}
        />

        <div className="input-group w-100 flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle">
            <Search className="bd-fs-md text-secondary" />
          </span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search classes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search classes"
          />
        </div>

        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center justify-content-center py-10 text-center">
              <BookOpen className="fs-3 mb-4 text-secondary" />
              <h3 className="fw-semibold text-main mb-2">No classes found</h3>
              <p className="text-secondary bd-fs-sm mb-0">
                {searchQuery ? 'Try adjusting your search' : 'Create your first class to get started'}
              </p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr className="border-bottom border-secondary-subtle">
                    <th scope="col">Class</th>
                    <th scope="col">Grade Level</th>
                    <th scope="col">Academic Year</th>
                    <th scope="col" className="text-end">Students</th>
                    {canManage && <th scope="col" className="text-end">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.map((cls) => (
                    <tr key={cls.id} className="border-bottom border-secondary-subtle">
                      <td>
                        <div className="d-flex align-items-center gap-3">
                          <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle p-2 text-success">
                            <BookOpen className="fs-5" />
                          </span>
                          <div>
                            <p className="fw-medium text-main mb-0">{cls.name}</p>
                            <p className="text-muted bd-fs-sm mb-0">{cls.grade_level}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-secondary">{cls.grade_level}</td>
                      <td className="text-secondary">{cls.academic_year}</td>
                      <td className="text-end">
                        <span className="d-inline-flex align-items-center gap-1 bd-fs-sm text-secondary">
                          <Users className="text-success" />{studentCounts[cls.id] || 0} students
                        </span>
                      </td>
                      {canEditClass(cls) && (
                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-1">
                            <button className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => openEdit(cls)}>
                              <Pencil /> Edit
                            </button>
                            <button className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1" onClick={() => handleDeleteClass(cls)}>
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

        {/* ── Add Class modal ── */}
        {isAddDialogOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Create New Class</h5>
                    <button type="button" className="btn-close" onClick={() => setIsAddDialogOpen(false)} aria-label="Close" />
                  </div>
                  <form className="modal-body d-flex flex-column gap-4" onSubmit={handleAddClass}>
                    <div>
                      <label htmlFor="name" className="form-label">Class Name</label>
                      <input id="name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Class 5A" required />
                    </div>
                    <div>
                      <label htmlFor="gradeLevel" className="form-label">Grade Level</label>
                      <input id="gradeLevel" className="form-control" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g., Grade 5" required />
                    </div>
                    <div>
                      <label htmlFor="academicYear" className="form-label">Academic Year</label>
                      <input id="academicYear" className="form-control" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="e.g., 2024-2025" required />
                    </div>
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setIsAddDialogOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-success" disabled={formLoading}>
                        {formLoading ? <><span className="spinner-border spinner-border-sm" /> Creating...</> : 'Create Class'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Edit Class modal ── */}
        {editing && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Edit Class</h5>
                    <button type="button" className="btn-close" onClick={() => setEditing(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-4">
                    <div>
                      <label className="form-label">Class Name</label>
                      <input className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Grade Level</label>
                      <input className="form-control" value={editGrade} onChange={(e) => setEditGrade(e.target.value)} />
                    </div>
                    <div>
                      <label className="form-label">Academic Year</label>
                      <input className="form-control" value={editYear} onChange={(e) => setEditYear(e.target.value)} />
                    </div>
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
                      <button type="button" className="btn btn-primary" onClick={handleEditSave}>Save</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Promote Students modal ── */}
        {promoteOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Promote Students to Next Class</h5>
                    <button type="button" className="btn-close" onClick={() => setPromoteOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-4">
                    <div>
                      <label htmlFor="fromClass" className="form-label">From Class</label>
                      <select id="fromClass" className="form-select" value={fromClass} onChange={(e) => setFromClass(e.target.value)}>
                        <option value="">Select source class</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({studentCounts[c.id] || 0} students)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="toClass" className="form-label">To Class</label>
                      <select id="toClass" className="form-select" value={toClass} onChange={(e) => setToClass(e.target.value)}>
                        <option value="">Select destination class</option>
                        {classes.filter((c) => c.id !== fromClass).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-3 border border-secondary-subtle bg-secondary-subtle p-3 bd-fs-sm text-secondary">
                      <strong>{eligibleCount}</strong> eligible student(s) will be moved.
                    </div>
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setPromoteOpen(false)}>Cancel</button>
                      <button type="button" className="btn btn-primary" onClick={handlePromote} disabled={promoting || !fromClass || !toClass}>
                        {promoting ? <><span className="spinner-border spinner-border-sm" /> Promoting...</> : <><ArrowUpRight /> Promote</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
