import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, UserCheck, FileText } from 'lucide-react';
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
    const k = `${r.academic_year} · ${termLabel[r.term] ?? r.term}`;
    (acc[k] ||= []).push(r); return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background p-3 sm:p-5">
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
              <img src={logo} alt="College De Rebero" className="h-7 w-7 object-contain" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-slate-900">College De Rebero</h1>
              <p className="text-[13px] text-slate-500">Check your marks</p>
            </div>
          </div>
          <Link to="/login"><Button variant="outline" size="sm">Sign in</Button></Link>
        </div>

        {/* Search form */}
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-col sm:flex-row gap-2">
              <form onSubmit={search} className="flex w-full max-w-xl gap-2">
                <Input placeholder="Enter your registration number" value={reg} onChange={(e) => setReg(e.target.value)} className="h-11" />
                <Button type="submit" className="gap-2" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </form>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 p-3">
                <p className="text-[13px] text-red-600">{error}</p>
              </div>
            )}
            {rows && rows.length === 0 && (
              <div className="empty-state">
                <UserCheck className="h-12 w-12 text-slate-400 mb-3" />
                <p className="text-[14px] text-slate-500">No marks found for this registration number.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <p className="rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-[14px] font-semibold text-slate-900">
              {rows[0].student_name} {rows[0].class_name ? ` — ${rows[0].class_name}` : ''}
            </p>
            {Object.entries(groups).map(([k, list]) => {
              const avg = list.reduce((s, r) => s + Number(r.total), 0) / list.length;
              const passCount = list.filter((r) => r.total >= 50).length;
              return (
                <Card key={k}>
                  <CardContent className="space-y-3 py-5">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      <h3 className="font-semibold text-[15px] text-slate-900">{k}</h3>
                      <Badge className={passCount === list.length ? 'bg-green-100 text-emerald-700' : passCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>
                        {passCount}/{list.length} passed
                      </Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">CAT /40</TableHead>
                          <TableHead className="text-right">Exam /60</TableHead>
                          <TableHead className="text-right font-semibold">Total /100</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-[13px] text-slate-900">{r.subject}</TableCell>
                            <TableCell className="text-right text-[13px]">{r.cat_score}</TableCell>
                            <TableCell className="text-right text-[13px]">{r.exam_score}</TableCell>
                            <TableCell className={`text-right text-[13px] font-bold ${r.total >= 50 ? 'text-emerald-700' : 'text-red-700'}`}>{r.total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="text-right text-[14px] font-semibold text-emerald-600">
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

