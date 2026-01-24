import React from 'react';
import { Terminal, ChevronDown, CheckCircle, XCircle } from 'lucide-react';

interface ValidationResult {
  step: string;
  status: 'passed' | 'failed';
  message: string;
}

interface ConsoleProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  validating: boolean;
  validationResults: ValidationResult[] | null;
}

export const Console: React.FC<ConsoleProps> = ({
  isOpen,
  onToggle,
  validating,
  validationResults,
}) => {
  return (
    <div
      className={`border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] flex flex-col transition-all duration-300 ${isOpen ? 'h-52' : 'h-9'}`}
    >
      <div
        onClick={() => onToggle(!isOpen)}
        className="h-9 min-h-[36px] bg-gray-50 dark:bg-[#252526] border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2a2a2b]"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          <Terminal size={14} /> Console
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-500 transition-transform ${isOpen ? '' : 'rotate-180'}`}
        />
      </div>

      <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-white dark:bg-[#1e1e1e]">
        {validating ? (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            Running kubectl commands...
          </div>
        ) : validationResults ? (
          <div className="space-y-3">
            {validationResults.map((r, i) => (
              <div key={i} className="flex gap-3">
                {r.status === 'passed' ? (
                  <CheckCircle
                    size={14}
                    className="text-green-500 shrink-0 mt-0.5"
                  />
                ) : (
                  <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-gray-700 dark:text-gray-300">
                    {r.step}
                  </div>
                  <div className="text-gray-500 mt-0.5">{r.message}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400 italic">
            Run your code to see validation output here.
          </div>
        )}
      </div>
    </div>
  );
};

export default Console;
