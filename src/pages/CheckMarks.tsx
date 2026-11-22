import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, UserCheck, FileText } from '@/lib/icons';
import logo from '@/assets/college-rebero-logo.png';
import { Badge } from '@/components/ui/badge';

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
    const k = `${r.academic_year} Â· ${termLabel[r.term] ?? r.term}`;
    (acc[k] ||= []).push(r); return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background p-3 sm:p-5">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="d-flex d-flex flex-column g-1 sm:d-flex flex-row sm:align-items-center sm:justify-content-between">
          <div className="d-flex align-items-center g-3">
            <div className="d-flex h-11 w-11 align-items-center justify-content-center rounded-circle bg-emerald-100">
              <img src={logo} alt="College De Rebero" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <h1 className="fs-22 fw-bold text-slate-900">College De Rebero</h1>
              <p className="fs-13 text-slate-500">Check your marks</p>
            </div>
          </div>
          <Link to="/login"><Button variant="outline" size="sm">Sign in</Button></Link>
        </div>

        {/* Search form */}
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="d-flex d-flex flex-column sm:d-flex flex-row g-2">
              <form onSubmit={search} className="d-flex w-100 max-w-xl g-2">
                <Input placeholder="Enter your registration number" value={reg} onChange={(e) => setReg(e.target.value)} className="h-11" />
                <Button type="submit" className="g-2" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </form>
            </div>
            {error && (
              <div className="d-flex align-items-start g-2 rounded-[10px] border border-red-200 bg-red-50 p-3">
                <p className="fs-13 text-red-600">{error}</p>
              </div>
            )}
            {rows && rows.length === 0 && (
              <div className="empty-state">
                <UserCheck className="h-12 w-12 text-slate-400 mb-3" />
                <p className="fs-14 text-slate-500">No marks found for this registration number.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <p className="rounded-[10px] border border-slate-200 bg-slate-50 p-3 fs-14 fw-semibold text-slate-900">
              {rows[0].student_name} {rows[0].class_name ? ` â€” ${rows[0].class_name}` : ''}
            </p>
            {Object.entries(groups).map(([k, list]) => {
              const avg = list.reduce((s, r) => s + Number(r.total), 0) / list.length;
              const passCount = list.filter((r) => r.total >= 50).length;
              return (
                <Card key={k}>
                  <CardContent className="space-y-3 py-5">
                    <div className="d-flex align-items-center g-2">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      <h3 className="fw-semibold fs-15 text-slate-900">{k}</h3>
                      <Badge className={passCount === list.length ? 'bg-green-100 text-emerald-700' : passCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>
                        {passCount}/{list.length} passed
                      </Badge>
                    </div>
                    <div class="table-responsive"><Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-end">CAT /40</TableHead>
                          <TableHead className="text-end">Exam /60</TableHead>
                          <TableHead className="text-end fw-semibold">Total /100</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="fs-13 text-slate-900">{r.subject}</TableCell>
                            <TableCell className="text-end fs-13">{r.cat_score}</TableCell>
                            <TableCell className="text-end fs-13">{r.exam_score}</TableCell>
                            <TableCell className={`text-end fs-13 fw-bold ${r.total >= 50 ? 'text-emerald-700' : 'text-red-700'}`}>{r.total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table></div>
                    <p className="text-end fs-14 fw-semibold text-emerald-600">
                      Average: {avg.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';






