import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCheck } from '@/lib/icons';

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

/** Lets a student user connect their login to their own student record. */
export function ClaimStudentRecordDialog({ open, onOpenChange, onLinked }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('students')
      .select('id, first_name, last_name, student_id')
      .is('user_id', null)
      .order('first_name')
      .then(({ data }) => {
        setRows((data as Row[]) || []);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows.slice(0, 30);
    return rows
      .filter((r) => `${r.first_name} ${r.last_name} ${r.student_id}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [rows, search]);

  const claim = async (row: Row) => {
    if (!user) return;
    setSaving(row.id);
    const { error } = await supabase.from('students').update({ user_id: user.id }).eq('id', row.id);
    setSaving(null);
    if (error) {
      toast({ title: 'Could not connect your profile', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Profile connected', description: `You are now ${row.first_name} ${row.last_name}.` });
    onOpenChange(false);
    onLinked();
  };

  return (
    <>
      {open && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show">
            <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header d-flex align-items-center justify-content-between border-bottom border-secondary-subtle py-3">
                  <h5 className="modal-title fw-semibold text-main mb-0">Find your student profile</h5>
                  <button type="button" className="btn-close" onClick={() => onOpenChange(false)} aria-label="Close" />
                </div>
                <div className="modal-body d-flex flex-column gap-3">
                  <input
                    className="form-control"
                    placeholder="Search your name or student number"
                    value={search}
                    maxLength={80}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search student"
                  />
                  {loading ? (
                    <div className="d-flex justify-content-center py-8">
                      <span className="spinner-border spinner-border-lg text-success" role="status" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-muted bd-fs-sm text-center py-6 mb-0">
                      No matching profile found. Ask your school administrator to add you.
                    </p>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {filtered.map((r) => (
                        <div key={r.id} className="d-flex align-items-center justify-content-between gap-2 rounded-3 border border-secondary-subtle p-3">
                          <div>
                            <p className="fw-medium text-main mb-0">{r.first_name} {r.last_name}</p>
                            <p className="text-muted bd-fs-sm mb-0">{r.student_id}</p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                            disabled={saving === r.id}
                            onClick={() => claim(r)}
                          >
                            {saving === r.id ? (
                              <><span className="spinner-border spinner-border-sm" /> This is me</>
                            ) : (
                              <><UserCheck /> This is me</>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="modal-footer d-flex justify-content-end">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => onOpenChange(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
