import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Link2Off, Search } from '@/lib/icons';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  studentId: string;
  studentName: string;
  currentUserId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

interface Candidate {
  user_id: string;
  full_name: string;
  email: string;
}

export function LinkStudentAccountDialog({
  studentId,
  studentName,
  currentUserId,
  open,
  onOpenChange,
  onLinked,
}: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name');
      if (error) toast.error('Failed to load accounts', { description: error.message });
      setCandidates((data as Candidate[]) || []);
      setLoading(false);
    };
    load();
  }, [open]);

  const link = async (userId: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from('students')
      .update({ user_id: userId })
      .eq('id', studentId);
    setSaving(false);
    if (error) {
      toast.error('Failed to update login link', { description: error.message });
      return;
    }
    toast.success(userId ? 'Login account linked' : 'Login account unlinked');
    onLinked();
    onOpenChange(false);
  };

  const filtered = candidates.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;

  return (
    <>
      <div className="bd-modal-backdrop" />
      <div className="bd-modal show">
        <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
              <h5 className="modal-title fw-semibold text-main mb-0">Link login account — {studentName}</h5>
              <button type="button" className="btn-close" onClick={() => onOpenChange(false)} aria-label="Close" />
            </div>
            <div className="modal-body d-flex flex-column gap-3">
              <div className="input-group">
                <span className="input-group-text bg-white border-secondary-subtle">
                  <Search className="text-secondary" />
                </span>
                <input
                  type="search"
                  className="form-control border-secondary-subtle"
                  placeholder="Name or email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search accounts"
                />
              </div>

              {currentUserId && (
                <button
                  type="button"
                  className="btn btn-outline-secondary w-100"
                  disabled={saving}
                  onClick={() => link(null)}
                >
                  <Link2Off />
                  Unlink current account
                </button>
              )}

              <div className="mh-64 overflow-auto rounded-3 bg-secondary-subtle p-1 d-flex flex-column gap-1">
                {loading ? (
                  <div className="d-flex justify-content-center py-6">
                    <span className="spinner-border spinner-border-lg text-success" role="status" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-center py-6 text-muted bd-fs-sm">No accounts found</p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.user_id}
                      type="button"
                      disabled={saving}
                      onClick={() => link(c.user_id)}
                      className={cn(
                        'rounded-3 border border-secondary-subtle bg-white px-3 py-2 d-flex align-items-center justify-content-between',
                        c.user_id === currentUserId && 'border-success bg-success text-white',
                        saving && 'opacity-50',
                      )}
                    >
                      <span>
                        <span className="d-block fw-medium text-main">{c.full_name}</span>
                        <span className="d-block bd-fs-sm text-secondary">{c.email}</span>
                      </span>
                      {c.user_id === currentUserId && (
                        <span className="fw-medium bd-fs-sm">Linked</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
