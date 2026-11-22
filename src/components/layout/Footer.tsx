import schoolLogo from '@/assets/college-rebero-logo.png';
import { MapPin, Phone, Mail, Building2 } from '@/lib/icons';

export function Footer() {
  return (
    <footer className="mt-8 border-top border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="row g-4 col-md-6 col-xl-3">
          <div className="d-flex align-items-center g-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-9 w-9 object-contain" />
            <div>
              <p className="fw-semibold text-slate-900">College De Rebero</p>
              <p className="fs-12 text-muted-foreground">Behavior Management System</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="fs-12 fw-semibold text-uppercase tracking-wider text-slate-600">School</p>
            <ul className="space-y-1.5 fs-12.5 text-muted-foreground">
              <li><span className="d-inline-flex align-items-center g-2"><Building2 className="h-3.5 w-3.5 text-emerald-600" /> East Campus, Kigali</span></li>
              <li><span className="d-inline-flex align-items-center g-2"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> Gicumbi, Ruvune, Rebero</span></li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="fs-12 fw-semibold text-uppercase tracking-wider text-slate-600">Contact</p>
            <ul className="space-y-1.5 fs-12.5 text-muted-foreground">
              <li><span className="d-inline-flex align-items-center g-2"><Phone className="h-3.5 w-3.5 text-emerald-600" /> +250 788 000 000</span></li>
              <li><span className="d-inline-flex align-items-center g-2"><Mail className="h-3.5 w-3.5 text-emerald-600" /> info@collegederebero.rw</span></li>
            </ul>
          </div>

          <div className="space-y-2">
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





