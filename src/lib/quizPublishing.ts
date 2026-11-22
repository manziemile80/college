export interface QuizPublishQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c?: string | null;
  option_d?: string | null;
  correct_option: string;
}

/** A published quiz needs complete questions and a valid answer key. */
export function canPublishQuiz(questions: QuizPublishQuestion[]): boolean {
  if (questions.length === 0) return false;

  return questions.every((question) => {
    const options: Record<string, string | null | undefined> = {
      a: question.option_a,
      b: question.option_b,
      c: question.option_c,
      d: question.option_d,
    };

    return Boolean(
      question.question_text.trim() &&
      question.option_a.trim() &&
      question.option_b.trim() &&
      options[question.correct_option]?.trim()
    );
  });
}
