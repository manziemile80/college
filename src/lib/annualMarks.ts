/**
 * Single source of truth for annual (yearly) assessment results.
 *
 * Rules (shared by the UI and the report generator):
 *  - A mark only exists when a saved row has numeric CAT and Exam scores.
 *  - A genuine score of zero is a valid mark; a missing score is not.
 *  - The annual result is calculated only when Term 1, Term 2 AND Term 3
 *    all have at least one valid mark. Otherwise every annual field is
 *    NULL (rendered as an empty value), never 0 and never copied from
 *    Term 1 or Term 2.
 */

export type Term = 'term1' | 'term2' | 'term3';
export const TERMS: Term[] = ['term1', 'term2', 'term3'];

export interface MarkRecord {
  term: Term | string;
  cat_score: number | string | null | undefined;
  exam_score: number | string | null | undefined;
  student_id?: string;
  subject_id?: string;
}

export interface TermResult {
  /** NULL when the term has no saved, valid marks (zero is valid). */
  total: number | null;
  count: number;
  /** NULL when the term has no saved, valid marks. */
  percentage: number | null;
}

export interface AnnualResult {
  /** NULL unless all three terms have valid marks. */
  total: number | null;
  /** NULL unless all three terms have valid marks. */
  percentage: number | null;
  available: boolean;
}

export interface BackendAnnualRow {
  student_id: string;
  term1_total: number | string | null;
  term1_count: number | string | null;
  term2_total: number | string | null;
  term2_count: number | string | null;
  term3_total: number | string | null;
  term3_count: number | string | null;
  annual_total: number | string | null;
  annual_percentage: number | string | null;
  annual_available: boolean | null;
}

export interface StudentAnnualResult {
  terms: Record<Term, TermResult>;
  annual: AnnualResult;
}

/** Convert database numeric/text values to a number, keeping NULL as NULL. */
export function nullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A missing/invalid score is NULL. Zero is a perfectly valid score. */
export function validScore(value: number | string | null | undefined): number | null {
  const n = nullableNumber(value);
  return n !== null && n >= 0 ? n : null;
}

/** NULL for a missing mark row; 0 is only returned for a genuine 0+0 result. */
export function markTotal(mark: MarkRecord): number | null {
  const cat = validScore(mark.cat_score);
  const exam = validScore(mark.exam_score);
  return cat === null || exam === null ? null : cat + exam;
}

export function emptyTermResult(): TermResult {
  return { total: null, count: 0, percentage: null };
}

export function emptyAnnualResult(): AnnualResult {
  return { total: null, percentage: null, available: false };
}

export function emptyStudentAnnualResult(): StudentAnnualResult {
  return {
    terms: { term1: emptyTermResult(), term2: emptyTermResult(), term3: emptyTermResult() },
    annual: emptyAnnualResult(),
  };
}

function isTerm(value: string): value is Term {
  return (TERMS as string[]).includes(value);
}

/** Aggregate saved marks per term. Missing rows are skipped, zero rows are kept. */
export function calculateTermResults(marks: readonly MarkRecord[]): Record<Term, TermResult> {
  const terms: Record<Term, TermResult> = {
    term1: emptyTermResult(),
    term2: emptyTermResult(),
    term3: emptyTermResult(),
  };
  marks.forEach((mark) => {
    if (!mark || !isTerm(String(mark.term))) return;
    const total = markTotal(mark);
    if (total === null) return;
    const term = terms[mark.term as Term];
    term.total = (term.total ?? 0) + total;
    term.count += 1;
  });
  TERMS.forEach((term) => {
    const result = terms[term];
    result.percentage = result.count > 0 && result.total !== null ? result.total / result.count : null;
  });
  return terms;
}

/**
 * Annual = average of all valid term marks, but ONLY when every term has
 * results. Term 1/Term 2 on their own never produce an annual result.
 */
export function calculateAnnualFromTerms(terms: Record<Term, TermResult>): AnnualResult {
  const available = TERMS.every((term) => terms[term].count > 0 && terms[term].total !== null);
  if (!available) return emptyAnnualResult();
  const total = TERMS.reduce((sum, term) => sum + (terms[term].total ?? 0), 0);
  const count = TERMS.reduce((sum, term) => sum + terms[term].count, 0);
  return {
    total,
    percentage: count > 0 ? total / count : null,
    available: true,
  };
}

export function calculateStudentAnnual(marks: readonly MarkRecord[]): StudentAnnualResult {
  const terms = calculateTermResults(marks);
  return { terms, annual: calculateAnnualFromTerms(terms) };
}

/**
 * Subject-level annual mark: the mean of the three term totals, and EMPTY
 * unless all three terms exist. A term total of zero counts as a real mark.
 */
export function calculateSubjectAnnual(marks: readonly MarkRecord[]): number | null {
  const terms = calculateTermResults(marks);
  if (!TERMS.every((term) => terms[term].total !== null)) return null;
  const total = TERMS.reduce((sum, term) => sum + (terms[term].total ?? 0), 0);
  return total / TERMS.length;
}

/**
 * Override locally derived values with the authoritative backend result
 * (RPC `get_class_annual_results`). Backend NULLs stay NULL; they are never
 * defaulted to zero or replaced with an earlier term's mark.
 */
export function applyBackendAnnual(
  local: StudentAnnualResult,
  row: BackendAnnualRow | null | undefined,
): StudentAnnualResult {
  if (!row) return local;
  const terms: Record<Term, TermResult> = { ...local.terms };
  TERMS.forEach((term) => {
    const total = nullableNumber(row[`${term}_total` as keyof BackendAnnualRow] as number | string | null);
    const count = nullableNumber(row[`${term}_count` as keyof BackendAnnualRow] as number | string | null);
    terms[term] = total !== null && count !== null && count > 0
      ? { total, count, percentage: total / count }
      : emptyTermResult();
  });
  const available = row.annual_available === true && nullableNumber(row.annual_total) !== null;
  const annual: AnnualResult = available
    ? {
        total: nullableNumber(row.annual_total),
        percentage: nullableNumber(row.annual_percentage) ?? calculateAnnualFromTerms(terms).percentage,
        available: true,
      }
    : emptyAnnualResult();
  return { terms, annual };
}

/** Format a possibly-NULL value for the UI/PDF: NULL becomes an empty string. */
export function formatMark(value: number | null | undefined, decimals = 0): string {
  const n = nullableNumber(value);
  return n === null ? '' : n.toFixed(decimals);
}

/** PASS/FAIL is only meaningful for a complete annual result. */
export function formatAnnualStatus(annual: AnnualResult): string {
  return annual.available && annual.percentage !== null
    ? annual.percentage >= 50 ? 'PASS' : 'FAIL'
    : '';
}
