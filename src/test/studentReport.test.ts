import { beforeEach, describe, expect, it, vi } from 'vitest';
import jsPDF from 'jspdf';

const captured = vi.hoisted(() => ({ tables: [] as any[] }));

vi.mock('jspdf-autotable', () => ({
  default: (doc: any, options: any) => {
    captured.tables.push(options);
    doc.lastAutoTable = { finalY: (options.startY ?? 0) + 10 };
  },
}));

import { buildStudentReport } from '@/lib/studentReport';
import { calculateStudentAnnual, type MarkRecord } from '@/lib/annualMarks';

const student = { id: 'stu-1', first_name: 'Jane', last_name: 'Doe', student_id: 'R001' };
const subjects = [
  { id: 's1', name: 'Mathematics', code: 'MAT' },
  { id: 's2', name: 'English', code: 'ENG' },
];
const term1: MarkRecord[] = [
  { student_id: 'stu-1', subject_id: 's1', term: 'term1', cat_score: 40, exam_score: 40 },
  { student_id: 'stu-1', subject_id: 's2', term: 'term1', cat_score: 38, exam_score: 40 },
];
const term2: MarkRecord[] = [
  { student_id: 'stu-1', subject_id: 's1', term: 'term2', cat_score: 35, exam_score: 35 },
  { student_id: 'stu-1', subject_id: 's2', term: 'term2', cat_score: 36, exam_score: 34 },
];
const term3: MarkRecord[] = [
  { student_id: 'stu-1', subject_id: 's1', term: 'term3', cat_score: 0, exam_score: 0 },
  { student_id: 'stu-1', subject_id: 's2', term: 'term3', cat_score: 39, exam_score: 39 },
];

function render(marks: MarkRecord[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  buildStudentReport({
    doc,
    student,
    cls: { name: 'S3 A', grade_level: 'S3' },
    totalStudents: 12,
    year: '2026',
    marks,
    subjects,
    result: calculateStudentAnnual(marks),
    termPositions: { term1: { 'stu-1': 2 }, term2: { 'stu-1': 3 }, term3: { 'stu-1': 4 } },
    annualPosition: null,
  });
  return doc;
}

beforeEach(() => { captured.tables.length = 0; });

describe('student report PDF cells', () => {
  it('keeps every Annual cell empty when Term 3 is missing', () => {
    const doc = render([...term1, ...term2]);
    expect(doc.getNumberOfPages()).toBe(1);
    const [infoTable, subjectTable, summaryTable] = captured.tables;
    expect(infoTable.body.length).toBeGreaterThan(0);

    // Subject rows: #, title, T1(3), T2(3), T3(3), Annual, A.%, DES
    expect(subjectTable.body).toHaveLength(2);
    subjectTable.body.forEach((row: any[]) => {
      expect(row[8]).toBe(''); // Term 3 total
      expect(row[11]).toBe(''); // Annual
      expect(row[12]).toBe(''); // Annual %
      expect(row[13]).toBe(''); // DES / PASS-FAIL
      expect(['40', '38']).toContain(row[2]); // Term 1 marks remain visible
    });

    // TOTAL / PERCENTAGE / POSITION: annual cell is blank in all three rows.
    summaryTable.body.forEach((row: any[]) => { expect(row[4].content).toBe(''); });
    expect(summaryTable.body[1][3].content).toBe(''); // Term 3 percentage
    expect(summaryTable.body[2][3].content).toBe(''); // Term 3 position
  });

  it('shows Annual values and PASS/FAIL once all three terms exist', () => {
    render([...term1, ...term2, ...term3]);
    const [, subjectTable, summaryTable] = captured.tables;
    expect(subjectTable.body[0][11]).toBe('50.0'); // (80 + 70 + 0) / 3
    expect(subjectTable.body[0][12]).toBe('50.0%');
    expect(subjectTable.body[0][13]).toBe('PASS');
    expect(subjectTable.body[0][8]).toBe('0'); // genuine Term 3 zero is visible
    expect(summaryTable.body[0][4].content).not.toBe('');
    expect(summaryTable.body[2][4].content).toBe(''); // no annual position supplied yet
  });

  it('does not show a misleading annual class position for incomplete results', () => {
    render([...term1, ...term2]);
    const summary = captured.tables[2];
    expect(summary.body[2][4].content).toBe('');
  });
});
