import { Link } from 'react-router-dom';
import { ShieldAlert } from '@/lib/icons';

/** Proper 403 response for an authenticated user without the required permission. */
export function Forbidden() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-body p-3">
      <div className="card shadow-sm" style={{ maxWidth: 460 }}>
        <div className="card-body text-center p-5">
          <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-danger-subtle p-3 text-danger mb-3">
            <ShieldAlert className="fs-3" />
          </div>
          <h1 className="fs-3 fw-bold text-main mb-2">403 — Forbidden</h1>
          <p className="text-secondary bd-fs-sm mb-4">
            Your account does not have permission to open this module. If you believe this is a mistake,
            ask an administrator to review your roles and permissions.
          </p>
          <Link to="/dashboard" className="btn btn-primary">Back to my dashboard</Link>
        </div>
      </div>
    </div>
  );
}

export default Forbidden;
