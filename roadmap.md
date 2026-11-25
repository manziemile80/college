# Integrated School Management System — Spec Rollout

- [x] Database: DOS/DOD roles, discipline rules/incidents, enrollments + history, announcements, audit logs (migrations applied)
- [x] Discipline page (rules, incident reporting, DOD review → behavior deduction)
- [x] Enrollment page (search, enroll, transfer, remove, history)
- [x] Role-specific dashboards (all roles incl. DOS, DOD, stock manager, parent, student, viewer)
- [x] Nav + role badges for DOS/DOD; Stock Dashboard sidebar link added
- [x] Users page: DOS/DOD assignable; Settings: audit log viewer
- [x] Verify typecheck/build and end-to-end role access (admin: Discipline, Enrollment, Settings audit log all load cleanly)
- [x] Enrollment required for quizzes, assignments and attendance (UI gating + Supabase RLS)
- [x] In-app notifications published to related users (bell menu, realtime, triggers for scores/incidents/enrollment/announcements)
- [x] Complete stock module: unique products by SKU, batches + FEFO, stock-in/out RPCs, expiry alerts, movement ledger, valuation, daily/weekly/monthly/annual reports and exports
