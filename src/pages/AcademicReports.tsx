import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Search, Users, Loader2 } from '@/lib/icons';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import schoolLogo from '@/assets/college-rebero-logo.png';

interface Student { id: string; first_name: string; last_name: string; student_id: string; class_id: string | null; date_of_birth: string | null; }
interface ClassRow { id: string; name: string; grade_level: string; academic_year: string; }
interface Subject { id: string; name: string; code: string; }
interface MarkRow { student_id: string; subject_id: string; term: string; cat_score: number; exam_score: number; }

const TERMS: ('term1' | 'term2' | 'term3')[] = ['term1', 'term2', 'term3'];
const TERM_LABEL: Record<string, string> = { term1: 'TERM 1', term2: 'TERM 2', term3: 'TERM 3' };

interface StudentAggregate {
  student: Student;
  termTotals: Record<string, number>;
  termPct: Record<string, number>;
  annualTotal: number;
  annualPct: number;
  position?: number;
}

export default function AcademicReports() {
  const currentYear = `${new Date().getFullYear()}`;
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<MarkRow[]>([]);
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
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from('classes').select('id, name, grade_level, academic_year').order('name'),
        supabase.from('subjects').select('id, name, code').order('name'),
      ]);
      setClasses(c.data || []);
      setSubjects(s.data || []);
    })();
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); setMarks([]); return; }
    (async () => {
      setLoading(true);
      const { data: st } = await supabase.from('students').select('id, first_name, last_name, student_id, class_id, date_of_birth').eq('class_id', classId).order('last_name');
      setStudents(st || []);
      const ids = (st || []).map((x) => x.id);
      if (ids.length === 0) { setMarks([]); setLoading(false); return; }
      const { data: mk } = await supabase.from('marks').select('student_id, subject_id, term, cat_score, exam_score').in('student_id', ids).eq('academic_year', year);
      setMarks((mk || []).map((m: any) => ({ ...m, cat_score: Number(m.cat_score), exam_score: Number(m.exam_score) })));
      setLoading(false);
    })();
  }, [classId, year]);

  const aggregates: StudentAggregate[] = useMemo(() => {
    const list: StudentAggregate[] = students.map((stu) => {
      const studentMarks = marks.filter((m) => m.student_id === stu.id);
      const termTotals: Record<string, number> = { term1: 0, term2: 0, term3: 0 };
      const termCounts: Record<string, number> = { term1: 0, term2: 0, term3: 0 };
      studentMarks.forEach((m) => {
        termTotals[m.term] += m.cat_score + m.exam_score;
        termCounts[m.term] += 1;
      });
      const termPct: Record<string, number> = {};
      TERMS.forEach((t) => { termPct[t] = termCounts[t] > 0 ? termTotals[t] / termCounts[t] : 0; });
      const totalCount = studentMarks.length;
      const annualTotal = termTotals.term1 + termTotals.term2 + termTotals.term3;
      const annualPct = totalCount > 0 ? annualTotal / totalCount : 0;
      return { student: stu, termTotals, termPct, annualTotal, annualPct };
    });
    const ranked = [...list].sort((a, b) => b.annualPct - a.annualPct);
    ranked.forEach((a, i) => { a.position = i + 1; });
    return ranked;
  }, [students, marks]);

  const termPositions = useMemo(() => {
    const map: Record<string, Record<string, number>> = { term1: {}, term2: {}, term3: {} };
    TERMS.forEach((t) => {
      const sorted = [...aggregates]
        .filter((a) => a.termPct[t] > 0)
        .sort((a, b) => b.termPct[t] - a.termPct[t]);
      sorted.forEach((a, i) => { map[t][a.student.id] = i + 1; });
    });
    return map;
  }, [aggregates]);

  const filtered = aggregates.filter((a) => `${a.student.first_name} ${a.student.last_name} ${a.student.student_id}`.toLowerCase().includes(search.toLowerCase()));

  const buildStudentReport = (doc: jsPDF, agg: StudentAggregate, cls: ClassRow | undefined, totalStudents: number, termPos: Record<string, Record<string, number>>) => {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    if (logoData) {
      try { doc.addImage(logoData, 'PNG', 10, 6, 18, 18); } catch (_) { /* ignore */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('COLLEGE DE REBERO', pageW / 2, 10, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Excellence in Education • Rwanda', pageW / 2, 15, { align: 'center' });

    doc.setDrawColor(0); doc.setLineWidth(0.5);
    doc.rect(pageW / 2 - 60, 19, 120, 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text("STUDENT'S ASSESSMENT REPORT", pageW / 2, 24.5, { align: 'center' });

    autoTable(doc, {
      startY: 30,
      theme: 'row',
      styles: { fontSize: 9, cellPadding: 1.5, textColor: 0, lineColor: 0, lineWidth: 0.2 },
      body: [
        [{ content: 'School Name: COLLEGE DE REBERO', colSpan: 2, styles: { fontStyle: 'bold' } }],
        [`Class: ${cls ? cls.name : '—'}`, `Grade Level: ${cls?.grade_level || '—'}`],
        [`Academic Year: ${year}`, `Class Size: ${totalStudents}`],
        [{ content: `Student Name: ${agg.student.first_name} ${agg.student.last_name}    |    Reg. No: ${agg.student.student_id}`, colSpan: 2, styles: { fontStyle: 'bold' } }],
      ],
    });
    let y = (doc as any).lastAutoTable.finalY + 4;

    const subjectRows: any[] = [];
    const subjectIds = Array.from(new Set(marks.filter((m) => m.student_id === agg.student.id).map((m) => m.subject_id)));
    subjectIds.forEach((sid, idx) => {
      const subj = subjects.find((s) => s.id === sid);
      const cell = (term: string) => {
        const m = marks.find((x) => x.student_id === agg.student.id && x.subject_id === sid && x.term === term);
        return m ? [m.cat_score.toFixed(0), m.exam_score.toFixed(0), (m.cat_score + m.exam_score).toFixed(0)] : ['', '', ''];
      };
      const t1 = cell('term1'), t2 = cell('term2'), t3 = cell('term3');
      const totals = [t1, t2, t3].map((t) => (t[2] ? Number(t[2]) : 0));
      const counted = totals.filter((v) => v > 0).length;
      const annual = counted > 0 ? (totals.reduce((s, v) => s + v, 0) / counted).toFixed(1) : '';
      subjectRows.push([
        idx + 1,
        `${subj?.code || ''} | ${subj?.name || '—'}`,
        ...t1, ...t2, ...t3,
        annual,
        annual ? `${annual}%` : '',
        annual ? (Number(annual) >= 50 ? 'PASS' : 'FAIL') : '',
      ]);
    });

    const COL_WIDTHS: Record<number, number> = {
      0: 8, 1: 50, 2: 14, 3: 14, 4: 14, 5: 14, 6: 14, 7: 14, 8: 14, 9: 14, 10: 14, 11: 18, 12: 18, 13: 20,
    };
    const subjectColumnStyles: Record<number, any> = { 1: { halign: 'left', cellWidth: COL_WIDTHS[1] } };
    Object.entries(COL_WIDTHS).forEach(([k, v]) => {
      const i = Number(k);
      subjectColumnStyles[i] = { ...(subjectColumnStyles[i] || {}), cellWidth: v };
    });

    autoTable(doc, {
      startY: y,
      theme: 'row',
      tableWidth: 'wrap',
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 1, textColor: 0, lineColor: 0, lineWidth: 0.2, halign: 'center' },
      headStyles: { fillColor: [220, 230, 241], textColor: 0, fontStyle: 'bold' },
      head: [
        [
          { content: '#', rowSpan: 2 },
          { content: 'MODULE CODE & TITLE', rowSpan: 2, styles: { halign: 'left' } },
          { content: 'TERM 1', colSpan: 3 },
          { content: 'TERM 2', colSpan: 3 },
          { content: 'TERM 3', colSpan: 3 },
          { content: 'Annual', rowSpan: 2 },
          { content: 'A.%', rowSpan: 2 },
          { content: 'DES', rowSpan: 2 },
        ],
        ['CAT', 'Exam', 'Tot', 'CAT', 'Exam', 'Tot', 'CAT', 'Exam', 'Tot'],
      ],
      body: subjectRows.length ? subjectRows : [[{ content: 'No marks recorded', colSpan: 14, styles: { halign: 'center', fontStyle: 'italic' } }]],
      columnStyles: subjectColumnStyles,
    });
    y = (doc as any).lastAutoTable.finalY;

    const posT = (t: string) => {
      const p = termPos[t]?.[agg.student.id];
      return p ? `${p} / ${totalStudents}` : '-';
    };
    const labelCell = (txt: string) => ({ content: txt, colSpan: 2, styles: { halign: 'left' as const, fillColor: [240, 240, 245] as [number, number, number] } });
    const termCell = (txt: string) => ({ content: txt, colSpan: 3 });
    const annualCell = (txt: string) => ({ content: txt, colSpan: 3 });
    autoTable(doc, {
      startY: y,
      theme: 'row',
      tableWidth: 'wrap',
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8.5, cellPadding: 1.5, textColor: 0, lineColor: 0, lineWidth: 0.2, halign: 'center', fontStyle: 'bold' },
      columnStyles: subjectColumnStyles,
      body: [
        [
          labelCell('TOTAL'),
          termCell(agg.termTotals.term1.toFixed(0)),
          termCell(agg.termTotals.term2.toFixed(0)),
          termCell(agg.termTotals.term3.toFixed(0)),
          annualCell(agg.annualTotal.toFixed(0)),
        ],
        [
          labelCell('PERCENTAGE'),
          termCell(`${agg.termPct.term1.toFixed(2)}%`),
          termCell(`${agg.termPct.term2.toFixed(2)}%`),
          termCell(`${agg.termPct.term3.toFixed(2)}%`),
          annualCell(`${agg.annualPct.toFixed(2)}%`),
        ],
        [
          labelCell('POSITION'),
          termCell(posT('term1')),
          termCell(posT('term2')),
          termCell(posT('term3')),
          annualCell(`${agg.position} / ${totalStudents}`),
        ],
      ],
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Done at College De Rebero, on ${new Date().toLocaleDateString()}`, 14, y);
    y += 14;
    doc.line(14, y, 80, y);
    doc.line(pageW / 2 - 33, y, pageW / 2 + 33, y);
    doc.line(pageW - 80, y, pageW - 14, y);
    doc.setFontSize(9);
    doc.text('Class Teacher', 14, y + 5);
    doc.text('Director of Studies', pageW / 2, y + 5, { align: 'center' });
    doc.text('School Manager', pageW - 80, y + 5);

    doc.setDrawColor(150); doc.setLineWidth(0.2);
    doc.line(10, pageH - 14, pageW - 10, pageH - 14);
    doc.setFontSize(8); doc.setTextColor(100);
    doc.text('College De Rebero • P.O. Box 000 Kigali, Rwanda • Tel: +250 000 000 000 • info@collegederebero.rw', pageW / 2, pageH - 9, { align: 'center' });
    doc.text(`College Report Manager • Generated on ${new Date().toLocaleString()} • This is a computer-generated document.`, pageW / 2, pageH - 5, { align: 'center' });
    doc.setTextColor(0);
  };

  const generateOne = async (agg: StudentAggregate) => {
    setGenerating(agg.student.id);
    try {
      const cls = classes.find((c) => c.id === classId);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      buildStudentReport(doc, agg, cls, aggregates.length, termPositions);
      doc.save(`Report_${agg.student.first_name}_${agg.student.last_name}_${year}.pdf`);
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
      buildStudentReport(doc, agg, cls, aggregates.length, termPositions);
    });
    doc.save(`Class_Reports_${cls?.name || 'class'}_${year}.pdf`);
    toast.success(`Generated ${aggregates.length} reports`);
  };

  const avg = filtered.length
    ? filtered.reduce((s, a) => s + a.annualPct, 0) / filtered.length
    : 0;
  const top = filtered[0];
  const bottom = filtered[filtered.length - 1];

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
                <button
                  type="button"
                  className="btn btn-primary d-inline-flex align-items-center gap-1 w-100"
                  onClick={generateClassBatch}
                  disabled={aggregates.length === 0}
                >
                  <Download /> Download All Reports
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Class ranking summary */}
        {classId && (
          <div className="row g-3">
            <div className="col-12 col-sm-6 col-lg-4">
              <div className="card h-100 d-flex flex-column justify-between">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between">
                    <div>
                      <p className="text-muted bd-fs-sm mb-0">Class Average</p>
                      <p className={`fs-3 fw-bold tracking-tight mb-0 ${avg >= 50 ? 'text-success' : 'text-danger'}`}>{avg.toFixed(1)}%</p>
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
                      <p className="fs-3 fw-bold text-main text-truncate mb-0">{top?.student.first_name} {top?.student.last_name}</p>
                      <p className="text-success bd-fs-sm mb-0">{top ? top.annualPct.toFixed(1) + '%' : '—'}</p>
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
                      <p className="fs-3 fw-bold text-main text-truncate mb-0">{bottom?.student.first_name} {bottom?.student.last_name}</p>
                      <p className="text-warning bd-fs-sm mb-0">{bottom ? bottom.annualPct.toFixed(1) + '%' : '—'}</p>
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
                          <td className="text-center fw-bold text-main">{a.position}</td>
                          <td className="fw-medium text-main">{a.student.first_name} {a.student.last_name}</td>
                          <td className="text-muted bd-fs-sm">{a.student.student_id}</td>
                          <td className="text-center">{a.termPct.term1 > 0 ? a.termPct.term1.toFixed(1) : '-'}</td>
                          <td className="text-center">{a.termPct.term2 > 0 ? a.termPct.term2.toFixed(1) : '-'}</td>
                          <td className="text-center">{a.termPct.term3 > 0 ? a.termPct.term3.toFixed(1) : '-'}</td>
                          <td className={`text-center fw-bold ${a.annualPct >= 50 ? 'text-success' : 'text-danger'}`}>
                            {a.annualPct.toFixed(2)}%
                          </td>
                          <td className="text-end">
                            <button
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
                            </button>
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


