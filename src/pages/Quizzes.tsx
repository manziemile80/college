import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { supabase } from '@/integrations/supabase/client';
import { canPublishQuiz } from '@/lib/quizPublishing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ListChecks, Loader2, PenLine, BarChart3, UserCheck, Sparkles, CheckCircle2, Send } from '@/lib/icons';
import { ClaimStudentRecordDialog } from '@/components/students/ClaimStudentRecordDialog';

interface DraftQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation?: string;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  class_id: string | null;
  time_limit_minutes: number | null;
  is_published: boolean;
}

interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_option: string;
  points: number;
  sort_order: number;
}

type PendingQuestion = Omit<Question, 'id' | 'quiz_id'>;

interface Attempt {
  id: string;
  quiz_id: string;
  student_id: string;
  score: number;
  total_points: number;
  completed_at: string;
  student?: { first_name: string; last_name: string };
}

const emptyQuiz = { title: '', description: '', subject_id: '', class_id: '', time_limit_minutes: '', is_published: true };
const emptyQuestion = { question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', points: '1' };

export default function Quizzes() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { studentId, refresh: refreshStudent } = useCurrentStudent();
  const isStaff = role === 'admin' || role === 'teacher';
  const [claimOpen, setClaimOpen] = useState(false);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [myAttempts, setMyAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  const [quizOpen, setQuizOpen] = useState(false);
  const [quizForm, setQuizForm] = useState(emptyQuiz);
  const [newQuizQuestions, setNewQuizQuestions] = useState<PendingQuestion[]>([]);
  const [savingQuiz, setSavingQuiz] = useState(false);

  const [manageQuiz, setManageQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionForm, setQuestionForm] = useState(emptyQuestion);

  const [takeQuiz, setTakeQuiz] = useState<Quiz | null>(null);
  const [takeQuestions, setTakeQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [resultsQuiz, setResultsQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMaterial, setAiMaterial] = useState('');
  const [aiCount, setAiCount] = useState('5');
  const [aiLevel, setAiLevel] = useState('');
  const [aiSubject, setAiSubject] = useState('');
  const [aiClass, setAiClass] = useState('');
  const [aiDraft, setAiDraft] = useState<{ title: string; description: string; questions: DraftQuestion[] } | null>(null);

  const updateDraftQ = (i: number, patch: Partial<DraftQuestion>) =>
    setAiDraft((d) => d && { ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  const generateWithAI = async () => {
    if (aiMaterial.trim().length < 3) {
      toast({ title: 'Enter a lesson topic or paste material', variant: 'destructive' });
      return;
    }
    setAiBusy(true);
    const { data, error } = await supabase.functions.invoke('generate-quiz', {
      body: { material: aiMaterial, count: Number(aiCount) || 5, level: aiLevel },
    });
    setAiBusy(false);
    if (error || data?.error) {
      let msg = data?.error as string | undefined;
      if (!msg && error && 'context' in error) {
        try { msg = (await (error as { context: Response }).context.json())?.error; } catch { /* ignore */ }
      }
      toast({ title: 'Could not generate quiz', description: msg || error?.message, variant: 'destructive' });
      return;
    }
    setAiDraft({ title: data.title ?? '', description: data.description ?? '', questions: data.questions ?? [] });
  };

  const saveAiQuiz = async () => {
    if (!aiDraft) return;
    if (!aiDraft.title.trim()) return toast({ title: 'Title is required', variant: 'destructive' });
    const bad = aiDraft.questions.findIndex((q) => !q.question_text.trim() || !q.option_a.trim() || !q.option_b.trim());
    if (bad >= 0) return toast({ title: `Question ${bad + 1} needs text and options A/B`, variant: 'destructive' });
    if (!canPublishQuiz(aiDraft.questions)) {
      return toast({ title: 'Every correct answer needs option text', variant: 'destructive' });
    }
    setAiBusy(true);
    const { data: quiz, error } = await supabase.from('quizzes').insert({
      title: aiDraft.title.trim().slice(0, 150),
      description: aiDraft.description.trim().slice(0, 1000) || null,
      subject_id: aiSubject || null,
      class_id: aiClass || null,
      is_published: true,
      created_by: user!.id,
    }).select('id').single();
    if (error || !quiz) {
      setAiBusy(false);
      return toast({ title: 'Could not save quiz', description: error?.message, variant: 'destructive' });
    }
    const { error: qErr } = await supabase.from('quiz_questions').insert(
      aiDraft.questions.map((q, i) => ({
        quiz_id: quiz.id,
        question_text: q.question_text.trim().slice(0, 1000),
        option_a: q.option_a.trim().slice(0, 300),
        option_b: q.option_b.trim().slice(0, 300),
        option_c: q.option_c?.trim().slice(0, 300) || null,
        option_d: q.option_d?.trim().slice(0, 300) || null,
        correct_option: ['a', 'b', 'c', 'd'].includes(q.correct_option) ? q.correct_option : 'a',
        points: 1,
        sort_order: i + 1,
      })),
    );
    setAiBusy(false);
    if (qErr) return toast({ title: 'Quiz saved, but questions failed', description: qErr.message, variant: 'destructive' });
    toast({ title: 'Quiz published', description: 'Students can now see and take this quiz.' });
    setAiOpen(false);
    setAiDraft(null);
    setAiMaterial('');
    fetchAll();
  };

  useEffect(() => {
    fetchAll();
  }, [studentId]);

  const fetchAll = async () => {
    setLoading(true);
    const [q, s, c] = await Promise.all([
      supabase.from('quizzes').select('*').order('created_at', { ascending: false }),
      supabase.from('subjects').select('id, name').order('name'),
      supabase.from('classes').select('id, name').order('name'),
    ]);
    setQuizzes((q.data as Quiz[]) || []);
    setSubjects(s.data || []);
    setClasses(c.data || []);
    if (studentId) {
      const { data } = await supabase.from('quiz_attempts').select('*').eq('student_id', studentId);
      setMyAttempts((data as Attempt[]) || []);
    }
    setLoading(false);
  };

  const openNewQuiz = () => {
    setQuizForm(emptyQuiz);
    setNewQuizQuestions([]);
    setQuestionForm(emptyQuestion);
    setQuizOpen(true);
  };

  const addNewQuizQuestion = () => {
    if (!questionForm.question_text.trim() || !questionForm.option_a.trim() || !questionForm.option_b.trim()) {
      toast({ title: 'Question and options A/B are required', variant: 'destructive' });
      return;
    }
    const selectedOption = questionForm[`option_${questionForm.correct_option}` as 'option_a'];
    if (!selectedOption.trim()) {
      toast({ title: 'The correct answer needs option text', variant: 'destructive' });
      return;
    }

    setNewQuizQuestions((current) => [
      ...current,
      {
        question_text: questionForm.question_text.trim().slice(0, 1000),
        option_a: questionForm.option_a.trim().slice(0, 300),
        option_b: questionForm.option_b.trim().slice(0, 300),
        option_c: questionForm.option_c.trim().slice(0, 300) || null,
        option_d: questionForm.option_d.trim().slice(0, 300) || null,
        correct_option: questionForm.correct_option,
        points: Math.min(Math.max(Number(questionForm.points) || 1, 1), 20),
        sort_order: current.length + 1,
      },
    ]);
    setQuestionForm(emptyQuestion);
  };

  const saveQuiz = async () => {
    if (!quizForm.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    if (quizForm.is_published && !canPublishQuiz(newQuizQuestions)) {
      toast({ title: 'Add at least one complete question before publishing', variant: 'destructive' });
      return;
    }

    setSavingQuiz(true);
    const { data: quiz, error } = await supabase.from('quizzes').insert({
      title: quizForm.title.trim().slice(0, 150),
      description: quizForm.description.trim().slice(0, 1000) || null,
      subject_id: quizForm.subject_id || null,
      class_id: quizForm.class_id || null,
      time_limit_minutes: quizForm.time_limit_minutes ? Number(quizForm.time_limit_minutes) : null,
      is_published: false,
      created_by: user!.id,
    }).select('id').single();
    if (error || !quiz) {
      setSavingQuiz(false);
      toast({ title: 'Could not create quiz', description: error?.message, variant: 'destructive' });
      return;
    }

    if (newQuizQuestions.length > 0) {
      const { error: questionsError } = await supabase.from('quiz_questions').insert(
        newQuizQuestions.map((question) => ({ ...question, quiz_id: quiz.id })),
      );
      if (questionsError) {
        setSavingQuiz(false);
        toast({ title: 'Quiz saved as a draft, but its questions could not be added', description: questionsError.message, variant: 'destructive' });
        setQuizOpen(false);
        fetchAll();
        return;
      }
    }

    if (quizForm.is_published) {
      const { error: publishError } = await supabase.from('quizzes').update({ is_published: true }).eq('id', quiz.id);
      if (publishError) {
        setSavingQuiz(false);
        toast({ title: 'Quiz saved as a draft, but could not be published', description: publishError.message, variant: 'destructive' });
        setQuizOpen(false);
        fetchAll();
        return;
      }
    }

    setSavingQuiz(false);
    toast({
      title: quizForm.is_published ? 'Quiz published' : 'Draft quiz created',
      description: quizForm.is_published ? 'Students can now see and take this quiz.' : 'Add questions and publish it when ready.',
    });
    setQuizOpen(false);
    setQuizForm(emptyQuiz);
    setNewQuizQuestions([]);
    setQuestionForm(emptyQuestion);
    fetchAll();
  };

  const removeQuiz = async (id: string) => {
    const { error } = await supabase.from('quizzes').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    fetchAll();
  };

  const openManage = async (quiz: Quiz) => {
    setManageQuiz(quiz);
    setQuestionForm(emptyQuestion);
    const { data } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quiz.id).order('sort_order');
    setQuestions((data as Question[]) || []);
  };

  const addQuestion = async () => {
    if (!manageQuiz) return;
    if (!questionForm.question_text.trim() || !questionForm.option_a.trim() || !questionForm.option_b.trim()) {
      toast({ title: 'Question and options A/B are required', variant: 'destructive' });
      return;
    }
    const selectedOption = questionForm[`option_${questionForm.correct_option}` as 'option_a'];
    if (!selectedOption.trim()) {
      toast({ title: 'The correct answer needs option text', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('quiz_questions').insert({
      quiz_id: manageQuiz.id,
      question_text: questionForm.question_text.trim().slice(0, 1000),
      option_a: questionForm.option_a.trim().slice(0, 300),
      option_b: questionForm.option_b.trim().slice(0, 300),
      option_c: questionForm.option_c.trim().slice(0, 300) || null,
      option_d: questionForm.option_d.trim().slice(0, 300) || null,
      correct_option: questionForm.correct_option,
      points: Math.min(Math.max(Number(questionForm.points) || 1, 1), 20),
      sort_order: questions.length + 1,
    });
    if (error) {
      toast({ title: 'Could not add question', description: error.message, variant: 'destructive' });
      return;
    }
    openManage(manageQuiz);
  };

  const removeQuestion = async (id: string) => {
    await supabase.from('quiz_questions').delete().eq('id', id);
    if (manageQuiz) openManage(manageQuiz);
  };

  const publishQuiz = async () => {
    if (!manageQuiz) return;
    if (!canPublishQuiz(questions)) {
      toast({ title: 'Add at least one complete question before publishing', variant: 'destructive' });
      return;
    }

    setSavingQuiz(true);
    const { error } = await supabase.from('quizzes').update({ is_published: true }).eq('id', manageQuiz.id);
    setSavingQuiz(false);
    if (error) {
      toast({ title: 'Could not publish quiz', description: error.message, variant: 'destructive' });
      return;
    }

    setManageQuiz({ ...manageQuiz, is_published: true });
    toast({ title: 'Quiz published', description: 'Students can now see and take this quiz.' });
    fetchAll();
  };

  const startQuiz = async (quiz: Quiz) => {
    const { data } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quiz.id).order('sort_order');
    setTakeQuestions((data as Question[]) || []);
    setAnswers({});
    setTakeQuiz(quiz);
  };

  const submitQuiz = async () => {
    if (!takeQuiz) return;
    if (!studentId) {
      toast({
        title: 'Connect your student profile first',
        description: 'Pick your name so we can save your answers.',
        variant: 'destructive',
      });
      setClaimOpen(true);
      return;
    }
    if (takeQuestions.some((q) => !answers[q.id])) {
      toast({ title: 'Answer every question before submitting', variant: 'destructive' });
      return;
    }
    let score = 0;
    let total = 0;
    takeQuestions.forEach((q) => {
      total += Number(q.points);
      if (answers[q.id] === q.correct_option) score += Number(q.points);
    });
    const { error } = await supabase.from('quiz_attempts').insert({
      quiz_id: takeQuiz.id,
      student_id: studentId,
      answers,
      score,
      total_points: total,
    });
    if (error) {
      toast({ title: 'Could not submit quiz', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Quiz submitted', description: `You scored ${score}/${total}` });
    setTakeQuiz(null);
    fetchAll();
  };

  const openResults = async (quiz: Quiz) => {
    setResultsQuiz(quiz);
    const { data } = await supabase
      .from('quiz_attempts')
      .select('*, student:students(first_name, last_name)')
      .eq('quiz_id', quiz.id)
      .order('score', { ascending: false });
    setAttempts((data as unknown as Attempt[]) || []);
  };

  const label = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="E-Learning"
          title="Quizzes"
          description={isStaff ? 'Build multiple-choice quizzes and review auto-scored student results.' : 'Take published quizzes and see your score instantly.'}
          actions={isStaff ? (
            <div className="d-flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => { setAiDraft(null); setAiOpen(true); }}>
                <Sparkles className="h-4 w-4" /> Generate with AI
              </Button>
              <Button className="gap-2" onClick={openNewQuiz}>
                <Plus className="h-4 w-4" /> New Quiz
              </Button>
            </div>
          ) : undefined}
        />

        {role === 'student' && !studentId && (
          <Card className="border-dashed border-2 border-slate-300 bg-slate-50">
            <CardContent className="d-flex align-items-center justify-content-between gap-4 p-4 sm:d-flex flex-row">
              <div>
                <p className="fs-14 fw-medium text-slate-900">Connect your student profile</p>
                <p className="fs-13 text-slate-500">Pick your name once so your quiz answers are saved.</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setClaimOpen(true)}><UserCheck className="h-4 w-4" />Find my profile</Button>
            </CardContent>
          </Card>
        )}

        <ClaimStudentRecordDialog
          open={claimOpen}
          onOpenChange={setClaimOpen}
          onLinked={() => { refreshStudent(); }}
        />

        {loading ? (
          <div className="d-flex justify-content-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : quizzes.length === 0 ? (
          <Card><CardContent className="d-flex d-flex flex-column align-items-center py-14 text-center">
            <ListChecks className="mb-3 h-10 w-10 text-slate-400" />
            <p className="fw-medium text-slate-900">No quizzes yet</p>
            {isStaff && <p className="mt-1 fs-13 text-slate-500">Create your first quiz to get started.</p>}
          </CardContent></Card>
        ) : (
          <div className="row gap-5 sm:col-6 xl:col-4">
            {quizzes.map((quiz) => {
              const attempt = myAttempts.find((a) => a.quiz_id === quiz.id);
              return (
                <Card key={quiz.id} className="d-flex d-flex flex-column">
                  <CardContent className="d-flex flex-1 d-flex flex-column gap-3 p-5">
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div className="d-flex h-10 w-10 align-items-center justify-content-center rounded-[10px] bg-emerald-50 text-emerald-600">
                        <ListChecks className="h-5 w-5" />
                      </div>
                      {attempt ? (
                        <Badge className="bg-green-100 text-emerald-700">{attempt.score}/{attempt.total_points}</Badge>
                      ) : (
                        <Badge variant={quiz.is_published ? 'secondary' : 'outline'}>
                          {quiz.is_published ? 'Open' : 'Draft'}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h3 className="fw-semibold text-slate-900">{quiz.title}</h3>
                      <p className="mt-1 line-clamp-2 fs-13 text-slate-500">{quiz.description || 'No description'}</p>
                    </div>
                    <div className="d-flex flex-wrap gap-x-3 gap-y-1.5">
                      {label(subjects, quiz.subject_id) && (
                        <span className="rounded-circle bg-slate-100 px-2.5 py-0.5 fs-11.5 text-slate-600">{label(subjects, quiz.subject_id)}</span>
                      )}
                      {label(classes, quiz.class_id) && (
                        <span className="rounded-circle bg-slate-100 px-2.5 py-0.5 fs-11.5 text-slate-600">{label(classes, quiz.class_id)}</span>
                      )}
                      {quiz.time_limit_minutes && (
                        <span className="rounded-circle bg-slate-100 px-2.5 py-0.5 fs-11.5 text-slate-600">{quiz.time_limit_minutes} min</span>
                      )}
                    </div>
                    <div className="mt-auto d-flex flex-wrap align-items-center gap-2 pt-2">
                      {isStaff ? (
                        <>
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openManage(quiz)}><PenLine className="h-4 w-4" />Questions</Button>
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openResults(quiz)}><BarChart3 className="h-4 w-4" />Results</Button>
                          <Button variant="destructive" size="icon" aria-label="Delete quiz" onClick={() => removeQuiz(quiz.id)}><Trash2 className="h-4 w-4" /></Button>
                        </>
                      ) : role === 'student' && !attempt ? (
                        <Button size="sm" onClick={() => startQuiz(quiz)}><Send className="h-4 w-4" />Start Quiz</Button>
                      ) : attempt ? (
                        <p className="fs-12.5 text-slate-500">Completed {new Date(attempt.completed_at).toLocaleDateString()}</p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* New quiz dialog */}
        <Dialog open={quizOpen} onOpenChange={(open) => !savingQuiz && setQuizOpen(open)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader><DialogTitle>New Quiz</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={quizForm.title} maxLength={150} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={quizForm.description} maxLength={1000} onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })} /></div>
              <div className="row gap-3 sm:col-6">
                <div><Label>Subject</Label>
                  <Select value={quizForm.subject_id} onValueChange={(v) => setQuizForm({ ...quizForm, subject_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Class</Label>
                  <Select value={quizForm.class_id} onValueChange={(v) => setQuizForm({ ...quizForm, class_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Time limit (minutes)</Label>
                  <Input type="number" min={1} max={300} value={quizForm.time_limit_minutes} onChange={(e) => setQuizForm({ ...quizForm, time_limit_minutes: e.target.value })} />
                </div>
              </div>

              <div className="space-y-3 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                <div className="d-flex align-items-center justify-content-between gap-3">
                  <div>
                    <p className="fs-14 fw-medium text-slate-900">Questions and answer key</p>
                    <p className="fs-12.5 text-slate-500">Add every question before publishing the quiz.</p>
                  </div>
                  <Badge variant="secondary">{newQuizQuestions.length}</Badge>
                </div>
                {newQuizQuestions.map((question, index) => (
                  <div key={`${question.sort_order}-${question.question_text}`} className="d-flex align-items-start justify-content-between gap-2 rounded-[8px] bg-slate-100 p-3">
                    <div>
                      <p className="fs-13.5 fw-medium text-slate-900">{index + 1}. {question.question_text}</p>
                      <p className="mt-1 fs-11.5 text-slate-500">Correct: {question.correct_option.toUpperCase()} Â· {question.points} pt(s)</p>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      aria-label={`Remove new question ${index + 1}`}
                      onClick={() => setNewQuizQuestions((current) =>
                        current.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i + 1 })),
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <div className="space-y-2 rounded-[8px] border border-dashed border-slate-300 bg-white p-3">
                  <Textarea placeholder="Question" maxLength={1000} value={questionForm.question_text} onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })} />
                  <div className="row gap-2 sm:col-6">
                    <Input placeholder="Option A" maxLength={300} value={questionForm.option_a} onChange={(e) => setQuestionForm({ ...questionForm, option_a: e.target.value })} />
                    <Input placeholder="Option B" maxLength={300} value={questionForm.option_b} onChange={(e) => setQuestionForm({ ...questionForm, option_b: e.target.value })} />
                    <Input placeholder="Option C (optional)" maxLength={300} value={questionForm.option_c} onChange={(e) => setQuestionForm({ ...questionForm, option_c: e.target.value })} />
                    <Input placeholder="Option D (optional)" maxLength={300} value={questionForm.option_d} onChange={(e) => setQuestionForm({ ...questionForm, option_d: e.target.value })} />
                  </div>
                  <div className="row gap-2 sm:col-6">
                    <div>
                      <Label className="fs-13">Correct option</Label>
                      <Select value={questionForm.correct_option} onValueChange={(v) => setQuestionForm({ ...questionForm, correct_option: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="a">A</SelectItem>
                          <SelectItem value="b">B</SelectItem>
                          <SelectItem value="c">C</SelectItem>
                          <SelectItem value="d">D</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="fs-13">Points</Label>
                      <Input type="number" min={1} max={20} value={questionForm.points} onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })} />
                    </div>
                  </div>
                  <Button variant="outline" className="gap-2" onClick={addNewQuizQuestion}><Plus className="h-4 w-4" />Add Question</Button>
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="fs-14 fw-medium text-slate-900">Published</p>
                  <p className="fs-13 text-slate-500">Students can take it once published</p>
                </div>
                <Switch checked={quizForm.is_published} onCheckedChange={(v) => setQuizForm({ ...quizForm, is_published: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setQuizOpen(false)} disabled={savingQuiz}>Cancel</Button>
              <Button onClick={saveQuiz} disabled={savingQuiz} className="gap-2">
                {savingQuiz && <Loader2 className="h-4 w-4 animate-spin" />}
                {quizForm.is_published ? 'Publish quiz' : 'Create draft'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI quiz generator */}
        <Dialog open={aiOpen} onOpenChange={(o) => { if (!aiBusy) setAiOpen(o); }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader><DialogTitle className="d-flex align-items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-600" />Generate quiz with AI</DialogTitle></DialogHeader>
            {!aiDraft ? (
              <div className="space-y-3">
                <div>
                  <Label>Lesson topic or course material</Label>
                  <Textarea rows={8} maxLength={20000} placeholder="e.g. Photosynthesis â€” or paste your lesson notes here" value={aiMaterial} onChange={(e) => setAiMaterial(e.target.value)} />
                  <p className="mt-1 fs-12.5 text-slate-500">{aiMaterial.length}/20000</p>
                </div>
                <div className="row gap-3 sm:col-6">
                  <div><Label>Number of questions</Label><Input type="number" min={1} max={20} value={aiCount} onChange={(e) => setAiCount(e.target.value)} /></div>
                  <div><Label className="fs-13">Class level (optional)</Label><Input placeholder="e.g. Senior 2" maxLength={100} value={aiLevel} onChange={(e) => setAiLevel(e.target.value)} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAiOpen(false)} disabled={aiBusy}>Cancel</Button>
                  <Button className="gap-2" onClick={generateWithAI} disabled={aiBusy}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiBusy ? 'Generatingâ€¦' : 'Generate'}
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="row gap-3 sm:col-6">
                  <div className="sm:col-span-2"><Label>Title</Label><Input value={aiDraft.title} maxLength={150} onChange={(e) => setAiDraft({ ...aiDraft, title: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Description</Label><Textarea value={aiDraft.description} maxLength={1000} onChange={(e) => setAiDraft({ ...aiDraft, description: e.target.value })} /></div>
                  <div><Label>Subject</Label>
                    <Select value={aiSubject} onValueChange={setAiSubject}>
                      <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                      <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Class</Label>
                    <Select value={aiClass} onValueChange={setAiClass}>
                      <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="fs-14 fw-semibold text-slate-900">Questions & answer key â€” edit anything before saving</p>
                {aiDraft.questions.map((q, i) => (
                  <div key={i} className="space-y-2 rounded-[10px] border border-slate-200 p-3">
                    <div className="d-flex align-items-start gap-2">
                      <span className="pt-2 fs-14 fw-semibold text-slate-900">{i + 1}.</span>
                      <Textarea rows={2} value={q.question_text} onChange={(e) => updateDraftQ(i, { question_text: e.target.value })} />
                      <Button variant="destructive" size="icon" aria-label="Remove question" onClick={() => setAiDraft({ ...aiDraft, questions: aiDraft.questions.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="row gap-2 sm:col-6">
                      {(['a', 'b', 'c', 'd'] as const).map((k) => (
                        <div key={k} className="d-flex align-items-center gap-2">
                          <span className={`w-5 fs-12 fw-bold ${q.correct_option === k ? 'text-emerald-600' : 'text-slate-400'}`}>{k.toUpperCase()}</span>
                          <Input value={q[`option_${k}`]} maxLength={300} onChange={(e) => updateDraftQ(i, { [`option_${k}`]: e.target.value } as Partial<DraftQuestion>)} />
                        </div>
                      ))}
                    </div>
                    <div className="d-flex flex-wrap align-items-center gap-3">
                      <Label className="fs-12.5">Correct answer</Label>
                      <Select value={q.correct_option} onValueChange={(v) => updateDraftQ(i, { correct_option: v })}>
                        <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{['a', 'b', 'c', 'd'].map((k) => <SelectItem key={k} value={k}>{k.toUpperCase()}</SelectItem>)}</SelectContent>
                      </Select>
                      {q.explanation && <p className="fs-12.5 text-slate-500">{q.explanation}</p>}
                    </div>
                  </div>
                ))}
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setAiDraft(null)} disabled={aiBusy}>Back</Button>
                  <Button onClick={saveAiQuiz} disabled={aiBusy || aiDraft.questions.length === 0} className="gap-2">
                    {aiBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Publish quiz
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Manage questions */}
        <Dialog open={!!manageQuiz} onOpenChange={(o) => !o && setManageQuiz(null)}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{manageQuiz?.title} â€” Questions</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {questions.length === 0 && <p className="fs-13 text-slate-500">No questions yet.</p>}
              {questions.map((q, i) => (
                <div key={q.id} className="d-flex align-items-start justify-content-between gap-2 rounded-[8px] border border-slate-200 p-3">
                  <div>
                    <p className="fs-13.5 fw-medium text-slate-900">{i + 1}. {q.question_text}</p>
                    <p className="mt-1 fs-11.5 text-slate-500">
                      A) {q.option_a} Â· B) {q.option_b}
                      {q.option_c ? ` Â· C) ${q.option_c}` : ''}{q.option_d ? ` Â· D) ${q.option_d}` : ''}
                    </p>
                    <p className="mt-1 fs-11.5 fw-medium text-emerald-600">
                      Correct: {q.correct_option.toUpperCase()} Â· {q.points} pt(s)
                    </p>
                  </div>
                  <Button variant="destructive" size="icon" aria-label="Delete question" onClick={() => removeQuestion(q.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <div className="space-y-2 rounded-[8px] border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="fs-14 fw-medium text-slate-900">Add a question</p>
              <Textarea placeholder="Question" maxLength={1000} value={questionForm.question_text} onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })} />
              <div className="row gap-2 sm:col-6">
                <Input placeholder="Option A" maxLength={300} value={questionForm.option_a} onChange={(e) => setQuestionForm({ ...questionForm, option_a: e.target.value })} />
                <Input placeholder="Option B" maxLength={300} value={questionForm.option_b} onChange={(e) => setQuestionForm({ ...questionForm, option_b: e.target.value })} />
                <Input placeholder="Option C (optional)" maxLength={300} value={questionForm.option_c} onChange={(e) => setQuestionForm({ ...questionForm, option_c: e.target.value })} />
                <Input placeholder="Option D (optional)" maxLength={300} value={questionForm.option_d} onChange={(e) => setQuestionForm({ ...questionForm, option_d: e.target.value })} />
              </div>
              <div className="row gap-2 sm:col-6">
                <div>
                  <Label>Correct option</Label>
                  <Select value={questionForm.correct_option} onValueChange={(v) => setQuestionForm({ ...questionForm, correct_option: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a">A</SelectItem><SelectItem value="b">B</SelectItem><SelectItem value="c">C</SelectItem><SelectItem value="d">D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Points</Label>
                  <Input type="number" min={1} max={20} value={questionForm.points} onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })} />
                </div>
              </div>
              <Button className="gap-2" onClick={addQuestion}><Plus className="h-4 w-4" />Add Question</Button>
            </div>
            {!manageQuiz?.is_published && (
              <DialogFooter className="gap-2 sm:justify-content-between">
                <p className="fs-12.5 text-slate-500">This is a draft. Students cannot see it yet.</p>
                <Button onClick={publishQuiz} disabled={savingQuiz}>
                  {savingQuiz && <Loader2 className="h-4 w-4 animate-spin" />}Publish quiz
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {/* Take quiz */}
        <Dialog open={!!takeQuiz} onOpenChange={(o) => !o && setTakeQuiz(null)}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>{takeQuiz?.title}</DialogTitle></DialogHeader>
            {takeQuestions.length === 0 ? (
              <p className="fs-13 text-slate-500">This quiz has no questions yet.</p>
            ) : (
              <div className="space-y-4">
                {takeQuestions.map((q, i) => (
                  <div key={q.id} className="space-y-2 rounded-[8px] border border-slate-200 p-3">
                    <p className="fs-13.5 fw-medium text-slate-900">{i + 1}. {q.question_text}</p>
                    <RadioGroup value={answers[q.id] || ''} onValueChange={(v) => setAnswers({ ...answers, [q.id]: v })}>
                      {(['a', 'b', 'c', 'd'] as const).map((key) => {
                        const text = q[`option_${key}` as 'option_a'];
                        if (!text) return null;
                        return (
                          <div key={key} className="d-flex align-items-center gap-2">
                            <RadioGroupItem value={key} id={`${q.id}-${key}`} />
                            <Label htmlFor={`${q.id}-${key}`} className="fw-normal">{key.toUpperCase()}) {text}</Label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setTakeQuiz(null)}>Cancel</Button>
              <Button onClick={submitQuiz} disabled={takeQuestions.length === 0} className="gap-2"><CheckCircle2 className="h-4 w-4" />Submit Answers</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Results */}
        <Dialog open={!!resultsQuiz} onOpenChange={(o) => !o && setResultsQuiz(null)}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>{resultsQuiz?.title} â€” Results</DialogTitle></DialogHeader>
            {attempts.length === 0 ? (
              <p className="fs-13 text-slate-500">No attempts yet.</p>
            ) : (
              <div className="space-y-2">
                {attempts.map((a, i) => (
                  <div key={a.id} className="d-flex align-items-center justify-content-between rounded-[8px] border border-slate-200 p-3">
                    <div>
                      <p className="fs-14 fw-medium text-slate-900">{i + 1}. {a.student ? `${a.student.first_name} ${a.student.last_name}` : 'Student'}</p>
                      <p className="fs-12.5 text-slate-500">{new Date(a.completed_at).toLocaleString()}</p>
                    </div>
                    <Badge className={a.score >= a.total_points * 0.7 ? 'bg-green-100 text-emerald-700' : a.score >= a.total_points * 0.4 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>
                      {a.score}/{a.total_points}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}



