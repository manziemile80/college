import { existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import { buildStudentReport } from '@/lib/studentReport';
import { calculateStudentAnnual, type MarkRecord } from '@/lib/annualMarks';

const marks: MarkRecord[] = [
  { student_id: 'stu-1', subject_id: 's1', term: 'term1', cat_score: 40, exam_score: 40 },
  { student_id: 'stu-1', subject_id: 's1', term: 'term2', cat_score: 35, exam_score: 35 },
];

function buildPdf(withTerm3: boolean) {
  const allMarks = withTerm3
    ? [...marks, { student_id: 'stu-1', subject_id: 's1', term: 'term3', cat_score: 30, exam_score: 30 } as MarkRecord]
    : marks;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  buildStudentReport({
    doc,
    student: { id: 'stu-1', first_name: 'Sample', last_name: 'Student', student_id: 'R001' },
    cls: { name: 'S3 A', grade_level: 'S3' },
    totalStudents: 25,
    year: '2026',
    marks: allMarks,
    subjects: [{ id: 's1', name: 'Mathematics', code: 'MAT' }],
    result: calculateStudentAnnual(allMarks),
    termPositions: { term1: { 'stu-1': 1 }, term2: { 'stu-1': 1 }, term3: {} },
    annualPosition: withTerm3 ? 1 : null,
  });
  return doc;
}

describe('sample student report PDF regeneration', () => {
  it('generates a report while Term 3 is unavailable', () => {
    const doc = buildPdf(false);
    const bytes = doc.output('arraybuffer') as ArrayBuffer;
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(calculateStudentAnnual(marks).annual.available).toBe(false);
    const file = join(tmpdir(), 'sample-student-report-no-term3.pdf');
    writeFileSync(file, Buffer.from(bytes));
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
  });

  it('generates a report once all terms are available', () => {
    const doc = buildPdf(true);
    expect(doc.getNumberOfPages()).toBe(1);
    const file = join(tmpdir(), 'sample-student-report-complete.pdf');
    writeFileSync(file, Buffer.from(doc.output('arraybuffer') as ArrayBuffer));
    expect(existsSync(file)).toBe(true);
  });
});
