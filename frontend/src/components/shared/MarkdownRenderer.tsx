import React from 'react';

export const parseInline = (text: string): React.ReactNode[] => {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`')) {
      return (
        <code
          key={i}
          className="bg-[#44475a] px-2 py-1 rounded text-[#ffb86c] font-mono text-base border border-[#6272a4]"
        >
          {part.replace(/`/g, '')}
        </code>
      );
    }
    if (part.startsWith('**')) {
      return (
        <strong key={i} className="font-bold text-[#bd93f9]">
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
    <div className="space-y-4 text-lg text-[#f8f8f2] leading-relaxed">
      {parts.map((part, index) => {
        if (index % 3 === 1) return null;

        if (index % 3 === 2) {
          const lang = parts[index - 1] || 'text';
          return (
            <div
              key={index}
              className="rounded-md overflow-hidden bg-[#44475a] border border-[#6272a4] my-6 shadow-lg"
            >
              <div className="px-4 py-2 bg-[#282a36] border-b border-[#6272a4] text-sm text-[#8be9fd] font-mono flex items-center justify-between">
                <span>{lang}</span>
                <span className="cursor-pointer hover:text-[#bd93f9]">Copy</span>
              </div>
              <pre className="p-4 overflow-x-auto text-[#f8f8f2] font-mono text-base leading-relaxed"
                   style={{ fontSize: '15px', lineHeight: '1.6' }}>
                {part.trim()}
              </pre>
            </div>
          );
        }

        return (
          <div key={index}>
            {part.split('\n').map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lineIdx} className="h-3" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h3
                    key={lineIdx}
                    className="text-2xl font-bold text-[#50fa7b] mt-8 mb-4"
                  >
                    {trimmed.replace('### ', '')}
                  </h3>
                );
              }

              if (trimmed.startsWith('## ')) {
                return (
                  <h2
                    key={lineIdx}
                    className="text-3xl font-bold text-[#ff79c6] mt-10 mb-5"
                  >
                    {trimmed.replace('## ', '')}
                  </h2>
                );
              }

              if (/^\d+\.\s/.test(trimmed)) {
                return (
                  <li
                    key={lineIdx}
                    className="ml-6 mb-2 list-decimal list-outside marker:text-[#bd93f9] text-lg leading-relaxed"
                  >
                    {parseInline(trimmed.replace(/^\d+\.\s/, ''))}
                  </li>
                );
              }

              if (trimmed.startsWith('- ')) {
                return (
                  <li
                    key={lineIdx}
                    className="ml-6 mb-2 list-disc list-outside marker:text-[#bd93f9] text-lg leading-relaxed"
                  >
                    {parseInline(trimmed.replace(/^-\s/, ''))}
                  </li>
                );
              }

              return (
                <p key={lineIdx} className="mb-3 text-lg leading-relaxed">
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
