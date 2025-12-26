import React, { useRef } from 'react';

interface CodeEditorProps {
  value: string;
  onChange: (code: string) => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const renderHighlightedCode = () => {
    return value.split('\n').map((line, i) => (
      <div key={i} className="leading-6 h-6 whitespace-pre">
        <span className="text-gray-500 mr-4 select-none w-8 inline-block text-right text-xs opacity-50">
          {i + 1}
        </span>
        {line.split(/(: )/).map((part, j) => {
          if (part.trim().startsWith('#'))
            return (
              <span key={j} className="text-green-600 italic">
                {part}
              </span>
            );
          if (part === ': ')
            return (
              <span key={j} className="text-gray-500">
                {part}
              </span>
            );
          if (!part.includes(':') && /^[a-zA-Z0-9_-]+$/.test(part.trim()))
            return (
              <span key={j} className="text-blue-400">
                {part}
              </span>
            );
          return (
            <span key={j} className="text-[#ce9178]">
              {part}
            </span>
          );
        })}
      </div>
    ));
  };

  return (
    <div className="flex-1 relative font-mono text-sm bg-[#1e1e1e] text-[#d4d4d4] flex flex-col min-h-0">
      <div className="flex-1 relative overflow-auto custom-scrollbar">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 z-10 p-4 pl-14 leading-6 resize-none outline-none caret-white font-mono"
          spellCheck="false"
        />
        <div className="absolute inset-0 p-4 pointer-events-none z-0">
          {renderHighlightedCode()}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
