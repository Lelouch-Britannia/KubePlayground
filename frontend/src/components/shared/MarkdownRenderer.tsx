import React from 'react';

export const parseInline = (text: string): React.ReactNode[] => {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`')) {
      return (
        <code
          key={i}
          className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-red-500 dark:text-red-400 font-mono text-xs border border-gray-200 dark:border-gray-700"
        >
          {part.replace(/`/g, '')}
        </code>
      );
    }
    if (part.startsWith('**')) {
      return (
        <strong key={i} className="font-bold text-gray-900 dark:text-white">
          {part.replace(/\*\*/g, '')}
        </strong>
      );
    }
    return part;
  });
};

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const parts = content.split(/```(\w*)\n([\s\S]*?)```/g);

  return (
    <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      {parts.map((part, index) => {
        if (index % 3 === 1) return null;

        if (index % 3 === 2) {
          const lang = parts[index - 1] || 'text';
          return (
            <div
              key={index}
              className="rounded-md overflow-hidden bg-gray-900 border border-gray-700 my-4 shadow-sm"
            >
              <div className="px-3 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400 font-mono flex items-center justify-between">
                <span>{lang}</span>
                <span className="cursor-pointer hover:text-white">Copy</span>
              </div>
              <pre className="p-3 overflow-x-auto text-gray-100 font-mono text-xs">
                {part.trim()}
              </pre>
            </div>
          );
        }

        return (
          <div key={index}>
            {part.split('\n').map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lineIdx} className="h-2" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h3
                    key={lineIdx}
                    className="text-lg font-bold text-gray-900 dark:text-white mt-6 mb-2"
                  >
                    {trimmed.replace('### ', '')}
                  </h3>
                );
              }

              if (trimmed.startsWith('1. ') || trimmed.startsWith('- ')) {
                return (
                  <li
                    key={lineIdx}
                    className="ml-4 list-outside marker:text-gray-400"
                  >
                    {parseInline(trimmed.replace(/^[1.-]\s/, ''))}
                  </li>
                );
              }

              return (
                <p key={lineIdx} className="mb-2">
                  {parseInline(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default MarkdownRenderer;
