import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Loader2, Search, UserCheck, FileText } from '@/lib/icons';
import logo from '@/assets/college-rebero-logo.png';

type Row = { student_name: string; class_name: string | null; subject: string; term: string; academic_year: string; cat_score: number; exam_score: number; total: number };
const termLabel: Record<string, string> = { term1: 'Term 1', term2: 'Term 2', term3: 'Term 3' };

export default function CheckMarks() {
  const [reg, setReg] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reg.trim()) return;
    setLoading(true); setError('');
    const { data, error } = await (supabase.rpc as any)('get_marks_by_reg_number', { _reg: reg.trim() });
    setLoading(false);
    if (error) { setError('Could not load marks. Try again.'); setRows(null); return; }
    setRows((data as Row[]) ?? []);
  };

  const groups = (rows ?? []).reduce<Record<string, Row[]>>((acc, r) => {
    const k = `${r.academic_year} · ${termLabel[r.term] ?? r.term}`;
    (acc[k] ||= []).push(r); return acc;
  }, {});

  return (
    <div className="min-vh-100 bg-body p-3 sm:p-5">
      <div className="mx-auto max-w-3xl d-flex flex-column gap-5">
        {/* Header */}
        <div className="d-flex flex-column gap-1 d-sm-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-3">
            <span className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-2">
              <img src={logo} alt="College De Rebero" className="h-7 w-7 object-contain" />
            </span>
            <div>
              <h1 className="fs-4 fw-bold text-main mb-0">College De Rebero</h1>
              <p className="text-muted bd-fs-sm mb-0">Check your marks</p>
            </div>
          </div>
          <Link to="/login" className="d-inline-flex align-items-center">
            <button type="button" className="btn btn-outline-primary btn-sm">Sign in</button>
          </Link>
        </div>

        {/* Search form */}
        <div className="card">
          <div className="card-body d-flex flex-column gap-4">
            <form onSubmit={search} className="d-flex w-100 max-w-xl gap-2">
              <Input
                placeholder="Enter your registration number"
                value={reg}
                onChange={(e) => setReg(e.target.value)}
                className="form-control h-12 rounded-3"
                aria-label="Registration number"
              />
              <button type="submit" className="btn btn-success d-inline-flex align-items-center gap-1" disabled={loading}>
                {loading ? <><span className="spinner-border spinner-border-sm" /> Searching...</> : <><Search /> Search</>}
              </button>
            </form>
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2">
                <p className="mb-0 text-danger bd-fs-sm">{error}</p>
              </div>
            )}
            {rows && rows.length === 0 && (
              <div className="empty-state">
                <UserCheck className="empty-state-icon text-secondary" />
                <p className="text-secondary mb-0">No marks found for this registration number.</p>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {rows && rows.length > 0 && (
          <div className="d-flex flex-column gap-4">
            <p className="badge bg-secondary-subtle text-secondary text-center mx-auto">
              {rows[0].student_name} {rows[0].class_name ? ` — ${rows[0].class_name}` : ''}
            </p>
            {Object.entries(groups).map(([k, list]) => {
              const avg = list.reduce((s, r) => s + Number(r.total), 0) / list.length;
              const passCount = list.filter((r) => r.total >= 50).length;
              return (
                <div className="card" key={k}>
                  <div className="card-body d-flex flex-column gap-3">
                    <div className="d-flex align-items-center gap-2">
                      <FileText className="text-success" />
                      <h3 className="fw-semibold text-main mb-0">{k}</h3>
                      <span className={`badge bd-fs-sm ${passCount === list.length ? 'text-bg-success bg-success-subtle' : passCount > 0 ? 'text-bg-warning bg-warning-subtle' : 'text-bg-danger bg-danger-subtle'}`}>
                        {passCount}/{list.length} passed
                      </span>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead>
                          <tr className="border-bottom border-secondary-subtle">
                            <th scope="col">Subject</th>
                            <th scope="col" className="text-end">CAT /40</th>
                            <th scope="col" className="text-end">Exam /60</th>
                            <th scope="col" className="text-end fw-semibold">Total /100</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((r, i) => (
                            <tr key={i} className="border-bottom border-secondary-subtle">
                              <td className="text-main bd-fs-sm">{r.subject}</td>
                              <td className="text-end bd-fs-sm">{r.cat_score}</td>
                              <td className="text-end bd-fs-sm">{r.exam_score}</td>
                              <td className={`text-end fw-semibold bd-fs-sm ${r.total >= 50 ? 'text-success' : 'text-danger'}`}>{r.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-end fw-semibold text-success mb-0">
                      Average: {avg.toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
