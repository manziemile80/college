import { describe, expect, it } from 'vitest';
import {
  applyBackendAnnual,
  calculateAnnualFromTerms,
  calculateStudentAnnual,
  calculateSubjectAnnual,
  calculateTermResults,
  formatAnnualStatus,
  formatMark,
  markTotal,
  nullableNumber,
  validScore,
  type MarkRecord,
} from '@/lib/annualMarks';

const mark = (term: string, cat: number | null, exam: number | null, subject = 's1'): MarkRecord => ({
  student_id: 'stu-1',
  subject_id: subject,
  term,
  cat_score: cat,
  exam_score: exam,
});

describe('annual marks calculation', () => {
  it('leaves Annual NULL when only Term 1 is available', () => {
    const result = calculateStudentAnnual([mark('term1', 40, 40)]);
    expect(result.terms.term1.total).toBe(80);
    expect(result.terms.term2.total).toBeNull();
    expect(result.terms.term3.total).toBeNull();
    expect(result.annual.total).toBeNull();
    expect(result.annual.percentage).toBeNull();
    expect(result.annual.available).toBe(false);
    expect(formatMark(result.annual.percentage, 2)).toBe('');
  });

  it('leaves Annual NULL when Term 1 and Term 2 exist but Term 3 is missing', () => {
    const result = calculateStudentAnnual([mark('term1', 40, 40), mark('term2', 35, 35)]);
    expect(result.terms.term1.total).toBe(80);
    expect(result.terms.term2.total).toBe(70);
    expect(result.annual.total).toBeNull();
    expect(result.annual.percentage).toBeNull();
    expect(result.annual.available).toBe(false);
    // No PASS/FAIL from an incomplete annual result.
    expect(formatAnnualStatus(result.annual)).toBe('');
  });

  it('calculates the annual average only when all three terms have marks', () => {
    const result = calculateStudentAnnual([
      mark('term1', 40, 40), mark('term2', 35, 35), mark('term3', 30, 30),
    ]);
    expect(result.annual.available).toBe(true);
    expect(result.annual.total).toBe(210);
    expect(result.annual.percentage).toBe(70);
    expect(formatMark(result.annual.percentage, 2)).toBe('70.00');
    expect(formatAnnualStatus(result.annual)).toBe('PASS');
  });

  it('treats a genuine Term 3 score of zero as a valid result, not as missing', () => {
    const result = calculateStudentAnnual([
      mark('term1', 40, 40), mark('term2', 35, 35), mark('term3', 0, 0),
    ]);
    expect(result.terms.term3.total).toBe(0);
    expect(result.terms.term3.count).toBe(1);
    expect(result.annual.available).toBe(true);
    expect(result.annual.total).toBe(150);
    expect(result.annual.percentage).toBe(50);
    expect(formatMark(result.terms.term3.total)).toBe('0');
    expect(formatAnnualStatus(result.annual)).toBe('PASS');
  });

  it('never copies Term 1 or Term 2 marks into the Annual result', () => {
    const onlyTerm1 = calculateTermResults([mark('term1', 40, 40)]);
    const onlyTerm1And2 = calculateTermResults([mark('term1', 40, 40), mark('term2', 35, 35)]);
    expect(calculateAnnualFromTerms(onlyTerm1).total).toBeNull();
    expect(calculateAnnualFromTerms(onlyTerm1And2).total).toBeNull();
  });

  it('distinguishes a missing score from a genuine zero score', () => {
    expect(validScore(null)).toBeNull();
    expect(validScore(undefined)).toBeNull();
    expect(validScore('')).toBeNull();
    expect(validScore(0)).toBe(0);
    expect(markTotal(mark('term3', null, 50))).toBeNull();
    expect(markTotal(mark('term3', 0, 0))).toBe(0);
    expect(nullableNumber('0')).toBe(0);
  });

  it('returns NULL for students without any marks', () => {
    const result = calculateStudentAnnual([]);
    expect(result.annual.total).toBeNull();
    expect(result.annual.percentage).toBeNull();
  });

  it('honours backend NULL annual values instead of defaulting them to 0', () => {
    const local = calculateStudentAnnual([mark('term1', 40, 40), mark('term2', 35, 35)]);
    const backend = applyBackendAnnual(local, {
      student_id: 'stu-1',
      term1_total: 80, term1_count: 1,
      term2_total: 70, term2_count: 1,
      term3_total: null, term3_count: 0,
      annual_total: null, annual_percentage: null, annual_available: false,
    });
    expect(backend.annual.total).toBeNull();
    expect(backend.annual.percentage).toBeNull();
    expect(backend.annual.available).toBe(false);
  });

  it('treats backend zero totals as valid and calculates the annual result', () => {
    const local = calculateStudentAnnual([]);
    const backend = applyBackendAnnual(local, {
      student_id: 'stu-1',
      term1_total: 80, term1_count: 1,
      term2_total: 70, term2_count: 1,
      term3_total: 0, term3_count: 1,
      annual_total: 150, annual_percentage: 50, annual_available: true,
    });
    expect(backend.terms.term3.total).toBe(0);
    expect(backend.annual.total).toBe(150);
    expect(backend.annual.percentage).toBe(50);
  });
});

describe('subject-level annual mark', () => {
  it('is blank without Term 3 and correct with a zero Term 3', () => {
    expect(calculateSubjectAnnual([mark('term1', 40, 40), mark('term2', 35, 35)])).toBeNull();
    expect(calculateSubjectAnnual([
      mark('term1', 40, 40), mark('term2', 35, 35), mark('term3', 0, 0),
    ])).toBe(50);
  });
});
