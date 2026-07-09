import React, { useState } from 'react';
import { Star, StarHalf } from 'lucide-react';
import { cn } from '@/lib/utils';

type StarSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<StarSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
};

// StarHalf 아이콘의 SVG path는 별의 왼쪽 절반 외곽선만 그리므로,
// 온전한 별처럼 보이려면 회색 outline Star 위에 겹쳐 그려야 한다.
function StarSlot({ index, effective, size }: { index: number; effective: number; size: StarSize }) {
  const iconClass = SIZE_CLASSES[size];

  if (effective >= index + 1) {
    return <Star className={cn(iconClass, 'fill-yellow-400 text-yellow-400')} />;
  }
  if (effective >= index + 0.5) {
    return (
      <span className={cn('relative inline-block', iconClass)}>
        <Star className={cn(iconClass, 'absolute inset-0 text-gray-300')} />
        <StarHalf className={cn(iconClass, 'absolute inset-0 fill-yellow-400 text-yellow-400')} />
      </span>
    );
  }
  return <Star className={cn(iconClass, 'text-gray-300')} />;
}

function pickValueFromClick(e: React.MouseEvent<HTMLButtonElement>, index: number): number {
  const rect = e.currentTarget.getBoundingClientRect();
  const isLeftHalf = e.clientX - rect.left < rect.width / 2;
  return isLeftHalf ? index + 0.5 : index + 1;
}

interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
  size?: StarSize;
}

export function StarRatingInput({ value, onChange, size = 'lg' }: StarRatingInputProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const effective = hoverValue ?? value;

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map(i => (
        <button
          key={i}
          type="button"
          className="relative transition-transform hover:scale-110"
          onMouseMove={e => setHoverValue(pickValueFromClick(e, i))}
          onMouseLeave={() => setHoverValue(null)}
          onClick={e => onChange(pickValueFromClick(e, i))}
        >
          <StarSlot index={i} effective={effective} size={size} />
        </button>
      ))}
    </div>
  );
}

interface StarRatingDisplayProps {
  value: number;
  size?: StarSize;
  showLabel?: boolean;
}

export function StarRatingDisplay({ value, size = 'sm', showLabel = false }: StarRatingDisplayProps) {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map(i => (
        <StarSlot key={i} index={i} effective={value} size={size} />
      ))}
      {showLabel && <span className="ml-1 text-sm text-muted-foreground font-semibold">{value}/5</span>}
    </div>
  );
}
