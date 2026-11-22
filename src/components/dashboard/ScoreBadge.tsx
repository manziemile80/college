import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const getScoreClass = (score: number) => {
    if (score < 0) return 'bg-red-100 text-red-800';
    if (score === 0) return 'bg-slate-200 text-slate-600';
    return 'bg-green-100 text-emerald-700';
  };

  const getScoreLabel = (score: number) => {
    if (score < 0) return 'Deducted';
    if (score === 0) return 'No change';
    return 'Added';
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        getScoreClass(score),
        sizeClasses[size],
      )}
    >
      <span className="font-bold">{score > 0 ? `+${score}` : score}</span>
      <span className="opacity-80">• {getScoreLabel(score)}</span>
    </span>
  );
}
