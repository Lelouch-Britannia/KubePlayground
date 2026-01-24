import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, RotateCcw, ChevronDown, BookOpen, FileText, Clock } from 'lucide-react';
import { apiClient } from '../services/api';
import type { UnitDetail, SyllabusItem } from '../types/api';
import MarkdownRenderer from '../components/shared/MarkdownRenderer';
import Toast from '../components/shared/Toast';
import Confetti from '../components/shared/Confetti';
import CodeEditor from '../components/RightPanel/CodeEditor';

const DUMMY_USER_ID = 'guest-user-001';

export default function LearningUnit() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [allUnits, setAllUnits] = useState<SyllabusItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [leftWidth, setLeftWidth] = useState(50);
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error';
    message: string;
    score?: number;
    total?: number;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeTab, setActiveTab] = useState<'question' | 'solution' | 'submissions'>('question');
  const [hintsExpanded, setHintsExpanded] = useState(false);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [solutionHistory, setSolutionHistory] = useState<any[]>([]);
  const [loadingSolution, setLoadingSolution] = useState(false);

  useEffect(() => {
    fetchSyllabus();
  }, []);

  useEffect(() => {
    if (slug && allUnits.length > 0) {
      const idx = allUnits.findIndex(u => u.slug === slug);
      setCurrentIndex(idx);
      fetchUnit(slug);
    }
  }, [slug, allUnits]);

  const fetchSyllabus = async () => {
    try {
      const data = await apiClient.getSyllabus() as { units: SyllabusItem[] };
      setAllUnits(data.units);
    } catch (err) {
      console.error('Failed to fetch syllabus:', err);
    }
  };

  const fetchUnit = async (unitSlug: string) => {
    try {
      // Only show full loading on initial load, use subtle indicator for navigation
      if (!unit) {
        setLoading(true);
      } else {
        setIsNavigating(true);
      }

      const data = await apiClient.getUnitDetail(unitSlug) as UnitDetail;
      setUnit(data);

      // Initialize code editor with template if coding exercise
      if (data.editor_config) {
        setCode(data.editor_config.initial_code);
      }

      // Reset quiz answers
      setSelectedAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load unit');
      console.error('Unit fetch error:', err);
    } finally {
      setLoading(false);
      setIsNavigating(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX === 0) return;
    const newWidth = (e.clientX / window.innerWidth) * 100;
    if (newWidth > 25 && newWidth < 75) setLeftWidth(newWidth);
  };

  const navigateToUnit = (direction: 'prev' | 'next') => {
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < allUnits.length) {
      navigate(`/unit/${allUnits[newIndex].slug}`);
    }
  };

  const handleQuizSubmit = async () => {
    if (!unit || !unit.quizzes) return;

    try {
      const result = await apiClient.submitQuiz({
        unit_slug: unit.slug,
        user_id: DUMMY_USER_ID,
        answers: selectedAnswers,
      }) as { score_percentage: number; passed: boolean };

      // Show animated toast instead of alert
      const correctCount = Math.round((result.score_percentage / 100) * unit.quizzes.length);
      setToast({
        show: true,
        type: result.passed ? 'success' : 'error',
        message: result.passed
          ? 'Excellent work! You passed the quiz!'
          : `You need 70% to pass. Keep learning and try again!`,
        score: correctCount,
        total: unit.quizzes.length,
      });

      // Show confetti on success!
      if (result.passed) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      // Update progress if passed
      if (result.passed) {
        await apiClient.updateProgress({
          user_id: DUMMY_USER_ID,
          unit_slug: unit.slug,
          status: 'completed',
          score: result.score_percentage,
        });
      }
    } catch (err) {
      console.error('Quiz submission error:', err);
      setToast({
        show: true,
        type: 'error',
        message: 'Failed to submit quiz. Please try again.',
      });
    }
  };

  const handleCodeSubmit = async () => {
    if (!unit) return;

    try {
      // Save solution first
      await apiClient.autosaveSolution({
        unit_slug: unit.slug,
        user_id: DUMMY_USER_ID,
        code,
        language: unit.editor_config?.language || 'yaml',
      });

      // Verify code (stub for now)
      const result = await apiClient.verifyCode({
        unit_slug: unit.slug,
        user_id: DUMMY_USER_ID,
        code,
        language: unit.editor_config?.language || 'yaml',
      }) as { success: boolean; message: string };

      // Show animated toast instead of alert
      setToast({
        show: true,
        type: result.success ? 'success' : 'error',
        message: result.message,
      });

      // Mark as in progress
      await apiClient.updateProgress({
        user_id: DUMMY_USER_ID,
        unit_slug: unit.slug,
        status: 'started',
      });
    } catch (err) {
      console.error('Code submission error:', err);
      setToast({
        show: true,
        type: 'error',
        message: 'Failed to submit code. Please try again.',
      });
    }
  };

  const fetchSolutionHistory = async () => {
    if (!unit) return;

    setLoadingSolution(true);
    try {
      const data = await apiClient.getSolutionHistory(unit.slug, DUMMY_USER_ID) as { versions: any[] };
      setSolutionHistory(data.versions || []);
    } catch (err) {
      console.error('Failed to fetch solution history:', err);
      setSolutionHistory([]);
    } finally {
      setLoadingSolution(false);
    }
  };

  // Fetch solution history when Solution tab is clicked
  useEffect(() => {
    if (activeTab === 'submissions' && unit) {
      fetchSolutionHistory();
    }
  }, [activeTab, unit]);

  if (loading) {
    return (
      <div className="h-screen bg-[#1e1e1e] flex items-center justify-center">
        <div className="text-white text-xl">Loading unit...</div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="h-screen bg-[#1e1e1e] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error || 'Unit not found'}</div>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-3 bg-[#2cbb5d] text-white rounded font-medium hover:bg-[#26a550] text-base"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allUnits.length - 1;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="h-14 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-5 shrink-0">
        {isNavigating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-500 animate-pulse" />
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
          >
            <Home size={18} />
            <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
          </button>

          <div className="h-5 w-px bg-[#444] mx-2" />

          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-400 font-medium">{unit.topic}</div>
            <div className="text-sm text-gray-600">/</div>
            <div className="text-sm text-white font-medium">{unit.title}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToUnit('prev')}
            disabled={!hasPrev || isNavigating}
            className="p-2 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm text-gray-300 font-mono font-medium min-w-[60px] text-center">
            {currentIndex + 1} / {allUnits.length}
          </span>
          <button
            onClick={() => navigateToUnit('next')}
            disabled={!hasNext || isNavigating}
            className="p-2 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative p-4 gap-2">
        {/* Left Panel - Description/Content with Tabs */}
        <div
          style={{ width: `${leftWidth}%` }}
          className={`flex flex-col bg-[#282a36] border border-[#44475a] rounded-lg min-w-[350px] overflow-hidden transition-opacity duration-200 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}
        >
          {/* Tabs */}
          <div className="h-12 bg-[#282a36] border-b border-[#44475a] flex items-center px-4 shrink-0">
            <button
              onClick={() => setActiveTab('question')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'question'
                  ? 'text-[#f8f8f2] border-b-2 border-[#bd93f9]'
                  : 'text-[#6272a4] hover:text-[#f8f8f2]'
              }`}
            >
              <BookOpen className="inline-block w-4 h-4 mr-1.5" />
              Question
            </button>
            <button
              onClick={() => setActiveTab('solution')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'solution'
                  ? 'text-[#f8f8f2] border-b-2 border-[#bd93f9]'
                  : 'text-[#6272a4] hover:text-[#f8f8f2]'
              }`}
            >
              <FileText className="inline-block w-4 h-4 mr-1.5" />
              Solution
            </button>
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'submissions'
                  ? 'text-[#f8f8f2] border-b-2 border-[#bd93f9]'
                  : 'text-[#6272a4] hover:text-[#f8f8f2]'
              }`}
            >
              <Clock className="inline-block w-4 h-4 mr-1.5" />
              Submissions
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 white-scrollbar">
            {activeTab === 'question' && (
              <>
                {/* Description */}
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-[#bd93f9] mb-5">{unit.title}</h2>
                  <div className="text-[#f8f8f2] text-base leading-relaxed prose prose-invert max-w-none">
                    <MarkdownRenderer content={unit.description} />
                  </div>
                </div>

                {/* Steps */}
                {unit.steps && unit.steps.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-[#50fa7b] mb-4">Steps</h3>
                    <ol className="list-decimal list-inside space-y-2.5 text-[#f8f8f2] text-base leading-relaxed">
                      {unit.steps.map((step, idx) => (
                        <li key={idx} className="pl-2">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Collapsible Hints */}
                {unit.hints && unit.hints.length > 0 && (
                  <div className="mb-6">
                    <button
                      onClick={() => setHintsExpanded(!hintsExpanded)}
                      className="flex items-center justify-between w-full px-4 py-3 bg-[#44475a] hover:bg-[#6272a4] border border-[#6272a4] rounded-lg transition-colors"
                    >
                      <span className="text-base font-semibold text-[#f1fa8c] flex items-center gap-2">
                        💡 Hints ({unit.hints.length})
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-[#f1fa8c] transition-transform ${
                          hintsExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {hintsExpanded && (
                      <div className="mt-3 px-4 py-3 bg-[#44475a] border border-[#6272a4] rounded-lg">
                        <ul className="space-y-3 text-[#f8f8f2] text-base leading-relaxed">
                          {unit.hints.map((hint, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-[#f1fa8c] font-bold">{idx + 1}.</span>
                              <span>{hint}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'solution' && (
              <div className="text-center py-12">
                <p className="text-[#6272a4] text-base">Solutions will be available after completing the exercise.</p>
              </div>
            )}

            {activeTab === 'submissions' && (
              <div>
                {loadingSolution ? (
                  <div className="text-center py-12">
                    <p className="text-[#6272a4] text-base">Loading submissions...</p>
                  </div>
                ) : solutionHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-[#6272a4] text-base">No submissions yet. Submit your solution to see it here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-[#bd93f9] mb-4">Your Submissions</h3>
                    {solutionHistory.map((version, idx) => (
                      <div key={version.version} className="bg-[#44475a] border border-[#6272a4] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-[#8be9fd] font-semibold">Version {version.version}</span>
                            {idx === 0 && (
                              <span className="px-2 py-1 bg-[#50fa7b] text-[#282a36] text-xs font-medium rounded">
                                Latest
                              </span>
                            )}
                          </div>
                          <span className="text-[#6272a4] text-sm">
                            {new Date(version.auto_saved_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-[#282a36] rounded p-3 overflow-x-auto">
                          <pre className="text-[#f8f8f2] font-mono text-sm">
                            {version.code_preview || 'No preview available'}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resizer */}
        <div
          className="w-1.5 bg-transparent hover:bg-[#bd93f9] cursor-col-resize z-10 transition-colors"
          onDrag={handleDrag}
          draggable
          onDragEnd={handleDrag}
        />

        {/* Right Panel - Editor/Quiz */}
        <div className={`flex-1 flex flex-col min-w-[400px] bg-[#282a36] border border-[#44475a] rounded-lg overflow-hidden transition-opacity duration-200 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}>
          {unit.type === 'coding' && unit.editor_config && (
            <>
              {/* Editor Header */}
              <div className="h-12 bg-[#44475a] border-b border-[#6272a4] flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <select className="bg-[#282a36] text-[#f8f8f2] text-sm px-3 py-1.5 rounded border border-[#6272a4] focus:outline-none focus:border-[#bd93f9]">
                    <option>Python</option>
                  </select>
                </div>
                <button
                  onClick={() => setCode(unit.editor_config!.initial_code)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#f8f8f2] hover:text-[#bd93f9] transition-colors"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>

              {/* Code Editor */}
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  language="python"
                />
              </div>

              {/* Console/Submit Section */}
              <div className="border-t border-[#6272a4] bg-[#282a36]">
                {/* Console Header */}
                <button
                  onClick={() => setConsoleExpanded(!consoleExpanded)}
                  className="w-full h-10 bg-[#44475a] border-b border-[#6272a4] flex items-center justify-between px-4 hover:bg-[#44475a]/80 transition-colors cursor-pointer"
                >
                  <span className="text-sm font-medium text-[#f8f8f2]">Console</span>
                  <ChevronDown
                    size={16}
                    className={`text-[#f8f8f2] transition-transform duration-200 ${consoleExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {/* Console Content */}
                {consoleExpanded && (
                  <div className="h-32 bg-[#282a36] p-3 overflow-y-auto white-scrollbar">
                    <p className="text-xs font-mono text-[#6272a4]">// Output will appear here...</p>
                  </div>
                )}
                {/* Submit Bar */}
                <div className="h-14 bg-[#282a36] border-t border-[#6272a4] flex items-center justify-end px-4 gap-3">
                  <button
                    onClick={handleCodeSubmit}
                    className="px-6 py-2 bg-[#50fa7b] hover:bg-[#50fa7b]/80 text-[#282a36] rounded text-sm font-semibold transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </>
          )}

          {unit.type === 'conceptual' && unit.quizzes && unit.quizzes.length > 0 && (
            <>
              {/* Quiz Header */}
              <div className="h-12 bg-[#44475a] border-b border-[#6272a4] flex items-center px-4">
                <div className="text-sm font-medium text-[#f8f8f2]">Quiz Assessment</div>
              </div>

              {/* Quiz Content */}
              <div className="flex-1 overflow-y-auto p-6 white-scrollbar">
                <div className="space-y-6 max-w-3xl">
                  {unit.quizzes.map((quiz, qIndex) => (
                    <div key={quiz.id} className="bg-[#44475a] border border-[#6272a4] rounded-lg p-5">
                      <h3 className="text-base font-medium text-[#f8f8f2] mb-4 leading-relaxed">
                        <span className="text-[#6272a4] mr-2">{qIndex + 1}.</span>
                        {quiz.question}
                      </h3>
                      <div className="space-y-2">
                        {quiz.options.map((option) => (
                          <label
                            key={option.id}
                            className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-all ${
                              selectedAnswers[quiz.id] === option.id
                                ? 'bg-[#6272a4] border-[#bd93f9]'
                                : 'bg-[#282a36] border-[#44475a] hover:border-[#6272a4]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={quiz.id}
                              value={option.id}
                              checked={selectedAnswers[quiz.id] === option.id}
                              onChange={(e) =>
                                setSelectedAnswers({ ...selectedAnswers, [quiz.id]: e.target.value })
                              }
                              className="mt-1 w-4 h-4 accent-purple-500"
                            />
                            <span className="text-sm text-[#f8f8f2] leading-relaxed">{option.text}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Bar */}
              <div className="h-14 bg-[#282a36] border-t border-[#6272a4] flex items-center justify-end px-4 gap-3 shrink-0">
                <button
                  onClick={handleQuizSubmit}
                  disabled={Object.keys(selectedAnswers).length !== unit.quizzes.length}
                  className="px-6 py-2 bg-[#50fa7b] hover:bg-[#50fa7b]/80 disabled:bg-[#44475a] disabled:cursor-not-allowed text-[#282a36] rounded text-sm font-semibold transition-colors"
                >
                  Submit
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .white-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .white-scrollbar::-webkit-scrollbar-track {
          background: #282a36;
        }
        .white-scrollbar::-webkit-scrollbar-thumb {
          background: #6272a4;
          border-radius: 4px;
        }
        .white-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #bd93f9;
        }
      `}</style>

      {/* Toast Notification */}
      {toast?.show && (
        <Toast
          type={toast.type}
          message={toast.message}
          score={toast.score}
          total={toast.total}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confetti on success */}
      {showConfetti && <Confetti />}
    </div>
  );
}
