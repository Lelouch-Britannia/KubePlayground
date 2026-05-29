import React from 'react';

export const parseInline = (text: string): React.ReactNode[] => {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`')) {
      return (
        <code
          key={i}
          className="bg-[#3c3c3c] px-1.5 py-0.5 rounded text-[#ce9178] font-mono text-xs border border-[#454545]"
        >
          {part.replace(/`/g, '')}
        </code>
      );
    }
    if (part.startsWith('**')) {
      return (
        <strong key={i} className="font-bold text-[#4fc1ff]">
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
    <div className="space-y-2 text-sm text-[#cccccc] leading-relaxed">
      {parts.map((part, index) => {
        if (index % 3 === 1) return null;

        if (index % 3 === 2) {
          const lang = parts[index - 1] || 'text';
          return (
            <div
              key={index}
              className="rounded-md overflow-hidden bg-[#1e1e1e] border border-[#3e3e42] my-4 shadow-lg"
            >
              <div className="px-4 py-1.5 bg-[#2d2d30] border-b border-[#3e3e42] text-xs text-[#569cd6] font-mono flex items-center justify-between">
                <span>{lang}</span>
                <span className="cursor-pointer hover:text-[#4ec9b0]">Copy</span>
              </div>
              <pre className="p-4 overflow-x-auto text-[#d4d4d4] font-mono text-xs leading-relaxed">
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
                    className="text-base font-semibold text-[#4ec9b0] mt-5 mb-2"
                  >
                    {trimmed.replace('### ', '')}
                  </h3>
                );
              }

              if (trimmed.startsWith('## ')) {
                return (
                  <h2
                    key={lineIdx}
                    className="text-lg font-bold text-[#569cd6] mt-6 mb-2"
                  >
                    {trimmed.replace('## ', '')}
                  </h2>
                );
              }

              if (/^\d+\.\s/.test(trimmed)) {
                return (
                  <li
                    key={lineIdx}
                    className="ml-5 mb-1 list-decimal list-outside marker:text-[#c586c0] text-sm leading-relaxed"
                  >
                    {parseInline(trimmed.replace(/^\d+\.\s/, ''))}
                  </li>
                );
              }

              if (trimmed.startsWith('- ')) {
                return (
                  <li
                    key={lineIdx}
                    className="ml-5 mb-1 list-disc list-outside marker:text-[#c586c0] text-sm leading-relaxed"
                  >
                    {parseInline(trimmed.replace(/^-\s/, ''))}
                  </li>
                );
              }

              return (
                <p key={lineIdx} className="mb-2 text-sm leading-relaxed">
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
