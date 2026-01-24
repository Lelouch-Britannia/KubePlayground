import React, { useState } from 'react';
import { List, CheckSquare, Square } from 'lucide-react';

interface Task {
  id: string;
  text: string;
}

interface Phase {
  phase: string;
  tasks: Task[];
}

interface StepsPanelProps {
  steps: Phase[];
}

export const StepsPanel: React.FC<StepsPanelProps> = ({ steps }) => {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const toggleTask = (id: string) => {
    setCompleted(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!steps || steps.length === 0) {
    return (
      <div className="p-6 text-gray-500 italic text-sm text-center">
        No guided steps available for this exercise.
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full custom-scrollbar">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <List size={20} className="text-blue-500" />
        Guided Steps
      </h3>
      <div className="space-y-8 relative">
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />

        {steps.map((phase, idx) => (
          <div key={idx} className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold shadow-sm">
                {idx + 1}
              </div>
              <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm uppercase tracking-wide">
                {phase.phase}
              </h4>
            </div>

            <div className="ml-11 space-y-3">
              {phase.tasks.map(task => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
                  className={`
                    p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 group
                    ${completed[task.id]
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'
                      : 'bg-white dark:bg-[#252526] border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                    }
                  `}
                >
                  <div
                    className={`mt-0.5 text-gray-400 group-hover:text-blue-500 transition-colors ${completed[task.id] ? 'text-green-500' : ''}`}
                  >
                    {completed[task.id] ? (
                      <CheckSquare size={18} />
                    ) : (
                      <Square size={18} />
                    )}
                  </div>
                  <span
                    className={`text-sm ${completed[task.id]
                      ? 'text-gray-500 line-through'
                      : 'text-gray-700 dark:text-gray-300'
                      }`}
                  >
                    {task.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StepsPanel;
