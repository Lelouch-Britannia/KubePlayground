import React, { useState } from 'react';
import { FileText, List, HelpCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import MarkdownRenderer from '../shared/MarkdownRenderer';
import StepsPanel from './StepsPanel';
import { Clock } from 'lucide-react';

interface Exercise {
  id: string;
  type: string;
  title: string;
  difficulty: string;
  topic: string;
  timeEstimate: string;
  description: string;
  steps: any[];
}

interface DescriptionPanelProps {
  exercise: Exercise;
}

export const DescriptionPanel: React.FC<DescriptionPanelProps> = ({ exercise }) => {
  const [activeTab, setActiveTab] = useState<'description' | 'steps' | 'hints'>('description');

  return (
    <>
      {/* Internal Tabs for Left Panel */}
      <div className="h-10 border-b border-gray-200 dark:border-gray-800 flex items-center px-1 bg-gray-50 dark:bg-[#252526]">
        <button
          onClick={() => setActiveTab('description')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide border-t-2 transition-colors
            ${activeTab === 'description'
              ? 'border-blue-500 bg-white dark:bg-[#1e1e1e] text-blue-600 dark:text-white'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <FileText size={14} /> Description
        </button>
        <button
          onClick={() => setActiveTab('steps')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide border-t-2 transition-colors
            ${activeTab === 'steps'
              ? 'border-blue-500 bg-white dark:bg-[#1e1e1e] text-blue-600 dark:text-white'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <List size={14} /> Steps
        </button>
        <button
          onClick={() => setActiveTab('hints')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide border-t-2 transition-colors ml-auto
            ${activeTab === 'hints'
              ? 'border-blue-500 bg-white dark:bg-[#1e1e1e] text-blue-600 dark:text-white'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }
          `}
        >
          <HelpCircle size={14} /> Hints
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'description' && (
          <div className="h-full overflow-auto p-6 custom-scrollbar">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {exercise.title}
            </h2>
            <div className="flex flex-wrap gap-2 mb-6">
              <Badge color={exercise.difficulty === 'Basic' ? 'green' : 'blue'}>
                {exercise.difficulty}
              </Badge>
              <Badge color="gray">{exercise.topic}</Badge>
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-auto font-medium">
                <Clock size={14} className="mr-1.5" /> {exercise.timeEstimate}
              </div>
            </div>
            <MarkdownRenderer content={exercise.description} />
          </div>
        )}

        {activeTab === 'steps' && (
          <StepsPanel steps={exercise.steps} />
        )}

        {activeTab === 'hints' && (
          <div className="p-6 text-center text-gray-500 italic text-sm">
            <div className="mb-4 inline-block p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-full text-yellow-500">
              <HelpCircle size={32} />
            </div>
            <p>No hints available for this exercise yet. Try checking the "Steps" tab for guidance!</p>
          </div>
        )}
      </div>
    </>
  );
};

export default DescriptionPanel;
