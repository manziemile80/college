import schoolLogo from '@/assets/college-rebero-logo.png';
import { MapPin, Phone, Mail, Building2, ArrowUpRight } from '@/lib/icons';

// The app's live deployment link (Vercel).
const LIVE_SITE_URL = 'https://college-mis-beta.vercel.app/';

export function Footer() {
  return (
    <footer className="mt-6 border-top border-secondary-subtle pt-4 pb-6 text-main">
      <div className="row g-4">
        <div className="col-12 col-sm-6 col-lg-3 d-flex flex-column gap-3">
          <div className="d-flex align-items-center gap-2">
            <img src={schoolLogo} alt="College De Rebero" width={36} height={36} className="object-contain" />
            <div>
              <p className="fw-semibold mb-0">College De Rebero</p>
              <p className="text-muted bd-fs-sm mb-0">Behavior Management System</p>
            </div>
          </div>
          <a
            href={LIVE_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline-primary btn-sm w-100 d-inline-flex align-items-center justify-content-center gap-1"
            aria-label="Open the live site"
          >
            Live site
            <ArrowUpRight className="bd-fs-sm" />
          </a>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <p className="fw-semibold mb-3">School</p>
          <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
            <li className="d-flex align-items-center gap-2 text-muted bd-fs-sm"><Building2 /> East Campus, Kigali</li>
            <li className="d-flex align-items-center gap-2 text-muted bd-fs-sm"><MapPin /> Gicumbi, Ruvune, Rebero</li>
          </ul>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <p className="fw-semibold mb-3">Contact</p>
          <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
            <li className="d-flex align-items-center gap-2 text-muted bd-fs-sm"><Phone /> +250 788 000 000</li>
            <li className="d-flex align-items-center gap-2 text-muted bd-fs-sm"><Mail /> info@collegederebero.rw</li>
          </ul>
        </div>

        <div className="col-12 col-sm-6 col-lg-3 d-flex flex-column justify-content-end">
          <p className="fw-semibold mb-3">Excellence &middot; Discipline &middot; Integrity</p>
          <p className="text-muted bd-fs-sm">© {new Date().getFullYear()} College De Rebero. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
