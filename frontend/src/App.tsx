import React, { useState, useEffect } from 'react';
import {
  Play,
  Send,
  ChevronDown,
  Moon,
  Sun,
  Code,
  LayoutGrid,
  RotateCcw,
} from 'lucide-react';

// Import data
import { EXERCISES, MOCK_VALIDATION_RESULTS } from './data/mockExercises';

// Import components
import DescriptionPanel from './components/LeftPanel/DescriptionPanel';
import CodeEditor from './components/RightPanel/CodeEditor';
import Console from './components/RightPanel/Console';
import QuizPanel from './components/RightPanel/QuizPanel';

// --- Main App ---

export default function App() {
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [leftWidth, setLeftWidth] = useState(40);
  const [code, setCode] = useState(EXERCISES[0].template);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<'code' | 'solution'>('code');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<any>(null);

  const currentExercise = EXERCISES[currentExerciseIdx];

  useEffect(() => {
    // Reset state when exercise changes
    setCode(currentExercise.template || '');
    setValidationResults(null);
    setActiveRightTab('code');
  }, [currentExerciseIdx, currentExercise]);

  const handleDrag = (e: DragEvent) => {
    if (e.clientX === 0) return;
    const newWidth = (e.clientX / window.innerWidth) * 100;
    if (newWidth > 25 && newWidth < 75) setLeftWidth(newWidth);
  };

  const handleExerciseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentExerciseIdx(Number(e.target.value));
  };

  const handleTopicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTopic = e.target.value;
    const firstExInTopic = EXERCISES.findIndex(ex => ex.topic === newTopic);
    if (firstExInTopic !== -1) {
      setCurrentExerciseIdx(firstExInTopic);
    }
  };

  const runValidation = () => {
    setValidating(true);
    setConsoleOpen(true);
    setValidationResults(null);
    setTimeout(() => {
      setValidating(false);
      setValidationResults(MOCK_VALIDATION_RESULTS);
    }, 1500);
  };

  // Group exercises by topic
  const exercisesByTopic = EXERCISES.reduce((acc: any, ex, idx) => {
    if (!acc[ex.topic]) acc[ex.topic] = [];
    acc[ex.topic].push({ ...ex, idx });
    return acc;
  }, {});

  const topics = Object.keys(exercisesByTopic);
  const currentTopic = currentExercise.topic;

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col ${theme === 'dark' ? 'dark' : ''} bg-gray-50 dark:bg-[#121212]`}>
      {/* Header */}
      <header className="h-14 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white text-lg">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white shadow-md">
              <Code size={18} strokeWidth={2.5} />
            </div>
            <span className="hidden sm:inline">KubePlayground</span>
          </div>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />

          {/* Topic Selector */}
          <div className="relative group">
            <LayoutGrid size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
            <select
              value={currentTopic}
              onChange={handleTopicChange}
              className="pl-9 pr-8 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 border-none text-sm font-bold text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[140px] appearance-none uppercase tracking-wide"
            >
              {topics.map(topic => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          {/* Exercise Selector */}
          <div className="relative group">
            <select
              value={currentExerciseIdx}
              onChange={handleExerciseChange}
              className="pl-4 pr-8 py-1.5 rounded-md bg-white dark:bg-[#252526] border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[220px] appearance-none shadow-sm"
            >
              {exercisesByTopic[currentTopic]?.map((ex: any) => (
                <option key={ex.id} value={ex.idx}>
                  {ex.title}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentExercise.type === 'code' && (
            <div className="flex gap-2 mr-4">
              <button
                onClick={runValidation}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <Play size={14} className="fill-current opacity-80" /> Run Code
              </button>
              <button
                onClick={runValidation}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded shadow-sm transition-colors"
              >
                <Send size={14} /> Submit
              </button>
            </div>
          )}

          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="h-8 w-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ring-2 ring-white dark:ring-gray-700">
            JS
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel */}
        <div
          style={{ width: `${leftWidth}%` }}
          className="flex flex-col bg-white dark:bg-[#1e1e1e] border-r border-gray-200 dark:border-gray-800 min-w-[350px]"
        >
          <DescriptionPanel exercise={currentExercise} />
        </div>

        {/* Resizer */}
        <div
          className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-blue-500 cursor-col-resize z-10 transition-colors"
          onDrag={handleDrag}
          draggable
          onDragEnd={handleDrag}
        />

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-w-[400px] bg-white dark:bg-[#1e1e1e]">
          {currentExercise.type === 'code' && (
            <>
              {/* Editor Tabs */}
              <div className="h-10 bg-[#f3f4f6] dark:bg-[#252526] flex items-center border-b border-gray-200 dark:border-gray-800 px-1">
                <button
                  onClick={() => setActiveRightTab('code')}
                  className={`h-full px-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wide border-t-2 transition-colors
                    ${activeRightTab === 'code'
                      ? 'border-blue-500 bg-white dark:bg-[#1e1e1e] text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }
                  `}
                >
                  <Code size={14} /> Code
                </button>
                <button
                  onClick={() => setActiveRightTab('solution')}
                  className={`h-full px-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide border-t-2 transition-colors
                    ${activeRightTab === 'solution'
                      ? 'border-green-500 bg-white dark:bg-[#1e1e1e] text-green-600 dark:text-green-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }
                  `}
                >
                  Solution
                </button>
                <button
                  onClick={() => setCode(currentExercise.template)}
                  className="ml-auto mr-3 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw size={12} /> Reset Template
                </button>
              </div>

              {/* Editor Content */}
              <div className="flex-1 flex flex-col relative">
                {activeRightTab === 'code' ? (
                  <>
                    <CodeEditor value={code} onChange={setCode} />
                    <Console
                      isOpen={consoleOpen}
                      onToggle={setConsoleOpen}
                      validating={validating}
                      validationResults={validationResults}
                    />
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    Solution view placeholder
                  </div>
                )}
              </div>
            </>
          )}

          {currentExercise.type === 'quiz' && (
            <QuizPanel quizData={currentExercise.quizData} />
          )}
        </div>
      </div>

      {/* Global Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </div>
  );
}
