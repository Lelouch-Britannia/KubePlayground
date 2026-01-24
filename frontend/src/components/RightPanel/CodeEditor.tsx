import { Editor } from '@monaco-editor/react';

interface CodeEditorProps {
  value: string;
  onChange: (code: string) => void;
  language?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language = 'python' }) => {
  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={(value) => onChange(value || '')}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineHeight: 24,
        padding: { top: 16, bottom: 16 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        wordWrap: 'on',
        folding: true,
        lineNumbers: 'on',
        renderLineHighlight: 'all',
        scrollbar: {
          vertical: 'visible',
          horizontal: 'visible',
          useShadows: false,
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
        cursorStyle: 'line',
        cursorBlinking: 'smooth',
        smoothScrolling: true,
        contextmenu: false,
      }}
    />
  );
};

export default CodeEditor;
