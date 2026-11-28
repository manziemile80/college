/**
 * Client-side query scoping helpers. These are a UX/data-minimisation layer
 * only — the authoritative enforcement lives in Postgres RLS. Every query is
 * still filtered by RLS even if a client is compromised.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '@/types/database';

export interface Scope {
  /** null = unrestricted (admin / DOS / read-only viewer); [] = no records. */
  studentIds: string[] | null;
  classIds: string[] | null;
  subjectIds: string[] | null;
  /** The signed-in student's own record, when applicable. */
  ownStudentId: string | null;
}

function unrestricted(): Scope {
  return { studentIds: null, classIds: null, subjectIds: null, ownStudentId: null };
}

function none(): Scope {
  return { studentIds: [], classIds: [], subjectIds: [], ownStudentId: null };
}

/** Build the set of records the current user is allowed to work with. */
export async function buildScope(
  supabase: SupabaseClient,
  userId: string | undefined | null,
  roles: readonly AppRole[],
): Promise<Scope> {
  if (!userId) return none();
  if (roles.includes('admin') || roles.includes('dos') || roles.includes('viewer')) return unrestricted();
  if (roles.includes('stock_manager') || roles.includes('storekeeper')) return none();

  const [{ data: own }, { data: taughtClasses }, { data: taughtSubjects }, { data: parentLinks }] = await Promise.all([
    supabase.from('students').select('id, class_id').eq('user_id', userId).maybeSingle(),
    supabase.from('classes').select('id').eq('teacher_id', userId),
    supabase.from('class_subjects').select('class_id, subject_id').eq('teacher_id', userId),
    supabase.from('student_parents')
      .select('student_id, students!inner(id, class_id)')
      .in('parent_id', (await supabase.from('parents').select('id').eq('user_id', userId)).data?.map((p) => p.id) || []),
  ]);

  const classIds = new Set<string>((taughtClasses || []).map((c) => c.id));
  (taughtSubjects || []).forEach((cs) => classIds.add(cs.class_id));

  if (roles.includes('teacher')) {
    const { data: enrolled } = classIds.size
      ? await supabase.from('enrollments').select('student_id').in('class_id', [...classIds]).eq('status', 'active')
      : { data: [] };
    const { data: classStudents } = classIds.size
      ? await supabase.from('students').select('id').in('class_id', [...classIds])
      : { data: [] };
    const studentIds = new Set<string>([
      ...(enrolled || []).map((e) => e.student_id),
      ...(classStudents || []).map((s) => s.id),
    ]);
    return {
      studentIds: [...studentIds],
      classIds: [...classIds],
      subjectIds: [...new Set((taughtSubjects || []).map((cs) => cs.subject_id))],
      ownStudentId: null,
    };
  }

  if (roles.includes('student')) {
    const ownStudentId = own?.id ?? null;
    const linkedClasses = new Set<string>(own?.class_id ? [own.class_id] : []);
    const { data: enrolled } = ownStudentId
      ? await supabase.from('enrollments').select('class_id').eq('student_id', ownStudentId).eq('status', 'active')
      : { data: [] };
    (enrolled || []).forEach((e) => linkedClasses.add(e.class_id));
    const { data: cs } = linkedClasses.size
      ? await supabase.from('class_subjects').select('subject_id').in('class_id', [...linkedClasses])
      : { data: [] };
    return {
      studentIds: ownStudentId ? [ownStudentId] : [],
      classIds: [...linkedClasses],
      subjectIds: [...new Set((cs || []).map((c) => c.subject_id))],
      ownStudentId,
    };
  }

  if (roles.includes('parent')) {
    const studentIds = [...new Set((parentLinks || []).map((l: any) => l.student_id))];
    const linkedClasses = new Set<string>(
      (parentLinks || []).map((l: any) => l.students?.id ? l.students : null).filter(Boolean).map((s: any) => s.class_id),
    );
    const { data: cs } = linkedClasses.size
      ? await supabase.from('class_subjects').select('subject_id').in('class_id', [...linkedClasses])
      : { data: [] };
    return {
      studentIds,
      classIds: [...linkedClasses],
      subjectIds: [...new Set((cs || []).map((c) => c.subject_id))],
      ownStudentId: null,
    };
  }

  // DOD sees discipline data globally but no academic records.
  if (roles.includes('dod')) return { studentIds: null, classIds: null, subjectIds: [], ownStudentId: null };
  return none();
}

export function scopedByStudents<T extends { student_id: string }>(rows: T[], scope: Scope): T[] {
  return scope.studentIds === null ? rows : rows.filter((r) => scope.studentIds!.includes(r.student_id));
}

export function scopedById<T extends { id: string }>(rows: T[], ids: string[] | null): T[] {
  return ids === null ? rows : rows.filter((r) => ids.includes(r.id));
}
