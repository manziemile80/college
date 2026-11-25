import schoolLogo from '@/assets/college-rebero-logo.png';
import { MapPin, Phone, Mail, Building2, ArrowUpRight } from '@/lib/icons';

const LIVE_SITE_URL = 'https://college-mis-beta.vercel.app/';

export function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 pt-6 pb-8 text-slate-900 dark:border-slate-700 dark:text-slate-100">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <img src={schoolLogo} alt="College De Rebero" width={36} height={36} className="object-contain" />
            <div>
              <p className="font-semibold">College De Rebero</p>
              <p className="text-xs text-slate-500">Behavior Management System</p>
            </div>
          </div>
          <a
            href={LIVE_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1 w-full rounded-lg border border-emerald-600 text-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-50"
            aria-label="Open the live site"
          >
            Live site
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>

        <div>
          <p className="font-semibold mb-3">School</p>
          <ul className="flex flex-col gap-1 text-sm text-slate-500">
            <li className="flex items-center gap-2"><Building2 className="w-4 h-4" /> East Campus, Kigali</li>
            <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Gicumbi, Ruvune, Rebero</li>
          </ul>
        </div>

        <div>
          <p className="font-semibold mb-3">Contact</p>
          <ul className="flex flex-col gap-1 text-sm text-slate-500">
            <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> +250 788 000 000</li>
            <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> info@collegederebero.rw</li>
          </ul>
        </div>

        <div className="flex flex-col justify-end">
          <p className="font-semibold mb-3">Excellence · Discipline · Integrity</p>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} College De Rebero. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}