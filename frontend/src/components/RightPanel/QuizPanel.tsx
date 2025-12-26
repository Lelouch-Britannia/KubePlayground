import React, { useState } from 'react';
import Badge from '../ui/Badge';

interface Option {
  id: string;
  text: string;
}

interface Question {
  id: number;
  text: string;
  options: Option[];
  correct: string;
  explanation: string;
}

interface QuizData {
  questions: Question[];
}

interface QuizPanelProps {
  quizData: QuizData;
}

export const QuizPanel: React.FC<QuizPanelProps> = ({ quizData }) => {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  const toggleOption = (qId: number, optionId: string) => {
    if (showResults) return;
    setAnswers(prev => ({ ...prev, [qId]: optionId }));
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-[#1e1e1e] p-6 custom-scrollbar">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Knowledge Check
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select the best answer for each question.
            </p>
          </div>
          {showResults && <Badge color="green">Complete</Badge>}
        </div>

        {quizData.questions.map((q, idx) => {
          const selected = answers[q.id];
          const isCorrect = selected === q.correct;

          return (
            <div
              key={q.id}
              className="bg-white dark:bg-[#252526] p-5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-bold mt-0.5">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="text-gray-800 dark:text-gray-200 font-medium mb-4">
                    {q.text}
                  </p>

                  <div className="space-y-2">
                    {q.options.map(opt => (
                      <div
                        key={opt.id}
                        onClick={() => toggleOption(q.id, opt.id)}
                        className={`
                          relative flex items-center p-3 rounded-md border cursor-pointer transition-all
                          ${selected === opt.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }
                          ${showResults && q.correct === opt.id
                            ? '!border-green-500 !bg-green-50 dark:!bg-green-900/20'
                            : ''
                          }
                          ${showResults && selected === opt.id && !isCorrect
                            ? '!border-red-500 !bg-red-50 dark:!bg-red-900/20'
                            : ''
                          }
                        `}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border mr-3 flex items-center justify-center
                          ${selected === opt.id ? 'border-blue-500' : 'border-gray-400'}
                          ${showResults && q.correct === opt.id ? '!border-green-500' : ''}
                        `}
                        >
                          {selected === opt.id && (
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                          )}
                          {showResults && q.correct === opt.id && (
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                          )}
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {opt.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  {showResults && (
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400 border-l-2 border-blue-500">
                      <strong>Explanation:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-4">
          {!showResults ? (
            <button
              onClick={() => setShowResults(true)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-sm transition-colors"
            >
              Submit Answers
            </button>
          ) : (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-800 dark:text-green-300 text-center">
              Quiz completed!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizPanel;
