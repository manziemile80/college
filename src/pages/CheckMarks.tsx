import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search } from 'lucide-react';
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
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="College De Rebero" className="h-12 w-12 object-contain" />
          <div>
            <h1 className="text-xl font-bold">College De Rebero</h1>
            <p className="text-sm text-muted-foreground">Check your marks</p>
          </div>
          <Link to="/login" className="ml-auto text-sm text-primary hover:underline">Sign in</Link>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={search} className="flex gap-2">
              <Input placeholder="Enter your registration number" value={reg} onChange={(e) => setReg(e.target.value)} />
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-1">Search</span>
              </Button>
            </form>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
        {rows && rows.length === 0 && <p className="text-center text-muted-foreground">No marks found for this registration number.</p>}
        {rows && rows.length > 0 && (
          <p className="text-sm"><strong>{rows[0].student_name}</strong>{rows[0].class_name ? ` — ${rows[0].class_name}` : ''}</p>
        )}
        {Object.entries(groups).map(([k, list]) => {
          const avg = list.reduce((s, r) => s + Number(r.total), 0) / list.length;
          return (
            <Card key={k}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{k}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>CAT /40</TableHead><TableHead>Exam /60</TableHead><TableHead>Total /100</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {list.map((r, i) => (
                      <TableRow key={i}><TableCell>{r.subject}</TableCell><TableCell>{r.cat_score}</TableCell><TableCell>{r.exam_score}</TableCell><TableCell className="font-medium">{r.total}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-right text-sm font-medium">Average: {avg.toFixed(1)}%</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
