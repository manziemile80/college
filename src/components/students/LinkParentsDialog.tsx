import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Parent, StudentParent } from '@/types/database';
import { Loader2, UserPlus, Trash2 } from '@/lib/icons';
import { toast } from 'sonner';

interface LinkParentsDialogProps {
  studentId: string;
  studentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

interface LinkedParent extends StudentParent {
  parent?: Parent;
}

export function LinkParentsDialog({
  studentId,
  studentName,
  open,
  onOpenChange,
  onUpdate,
}: LinkParentsDialogProps) {
  const [parents, setParents] = useState<Parent[]>([]);
  const [linkedParents, setLinkedParents] = useState<LinkedParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // New link form
  const [selectedParentId, setSelectedParentId] = useState('');
  const [relationship, setRelationship] = useState('parent');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, studentId]);

  // Lock the page behind the modal, support Escape and backdrop dismissal.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [parentsRes, linkedRes] = await Promise.all([
        supabase.from('parents').select('*').order('full_name'),
        supabase
          .from('student_parents')
          .select('*, parent:parents(*)')
          .eq('student_id', studentId),
      ]);

      if (parentsRes.data) {
        setParents(parentsRes.data);
      }
      if (linkedRes.data) {
        setLinkedParents(linkedRes.data as LinkedParent[]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load parents');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkParent = async () => {
    if (!selectedParentId) {
      toast.error('Please select a parent');
      return;
    }

    if (linkedParents.some((lp) => lp.parent_id === selectedParentId)) {
      toast.error('This parent is already linked to this student');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('student_parents').insert({
        student_id: studentId,
        parent_id: selectedParentId,
        relationship,
        is_primary_contact: isPrimaryContact,
      });

      if (error) throw error;

      toast.success('Parent linked successfully');
      setSelectedParentId('');
      setRelationship('parent');
      setIsPrimaryContact(false);
      fetchData();
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to link parent', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkParent = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from('student_parents')
        .delete()
        .eq('id', linkId);

      if (error) throw error;

      toast.success('Parent unlinked');
      fetchData();
      onUpdate();
    } catch (error: any) {
      toast.error('Failed to unlink parent', { description: error.message });
    }
  };

  const handleTogglePrimary = async (linkId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('student_parents')
        .update({ is_primary_contact: !currentValue })
        .eq('id', linkId);

      if (error) throw error;

      fetchData();
    } catch (error: any) {
      toast.error('Failed to update', { description: error.message });
    }
  };

  const availableParents = parents.filter(
    (p) => !linkedParents.some((lp) => lp.parent_id === p.id)
  );

  if (!open) return null;

  return (
    <>
      <div
        className="bd-modal-backdrop"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="bd-modal show"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}
      >
        <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-parents-title"
          >
            <div className="modal-header d-flex justify-content-between align-items-start gap-3 py-3">
              <div className="min-w-0">
                <h5 id="link-parents-title" className="modal-title fw-semibold text-main mb-0">
                  Link Parents
                </h5>
                <p className="text-muted bd-fs-sm mb-0 mt-1 text-truncate">{studentName}</p>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                title="Close"
              />
            </div>

            <div className="modal-body d-flex flex-column gap-3">
              {loading ? (
                <div className="d-flex align-items-center justify-content-center py-8">
                  <Loader2 className="fs-3 text-success" />
                  <span className="visually-hidden">Loading parents…</span>
                </div>
              ) : (
                <>
                  <section className="modal-section">
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                      <h6 className="fw-semibold text-main mb-0">Linked Parents</h6>
                      <span className="badge text-bg-secondary">{linkedParents.length}</span>
                    </div>

                    {linkedParents.length === 0 ? (
                      <p className="text-muted bd-fs-sm mb-0">No parents are linked to this student yet.</p>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        {linkedParents.map((link) => (
                          <div
                            key={link.id}
                            className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between gap-3 rounded-3 border border-secondary-subtle p-3"
                          >
                            <div className="d-flex flex-column gap-1 min-w-0 flex-grow-1">
                              <p className="fw-medium text-main mb-0 text-truncate">
                                {link.parent?.full_name || 'Parent'}
                              </p>
                              <div className="d-flex align-items-center gap-2 text-muted bd-fs-sm flex-wrap">
                                <span className="text-capitalize">{link.relationship}</span>
                                {link.is_primary_contact && (
                                  <span className="badge text-bg-primary">Primary</span>
                                )}
                              </div>
                              <p className="text-muted bd-fs-sm mb-0">{link.parent?.phone || '—'}</p>
                            </div>
                            <div className="d-flex align-items-center gap-2 flex-shrink-0 flex-wrap">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => handleTogglePrimary(link.id, link.is_primary_contact)}
                              >
                                {link.is_primary_contact ? 'Remove Primary' : 'Set Primary'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1"
                                onClick={() => handleUnlinkParent(link.id)}
                                aria-label={`Unlink ${link.parent?.full_name || 'parent'}`}
                              >
                                <Trash2 />
                                <span>Unlink</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {availableParents.length > 0 && (
                    <section className="modal-section">
                      <h6 className="fw-semibold text-main mb-1">Link New Parent</h6>
                      <p className="text-muted bd-fs-sm mb-3">
                        Select a parent, choose the relationship and optionally set them as the primary contact.
                      </p>

                      <div className="row g-3">
                        <div className="col-12 col-sm-6">
                          <label htmlFor="link-parent" className="form-label">Parent</label>
                          <select
                            id="link-parent"
                            className="form-select"
                            value={selectedParentId}
                            onChange={(e) => setSelectedParentId(e.target.value)}
                          >
                            <option value="">Select a parent</option>
                            {availableParents.map((parent) => (
                              <option key={parent.id} value={parent.id}>
                                {parent.full_name} ({parent.phone})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-12 col-sm-6">
                          <label htmlFor="link-relationship" className="form-label">Relationship</label>
                          <select
                            id="link-relationship"
                            className="form-select"
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                          >
                            <option value="parent">Parent</option>
                            <option value="guardian">Guardian</option>
                            <option value="mother">Mother</option>
                            <option value="father">Father</option>
                            <option value="grandparent">Grandparent</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-2 mt-3">
                        <input
                          type="checkbox"
                          id="link-primary"
                          className="form-check-input"
                          checked={isPrimaryContact}
                          onChange={(e) => setIsPrimaryContact(e.target.checked)}
                        />
                        <label htmlFor="link-primary" className="form-check-label text-muted bd-fs-sm fw-normal mb-0">
                          Set as primary contact for SMS notifications
                        </label>
                      </div>

                      <div className="d-flex justify-content-end mt-3">
                        <button
                          type="button"
                          className="btn btn-success d-inline-flex align-items-center gap-1"
                          disabled={saving || !selectedParentId}
                          onClick={handleLinkParent}
                        >
                          {saving ? (
                            <>
                              <span className="spinner-border spinner-border-sm" />
                              Linking...
                            </>
                          ) : (
                            <>
                              <UserPlus />
                              Link Parent
                            </>
                          )}
                        </button>
                      </div>
                    </section>
                  )}

                  {availableParents.length === 0 && parents.length > 0 && (
                    <section className="modal-section">
                      <p className="text-muted bd-fs-sm mb-0">
                        All available parents have been linked to this student.
                      </p>
                    </section>
                  )}

                  {parents.length === 0 && (
                    <section className="modal-section">
                      <p className="text-muted bd-fs-sm mb-0">
                        No parents available. Please add parents first on the Parents page.
                      </p>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
