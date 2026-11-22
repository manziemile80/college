import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { SearchX, ArrowLeft } from '@/lib/icons';
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="d-flex min-h-screen d-flex flex-column align-items-center justify-content-center bg-background px-4">
      <div className="text-center">
        <div className="mb-6 d-inline-flex h-20 w-20 align-items-center justify-content-center rounded-circle bg-emerald-100">
          <SearchX className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="mb-4 fs-64 fw-bold tracking-tight text-slate-900 sm:fs-80">404</h1>
        <h2 className="mb-2 fs-22 fw-semibold text-slate-900">Page not found</h2>
        <p className="mb-8 max-w-md fs-14 text-slate-500">
          The page you are looking for doesn't exist or has been moved. Let's get you back on track.
        </p>
        <div className="d-flex d-flex flex-column gap-2 sm:d-flex flex-row sm:justify-content-center">
          <Link to="/dashboard">
            <Button className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;



