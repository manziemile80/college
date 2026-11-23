import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const getScoreClass = (score: number) => {
    if (score < 0) return 'text-bg-danger';
    if (score === 0) return 'text-bg-secondary';
    return 'text-bg-success';
  };

  const getScoreLabel = (score: number) => {
    if (score < 0) return 'Deducted';
    if (score === 0) return 'No change';
    return 'Added';
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 bd-fs-xs',
    md: 'px-3 py-1 bd-fs-sm',
    lg: 'px-4 py-1.5 bd-fs-md',
  };

  return (
    <span className={cn('badge d-inline-flex align-items-center gap-1.5', getScoreClass(score), sizeClasses[size])}>
      <span className="fw-bold">{score > 0 ? `+${score}` : score}</span>
      <span className="opacity-75">• {getScoreLabel(score)}</span>
    </span>
  );
}
