import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { buildScope, scopedById, type Scope } from '@/lib/scope';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Search, Users, Loader2 } from '@/lib/icons';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import schoolLogo from '@/assets/college-rebero-logo.png';
import {
  TERMS,
  applyBackendAnnual,
  calculateStudentAnnual,
  formatMark,
  type BackendAnnualRow,
  type MarkRecord,
  type StudentAnnualResult,
  type Term,
} from '@/lib/annualMarks';
import { buildStudentReport } from '@/lib/studentReport';

interface Student { id: string; first_name: string; last_name: string; student_id: string; class_id: string | null; date_of_birth: string | null; }
interface ClassRow { id: string; name: string; grade_level: string; academic_year: string; }
interface Subject { id: string; name: string; code: string; }
interface MarkRow extends MarkRecord { student_id: string; subject_id: string; term: Term; }

interface StudentAggregate extends StudentAnnualResult {
  student: Student;
  /** NULL until all three terms exist — never rank an incomplete result. */
  position: number | null;
}

export default function AcademicReports() {
  const { user, roles, can } = useAuth();
  const [scope, setScope] = useState<Scope | null>(null);
  const isStaff = roles.some((r) => r === 'admin' || r === 'dos' || r === 'teacher');
  const isDodOnly = roles.includes('dod') && !isStaff && !roles.includes('parent') && !roles.includes('student');
  const currentYear = `${new Date().getFullYear()}`;
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<MarkRow[]>([]);
  const [backendAnnualRows, setBackendAnnualRows] = useState<BackendAnnualRow[] | null>(null);
  const [classId, setClassId] = useState('');
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [logoData, setLogoData] = useState<string | null>(null);

  useEffect(() => {
    fetch(schoolLogo)
      .then((r) => r.blob())
      .then((blob) => new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      }))
      .then(setLogoData)
      .catch(() => setLogoData(null));
  }, []);

  useEffect(() => {
    if (isDodOnly) return;
    let cancelled = false;
    buildScope(supabase, user?.id, roles).then((s) => { if (!cancelled) setScope(s); });
    return () => { cancelled = true; };
  }, [user?.id, roles, isDodOnly]);

  useEffect(() => {
    if (!scope) return;
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from('classes').select('id, name, grade_level, academic_year').order('name'),
        supabase.from('subjects').select('id, name, code').order('name'),
      ]);
      setClasses(scopedById(c.data || [], scope.classIds));
      setSubjects(scopedById(s.data || [], scope.subjectIds));
    })();
  }, [scope]);

  useEffect(() => {
    if (!classId || !scope) { setStudents([]); setMarks([]); setBackendAnnualRows(null); return; }
    if (scope.classIds !== null && !scope.classIds.includes(classId)) {
      setStudents([]); setMarks([]); setBackendAnnualRows(null); return;
    }
    (async () => {
      setLoading(true);
      const { data: st } = await supabase.from('students').select('id, first_name, last_name, student_id, class_id, date_of_birth').eq('class_id', classId).order('last_name');
      const scopedStudents = scope.studentIds === null ? st || [] : (st || []).filter((x) => scope.studentIds!.includes(x.id));
      setStudents(scopedStudents);
      const ids = scopedStudents.map((x) => x.id);
      if (ids.length === 0) { setMarks([]); setBackendAnnualRows(null); setLoading(false); return; }
      const [mk, annual] = await Promise.all([
        supabase.from('marks').select('student_id, subject_id, term, cat_score, exam_score').in('student_id', ids).eq('academic_year', year),
        // Backend authority for annual results; RLS limits this to staff.
        isStaff
          ? supabase.rpc('get_class_annual_results', { _class_id: classId, _academic_year: year })
          : Promise.resolve({ data: null }),
      ]);
      setMarks((mk.data || []).map((m: any) => ({ ...m, cat_score: Number(m.cat_score), exam_score: Number(m.exam_score) })));
      setBackendAnnualRows(Array.isArray(annual.data) ? annual.data as BackendAnnualRow[] : null);
      setLoading(false);
    })();
  }, [classId, year, scope, isStaff]);

  const aggregates: StudentAggregate[] = useMemo(() => {
    const byStudent = new Map((backendAnnualRows || []).map((r) => [r.student_id, r]));
    const list: StudentAggregate[] = students.map((stu) => {
      const ownMarks = marks.filter((m) => m.student_id === stu.id);
      const result = applyBackendAnnual(calculateStudentAnnual(ownMarks), byStudent.get(stu.id));
      return { student: stu, ...result, position: null };
    });
    // Only complete annual results are ranked / averaged.
    const complete = list
      .filter((a) => a.annual.available && a.annual.percentage !== null)
      .sort((a, b) => b.annual.percentage! - a.annual.percentage!
        || `${a.student.last_name} ${a.student.first_name}`.localeCompare(`${b.student.last_name} ${b.student.first_name}`));
    complete.forEach((a, i) => { a.position = i + 1; });
    const incomplete = list.filter((a) => !a.annual.available);
    return [...complete, ...incomplete];
  }, [students, marks, backendAnnualRows]);

  const termPositions = useMemo(() => {
    const map: Record<string, Record<string, number>> = { term1: {}, term2: {}, term3: {} };
    TERMS.forEach((t) => {
      const sorted = [...aggregates]
        // A total of zero is a valid result and is included in the ranking.
        .filter((a) => a.terms[t].total !== null)
        .sort((a, b) => b.terms[t].total! - a.terms[t].total!);
      sorted.forEach((a, i) => { map[t][a.student.id] = i + 1; });
    });
    return map;
  }, [aggregates]);

  const filtered = aggregates.filter((a) => `${a.student.first_name} ${a.student.last_name} ${a.student.student_id}`.toLowerCase().includes(search.toLowerCase()));
  const completeFiltered = filtered.filter((a) => a.annual.available && a.annual.percentage !== null);

  const generateReport = (agg: StudentAggregate) => {
    const cls = classes.find((c) => c.id === classId);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    buildStudentReport({
      doc,
      student: agg.student,
      cls,
      totalStudents: aggregates.length,
      year,
      marks,
      subjects,
      result: { terms: agg.terms, annual: agg.annual },
      termPositions,
      annualPosition: agg.position,
      logoData,
    });
    return doc;
  };

  const generateOne = async (agg: StudentAggregate) => {
    setGenerating(agg.student.id);
    try {
      generateReport(agg).save(`Report_${agg.student.first_name}_${agg.student.last_name}_${year}.pdf`);
      toast.success('Report downloaded');
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate');
    } finally {
      setGenerating(null);
    }
  };

  const generateClassBatch = () => {
    if (aggregates.length === 0) return toast.error('No students');
    const cls = classes.find((c) => c.id === classId);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    aggregates.forEach((agg, i) => {
      if (i > 0) doc.addPage();
      buildStudentReport({
        doc,
        student: agg.student,
        cls,
        totalStudents: aggregates.length,
        year,
        marks,
        subjects,
        result: { terms: agg.terms, annual: agg.annual },
        termPositions,
        annualPosition: agg.position,
        logoData,
      });
    });
    doc.save(`Class_Reports_${cls?.name || 'class'}_${year}.pdf`);
    toast.success(`Generated ${aggregates.length} reports`);
  };

  const avg = completeFiltered.length
    ? completeFiltered.reduce((s, a) => s + a.annual.percentage!, 0) / completeFiltered.length
    : null;
  const top = completeFiltered[0];
  const bottom = completeFiltered[completeFiltered.length - 1];

  if (isDodOnly) {
    return (
      <DashboardLayout>
        <div className="card"><div className="card-body p-5 text-center">
          <h2 className="fs-4 fw-bold text-main mb-2">403 — Forbidden</h2>
          <p className="text-secondary mb-0">Academic marks and reports are not available to the Director of Discipline.</p>
        </div></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Records"
          title="Academic Reports"
          description="Ranked class performance with downloadable termly reports."
        />

        <div className="card">
          <div className="card-body d-flex flex-column gap-4">
            <div className="row g-3">
              <div className="col-12 col-sm-6 col-lg-4">
                <label className="form-label">Class</label>
                <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.grade_level} ({c.academic_year})</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-sm-6 col-lg-2">
                <label className="form-label">Academic Year</label>
                <input className="form-control" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
              </div>
              <div className="col-12 col-sm-6 col-lg-4">
                <label className="form-label">Search Student</label>
                <div className="input-group">
                  <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
                  <input
                    type="search"
                    className="form-control border-secondary-subtle"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or ID..."
                  />
                </div>
              </div>
              <div className="col-12 d-flex align-items-end">
                {can('reports.academic.generate') && <button
                  type="button"
                  className="btn btn-primary d-inline-flex align-items-center gap-1 w-100"
                  onClick={generateClassBatch}
                  disabled={aggregates.length === 0}
                >
                  <Download /> Download All Reports
                </button>}
              </div>
            </div>
          </div>
        </div>

        {/* Class ranking summary — based on complete annual results only */}
        {classId && (
          <div className="row g-3">
            <div className="col-12 col-sm-6 col-lg-4">
              <div className="card h-100 d-flex flex-column justify-between">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="text-muted bd-fs-sm mb-0">Class Average</p>
                      <p className={`fs-3 fw-bold tracking-tight mb-0 ${avg !== null && avg >= 50 ? 'text-success' : 'text-danger'}`}>
                        {avg === null ? '—' : `${avg.toFixed(1)}%`}
                      </p>
                    </div>
                    <FileText className="fs-5 text-success" />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="text-muted bd-fs-sm mb-0">Top Performer</p>
                      <p className="fs-3 fw-bold text-main text-truncate mb-0">{top ? `${top.student.first_name} ${top.student.last_name}` : '—'}</p>
                      <p className="text-success bd-fs-sm mb-0">{top ? `${top.annual.percentage!.toFixed(1)}%` : '—'}</p>
                    </div>
                    <Users className="fs-5 text-success" />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="text-muted bd-fs-sm mb-0">Needs Attention</p>
                      <p className="fs-3 fw-bold text-main text-truncate mb-0">{bottom ? `${bottom.student.first_name} ${bottom.student.last_name}` : '—'}</p>
                      <p className="text-warning bd-fs-sm mb-0">{bottom ? `${bottom.annual.percentage!.toFixed(1)}%` : '—'}</p>
                    </div>
                    <FileText className="fs-5 text-warning" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {classId && (
          <div className="card">
            <div className="card-header py-3 border-bottom border-secondary-subtle">
              <h5 className="mb-0 fw-semibold">Class Ranking — {classes.find((c) => c.id === classId)?.name || '—'} ({year})</h5>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <div className="d-flex align-items-center justify-content-center py-8">
                  <span className="spinner-border spinner-border-lg text-success" role="status" />
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr className="border-bottom border-secondary-subtle">
                        <th scope="col" className="w-12 text-center">Pos</th>
                        <th scope="col">Student</th>
                        <th scope="col">ID</th>
                        <th scope="col" className="text-center">Term 1 %</th>
                        <th scope="col" className="text-center">Term 2 %</th>
                        <th scope="col" className="text-center">Term 3 %</th>
                        <th scope="col" className="text-center fw-semibold">Annual %</th>
                        <th scope="col" className="text-end">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => (
                        <tr key={a.student.id} className="border-bottom border-secondary-subtle">
                          <td className="text-center fw-bold text-main">{a.position ?? ''}</td>
                          <td className="fw-medium text-main">{a.student.first_name} {a.student.last_name}</td>
                          <td className="text-muted bd-fs-sm">{a.student.student_id}</td>
                          <td className="text-center">{formatMark(a.terms.term1.percentage, 1) || '—'}</td>
                          <td className="text-center">{formatMark(a.terms.term2.percentage, 1) || '—'}</td>
                          <td className="text-center">{formatMark(a.terms.term3.percentage, 1) || '—'}</td>
                          <td className={`text-center fw-bold ${a.annual.percentage === null ? '' : a.annual.percentage >= 50 ? 'text-success' : 'text-danger'}`}>
                            {a.annual.percentage === null ? '' : `${a.annual.percentage.toFixed(2)}%`}
                          </td>
                          <td className="text-end">
                            {can('reports.academic.generate') && <button
                              type="button"
                              className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                              onClick={() => generateOne(a)}
                              disabled={generating === a.student.id}
                            >
                              {generating === a.student.id ? (
                                <><span className="spinner-border spinner-border-sm" /> Generating...</>
                              ) : (
                                <><Download /> PDF</>
                              )}
                            </button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
