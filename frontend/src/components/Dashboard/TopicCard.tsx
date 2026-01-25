import { ChevronRight } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

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
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  const getStatusColor = () => {
    if (completionPercentage === 100) return isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600';
    if (completionPercentage > 0) return isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600';
    return isDarkMode ? 'text-dark-text-muted' : 'text-gray-400';
  };

  const getProgressBarColor = () => {
    if (completionPercentage === 100) return isDarkMode ? 'bg-dark-accent-yellow' : 'bg-amber-500';
    if (completionPercentage > 0) return isDarkMode ? 'bg-dark-accent-blue' : 'bg-blue-500';
    return isDarkMode ? 'bg-dark-elevated' : 'bg-gray-200';
  };

  return (
    <button
      onClick={onClick}
      className={`w-full border rounded-xl p-6 transition-all group text-left ${
        isDarkMode
          ? 'bg-dark-surface border-dark-border hover:border-dark-accent-purple/50 hover:shadow-lg hover:shadow-dark-accent-purple/5'
          : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-lg shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Topic Icon/Number */}
          <div className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-bold text-lg ${
            completionPercentage === 100
              ? isDarkMode
                ? 'bg-dark-accent-yellow/20 border-dark-accent-yellow text-dark-accent-yellow'
                : 'bg-amber-100 border-amber-500 text-amber-600'
              : completionPercentage > 0
              ? isDarkMode
                ? 'bg-dark-accent-blue/20 border-dark-accent-blue text-dark-accent-blue'
                : 'bg-blue-100 border-blue-500 text-blue-600'
              : isDarkMode
                ? 'bg-dark-elevated border-dark-border text-dark-text-muted'
                : 'bg-gray-100 border-gray-300 text-gray-400'
          }`}>
            {completedUnits}/{totalUnits}
          </div>

          {/* Topic Name */}
          <div>
            <h3 className={`text-xl font-bold transition-colors ${
              isDarkMode
                ? 'text-dark-text-primary group-hover:text-dark-accent-blue'
                : 'text-gray-900 group-hover:text-blue-600'
            }`}>
              {topic}
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              Chapter · {totalUnits} units
            </p>
          </div>
        </div>

        <ChevronRight className={`w-6 h-6 transition-colors ${
          isDarkMode
            ? 'text-dark-text-muted group-hover:text-dark-accent-blue'
            : 'text-gray-400 group-hover:text-blue-600'
        }`} />
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className={`w-full rounded-full h-2.5 overflow-hidden ${
          isDarkMode ? 'bg-dark-border/50' : 'bg-gray-200'
        }`}>
          <div
            className={`h-full ${getProgressBarColor()} transition-all duration-500 rounded-full`}
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${getStatusColor()}`}>
          {completionPercentage.toFixed(0)}% Complete
        </span>
        <div className={`flex gap-4 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
          {inProgressUnits > 0 && (
            <span>
              <span className={`font-semibold ${isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'}`}>
                {inProgressUnits}
              </span> in progress
            </span>
          )}
          <span>
            <span className={`font-semibold ${isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600'}`}>
              {completedUnits}
            </span> completed
          </span>
        </div>
      </div>
    </button>
  );
}
