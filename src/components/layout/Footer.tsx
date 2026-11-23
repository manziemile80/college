import schoolLogo from '@/assets/college-rebero-logo.png';
import { MapPin, Phone, Mail, Building2, ArrowUpRight } from '@/lib/icons';

// The app's live deployment link (Vercel).
const LIVE_SITE_URL = 'https://college-mis-beta.vercel.app/';

export function Footer() {
  return (
    <footer className="mt-8 border-top border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="row g-4 row-cols-1 row-cols-md-2 row-cols-xl-4">
          <div className="col d-flex align-items-center flex-wrap g-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-9 w-9 object-contain" />
            <div className="min-w-0">
              <p className="fw-semibold text-slate-900">College De Rebero</p>
              <p className="fs-12 text-muted-foreground">Behavior Management System</p>
            </div>
            <a
              href={LIVE_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the live site"
              className="d-inline-flex w-100 flex-wrap align-items-center gap-2 mt-1 rounded-[8px] border border-slate-200 bg-white px-3 py-2 text-start fs-13 fw-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
            >
              Live site
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
            </a>
          </div>

          <div className="col space-y-2">
            <p className="fs-12 fw-semibold text-uppercase tracking-wider text-slate-600">School</p>
            <ul className="space-y-1.5 fs-12.5 text-muted-foreground">
              <li><span className="d-inline-flex align-items-center g-2"><Building2 className="h-3.5 w-3.5 text-emerald-600" /> East Campus, Kigali</span></li>
              <li><span className="d-inline-flex align-items-center g-2"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> Gicumbi, Ruvune, Rebero</span></li>
            </ul>
          </div>

          <div className="col space-y-2">
            <p className="fs-12 fw-semibold text-uppercase tracking-wider text-slate-600">Contact</p>
            <ul className="space-y-1.5 fs-12.5 text-muted-foreground">
              <li><span className="d-inline-flex align-items-center g-2"><Phone className="h-3.5 w-3.5 text-emerald-600" /> +250 788 000 000</span></li>
              <li><span className="d-inline-flex align-items-center g-2"><Mail className="h-3.5 w-3.5 text-emerald-600" /> info@collegederebero.rw</span></li>
            </ul>
          </div>

          <div className="col space-y-2">
            <p className="fs-12 fw-semibold text-uppercase tracking-wider text-slate-600">Excellence Â· Discipline Â· Integrity</p>
            <p className="fs-12.5 text-muted-foreground">
              Â© {new Date().getFullYear()} College De Rebero. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}





