import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentStudent } from '@/hooks/useCurrentStudent';
import { supabase } from '@/integrations/supabase/client';
import { canPublishQuiz } from '@/lib/quizPublishing';
import { useToast } from '@/hooks/use-toast';
import { ClaimStudentRecordDialog } from '@/components/students/ClaimStudentRecordDialog';
import { Plus, Trash2, ListChecks, Loader2, Send, CheckCircle2, Sparkles, PenLine, BarChart3, UserCheck } from '@/lib/icons';

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

  const quizCard = (quiz: Quiz) => {
    const attempt = myAttempts.find((a) => a.quiz_id === quiz.id);
    return (
      <div className="card h-100 d-flex flex-column">
        <div className="card-body d-flex flex-column gap-3 p-4">
          <div className="d-flex align-items-start justify-content-between gap-2">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success p-2"><ListChecks className="fs-5" /></span>
            {attempt ? (
              <span className="badge text-bg-success bd-fs-sm">{attempt.score}/{attempt.total_points}</span>
            ) : (
              <span className={`badge bd-fs-sm ${quiz.is_published ? 'text-bg-secondary bg-secondary-subtle' : 'text-bg-warning bg-warning-subtle'}`}>
                {quiz.is_published ? 'Open' : 'Draft'}
              </span>
            )}
          </div>
          <div>
            <h3 className="fw-semibold text-main mb-1 text-truncate">{quiz.title}</h3>
            <p className="mt-1 text-muted bd-fs-sm mb-0 text-truncate-2">{quiz.description || 'No description'}</p>
          </div>
          <div className="d-flex flex-wrap gap-1.5">
            {label(subjects, quiz.subject_id) && (
              <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{label(subjects, quiz.subject_id)}</span>
            )}
            {label(classes, quiz.class_id) && (
              <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{label(classes, quiz.class_id)}</span>
            )}
            {quiz.time_limit_minutes && (
              <span className="badge text-bg-secondary bg-secondary-subtle bd-fs-xs">{quiz.time_limit_minutes} min</span>
            )}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-auto">
            {isStaff ? (
              <>
                <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => openManage(quiz)}><PenLine /> Questions</button>
                <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" onClick={() => openResults(quiz)}><BarChart3 /> Results</button>
                <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete quiz" onClick={() => removeQuiz(quiz.id)}><Trash2 /></button>
              </>
            ) : role === 'student' && !attempt ? (
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => startQuiz(quiz)}><Send /> Start Quiz</button>
            ) : attempt ? (
              <p className="text-muted bd-fs-sm mb-0">Completed {new Date(attempt.completed_at).toLocaleDateString()}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="E-Learning"
          title="Quizzes"
          description={isStaff ? 'Build multiple-choice quizzes and review auto-scored student results.' : 'Take published quizzes and see your score instantly.'}
          actions={isStaff ? (
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline-success d-inline-flex align-items-center gap-1" onClick={() => { setAiDraft(null); setAiOpen(true); }}>
                <Sparkles /> Generate with AI
              </button>
              <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={openNewQuiz}>
                <Plus /> New Quiz
              </button>
            </div>
          ) : undefined}
        />

        {role === 'student' && !studentId && (
          <div className="card border-dashed border-3">
            <div className="card-body d-flex align-items-center justify-content-between gap-4 p-4">
              <div>
                <p className="fw-semibold text-main mb-0">Connect your student profile</p>
                <p className="text-muted bd-fs-sm mb-0">Pick your name once so your quiz answers are saved.</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => setClaimOpen(true)}><UserCheck /> Find my profile</button>
            </div>
          </div>
        )}

        <ClaimStudentRecordDialog open={claimOpen} onOpenChange={setClaimOpen} onLinked={() => { refreshStudent(); }} />

        {loading ? (
          <div className="d-flex justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center py-12 text-center">
              <ListChecks className="fs-3 mb-3 text-secondary" />
              <p className="fw-semibold text-main mb-2">No quizzes yet</p>
              {isStaff && <p className="text-muted bd-fs-sm mb-0">Create your first quiz to get started.</p>}
            </div>
          </div>
        ) : (
          <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-3">
            {quizzes.map((quiz) => <div key={quiz.id} className="col">{quizCard(quiz)}</div>)}
          </div>
        )}

        {/* ── New quiz modal ── */}
        {quizOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">New Quiz</h5>
                    <button type="button" className="btn-close" onClick={() => !savingQuiz && setQuizOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label">Title</label>
                        <input className="form-control" value={quizForm.title} maxLength={150} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} />
                      </div>
                      <div className="col-12">
                        <label className="form-label">Description</label>
                        <textarea className="form-control" value={quizForm.description} maxLength={1000} onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })} />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Subject</label>
                        <select className="form-select" value={quizForm.subject_id} onChange={(e) => setQuizForm({ ...quizForm, subject_id: e.target.value })}>
                          <option value="">Select subject</option>
                          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Class</label>
                        <select className="form-select" value={quizForm.class_id} onChange={(e) => setQuizForm({ ...quizForm, class_id: e.target.value })}>
                          <option value="">Select class</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Time limit (minutes)</label>
                        <input type="number" min={1} max={300} className="form-control" value={quizForm.time_limit_minutes} onChange={(e) => setQuizForm({ ...quizForm, time_limit_minutes: e.target.value })} />
                      </div>
                    </div>

                    <div className="rounded-3 bg-secondary-subtle p-3 d-flex flex-column gap-2">
                      <div className="d-flex align-items-center justify-content-between">
                        <p className="fw-semibold text-main mb-0">Questions and answer key</p>
                        <span className="badge text-bg-secondary bg-secondary-subtle">{newQuizQuestions.length}</span>
                      </div>
                      {newQuizQuestions.map((question, index) => (
                        <div key={`${question.sort_order}-${question.question_text}`} className="d-flex align-items-start justify-content-between gap-2 rounded-3 bg-white border border-secondary-subtle p-3">
                          <div className="min-w-0">
                            <p className="fw-semibold text-main mb-0">{index + 1}. {question.question_text}</p>
                            <p className="text-muted bd-fs-sm mb-0 mt-1">Correct: {question.correct_option.toUpperCase()} · {question.points} pt(s)</p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm d-inline-flex align-items-center"
                            aria-label={`Remove new question ${index + 1}`}
                            onClick={() => setNewQuizQuestions((current) =>
                              current.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i + 1 })),
                            )}
                          >
                            <Trash2 />
                          </button>
                        </div>
                      ))}

                      <div className="d-flex flex-column gap-2 rounded-3 border border-dashed border-secondary-subtle p-3">
                        <p className="fw-semibold text-main mb-0">Add question</p>
                        <textarea className="form-control" placeholder="Question" maxLength={1000} value={questionForm.question_text} onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })} />
                        <div className="row g-2">
                          <div className="col-6 col-md-6"><input className="form-control" placeholder="Option A" maxLength={300} value={questionForm.option_a} onChange={(e) => setQuestionForm({ ...questionForm, option_a: e.target.value })} /></div>
                          <div className="col-6 col-md-6"><input className="form-control" placeholder="Option B" maxLength={300} value={questionForm.option_b} onChange={(e) => setQuestionForm({ ...questionForm, option_b: e.target.value })} /></div>
                          <div className="col-6 col-md-4"><input className="form-control" placeholder="Option C (optional)" maxLength={300} value={questionForm.option_c} onChange={(e) => setQuestionForm({ ...questionForm, option_c: e.target.value })} /></div>
                          <div className="col-6 col-md-2"><input className="form-control" placeholder="Points" type="number" min={1} max={20} value={questionForm.points} onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })} /></div>
                          <div className="col-12 d-flex flex-wrap align-items-center gap-2 mt-1">
                            <label className="form-label mb-0">Correct option</label>
                            <select className="form-select w-auto" value={questionForm.correct_option} onChange={(e) => setQuestionForm({ ...questionForm, correct_option: e.target.value })}>
                              <option value="a">A</option>
                              <option value="b">B</option>
                              <option value="c">C</option>
                              <option value="d">D</option>
                            </select>
                          </div>
                        </div>
                        <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" onClick={addNewQuizQuestion}><Plus /> Add Question</button>
                      </div>
                    </div>

                    <div className="d-flex align-items-center justify-content-between rounded-3 bg-secondary-subtle p-3">
                      <div>
                        <p className="fw-semibold text-main mb-0">Published</p>
                        <p className="text-muted bd-fs-sm mb-0">Students can take it once published</p>
                      </div>
                      <input
                        type="checkbox"
                        className="form-switch"
                        id="quiz-published"
                        checked={quizForm.is_published}
                        onChange={(e) => setQuizForm({ ...quizForm, is_published: e.target.checked })}
                      />
                    </div>
                  </div>
                  <div className="modal-footer d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setQuizOpen(false)} disabled={savingQuiz}>Cancel</button>
                    <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={saveQuiz} disabled={savingQuiz}>
                      {savingQuiz && <span className="spinner-border spinner-border-sm" />}
                      {quizForm.is_published ? 'Publish quiz' : 'Create draft'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── AI quiz generator modal ── */}
        {aiOpen && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex align-items-center justify-content-between border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main d-flex align-items-center gap-2">
                      <Sparkles className="text-success" /> Generate quiz with AI
                    </h5>
                    <button type="button" className="btn-close" onClick={() => { if (!aiBusy) setAiOpen(false); }} aria-label="Close" />
                  </div>
                  {!aiDraft ? (
                    <div className="modal-body d-flex flex-column gap-3">
                      <div>
                        <label className="form-label">Lesson topic or course material</label>
                        <textarea rows={8} className="form-control" maxLength={20000} placeholder="e.g. Photosynthesis — or paste your lesson notes here" value={aiMaterial} onChange={(e) => setAiMaterial(e.target.value)} />
                        <p className="mt-1 text-muted bd-fs-sm">{aiMaterial.length}/20000</p>
                      </div>
                      <div className="row g-2">
                        <div className="col-6 col-md-4"><label className="form-label">Number of questions</label><input type="number" className="form-control" min={1} max={20} value={aiCount} onChange={(e) => setAiCount(e.target.value)} /></div>
                        <div className="col-6 col-md-4"><label className="form-label">Class level (optional)</label><input className="form-control" placeholder="e.g. Senior 2" maxLength={100} value={aiLevel} onChange={(e) => setAiLevel(e.target.value)} /></div>
                      </div>
                      <div className="modal-footer d-flex justify-content-end gap-2">
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setAiOpen(false)} disabled={aiBusy}>Cancel</button>
                        <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={generateWithAI} disabled={aiBusy}>
                          {aiBusy ? <><span className="spinner-border spinner-border-sm" /> Generating...</> : <><Sparkles /> Generate</>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="modal-body d-flex flex-column gap-3">
                      <div className="row g-3">
                        <div className="col-sm-6"><label className="form-label">Title</label><input className="form-control" value={aiDraft.title} maxLength={150} onChange={(e) => setAiDraft({ ...aiDraft, title: e.target.value })} /></div>
                        <div className="col-sm-6"><label className="form-label">Description</label><textarea className="form-control" value={aiDraft.description} maxLength={1000} onChange={(e) => setAiDraft({ ...aiDraft, description: e.target.value })} /></div>
                        <div className="col-12"><label className="form-label">Subject</label>
                          <select className="form-select" value={aiSubject} onChange={(e) => setAiSubject(e.target.value)}>
                            <option value="">Select subject</option>
                            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div className="col-12"><label className="form-label">Class</label>
                          <select className="form-select" value={aiClass} onChange={(e) => setAiClass(e.target.value)}>
                            <option value="">Select class</option>
                            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="fw-semibold text-main">Questions & answer key — edit anything before saving</p>
                      {aiDraft.questions.map((q, i) => (
                        <div key={i} className="d-flex flex-column gap-2 rounded-3 border border-secondary-subtle p-3">
                          <div className="d-flex align-items-start gap-2">
                            <span className="pt-2 fw-semibold text-main">{i + 1}.</span>
                            <textarea rows={2} className="form-control" value={q.question_text} onChange={(e) => updateDraftQ(i, { question_text: e.target.value })} />
                            <button type="button" className="btn btn-outline-danger d-inline-flex align-items-center" aria-label="Remove question" onClick={() => setAiDraft({ ...aiDraft, questions: aiDraft.questions.filter((_, j) => j !== i) })}>
                              <Trash2 />
                            </button>
                          </div>
                          <div className="row g-2">
                            {(['a', 'b', 'c', 'd'] as const).map((k) => (
                              <div key={k} className="d-flex align-items-center gap-2">
                                <span className={`w-5 fw-bold ${q.correct_option === k ? 'text-success' : 'text-secondary'}`}>{k.toUpperCase()}</span>
                                <input className="form-control" value={q[`option_${k}`]} maxLength={300} onChange={(e) => updateDraftQ(i, { [`option_${k}`]: e.target.value } as Partial<DraftQuestion>)} />
                              </div>
                            ))}
                          </div>
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <label className="form-label mb-0">Correct answer</label>
                            <select className="form-select w-auto" value={q.correct_option} onChange={(e) => updateDraftQ(i, { correct_option: e.target.value })}>
                              {['a', 'b', 'c', 'd'].map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}
                            </select>
                            {q.explanation && <p className="text-muted bd-fs-sm mb-0">{q.explanation}</p>}
                          </div>
                        </div>
                      ))}
                      <div className="modal-footer d-flex justify-content-end gap-2">
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setAiDraft(null)} disabled={aiBusy}>Back</button>
                        <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={saveAiQuiz} disabled={aiBusy || aiDraft.questions.length === 0}>
                          {aiBusy && <span className="spinner-border spinner-border-sm" />} Publish quiz
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Manage questions modal ── */}
        {manageQuiz && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{manageQuiz.title} — Questions</h5>
                    <button type="button" className="btn-close" onClick={() => setManageQuiz(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="d-flex flex-column gap-2">
                      {questions.length === 0 && <p className="text-muted bd-fs-sm mb-0">No questions yet.</p>}
                      {questions.map((q, i) => (
                        <div key={q.id} className="d-flex align-items-start justify-content-between gap-2 rounded-3 border border-secondary-subtle p-3">
                          <div className="min-w-0">
                            <p className="fw-semibold text-main mb-0">{i + 1}. {q.question_text}</p>
                            <p className="text-muted bd-fs-sm mt-1 mb-0">
                              A) {q.option_a} · B) {q.option_b}
                              {q.option_c ? ` · C) ${q.option_c}` : ''}{q.option_d ? ` · D) ${q.option_d}` : ''}
                            </p>
                            <p className="fw-semibold text-success bd-fs-sm mt-1 mb-0">
                              Correct: {q.correct_option.toUpperCase()} · {q.points} pt(s)
                            </p>
                          </div>
                          <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete question" onClick={() => removeQuestion(q.id)}><Trash2 /></button>
                        </div>
                      ))}
                    </div>
                    <div className="d-flex flex-column gap-2 rounded-3 border border-dashed border-secondary-subtle p-3">
                      <p className="fw-semibold text-main mb-0">Add a question</p>
                      <textarea className="form-control" placeholder="Question" maxLength={1000} value={questionForm.question_text} onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })} />
                      <div className="row g-2">
                        <div className="col-6"><input className="form-control" placeholder="Option A" maxLength={300} value={questionForm.option_a} onChange={(e) => setQuestionForm({ ...questionForm, option_a: e.target.value })} /></div>
                        <div className="col-6"><input className="form-control" placeholder="Option B" maxLength={300} value={questionForm.option_b} onChange={(e) => setQuestionForm({ ...questionForm, option_b: e.target.value })} /></div>
                        <div className="col-6"><input className="form-control" placeholder="Option C (optional)" maxLength={300} value={questionForm.option_c} onChange={(e) => setQuestionForm({ ...questionForm, option_c: e.target.value })} /></div>
                        <div className="col-6"><input className="form-control" placeholder="Option D (optional)" maxLength={300} value={questionForm.option_d} onChange={(e) => setQuestionForm({ ...questionForm, option_d: e.target.value })} /></div>
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <label className="form-label mb-0">Correct option</label>
                        <select className="form-select w-auto" value={questionForm.correct_option} onChange={(e) => setQuestionForm({ ...questionForm, correct_option: e.target.value })}>
                          <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
                        </select>
                        <label className="form-label mb-0">Points</label>
                        <input type="number" className="form-control w-auto" min={1} max={20} value={questionForm.points} onChange={(e) => setQuestionForm({ ...questionForm, points: e.target.value })} />
                        <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={addQuestion}><Plus /> Add Question</button>
                      </div>
                    </div>
                    {!manageQuiz?.is_published && (
                      <div className="d-flex flex-column justify-content-between gap-2 border-top border-secondary-subtle pt-3">
                        <p className="text-muted bd-fs-sm mb-0">This is a draft. Students cannot see it yet.</p>
                        <button type="button" className="btn btn-primary align-self-end" onClick={publishQuiz} disabled={savingQuiz}>
                          {savingQuiz && <span className="spinner-border spinner-border-sm" />}Publish quiz
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Take quiz modal ── */}
        {takeQuiz && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{takeQuiz.title}</h5>
                    <button type="button" className="btn-close" onClick={() => setTakeQuiz(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    {takeQuestions.length === 0 ? (
                      <p className="text-muted bd-fs-sm mb-0">This quiz has no questions yet.</p>
                    ) : (
                      <div className="d-flex flex-column gap-4">
                        {takeQuestions.map((q, i) => (
                          <div key={q.id} className="rounded-3 border border-secondary-subtle p-3">
                            <p className="fw-semibold text-main mb-2">{i + 1}. {q.question_text}</p>
                            <div className="d-flex flex-column gap-2">
                              {(['a', 'b', 'c', 'd'] as const).map((key) => {
                                const text = q[`option_${key}` as 'option_a'];
                                if (!text) return null;
                                return (
                                  <div key={key} className="form-check">
                                    <input
                                      className="form-check-input"
                                      type="radio"
                                      name={`quiz-q-${q.id}`}
                                      id={`${q.id}-${key}`}
                                      value={key}
                                      checked={answers[q.id] === key}
                                      onChange={() => setAnswers({ ...answers, [q.id]: key })}
                                    />
                                    <label className="form-check-label fw-normal" htmlFor={`${q.id}-${key}`}>
                                      {key.toUpperCase()}) {text}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setTakeQuiz(null)}>Cancel</button>
                    <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={submitQuiz} disabled={takeQuestions.length === 0}><CheckCircle2 /> Submit Answers</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Results modal ── */}
        {resultsQuiz && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{resultsQuiz.title} — Results</h5>
                    <button type="button" className="btn-close" onClick={() => setResultsQuiz(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body">
                    {attempts.length === 0 ? (
                      <p className="text-muted bd-fs-sm mb-0">No attempts yet.</p>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        {attempts.map((a, i) => (
                          <div key={a.id} className="d-flex align-items-center justify-content-between rounded-3 border border-secondary-subtle p-3">
                            <div>
                              <p className="fw-semibold text-main mb-0">{i + 1}. {a.student ? `${a.student.first_name} ${a.student.last_name}` : 'Student'}</p>
                              <p className="text-muted bd-fs-sm mb-0">{new Date(a.completed_at).toLocaleString()}</p>
                            </div>
                            <span className={`badge bd-fs-sm ${a.score >= a.total_points * 0.7 ? 'text-bg-success' : a.score >= a.total_points * 0.4 ? 'text-bg-warning' : 'text-bg-danger'}`}>
                              {a.score}/{a.total_points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
