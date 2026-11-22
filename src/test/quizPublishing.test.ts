import { describe, expect, it } from 'vitest';
import { canPublishQuiz } from '@/lib/quizPublishing';

const completeQuestion = {
  question_text: 'What is 2 + 2?',
  option_a: '3',
  option_b: '4',
  option_c: '5',
  option_d: '6',
  correct_option: 'b',
};

describe('canPublishQuiz', () => {
  it('does not publish a quiz without questions', () => {
    expect(canPublishQuiz([])).toBe(false);
  });

  it('does not publish when the correct answer has no option text', () => {
    expect(canPublishQuiz([{ ...completeQuestion, option_c: '', correct_option: 'c' }])).toBe(false);
  });

  it('publishes a quiz with complete questions and an answer key', () => {
    expect(canPublishQuiz([completeQuestion])).toBe(true);
  });
});
