import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText, Plus, Clock, CheckCircle, CheckCircle2, XCircle, Loader2,
  RefreshCw, ShieldCheck, ScrollText,
} from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/** New RPCs/table are not in the generated client types yet. */
const db = supabase as any;

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

interface CertificateRequest {
  id: string;
  student_id: string;
  request_type: string;
  reason: string | null;
  status: RequestStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

const REQUEST_TYPES = [
  'Enrollment certificate',
  'Academic transcript',
  'Good conduct certificate',
  'Transfer certificate',
  'Other',
];

const statusMeta: Record<RequestStatus, { label: string; badge: string; icon: React.ComponentType<any> }> = {
  pending: { label: 'Pending', badge: 'badge text-bg-warning', icon: Clock },
  approved: { label: 'Approved', badge: 'badge text-bg-success', icon: CheckCircle },
  rejected: { label: 'Rejected', badge: 'badge text-bg-danger', icon: XCircle },
  completed: { label: 'Completed', badge: 'badge text-bg-primary', icon: CheckCircle2 },
};

export default function Certificates() {
  const { user, roles, can } = useAuth();
  const isReviewer = roles.includes('admin') || roles.includes('dos');
  const isParent = roles.includes('parent');
  const canRequest = roles.includes('student') || can('certificates.request');

  const [requests, setRequests] = useState<CertificateRequest[]>([]);
  const [studentNames, setStudentNames] = useState<Map<string, string>>(new Map());
  const [ownStudentId, setOwnStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');

  const [requestType, setRequestType] = useState(REQUEST_TYPES[0]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<CertificateRequest | null>(null);
  const [reviewStatus, setReviewStatus] = useState<RequestStatus>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Resolve the current student record for student requests.
      let studentId: string | null = null;
      if (canRequest && !isReviewer) {
        const { data } = await supabase
          .from('students')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        studentId = data?.id ?? null;
        setOwnStudentId(studentId);
      }

      // Resolve linked children for parents.
      let childIds: string[] = [];
      if (isParent) {
        const { data: parent } = await supabase
          .from('parents')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (parent) {
          const { data: links } = await supabase
            .from('student_parents')
            .select('student_id')
            .eq('parent_id', parent.id);
          childIds = (links || []).map((link: { student_id: string }) => link.student_id);
        }
      }

      // RLS scopes this to own / child / assigned students for other roles,
      // and returns everything for admins and DOS.
      const { data: studentRows } = await supabase
        .from('students')
        .select('id, first_name, last_name, student_id');
      const names = new Map<string, string>();
      (studentRows || []).forEach((s) => {
        names.set(s.id, `${s.first_name} ${s.last_name} (${s.student_id})`);
      });
      setStudentNames(names);

      if (isParent && childIds.length === 0) {
        setRequests([]);
        return;
      }

      let query = db.from('certificate_requests').select('*').order('created_at', { ascending: false });
      if (studentId) query = query.eq('student_id', studentId);
      else if (isParent) query = query.in('student_id', childIds);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setRequests((data as CertificateRequest[]) || []);
    } catch (err: any) {
      console.error('Failed to load certificate requests:', err);
      setError(err?.message || 'Failed to load certificate requests');
    } finally {
      setLoading(false);
    }
  }, [user, canRequest, isReviewer, isParent]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRequests = useMemo(
    () => (statusFilter === 'all' ? requests : requests.filter((r) => r.status === statusFilter)),
    [requests, statusFilter],
  );

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRequest) return;
    if (!requestType) return toast.error('Select a certificate type');
    setSubmitting(true);
    try {
      await db.rpc('create_certificate_request', {
        _request_type: requestType,
        _reason: reason.trim() || null,
      });
      toast.success('Certificate request submitted');
      setReason('');
      setRequestType(REQUEST_TYPES[0]);
      await load();
    } catch (err: any) {
      toast.error('Failed to submit request', { description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openReview = (request: CertificateRequest) => {
    setReviewTarget(request);
    setReviewStatus(request.status === 'pending' ? 'approved' : 'completed');
    setReviewNote('');
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setSavingReview(true);
    try {
      const { error: rpcError } = await db.rpc('review_certificate_request', {
        _request_id: reviewTarget.id,
        _status: reviewStatus,
        _note: reviewNote.trim() || null,
      });
      if (rpcError) throw rpcError;
      toast.success(`Request marked ${reviewStatus}`);
      setReviewTarget(null);
      await load();
    } catch (err: any) {
      toast.error('Failed to review request', { description: err?.message });
    } finally {
      setSavingReview(false);
    }
  };

  const roleHint = isReviewer
    ? 'Review and track all certificate requests across the school.'
    : isParent
      ? 'Requests submitted by your linked children.'
      : canRequest
        ? 'Submit and track your own certificate requests.'
        : 'Certificate requests for students in your scope (read-only).';

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Student services"
          title="Certificates"
          description={roleHint}
          actions={
            <span className="badge text-bg-warning d-inline-flex align-items-center gap-1">
              <Clock /> {pendingCount} pending
            </span>
          }
        />

        {canRequest && (
          <div className="card">
            <div className="card-header d-flex align-items-start gap-3 py-3">
              <span className="d-inline-flex align-items-center justify-content-center rounded-circle p-2 text-success">
                <Plus className="fs-5" />
              </span>
              <div>
                <h5 className="fw-semibold text-main mb-0">Request a certificate</h5>
                <p className="text-muted bd-fs-sm mb-0">Your request will be sent to the Director of Studies and administrators.</p>
              </div>
            </div>
            <div className="card-body">
              {!ownStudentId && !loading ? (
                <div className="rounded-3 bg-warning-subtle p-3 bd-fs-sm text-secondary mb-0">
                  No student record is linked to your account yet. Ask an administrator to link it before
                  requesting a certificate.
                </div>
              ) : (
                <form className="row g-3 align-items-end" onSubmit={handleSubmitRequest}>
                  <div className="col-12 col-md-5">
                    <label className="form-label" htmlFor="certificate-type">Certificate type</label>
                    <select
                      id="certificate-type"
                      className="form-select"
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value)}
                    >
                      {REQUEST_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-5">
                    <label className="form-label" htmlFor="certificate-reason">Reason (optional)</label>
                    <textarea
                      id="certificate-reason"
                      className="form-control"
                      rows={2}
                      maxLength={1000}
                      placeholder="Why do you need this certificate?"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-md-2 d-flex">
                    <button type="submit" className="btn btn-success w-100 d-inline-flex align-items-center justify-content-center gap-1" disabled={submitting}>
                      {submitting ? <><span className="spinner-border spinner-border-sm" /> Sending…</> : <><Plus /> Submit</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header d-flex align-items-center justify-content-between gap-3 py-3 flex-wrap">
            <div>
              <h5 className="fw-semibold text-main mb-0">Certificate requests</h5>
              <p className="text-muted bd-fs-sm mb-0">
                {isReviewer ? 'All requests' : isParent ? 'Your children' : 'Your requests'}
              </p>
            </div>
            <div className="d-flex align-items-center gap-2">
              <select
                className="form-select form-select-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | RequestStatus)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {(Object.keys(statusMeta) as RequestStatus[]).map((status) => (
                  <option key={status} value={status}>{statusMeta[status].label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw /> Refresh
              </button>
            </div>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex align-items-center justify-content-center py-8">
                <Loader2 className="fs-3 text-success" />
                <span className="visually-hidden">Loading certificate requests…</span>
              </div>
            ) : error ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-10 text-center gap-2">
                <XCircle className="fs-3 text-danger" />
                <p className="fw-medium text-main mb-0">Could not load certificate requests</p>
                <p className="text-muted bd-fs-sm mb-2">{error}</p>
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void load()}>
                  <RefreshCw /> Try again
                </button>
              </div>
            ) : visibleRequests.length === 0 ? (
              <div className="d-flex flex-column align-items-center justify-content-center py-10 text-center">
                <FileText className="fs-3 mb-4 text-secondary" />
                <h3 className="fw-semibold text-main mb-2">No requests found</h3>
                <p className="text-secondary bd-fs-sm mb-0">
                  {statusFilter === 'all'
                    ? 'Certificate requests will appear here when they are submitted.'
                    : `No requests with status “${statusMeta[statusFilter].label}”.`}
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="border-bottom border-secondary-subtle">
                      <th scope="col">Student</th>
                      <th scope="col">Type</th>
                      <th scope="col">Reason</th>
                      <th scope="col">Status</th>
                      <th scope="col">Dates</th>
                      <th scope="col">Review</th>
                      <th scope="col" className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.map((request) => {
                      const meta = statusMeta[request.status] || statusMeta.pending;
                      const Icon = meta.icon;
                      return (
                        <tr key={request.id} className="border-bottom border-secondary-subtle">
                          <td className="text-main bd-fs-sm fw-medium text-nowrap">
                            {studentNames.get(request.student_id) || 'Student'}
                          </td>
                          <td className="text-main bd-fs-sm">{request.request_type}</td>
                          <td className="text-muted bd-fs-sm" style={{ maxWidth: '16rem' }}>
                            {request.reason || '—'}
                          </td>
                          <td>
                            <span className={cn(meta.badge, 'd-inline-flex align-items-center gap-1')}>
                              <Icon /> {meta.label}
                            </span>
                          </td>
                          <td className="text-muted bd-fs-sm text-nowrap">
                            <span className="d-block">Requested {format(new Date(request.created_at), 'MMM d, yyyy')}</span>
                            {request.reviewed_at && (
                              <span className="d-block">Reviewed {format(new Date(request.reviewed_at), 'MMM d, yyyy')}</span>
                            )}
                          </td>
                          <td className="text-muted bd-fs-sm" style={{ maxWidth: '14rem' }}>
                            {request.review_note || '—'}
                          </td>
                          <td className="text-end">
                            {isReviewer ? (
                              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => openReview(request)}>
                                <ShieldCheck /> Review
                              </button>
                            ) : (
                              <span className="text-muted bd-fs-sm">
                                {canRequest ? '—' : 'Read only'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {!isReviewer && !canRequest && !loading && (
          <div className="d-flex align-items-center gap-2 text-muted bd-fs-sm">
            <ScrollText /> Showing only records your role is permitted to view.
          </div>
        )}

        {/* Review modal */}
        {reviewTarget && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">Review certificate request</h5>
                    <button type="button" className="btn-close" onClick={() => setReviewTarget(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <p className="text-muted bd-fs-sm mb-0">
                      {studentNames.get(reviewTarget.student_id) || 'Student'} — {reviewTarget.request_type}
                    </p>
                    {reviewTarget.reason && (
                      <div className="rounded-3 bg-secondary-subtle p-3 bd-fs-sm text-secondary mb-0">
                        {reviewTarget.reason}
                      </div>
                    )}
                    <div>
                      <label className="form-label" htmlFor="review-status">New status</label>
                      <select
                        id="review-status"
                        className="form-select"
                        value={reviewStatus}
                        onChange={(e) => setReviewStatus(e.target.value as RequestStatus)}
                      >
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                        <option value="completed">Mark completed</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label" htmlFor="review-note">Note (optional)</label>
                      <textarea
                        id="review-note"
                        className="form-control"
                        rows={3}
                        maxLength={1000}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Add a note for the student and parents"
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setReviewTarget(null)}>Cancel</button>
                    <button type="button" className="btn btn-success" disabled={savingReview} onClick={handleReview}>
                      {savingReview ? <><span className="spinner-border spinner-border-sm" /> Saving…</> : 'Save review'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
