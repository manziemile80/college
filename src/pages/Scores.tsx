import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Student, Class, BehaviorCategory, BehaviorScoreWithDetails } from '@/types/database';
import { Plus, Search, ClipboardList, Loader2, Send, Eye, Check, ChevronsUpDown, RotateCcw, Bell } from '@/lib/icons';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ScoreBadge } from '@/components/dashboard/ScoreBadge';
import { ScoreDetailsDialog } from '@/components/scores/ScoreDetailsDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface StudentWithClass extends Student {
  class?: Class | null;
}

const categoryLabels: Record<BehaviorCategory, string> = {
  discipline: 'Discipline',
  respect: 'Respect',
  attendance: 'Attendance',
  participation: 'Participation',
};

const categories: BehaviorCategory[] = ['discipline', 'respect', 'attendance', 'participation'];

export default function Scores() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuth();
  const canManage = role === 'admin' || role === 'teacher';
  const [scores, setScores] = useState<BehaviorScoreWithDetails[]>([]);
  const [students, setStudents] = useState<StudentWithClass[]>([]);
  const [cumulativeMap, setCumulativeMap] = useState<Record<string, number>>({});
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsAddDialogOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [formLoading, setFormLoading] = useState(false);
  const [testSmsLoading, setTestSmsLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [selectedScore, setSelectedScore] = useState<BehaviorScoreWithDetails | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [category, setCategory] = useState<BehaviorCategory>('discipline');
  const [score, setScore] = useState([1]);
  const MAX_SCORE = 40;
  const [notes, setNotes] = useState('');
  const [scoreDate, setScoreDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [scoresRes, studentsRes, cumRes] = await Promise.all([
        supabase
          .from('behavior_scores')
          .select('*, student:students(*, class:classes(*)), teacher:profiles(*)')
          .order('created_at', { ascending: false }),
        supabase.from('students').select('*, class:classes(*)').order('last_name'),
        supabase.from('student_cumulative_scores' as any).select('*'),
      ]);

      if (scoresRes.data) {
        setScores(scoresRes.data as unknown as BehaviorScoreWithDetails[]);
      }
      if (studentsRes.data) {
        setStudents(studentsRes.data as StudentWithClass[]);
      }
      if (cumRes && (cumRes as any).data) {
        const map: Record<string, number> = {};
        const rmap: Record<string, number> = {};
        for (const row of (cumRes as any).data as any[]) {
          map[row.student_id] = row.cumulative_score ?? 0;
          rmap[row.student_id] = row.remaining_marks ?? 100;
        }
        setCumulativeMap(map);
        setRemainingMap(rmap);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  const handleAddScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setFormLoading(true);

    try {
      const absScore = Math.min(Math.abs(score[0]), MAX_SCORE);
      if (Math.abs(score[0]) > MAX_SCORE) {
        toast.error(`Score cannot exceed ${MAX_SCORE}/${MAX_SCORE}`);
        setFormLoading(false);
        return;
      }
      const finalScore = -absScore;

      const { data: existing, error: existingErr } = await supabase
        .from('behavior_scores')
        .select('*')
        .eq('student_id', selectedStudent)
        .eq('category', category)
        .eq('score_date', scoreDate)
        .maybeSingle();
      if (existingErr) throw existingErr;

      let scoreData: any = null;
      let combinedDeduction = absScore;

      if (existing) {
        const prevAbs = Math.abs(existing.score || 0);
        combinedDeduction = Math.min(prevAbs + absScore, MAX_SCORE);
        const mergedNotes = [existing.notes, notes].filter(Boolean).join(' | ') || null;
        const { data: updated, error: updErr } = await supabase
          .from('behavior_scores')
          .update({
            score: -combinedDeduction,
            notes: mergedNotes,
            teacher_id: user.id,
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (updErr) throw updErr;
        scoreData = updated;
      } else {
        const { data: inserted, error } = await supabase.from('behavior_scores').insert({
          student_id: selectedStudent,
          teacher_id: user.id,
          category,
          score: finalScore,
          notes: notes || null,
          score_date: scoreDate,
        }).select().single();
        if (error) throw error;
        scoreData = inserted;
      }

      if (scoreData) {
        try {
          await sendSmsNotification(scoreData.id, selectedStudent, -combinedDeduction, scoreDate);
        } catch (smsError) {
          console.error('SMS notification failed:', smsError);
        }
      }

      toast.success(existing ? 'Deduction updated for this date' : 'Marks deducted', {
        description: `${combinedDeduction}/${MAX_SCORE} deducted Â· Parents notified via SMS`,
      });
      setIsAddDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error('Failed to record score', { description: error.message });
    } finally {
      setFormLoading(false);
    }
  };

  const sendSmsNotification = async (scoreId: string, studentId: string, scoreValue: number, date: string) => {
    const response = await supabase.functions.invoke('send-sms-notification', {
      body: { behaviorScoreId: scoreId, studentId, score: scoreValue, date },
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    console.log('SMS notification response:', response.data);
  };

  const resetForm = () => {
    setSelectedStudent('');
    setCategory('discipline');
    setScore([1]);
    setNotes('');
    setScoreDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleTestSms = async () => {
    setTestSmsLoading(true);
    try {
      const testStudentId = '688cb156-6dfb-477a-92da-c5fc763d671d';
      const testScore = 85;
      const testDate = format(new Date(), 'yyyy-MM-dd');

      const response = await supabase.functions.invoke('send-sms-notification', {
        body: { behaviorScoreId: 'test-' + Date.now(), studentId: testStudentId, score: testScore, date: testDate },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }
      if (response.data?.success) {
        toast.success('Test SMS sent successfully!', {
          description: `Sent to ${response.data.results?.length || 0} parent(s)`,
        });
      } else {
        toast.warning('SMS test completed', { description: response.data?.message || 'Check console for details' });
      }
    } catch (error: any) {
      console.error('Test SMS error:', error);
      toast.error('Test SMS failed', { description: error.message });
    } finally {
      setTestSmsLoading(false);
    }
  };

  const handleResetAllScores = async () => {
    if (!confirm('Reset behavior scores for ALL students? This deletes all behavior score records (e.g., at the start of a new term). This cannot be undone.')) return;
    setResetLoading(true);
    try {
      const { error } = await supabase.from('behavior_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      toast.success('All behavior scores have been reset');
      fetchData();
    } catch (e: any) {
      toast.error('Reset failed', { description: e.message });
    } finally {
      setResetLoading(false);
    }
  };

  const filteredScores = scores.filter((s) => {
    if (!s.student) return false;
    const fullName = `${s.student.first_name} ${s.student.last_name}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const selectedStudentObj = students.find((s) => s.id === selectedStudent);
  const previewRemaining =
    selectedStudent
      ? (remainingMap[selectedStudent] ?? 100) - Math.abs(score[0])
      : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Records"
          title="Behavior Scores"
          description="Record and manage student behavior assessments."
          actions={canManage ? (
            <div className="d-flex flex-wrap g-2">
              <Button variant="outline" size="sm" onClick={handleResetAllScores} disabled={resetLoading}>
                {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reset Marks (New Term)
              </Button>
              <Button variant="outline" size="sm" onClick={handleTestSms} disabled={testSmsLoading}>
                {testSmsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Test SMS
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4" />Record Score</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6 w-[calc(100%-1rem)]">
                  <DialogHeader><DialogTitle>Record Behavior Score</DialogTitle></DialogHeader>
                  <form onSubmit={handleAddScore} className="space-y-3 mt-2">
                    <div className="row col-12 col-md-6 g-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="student" className="fs-14">Student</Label>
                        <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={studentPickerOpen}
                              className="w-100 justify-content-between fw-normal"
                            >
                              {selectedStudentObj
                                ? `${selectedStudentObj.first_name} ${selectedStudentObj.last_name}${selectedStudentObj.class?.name ? ' Â· ' + selectedStudentObj.class.name : ''}`
                                : 'Search and select a student...'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search by name, ID or class..." />
                              <CommandList>
                                <CommandEmpty>No student found.</CommandEmpty>
                                <CommandGroup>
                                  {students.map((student) => {
                                    const label = `${student.first_name} ${student.last_name} ${student.student_id} ${student.class?.name ?? ''}`;
                                    const remaining = remainingMap[student.id] ?? 100;
                                    return (
                                      <CommandItem
                                        key={student.id}
                                        value={label}
                                        onSelect={() => {
                                          setSelectedStudent(student.id);
                                          setStudentPickerOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            selectedStudent === student.id ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        <div className="d-flex flex-1 align-items-center justify-content-between g-2">
                                          <span>
                                            {student.first_name} {student.last_name}
                                            <span className="ml-1 fs-12.5 text-slate-500">
                                              {student.class?.name || 'No class'}
                                            </span>
                                          </span>
                                          <span className="fs-13 fw-medium text-emerald-600">
                                            {remaining} pts
                                          </span>
                                        </div>
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="category" className="fs-14">Category</Label>
                        <Select value={category} onValueChange={(v) => setCategory(v as BehaviorCategory)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>{categoryLabels[cat]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3 fs-13 text-slate-500">
                      Every student starts the term with <span className="fw-semibold text-slate-900">40/40</span> in each category. You can only <span className="fw-semibold text-red-600">deduct</span> marks for misconduct.
                    </div>

                    <div className="space-y-2">
                      <div className="d-flex align-items-center justify-content-between">
                        <Label className="fs-14">Points to deduct</Label>
                        <span className="fs-30 fw-bold text-red-600">-{Math.abs(score[0])}</span>
                      </div>
                      <div className="d-flex align-items-center g-3">
                        <Slider value={score} onValueChange={setScore} min={1} max={MAX_SCORE} step={1} className="flex-1" />
                        <Input
                          type="number"
                          min={1}
                          max={MAX_SCORE}
                          value={score[0]}
                          onChange={(e) => {
                            const raw = parseInt(e.target.value, 10);
                            if (Number.isNaN(raw)) { setScore([1]); return; }
                            const clamped = Math.max(1, Math.min(MAX_SCORE, raw));
                            setScore([clamped]);
                          }}
                          className="w-20 text-center"
                          aria-label="Marks"
                        />
                      </div>
                      <p className="fs-11.5 text-slate-500">
                        Drag the slider or type marks (1â€“{MAX_SCORE}). Max is {MAX_SCORE}/{MAX_SCORE}.
                      </p>
                      {selectedStudent && (
                        <div className="d-flex align-items-center justify-content-between rounded-[10px] bg-slate-50 px-3 py-2 fs-12.5 text-slate-500">
                          <span>Current: <span className="fw-semibold text-slate-900">{remainingMap[selectedStudent] ?? 100}</span> pts</span>
                          <span>After: <span className={`fw-semibold ${(previewRemaining ?? 0) >= 50 ? 'text-emerald-600' : (previewRemaining ?? 0) >= 25 ? 'text-amber-600' : 'text-red-600'}`}>{previewRemaining}</span> pts</span>
                        </div>
                      )}
                    </div>

                    <div className="row col-12 col-md-6 g-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="date" className="fs-14">Date</Label>
                        <Input id="date" type="date" value={scoreDate} onChange={(e) => setScoreDate(e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="notes" className="fs-14">Notes (Optional)</Label>
                        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes..." rows={2} />
                      </div>
                    </div>

                    <div className="d-flex align-items-center g-2 rounded-[10px] bg-blue-50 p-2 fs-12.5 text-blue-700">
                      <Bell className="h-3.5 w-3.5" />
                      <span>Parents will be notified via SMS</span>
                    </div>

                    <div className="d-flex d-flex flex-column-reverse sm:d-flex flex-row sm:justify-content-end g-2 pt-1">
                      <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} className="w-100 sm:w-auto">Cancel</Button>
                      <Button type="submit" disabled={formLoading || !selectedStudent} className="w-100 sm:w-auto">
                        {formLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Recording...</> : 'Record Score'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          ) : undefined}
        />

        {/* Search */}
        <div className="position-relative w-100 sm:max-w-xs">
          <Search className="position-absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by student name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Scores list */}
        {loading ? (
          <div className="d-flex align-items-center justify-content-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : filteredScores.length === 0 ? (
          <Card><CardContent className="d-flex d-flex flex-column align-items-center justify-content-center py-12">
            <ClipboardList className="h-12 w-12 text-slate-400 mb-4" />
            <h3 className="fs-18 fw-semibold text-slate-900">No scores found</h3>
            <p className="fs-13 text-slate-500">{searchQuery ? 'Try adjusting your search' : 'Record your first behavior score to get started'}</p>
          </CardContent></Card>
        ) : (
          <Card>
            <div class="table-responsive"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-center">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScores.map((score) => (
                  <TableRow key={score.id}>
                    <TableCell>
                      <div>
                        <p className="fw-medium text-slate-900">
                          {score.student?.first_name} {score.student?.last_name}
                        </p>
                        <p className="fs-12.5 text-slate-500">{score.student?.class?.name || 'No class'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-slate-100 text-slate-700">{categoryLabels[score.category]}</Badge>
                    </TableCell>
                    <TableCell><ScoreBadge score={score.score} /></TableCell>
                    <TableCell className="fs-13 text-slate-500">{format(new Date(score.score_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="fs-13 text-slate-500">{score.teacher?.full_name || 'Unknown'}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="g-1 text-slate-500 hover:text-slate-900"
                        onClick={() => {
                          setSelectedScore(score);
                          setDetailsDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          </Card>
        )}

        {/* Score details dialog */}
        <ScoreDetailsDialog
          score={selectedScore}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}






