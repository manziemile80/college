// Custom types for the Conduct app

export type AppRole = 'admin' | 'teacher' | 'parent' | 'student' | 'viewer' | 'stock_manager' | 'dos' | 'dod';

export type BehaviorCategory = 'discipline' | 'respect' | 'attendance' | 'participation';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Class {
  id: string;
  name: string;
  grade_level: string;
  academic_year: string;
  teacher_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string;
  class_id: string | null;
  date_of_birth: string | null;
  enrollment_date: string;
  status: string;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Parent {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentParent {
  id: string;
  student_id: string;
  parent_id: string;
  relationship: string;
  is_primary_contact: boolean;
  created_at: string;
}

export interface BehaviorScore {
  id: string;
  student_id: string;
  teacher_id: string;
  category: BehaviorCategory;
  score: number;
  notes: string | null;
  score_date: string;
  created_at: string;
  updated_at: string;
}

export interface SmsNotification {
  id: string;
  behavior_score_id: string;
  parent_id: string;
  phone_number: string;
  message: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

// Extended types with relations
export interface StudentWithClass extends Student {
  class?: Class | null;
}

export interface BehaviorScoreWithDetails extends BehaviorScore {
  student?: StudentWithClass;
  teacher?: Profile;
}

export interface DisciplineRule {
  id: string;
  title: string;
  description: string | null;
  category: string;
  marks_deduction: number;
  severity: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DisciplineIncident {
  id: string;
  student_id: string;
  class_id: string | null;
  rule_id: string | null;
  reported_by: string;
  incident_date: string;
  description: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  marks_deducted: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  follow_up: string | null;
  behavior_score_id: string | null;
  created_at: string;
  updated_at: string;
  student?: StudentWithClass;
  rule?: DisciplineRule | null;
}

export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  academic_year: string;
  status: 'active' | 'transferred' | 'removed';
  enrolled_by: string;
  created_at: string;
  updated_at: string;
  student?: StudentWithClass;
}

export interface EnrollmentHistory {
  id: string;
  enrollment_id: string;
  action: string;
  details: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
