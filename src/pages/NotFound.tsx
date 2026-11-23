import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { SearchX, ArrowLeft } from '@/lib/icons';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-vh-100 bg-body d-flex flex-column align-items-center justify-content-center px-4">
      <div className="text-center">
        <div className="mb-5 d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-4">
          <SearchX className="fs-5 text-success" />
        </div>
        <h1 className="mb-4 fs-5 fw-bold tracking-tight text-main">404</h1>
        <h2 className="mb-2 fw-semibold text-main">Page not found</h2>
        <p className="mb-8 max-w-md text-muted bd-fs-md mb-0">
          The page you are looking for doesn't exist or has been moved. Let's get you back on track.
        </p>
        <div className="d-flex flex-wrap align-items-center justify-content-center gap-2">
          <Link to="/dashboard">
            <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1"><ArrowLeft /> Back to Dashboard</button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
