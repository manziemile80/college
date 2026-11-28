import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, type Scope } from '@/lib/scope';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, BookOpen, PlayCircle, FileText, X } from '@/lib/icons';
import Forbidden from './Forbidden';

interface Course {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  class_id: string | null;
  term: string | null;
  academic_year: string;
  is_published: boolean;
  teacher_id?: string | null;
}

interface Lesson {
  id: string;
  course_id: string;
  title: string;
  content: string | null;
  video_url: string | null;
  attachment_url: string | null;
  sort_order: number;
}

const emptyCourse = {
  title: '',
  description: '',
  subject_id: '',
  class_id: '',
  term: 'term1',
  academic_year: String(new Date().getFullYear()),
  is_published: true,
};

export default function Courses() {
  const { user, roles, can, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [scope, setScope] = useState<Scope | null>(null);
  const isPrivileged = roles.some((r) => r === 'admin' || r === 'dos');
  const isTeacher = roles.includes('teacher');
  const canView = isPrivileged || can('courses.view');
  const denied = !authLoading && !canView;
  const canManage = can('courses.manage') && (isPrivileged || isTeacher);

  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCourse);

  const [lessonCourse, setLessonCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonForm, setLessonForm] = useState({ title: '', content: '', video_url: '' });

  useEffect(() => {
    if (authLoading || denied) return;
    let active = true;
    buildScope(supabase, user?.id, roles).then((s) => {
      if (active) setScope(s);
    });
    return () => { active = false; };
  }, [authLoading, denied, user?.id, roles]);

  useEffect(() => {
    if (scope) void fetchAll(scope);
  }, [scope]);

  const fetchAll = async (currentScope: Scope) => {
    setLoading(true);
    // [] means no records — skip the .in() query entirely.
    if (currentScope.classIds !== null && currentScope.classIds.length === 0) {
      setCourses([]);
      setSubjects([]);
      setClasses([]);
      setLoading(false);
      return;
    }

    const isReader = !isPrivileged && !isTeacher;
    let coursesQuery = supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });
    // Students/parents must never receive drafts, even from the cache.
    if (isReader) coursesQuery = coursesQuery.eq('is_published', true);

    const [c, s, cl] = await Promise.all([
      coursesQuery,
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('classes').select('id, name').order('name'),
    ]);

    let visible = (c.data as Course[]) || [];
    if (isTeacher) {
      visible = visible.filter((course) =>
        course.teacher_id === user?.id ||
        (course.class_id != null && currentScope.classIds?.includes(course.class_id)));
    } else if (isReader) {
      visible = visible.filter((course) =>
        course.is_published &&
        (course.class_id === null || (currentScope.classIds || []).includes(course.class_id)));
    }
    const visibleClasses = (cl.data || []).filter((item) =>
      currentScope.classIds === null || currentScope.classIds.includes(item.id));

    setCourses(visible);
    setSubjects(s.data || []);
    setClasses(visibleClasses);
    setLoading(false);
  };

  const canEditCourse = (course: Course) =>
    canManage && (
      isPrivileged ||
      course.teacher_id === user?.id ||
      (course.class_id != null && (scope?.classIds || []).includes(course.class_id))
    );

  const openNew = () => {
    setEditingId(null);
    setForm(emptyCourse);
    setDialogOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditingId(course.id);
    setForm({
      title: course.title,
      description: course.description || '',
      subject_id: course.subject_id || '',
      class_id: course.class_id || '',
      term: course.term || 'term1',
      academic_year: course.academic_year,
      is_published: course.is_published,
    });
    setDialogOpen(true);
  };

  const saveCourse = async () => {
    if (!canManage) return;
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (editingId) {
      const target = courses.find((item) => item.id === editingId);
      if (!target || !canEditCourse(target)) {
        toast({ title: 'You can only edit your own courses', variant: 'destructive' });
        return;
      }
    } else if (form.class_id && scope?.classIds !== null && scope?.classIds !== undefined &&
               !scope.classIds.includes(form.class_id)) {
      toast({ title: 'You can only create courses for your assigned classes', variant: 'destructive' });
      return;
    }
    const payload = {
      title: form.title.trim().slice(0, 150),
      description: form.description.trim().slice(0, 2000) || null,
      subject_id: form.subject_id || null,
      class_id: form.class_id || null,
      term: form.term as 'term1' | 'term2' | 'term3',
      academic_year: form.academic_year,
      is_published: form.is_published,
      teacher_id: user!.id,
    };
    const { error } = editingId
      ? await supabase.from('courses').update(payload).eq('id', editingId)
      : await supabase.from('courses').insert(payload);
    if (error) {
      toast({ title: 'Could not save course', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editingId ? 'Course updated' : 'Course created' });
    setDialogOpen(false);
    if (scope) void fetchAll(scope);
  };

  const deleteCourse = async (course: Course) => {
    if (!canEditCourse(course)) return;
    const { error } = await supabase.from('courses').delete().eq('id', course.id);
    if (error) {
      toast({ title: 'Could not delete course', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Course deleted' });
    if (scope) void fetchAll(scope);
  };

  const openLessons = async (course: Course) => {
    setLessonCourse(course);
    setLessonForm({ title: '', content: '', video_url: '' });
    const { data } = await supabase
      .from('lessons')
      .select('*')
      .eq('course_id', course.id)
      .order('sort_order');
    setLessons((data as Lesson[]) || []);
  };

  const addLesson = async () => {
    if (!lessonCourse || !canEditCourse(lessonCourse) || !lessonForm.title.trim()) return;
    const { error } = await supabase.from('lessons').insert({
      course_id: lessonCourse.id,
      title: lessonForm.title.trim().slice(0, 150),
      content: lessonForm.content.trim().slice(0, 5000) || null,
      video_url: lessonForm.video_url.trim().slice(0, 500) || null,
      sort_order: lessons.length + 1,
    });
    if (error) {
      toast({ title: 'Could not add lesson', description: error.message, variant: 'destructive' });
      return;
    }
    setLessonForm({ title: '', content: '', video_url: '' });
    openLessons(lessonCourse);
  };

  const deleteLesson = async (id: string) => {
    if (!lessonCourse || !canEditCourse(lessonCourse)) return;
    const { error } = await supabase.from('lessons').delete().eq('id', id);
    if (error) toast({ title: 'Could not delete lesson', description: error.message, variant: 'destructive' });
    if (lessonCourse) void openLessons(lessonCourse);
  };

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name;
  const className = (id: string | null) => classes.find((c) => c.id === id)?.name;

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (subjectName(c.subject_id) || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (className(c.class_id) || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (denied) return <Forbidden />;

  const courseCard = (course: Course) => (
    <div className="card h-100 d-flex flex-column">
      <div className="card-body d-flex flex-column gap-3 p-4">
        <div className="d-flex align-items-start justify-content-between gap-2">
          <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success p-2"><BookOpen className="fs-5" /></span>
          <span className={`badge bd-fs-xs ${course.is_published ? 'text-bg-success bg-success-subtle' : 'text-bg-secondary bg-secondary-subtle'}`}>
            {course.is_published ? 'Published' : 'Draft'}
          </span>
        </div>
        <div>
          <h3 className="fw-semibold text-main mb-1 text-truncate">{course.title}</h3>
          <p className="text-muted bd-fs-sm mb-0 mt-1 line-clamp-2">{course.description || 'No description provided.'}</p>
        </div>
        <div className="d-flex flex-wrap gap-1.5">
          {subjectName(course.subject_id) && (
            <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{subjectName(course.subject_id)}</span>
          )}
          {className(course.class_id) && (
            <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{className(course.class_id)}</span>
          )}
          <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">
            {course.term?.replace('term', 'Term ') || '—'} · {course.academic_year}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2 mt-auto">
          <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => openLessons(course)}>
            <PlayCircle /> Lessons
          </button>
          {canEditCourse(course) && (
            <>
              <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center" aria-label="Edit course" onClick={() => openEdit(course)}><Pencil /></button>
              <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete course" onClick={() => deleteCourse(course)}><Trash2 /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="E-Learning"
          title="Courses"
          description="Online courses with lessons, videos and reading content for each subject and class."
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={openNew}>
              <Plus /> New Course
            </button>
          ) : undefined}
        />

        <div className="input-group w-100 flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle"><PlayCircle className="text-success" /></span>
          <input
            type="search"
            className="form-control border-secondary-subtle"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search courses"
          />
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center py-12 text-center">
              <BookOpen className="fs-3 mb-3 text-secondary" />
              <p className="fw-semibold text-main mb-2">No courses yet</p>
              <p className="text-muted bd-fs-sm mb-0">{canManage ? 'Create your first course to start publishing lessons.' : 'Courses will appear here once published.'}</p>
            </div>
          </div>
        ) : (
          <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-3">
            {filtered.map((course) => <div key={course.id} className="col">{courseCard(course)}</div>)}
          </div>
        )}

        {/* ── Course form modal ── */}
        {dialogOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{editingId ? 'Edit Course' : 'New Course'}</h5>
                    <button type="button" className="btn-close" onClick={() => setDialogOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Title</label>
                      <input className="form-control" value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Introduction to Algebra" />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Description</label>
                      <textarea className="form-control" value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What learners will cover in this course" />
                    </div>
                    <div className="row g-3">
                      <div className="col-6 col-md-6">
                        <label className="form-label">Subject</label>
                        <select className="form-select" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                          <option value="">Select subject</option>
                          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-md-6">
                        <label className="form-label">Class</label>
                        <select className="form-select" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                          <option value="">Select class</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Term</label>
                        <select className="form-select" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
                          <option value="term1">Term 1</option>
                          <option value="term2">Term 2</option>
                          <option value="term3">Term 3</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Academic Year</label>
                        <input className="form-control" value={form.academic_year} maxLength={9} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} />
                      </div>
                    </div>
                    <div className="d-flex align-items-center justify-content-between rounded-3 bg-secondary-subtle px-3 py-2">
                      <div>
                        <p className="fw-semibold text-main mb-0">Published</p>
                        <p className="text-muted bd-fs-sm mb-0">Visible to students and parents</p>
                      </div>
                      <input
                        type="checkbox"
                        className="form-switch"
                        checked={form.is_published}
                        onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                      />
                    </div>
                  </div>
                  <div className="modal-footer d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setDialogOpen(false)}>Cancel</button>
                    <button type="button" className="btn btn-success" onClick={saveCourse}>{editingId ? 'Save Changes' : 'Create Course'}</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Lessons modal ── */}
        {lessonCourse && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{lessonCourse.title} — Lessons</h5>
                    <button type="button" className="btn-close" onClick={() => setLessonCourse(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    {lessons.length === 0 && <p className="text-muted bd-fs-sm mb-0">No lessons added yet.</p>}
                    {lessons.map((lesson, i) => (
                      <div key={lesson.id} className="rounded-3 border border-secondary-subtle p-3">
                        <div className="d-flex align-items-start justify-content-between gap-2">
                          <div className="min-w-0">
                            <p className="fw-semibold text-main mb-0">{i + 1}. {lesson.title}</p>
                            {lesson.content && <p className="text-wrap text-muted bd-fs-sm mb-0 mt-1">{lesson.content}</p>}
                            {lesson.video_url && (
                              <a href={lesson.video_url} target="_blank" rel="noreferrer" className="d-inline-flex align-items-center gap-1 mt-2 bd-fs-sm text-success text-decoration-none">
                                <PlayCircle /> Watch lesson video
                              </a>
                            )}
                          </div>
                          {isStaff && (
                            <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete lesson" onClick={() => deleteLesson(lesson.id)}><X /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {isStaff && (
                    <div className="d-flex flex-column gap-2 rounded-3 border border-dashed border-secondary-subtle p-3">
                      <p className="d-flex align-items-center gap-2 fw-semibold text-main mb-0"><FileText className="text-success" /> Add a lesson</p>
                      <input className="form-control" placeholder="Lesson title" maxLength={150} value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />
                      <textarea className="form-control" placeholder="Lesson content / notes" maxLength={5000} value={lessonForm.content} onChange={(e) => setLessonForm({ ...lessonForm, content: e.target.value })} />
                      <input className="form-control" placeholder="Video link (optional)" maxLength={500} value={lessonForm.video_url} onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })} />
                      <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" onClick={addLesson}><Plus /> Add Lesson</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
