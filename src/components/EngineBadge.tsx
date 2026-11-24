import React from 'react';
import { Cpu } from 'lucide-react';
import type { EngineId } from '../types';

export function getEngineBadgeText(engine: EngineId): string {
  switch (engine) {
    case 'nano':
      return 'Gemini Nano · Firebase AI Logic · on device';
    case 'cloud':
      return 'Gemini Cloud · Firebase AI Logic · online';
    case 'template':
      return 'Saved plan · no AI';
  }
}

interface EngineBadgeProps {
  engine: EngineId;
  compact?: boolean;
}

export const EngineBadge: React.FC<EngineBadgeProps> = ({ engine, compact = false }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium text-slate-600 ${
        compact ? 'text-xs' : 'text-xs'
      }`}
    >
      <Cpu className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" aria-hidden="true" />
      <span>{getEngineBadgeText(engine)}</span>
    </span>
  );
};
