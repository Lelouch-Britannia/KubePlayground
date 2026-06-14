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

        {
          const isSeparator = (l: string) => /^\|[\s|:\-]+\|$/.test(l.trim());
          const parseCells = (l: string) =>
            l.trim().split('|').slice(1, -1).map((c) => c.trim());

          type Segment =
            | { type: 'table'; lines: string[] }
            | { type: 'text'; line: string };

          const segments: Segment[] = [];
          const rawLines = part.split('\n');
          let i = 0;
          while (i < rawLines.length) {
            if (rawLines[i].trim().startsWith('|')) {
              const tableLines: string[] = [];
              while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
                tableLines.push(rawLines[i]);
                i++;
              }
              if (tableLines.length >= 2) {
                segments.push({ type: 'table', lines: tableLines });
              } else {
                tableLines.forEach((l) => segments.push({ type: 'text', line: l }));
              }
            } else {
              segments.push({ type: 'text', line: rawLines[i] });
              i++;
            }
          }

          return (
            <div key={index}>
              {segments.map((seg, segIdx) => {
                if (seg.type === 'table') {
                  const nonSep = seg.lines.filter((l) => !isSeparator(l));
                  const headerRow = nonSep[0];
                  const bodyRows = nonSep.slice(1);
                  const headerCells = parseCells(headerRow);
                  return (
                    <table key={segIdx} className="w-full border-collapse text-sm my-4">
                      <thead>
                        <tr>
                          {headerCells.map((cell, ci) => (
                            <th
                              key={ci}
                              className="border border-[#3e3e42] px-3 py-1.5 text-left text-[#569cd6] bg-[#2d2d30] font-semibold"
                            >
                              {parseInline(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bodyRows.map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? 'bg-[#1e1e1e]' : 'bg-[#252526]'}>
                            {parseCells(row).map((cell, ci) => (
                              <td
                                key={ci}
                                className="border border-[#3e3e42] px-3 py-1.5 text-[#cccccc]"
                              >
                                {parseInline(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                }

                const line = seg.line;
                const trimmed = line.trim();
                if (!trimmed) return <div key={segIdx} className="h-2" />;

                if (trimmed.startsWith('### ')) {
                  return (
                    <h3
                      key={segIdx}
                      className="text-base font-semibold text-[#4ec9b0] mt-5 mb-2"
                    >
                      {trimmed.replace('### ', '')}
                    </h3>
                  );
                }

                if (trimmed.startsWith('## ')) {
                  return (
                    <h2
                      key={segIdx}
                      className="text-lg font-bold text-[#569cd6] mt-6 mb-2"
                    >
                      {trimmed.replace('## ', '')}
                    </h2>
                  );
                }

                if (/^\d+\.\s/.test(trimmed)) {
                  return (
                    <li
                      key={segIdx}
                      className="ml-5 mb-1 list-decimal list-outside marker:text-[#c586c0] text-sm leading-relaxed"
                    >
                      {parseInline(trimmed.replace(/^\d+\.\s/, ''))}
                    </li>
                  );
                }

                if (trimmed.startsWith('- ')) {
                  return (
                    <li
                      key={segIdx}
                      className="ml-5 mb-1 list-disc list-outside marker:text-[#c586c0] text-sm leading-relaxed"
                    >
                      {parseInline(trimmed.replace(/^-\s/, ''))}
                    </li>
                  );
                }

                return (
                  <p key={segIdx} className="mb-2 text-sm leading-relaxed">
                    {parseInline(line)}
                  </p>
                );
              })}
            </div>
          );
        }
      })}
    </div>
  );
};

export default MarkdownRenderer;
