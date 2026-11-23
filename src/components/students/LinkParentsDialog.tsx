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
      <div className="bd-modal-backdrop" />
      <div className="bd-modal show">
        <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
              <h5 className="modal-title fw-semibold text-main mb-0">Link Parents to {studentName}</h5>
              <button type="button" className="btn-close" onClick={() => onOpenChange(false)} aria-label="Close" />
            </div>
            <div className="modal-body d-flex flex-column gap-4">
              {loading ? (
                <div className="d-flex align-items-center justify-content-center py-8">
                  <span className="spinner-border spinner-border-lg text-success" role="status" />
                </div>
              ) : (
                <div className="d-flex flex-column gap-4">
                  <div>
                    <p className="fw-medium text-main mb-2">Linked Parents</p>
                    {linkedParents.length === 0 ? (
                      <p className="text-muted bd-fs-sm">No parents linked yet</p>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        {linkedParents.map((link) => (
                          <div
                            key={link.id}
                            className="d-flex align-items-center justify-content-between gap-3 rounded-3 border border-secondary-subtle p-3"
                          >
                            <div className="d-flex flex-column gap-1 min-w-0">
                              <p className="fw-medium text-main mb-0">{link.parent?.full_name}</p>
                              <div className="d-flex align-items-center gap-2 text-muted bd-fs-sm">
                                <span className="text-capitalize">{link.relationship}</span>
                                {link.is_primary_contact && (
                                  <span className="badge text-bg-primary">Primary</span>
                                )}
                              </div>
                              <p className="text-muted bd-fs-sm mb-0">{link.parent?.phone}</p>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => handleTogglePrimary(link.id, link.is_primary_contact)}
                              >
                                {link.is_primary_contact ? 'Remove Primary' : 'Set Primary'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm d-inline-flex align-items-center"
                                onClick={() => handleUnlinkParent(link.id)}
                                aria-label="Unlink parent"
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {availableParents.length > 0 && (
                    <div className="d-flex flex-column gap-3 border-top border-secondary-subtle pt-3">
                      <p className="fw-medium text-main mb-0">Link New Parent</p>
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
                      <div className="d-flex align-items-center gap-2">
                        <input
                          type="checkbox"
                          id="link-primary"
                          className="form-check-input"
                          checked={isPrimaryContact}
                          onChange={(e) => setIsPrimaryContact(e.target.checked)}
                        />
                        <label htmlFor="link-primary" className="form-check-label text-muted bd-fs-sm fw-normal">
                          Set as primary contact for SMS notifications
                        </label>
                      </div>
                      <div>
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
                    </div>
                  )}

                  {availableParents.length === 0 && parents.length > 0 && (
                    <p className="text-muted bd-fs-sm border-top border-secondary-subtle pt-3">
                      All available parents have been linked to this student.
                    </p>
                  )}

                  {parents.length === 0 && (
                    <p className="text-muted bd-fs-sm border-top border-secondary-subtle pt-3">
                      No parents available. Please add parents first on the Parents page.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
