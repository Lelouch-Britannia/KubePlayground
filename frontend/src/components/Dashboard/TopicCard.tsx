import { ChevronRight } from 'lucide-react';

interface TopicCardProps {
  topic: string;
  totalUnits: number;
  completedUnits: number;
  inProgressUnits: number;
  completionPercentage: number;
  onClick?: () => void;
}

export default function TopicCard({
  topic,
  totalUnits,
  completedUnits,
  inProgressUnits,
  completionPercentage,
  onClick
}: TopicCardProps) {

  const getStatusColor = () => {
    if (completionPercentage === 100) return 'text-yellow-400';
    if (completionPercentage > 0) return 'text-blue-400';
    return 'text-slate-500';
  };

  const getProgressBarColor = () => {
    if (completionPercentage === 100) return 'bg-yellow-400';
    if (completionPercentage > 0) return 'bg-blue-500';
    return 'bg-slate-700';
  };

  return (
    <button
      onClick={onClick}
      className="w-full bg-[#44475a] border border-[#6272a4] rounded-lg p-6 hover:border-[#bd93f9] transition-all group text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Topic Icon/Number */}
          <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-lg ${
            completionPercentage === 100
              ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400'
              : completionPercentage > 0
              ? 'bg-blue-500/20 border-blue-500 text-blue-400'
              : 'bg-slate-700/50 border-slate-600 text-slate-400'
          }`}>
            {completedUnits}/{totalUnits}
          </div>

          {/* Topic Name */}
          <div>
            <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">
              {topic}
            </h3>
            <p className="text-sm text-slate-400">
              Chapter · {totalUnits} units
            </p>
          </div>
        </div>

        <ChevronRight className="w-6 h-6 text-slate-500 group-hover:text-blue-400 transition-colors" />
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="w-full bg-[#6272a4]/30 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full ${getProgressBarColor()} transition-all duration-500`}
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${getStatusColor()}`}>
          {completionPercentage.toFixed(0)}% Complete
        </span>
        <div className="flex gap-4 text-slate-400">
          {inProgressUnits > 0 && (
            <span>
              <span className="text-blue-400 font-semibold">{inProgressUnits}</span> in progress
            </span>
          )}
          <span>
            <span className="text-yellow-400 font-semibold">{completedUnits}</span> completed
          </span>
        </div>
      </div>
    </button>
  );
}
