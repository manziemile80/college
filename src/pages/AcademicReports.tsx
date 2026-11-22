import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Loader2, Download, Search, Users } from '@/lib/icons';
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
  const { role } = useAuth();
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
    doc.text('Excellence in Education â€¢ Rwanda', pageW / 2, 15, { align: 'center' });

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
        [`Class: ${cls ? cls.name : 'â€”'}`, `Grade Level: ${cls?.grade_level || 'â€”'}`],
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
        `${subj?.code || ''} | ${subj?.name || 'â€”'}`,
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
    doc.text('College De Rebero â€¢ P.O. Box 000 Kigali, Rwanda â€¢ Tel: +250 000 000 000 â€¢ info@collegederebero.rw', pageW / 2, pageH - 9, { align: 'center' });
    doc.text(`College Report Manager â€¢ Generated on ${new Date().toLocaleString()} â€¢ This is a computer-generated document.`, pageW / 2, pageH - 5, { align: 'center' });
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
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Records"
          title="Academic Reports"
          description="Ranked class performance with downloadable termly reports."
        />

        <Card>
          <CardContent className="space-y-4">
            <div className="row g-3 col-md-6 col-xl-3">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} â€” {c.grade_level} ({c.academic_year})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
              </div>
              <div className="space-y-2">
                <Label>Search Student</Label>
                <div className="position-relative">
                  <Search className="position-absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or ID..." className="pl-8" />
                </div>
              </div>
              <div className="d-flex align-items-end">
                <Button onClick={generateClassBatch} disabled={aggregates.length === 0} className="g-2 w-100 sm:w-auto">
                  <Download className="h-4 w-4" /> Download All Reports
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Class ranking summary */}
        {classId && (
          <div className="row g-3 col-md-6 col-xl-3">
            <Card>
              <CardContent className="p-5">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="fs-13 text-slate-500">Class Average</p>
                    <p className={`fs-32 fw-bold tracking-tight ${avg >= 50 ? 'text-emerald-700' : 'text-red-700'}`}>{avg.toFixed(1)}%</p>
                  </div>
                  <FileText className="h-9 w-9 text-emerald-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="fs-13 text-slate-500">Top Performer</p>
                    <p className="fs-32 fw-bold text-slate-900 truncate">{top?.student.first_name} {top?.student.last_name}</p>
                    <p className="fs-13 text-emerald-600">{top ? top.annualPct.toFixed(1) + '%' : 'â€”'}</p>
                  </div>
                  <Users className="h-9 w-9 text-emerald-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="d-flex align-items-center justify-content-between">
                  <div>
                    <p className="fs-13 text-slate-500">Needs Attention</p>
                    <p className="fs-32 fw-bold text-slate-900 truncate">{bottom?.student.first_name} {bottom?.student.last_name}</p>
                    <p className="fs-13 text-amber-700">{bottom ? bottom.annualPct.toFixed(1) + '%' : 'â€”'}</p>
                  </div>
                  <FileText className="h-9 w-9 text-amber-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {classId && (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <div class="table-responsive"><Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Pos</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead className="text-center">Term 1 %</TableHead>
                    <TableHead className="text-center">Term 2 %</TableHead>
                    <TableHead className="text-center">Term 3 %</TableHead>
                    <TableHead className="text-center fw-semibold">Annual %</TableHead>
                    <TableHead className="w-32 text-end">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.student.id}>
                      <TableCell className="fw-bold text-slate-900">{a.position}</TableCell>
                      <TableCell className="fw-medium text-slate-900">{a.student.first_name} {a.student.last_name}</TableCell>
                      <TableCell className="fs-12.5 text-slate-500">{a.student.student_id}</TableCell>
                      <TableCell className="text-center">{a.termPct.term1 > 0 ? a.termPct.term1.toFixed(1) : '-'}</TableCell>
                      <TableCell className="text-center">{a.termPct.term2 > 0 ? a.termPct.term2.toFixed(1) : '-'}</TableCell>
                      <TableCell className="text-center">{a.termPct.term3 > 0 ? a.termPct.term3.toFixed(1) : '-'}</TableCell>
                      <TableCell className={`text-center fw-bold ${a.annualPct >= 50 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {a.annualPct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="outline" onClick={() => generateOne(a)} disabled={generating === a.student.id} className="g-2">
                          {generating === a.student.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}





