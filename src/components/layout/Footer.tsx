import schoolLogo from '@/assets/college-rebero-logo.png';
import { MapPin, Phone, Mail, Building2 } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3">
            <img src={schoolLogo} alt="College De Rebero" className="h-9 w-9 object-contain" />
            <div>
              <p className="font-semibold text-slate-900">College De Rebero</p>
              <p className="text-[12px] text-muted-foreground">Behavior Management System</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">School</p>
            <ul className="space-y-1.5 text-[12.5px] text-muted-foreground">
              <li><span className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-emerald-600" /> East Campus, Kigali</span></li>
              <li><span className="inline-flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-emerald-600" /> Gicumbi, Ruvune, Rebero</span></li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">Contact</p>
            <ul className="space-y-1.5 text-[12.5px] text-muted-foreground">
              <li><span className="inline-flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-600" /> +250 788 000 000</span></li>
              <li><span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-emerald-600" /> info@collegederebero.rw</span></li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">Excellence · Discipline · Integrity</p>
            <p className="text-[12.5px] text-muted-foreground">
              © {new Date().getFullYear()} College De Rebero. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
