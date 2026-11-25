import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Active enrollments for a student, used to gate class activities. */
export function useEnrollment(studentId: string | null) {
  const [enrolledClassIds, setEnrolledClassIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) {
      setEnrolledClassIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('enrollments')
      .select('class_id')
      .eq('student_id', studentId)
      .eq('status', 'active');
    setEnrolledClassIds(new Set((data || []).map((r) => r.class_id).filter(Boolean)));
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    enrolledClassIds,
    isEnrolled: enrolledClassIds.size > 0,
    loading,
    refresh: load,
  };
}
