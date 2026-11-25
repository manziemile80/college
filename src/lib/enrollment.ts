/**
 * A student may only take part in a class activity when they have at least one
 * active enrollment and, for activities tied to a class, they are enrolled in
 * that specific class.
 */
export function canAccessClass(
  enrolledClassIds: Set<string>,
  classId: string | null | undefined,
): boolean {
  if (enrolledClassIds.size === 0) return false;
  return !classId || enrolledClassIds.has(classId);
}
