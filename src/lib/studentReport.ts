/**
 * Student assessment report (PDF) model and renderer.
 *
 * The Annual cells are produced from the shared annual calculation in
 * `annualMarks.ts`. They are intentionally EMPTY until all three terms
 * have valid results; PASS/FAIL and annual position are suppressed too.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  type AnnualResult,
  type MarkRecord,
  type StudentAnnualResult,
  type Term,
  TERMS,
  calculateSubjectAnnual,
  formatAnnualStatus,
  formatMark,
  markTotal,
} from './annualMarks';

export interface ReportStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string;
}

export interface ReportClass {
  name: string;
  grade_level?: string;
}

export interface ReportSubject {
  id: string;
  name: string;
  code: string;
}

export interface ReportInput {
  doc: jsPDF;
  student: ReportStudent;
  cls?: ReportClass;
  totalStudents: number;
  year: string;
  marks: readonly MarkRecord[];
  subjects: readonly ReportSubject[];
  result: StudentAnnualResult;
  termPositions: Record<string, Record<string, number>>;
  annualPosition: number | null;
  logoData?: string | null;
}

/** One row per subject: CAT/Exam/Total for each term, then Annual cells. */
export function buildSubjectRows(
  marks: readonly MarkRecord[],
  subjects: readonly ReportSubject[],
  studentId: string,
): any[][] {
  const subjectIds = Array.from(new Set(marks.filter((m) => m.student_id === studentId).map((m) => String(m.subject_id))));
  return subjectIds.map((sid, idx) => {
    const subj = subjects.find((s) => s.id === sid);
    const cell = (term: Term): string[] => {
      const m = marks.find(
        (x) => x.student_id === studentId && String(x.subject_id) === sid && x.term === term,
      );
      if (!m) return ['', '', ''];
      return [formatMark(m.cat_score), formatMark(m.exam_score), formatMark(markTotal(m))];
    };
    const t1 = cell('term1'), t2 = cell('term2'), t3 = cell('term3');
    const subjectMarks = marks.filter(
      (x) => x.student_id === studentId && String(x.subject_id) === sid,
    );
    const annual = calculateSubjectAnnual(subjectMarks);
    return [
      idx + 1,
      `${subj?.code || ''} | ${subj?.name || '—'}`,
      ...t1, ...t2, ...t3,
      formatMark(annual, 1),
      annual === null ? '' : `${annual.toFixed(1)}%`,
      formatAnnualStatus({ available: annual !== null, total: annual, percentage: annual } as AnnualResult),
    ];
  });
}

/** TOTAL / PERCENTAGE / POSITION rows. Annual values stay blank when incomplete. */
export function buildSummaryRows(
  result: StudentAnnualResult,
  termPositions: Record<string, Record<string, number>>,
  studentId: string,
  totalStudents: number,
  annualPosition: number | null,
): any[][] {
  const labelCell = (txt: string) => ({
    content: txt,
    colSpan: 2,
    styles: { halign: 'left' as const, fillColor: [240, 240, 245] as [number, number, number] },
  });
  const termCell = (txt: string) => ({ content: txt, colSpan: 3 });
  const annualCell = (txt: string) => ({ content: txt, colSpan: 3 });
  const pos = (term: Term) => {
    // No position for a term that has no recorded results.
    if (result.terms[term].total === null) return '';
    const p = termPositions[term]?.[studentId];
    return p ? `${p} / ${totalStudents}` : '';
  };
  const annual = result.annual;
  return [
    [
      labelCell('TOTAL'),
      termCell(formatMark(result.terms.term1.total)),
      termCell(formatMark(result.terms.term2.total)),
      termCell(formatMark(result.terms.term3.total)),
      annualCell(formatMark(annual.total)),
    ],
    [
      labelCell('PERCENTAGE'),
      termCell(formatMark(result.terms.term1.percentage, 2) ? `${result.terms.term1.percentage!.toFixed(2)}%` : ''),
      termCell(formatMark(result.terms.term2.percentage, 2) ? `${result.terms.term2.percentage!.toFixed(2)}%` : ''),
      termCell(formatMark(result.terms.term3.percentage, 2) ? `${result.terms.term3.percentage!.toFixed(2)}%` : ''),
      annualCell(annual.percentage === null ? '' : `${annual.percentage.toFixed(2)}%`),
    ],
    [
      labelCell('POSITION'),
      termCell(pos('term1')),
      termCell(pos('term2')),
      termCell(pos('term3')),
      annualCell(annual.available && annualPosition !== null ? `${annualPosition} / ${totalStudents}` : ''),
    ],
  ];
}

const COL_WIDTHS: Record<number, number> = {
  0: 8, 1: 50, 2: 14, 3: 14, 4: 14, 5: 14, 6: 14, 7: 14, 8: 14, 9: 14, 10: 14, 11: 18, 12: 18, 13: 20,
};

/** Render the complete one-student report into an existing jsPDF document. */
export function buildStudentReport(input: ReportInput): void {
  const { doc, student, cls, totalStudents, year, marks, subjects, result, termPositions, annualPosition, logoData } = input;
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
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5, textColor: 0, lineColor: 0, lineWidth: 0.2 },
    body: [
      [{ content: 'School Name: COLLEGE DE REBERO', colSpan: 2, styles: { fontStyle: 'bold' } }],
      [`Class: ${cls ? cls.name : '—'}`, `Grade Level: ${cls?.grade_level || '—'}`],
      [`Academic Year: ${year}`, `Class Size: ${totalStudents}`],
      [{ content: `Student Name: ${student.first_name} ${student.last_name}    |    Reg. No: ${student.student_id}`, colSpan: 2, styles: { fontStyle: 'bold' } }],
    ],
  });
  let y = (doc as any).lastAutoTable.finalY + 4;

  const subjectRows = buildSubjectRows(marks, subjects, student.id);

  const subjectColumnStyles: Record<number, any> = { 1: { halign: 'left', cellWidth: COL_WIDTHS[1] } };
  Object.entries(COL_WIDTHS).forEach(([k, v]) => {
    const i = Number(k);
    subjectColumnStyles[i] = { ...(subjectColumnStyles[i] || {}), cellWidth: v };
  });

  autoTable(doc, {
    startY: y,
    theme: 'plain',
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

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    tableWidth: 'wrap',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8.5, cellPadding: 1.5, textColor: 0, lineColor: 0, lineWidth: 0.2, halign: 'center', fontStyle: 'bold' },
    columnStyles: subjectColumnStyles,
    body: buildSummaryRows(result, termPositions, student.id, totalStudents, annualPosition),
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
}
