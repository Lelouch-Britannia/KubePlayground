import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RotateCcw, ChevronDown, BookOpen, History } from 'lucide-react';
import { apiClient } from '../services/api';
import type { UnitDetail, SyllabusItem, ValidationResponse, WSMessage, RunCompleteData, ValidateOnlyResponse, UserSubmission } from '../types/api';
import MarkdownRenderer from '../components/shared/MarkdownRenderer';
import Toast from '../components/shared/Toast';
import Confetti from '../components/shared/Confetti';
import CodeEditor from '../components/RightPanel/CodeEditor';
import { Console } from '../components/RightPanel/Console';
import UserMenu from '../components/shared/UserMenu';
import UnitNavigation from '../components/shared/UnitNavigation';
import { useAuth } from '../contexts/AuthContext';

export default function LearningUnit() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [allUnits, setAllUnits] = useState<SyllabusItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({}); // quiz/grading feature commented out
  const [leftWidth, setLeftWidth] = useState(50);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
    score?: number;
    total?: number;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeTab, setActiveTab] = useState<'question' | 'submissions'>('question');
  const [submissions, setSubmissions] = useState<UserSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [hintsExpanded, setHintsExpanded] = useState(false);
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(250);
  const consoleResizing = useRef(false);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  // const [solutionHistory, setSolutionHistory] = useState<any[]>([]); // quiz/grading feature commented out
  // const [loadingSolution, setLoadingSolution] = useState(false); // quiz/grading feature commented out
  // const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle'); // quiz/grading feature commented out
  // const [lastSavedCode, setLastSavedCode] = useState(''); // quiz/grading feature commented out
  const [isCompleted, setIsCompleted] = useState(false);
  const [_completedScore, setCompletedScore] = useState<number | null>(null); // quiz/grading feature commented out (_completedScore unused since quiz panel removed)
  // const [quizResults, setQuizResults] = useState<Record<string, { is_correct: boolean }>>( {}); // quiz/grading feature commented out
  const [validating, setValidating] = useState(false);
  const [validationResponse, setValidationResponse] = useState<ValidationResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [runNamespace, setRunNamespace] = useState<string | null>(null);
  const [runComplete, setRunComplete] = useState(false);
  const [wsMessages, setWsMessages] = useState<WSMessage[]>([]);
  const [runData, setRunData] = useState<RunCompleteData | null>(null);
  const wsRef = useRef<{ close: () => void } | null>(null);

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

  // quiz/grading feature commented out
  // // Autosave code changes (debounced)
  // useEffect(() => {
  //   if (!unit || unit.type !== 'coding' || !code || code === lastSavedCode) return;
  //
  //   const timer = setTimeout(async () => {
  //     try {
  //       setAutosaveStatus('saving');
  //       await apiClient.autosaveSolution({
  //         unit_slug: unit.slug,
  //         code,
  //         language: unit.editor_config?.language || 'yaml',
  //       });
  //       setLastSavedCode(code);
  //       setAutosaveStatus('saved');
  //       setTimeout(() => setAutosaveStatus('idle'), 2000);
  //     } catch (err) {
  //       console.error('Autosave failed:', err);
  //       setAutosaveStatus('idle');
  //     }
  //   }, 2000); // 2 second debounce
  //
  //   return () => clearTimeout(timer);
  // }, [code, unit, lastSavedCode]);

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
      // Reset completion state for new unit
      setIsCompleted(false);
      setCompletedScore(null);
      // setQuizResults({}); // quiz/grading feature commented out
      // setSelectedAnswers({}); // Reset selected answers when navigating to new unit // quiz/grading feature commented out

      // Reset console/run state for new unit
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsMessages([]);
      setValidationResponse(null);
      setRunning(false);
      setRunComplete(false);
      setRunNamespace(null);
      setRunData(null);
      setConsoleExpanded(false);
      setValidating(false);
      setActiveTab('question');
      setSubmissions([]);

      // Only show full loading on initial load, use subtle indicator for navigation
      if (!unit) {
        setLoading(true);
      } else {
        setIsNavigating(true);
      }

      const data = await apiClient.getUnitDetail(unitSlug) as UnitDetail;
      setUnit(data);
      // Open right panel for coding units (editor); conceptual defaults to full-width
      setRightPanelOpen(data.type === 'coding' && !!data.editor_config);

      // Load previous solution for coding exercises
      if (data.editor_config) {
        // Load previous solution — commented out (solutions feature disabled)
        // try {
        //   const solution = await apiClient.getLatestSolution(unitSlug) as any;
        //   if (solution?.content) {
        //     setCode(solution.content);
        //   } else {
        //     setCode(data.editor_config.initial_code);
        //   }
        // } catch {
        //   // No previous solution, use template
        //   setCode(data.editor_config.initial_code);
        // }
        setCode(data.editor_config.initial_code);
      }

      // Check if unit was already completed
      let alreadyCompleted = false;
      try {
        const progress = await apiClient.getMyProgress() as any;
        const unitProgress = progress.units?.find((u: any) => u.unit_slug === unitSlug);
        if (unitProgress?.status === 'completed') {
          alreadyCompleted = true;
          setIsCompleted(true);
          setCompletedScore(null); // quiz/grading feature commented out (was: unitProgress.quiz_score || null)

          // quiz/grading feature commented out
          // // For conceptual/quiz units, load previous answers and results
          // if (data.type === 'conceptual' && data.quizzes) {
          //   try {
          //     const lastSubmission = await apiClient.getLastQuizSubmission(unitSlug) as any;
          //     console.log('Last quiz submission loaded:', lastSubmission);
          //     if (lastSubmission?.answers && lastSubmission?.results) {
          //       console.log('User answers:', lastSubmission.answers);
          //       console.log('Quiz results:', lastSubmission.results);
          //       setSelectedAnswers(lastSubmission.answers);
          //
          //       // Build results map for highlighting (only correctness, no correct answer)
          //       const resultsMap: Record<string, { is_correct: boolean }> = {};
          //       lastSubmission.results.forEach((r: any) => {
          //         resultsMap[r.quiz_id] = {
          //           is_correct: r.is_correct,
          //         };
          //       });
          //       setQuizResults(resultsMap);
          //     }
          //   } catch (err) {
          //     console.error('Failed to load quiz results:', err);
          //   }
          // }
        }
      } catch (err) {
        console.error('Failed to load progress:', err);
      }

      // Mark unit as started ONLY if not already completed (don't overwrite completed status)
      if (!alreadyCompleted) {
        try {
          await apiClient.updateProgress({
            unit_slug: unitSlug,
            status: 'started',
          });
        } catch (err) {
          console.error('Failed to track unit start:', err);
        }
      }

      // Don't reset quiz answers - keep them if loaded from previous submission
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

  // Console vertical resize: drag the handle to adjust console height
  const startConsoleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    consoleResizing.current = true;
    const startY = e.clientY;
    const startHeight = consoleHeight;

    const onMove = (ev: MouseEvent) => {
      if (!consoleResizing.current) return;
      // Dragging upward increases console height
      const delta = startY - ev.clientY;
      const panelRect = rightPanelRef.current?.getBoundingClientRect();
      const maxHeight = panelRect ? panelRect.height - 120 : 600;
      const newHeight = Math.max(100, Math.min(maxHeight, startHeight + delta));
      setConsoleHeight(newHeight);
    };

    const onUp = () => {
      consoleResizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // quiz/grading feature commented out

  const fetchSubmissions = async () => {
    if (!unit) return;
    try {
      setSubmissionsLoading(true);
      const data = await apiClient.getSubmissions(unit.slug) as { submissions: UserSubmission[] };
      setSubmissions(data.submissions || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const navigateToUnit = (direction: 'prev' | 'next') => {
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < allUnits.length) {
      navigate(`/unit/${allUnits[newIndex].slug}`);
    }
  };

  // quiz/grading feature commented out
  // const handleQuizSubmit = async () => {
  //   if (!unit || !unit.quizzes) return;
  //
  //   try {
  //     const result = await apiClient.submitQuiz({
  //       unit_slug: unit.slug,
  //       answers: selectedAnswers,
  //     }) as { score_percentage: number; passed: boolean; results: any[] };
  //
  //     // Store results for answer highlighting
  //     const resultsMap: Record<string, { is_correct: boolean; correct_answer: string }> = {};
  //     result.results.forEach((r: any) => {
  //       resultsMap[r.quiz_id] = {
  //         is_correct: r.is_correct,
  //         correct_answer: r.correct_answer,
  //       };
  //     });
  //     setQuizResults(resultsMap);
  //
  //     // Show animated toast
  //     const correctCount = Math.round((result.score_percentage / 100) * unit.quizzes.length);
  //     setToast({
  //       show: true,
  //       type: result.passed ? 'success' : 'error',
  //       message: result.passed
  //         ? 'Excellent work! You passed the quiz!'
  //         : `You need 70% to pass. Review and try again!`,
  //       score: correctCount,
  //       total: unit.quizzes.length,
  //     });
  //
  //     // Show confetti on success!
  //     if (result.passed) {
  //       setShowConfetti(true);
  //       setTimeout(() => setShowConfetti(false), 3000);
  //     }
  //
  //     // Update progress if passed
  //     if (result.passed) {
  //       try {
  //         await apiClient.updateProgress({
  //           unit_slug: unit.slug,
  //           status: 'completed',
  //           score: result.score_percentage,
  //         });
  //         setIsCompleted(true);
  //         setCompletedScore(result.score_percentage);
  //       } catch (progressErr) {
  //         console.error('Failed to update progress:', progressErr);
  //         // Don't show error to user - quiz was still graded successfully
  //       }
  //     }
  //   } catch (err) {
  //     console.error('Quiz submission error:', err);
  //     setToast({
  //       show: true,
  //       type: 'error',
  //       message: 'Failed to submit quiz. Please try again.',
  //     });
  //   }
  // };

  // quiz/grading feature commented out
  // const handleRetryQuiz = () => {
  //   // Clear previous results and answers to allow retaking
  //   setQuizResults({});
  //   setSelectedAnswers({});
  // };

  const handleCodeSubmit = async () => {
    if (!unit) return;
    try {
      setRunning(true);
      setRunComplete(false);
      setRunNamespace(null);
      setRunData(null);
      setValidationResponse(null);
      setValidating(false);
      setWsMessages([]);
      setConsoleExpanded(true);

      const handle = apiClient.runManifestWS(
        { unit_slug: unit.slug, code, language: unit.editor_config?.language || 'yaml' },
        {
          onMessage: (msg: WSMessage) => {
            setWsMessages(prev => [...prev, msg]);
            if (msg.type === 'run_complete') {
              const data = msg.data as unknown as RunCompleteData | undefined;
              if (data) { setRunData(data); setRunNamespace(data.namespace || null); }
              if (msg.status === 'success') {
                setRunComplete(true);
                setToast({ show: true, type: 'info', message: 'Resources deployed! Click "Validate" to run tests.' });
              } else {
                setToast({ show: true, type: 'error', message: msg.message || 'Manifest deployment failed.' });
              }
              setRunning(false);
            }
            if (msg.type === 'error') {
              setToast({ show: true, type: 'error', message: msg.message || 'An error occurred.' });
              setRunning(false);
            }
          },
          onClose: () => setRunning(false),
          onError: () => {
            setRunning(false);
            setToast({ show: true, type: 'error', message: 'WebSocket connection failed.' });
          },
        }
      );
      wsRef.current = handle;
    } catch (err) {
      console.error('Run error:', err);
      setRunning(false);
      setToast({ show: true, type: 'error', message: 'Failed to start deployment. Please try again.' });
    }
  };

  const handleValidate = async () => {
    if (!unit || !runNamespace) return;
    try {
      setValidating(true);
      setConsoleExpanded(true);

      const result = await apiClient.validateOnly({ unit_slug: unit.slug, namespace: runNamespace, code, language: unit.editor_config?.language || 'yaml' }) as ValidateOnlyResponse;

      const fullResponse: ValidationResponse = {
        request_id: result.request_id,
        is_valid: result.passed,
        passed: result.passed,
        message: result.message,
        apply_output: runData?.apply_output,
        resource_status: runData?.resource_status,
        pod_logs: runData?.pod_logs,
        events: runData?.events,
        test_results: result.test_results,
        duration_ms: (runData?.duration_ms || 0) + result.duration_ms,
        namespace: runNamespace,
        phases: [
          ...(runData?.phases || []),
          { name: 'validation', status: result.passed ? 'success' : 'failed', duration_ms: result.duration_ms, output: result.message },
        ],
      };
      setValidationResponse(fullResponse);

      setToast({
        show: true,
        type: result.passed ? 'success' : 'error',
        message: result.passed ? 'All tests passed! Great job!' : 'Some tests failed. Check the console for details.',
      });

      if (result.passed) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        setIsCompleted(true);
        setCompletedScore(100);
      }

      try { await apiClient.cleanupNamespace(runNamespace); } catch { /* non-critical */ }
      setRunNamespace(null);
      setRunComplete(false);
    } catch (err) {
      console.error('Validation error:', err);
      setToast({ show: true, type: 'error', message: 'Validation failed. Please try again.' });
    } finally {
      setValidating(false);
    }
  };

  // quiz/grading feature commented out
  // const fetchSolutionHistory = async () => {
  //   if (!unit) return;
  //
  //   setLoadingSolution(true);
  //   try {
  //     const data = await apiClient.getSolutionHistory(unit.slug) as { saves: any[], total_saves: number };
  //     setSolutionHistory(data.saves || []);
  //   } catch (err) {
  //     console.error('Failed to fetch solution history:', err);
  //     setSolutionHistory([]);
  //   } finally {
  //     setLoadingSolution(false);
  //   }
  // };

  // quiz/grading feature commented out
  // // Fetch solution history when Solution tab is clicked
  // useEffect(() => {
  //   if (activeTab === 'submissions' && unit) {
  //     fetchSolutionHistory();
  //   }
  // }, [activeTab, unit]);

  if (loading) {
    return (
      <div className="h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-dark-text-primary text-xl">Loading unit...</div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error || 'Unit not found'}</div>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-3 bg-dark-accent-green text-white rounded font-medium hover:bg-dark-accent-green/80 text-base"
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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-dark-bg">
      {/* Header */}
      <header className="h-14 bg-dark-surface border-b border-dark-border flex items-center justify-between px-5 shrink-0">
        {isNavigating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-dark-accent-green animate-pulse" />
        )}
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => user ? navigate('/') : navigate('/auth')}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-dark-accent-blue to-dark-accent-green rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
              </svg>
            </div>
            <span className="text-lg font-bold text-dark-text-primary">KubePlayground</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm font-medium rounded text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-active transition-colors"
            >
              Dashboard
            </button>
            <button
              onClick={() => navigate('/courses')}
              className="px-4 py-2 text-sm font-medium rounded text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-active transition-colors"
            >
              Courses
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* User Menu */}
          <UserMenu />
        </div>
      </header>

      {/* Secondary Navigation Banner */}
      <div className="h-12 bg-dark-surface border-b border-dark-border flex items-center px-5 shrink-0">
        {/* Left spacer - balances the right nav arrows */}
        <div className="min-w-[120px]" />

        {/* Center: Topic + Unit dropdowns */}
        <div className="flex-1 flex items-center justify-center">
          <UnitNavigation currentUnitSlug={unit.slug} currentTopic={unit.topic} />
        </div>

        {/* Right: Prev / progress counter / Next — consistent style */}
        <div className="flex items-center gap-1.5 min-w-[120px] justify-end">
          <button
            onClick={() => navigateToUnit('prev')}
            disabled={!hasPrev || isNavigating}
            className="w-8 h-8 flex items-center justify-center rounded bg-dark-elevated text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-dark-text-muted font-medium tabular-nums min-w-[44px] text-center select-none">
            {currentIndex + 1} / {allUnits.length}
          </span>
          <button
            onClick={() => navigateToUnit('next')}
            disabled={!hasNext || isNavigating}
            className="w-8 h-8 flex items-center justify-center rounded bg-dark-elevated text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative p-4 gap-2">
        {/* Left Panel - Description/Content with Tabs */}
        <div
          style={rightPanelOpen ? { width: `${leftWidth}%` } : undefined}
          className={`${rightPanelOpen ? 'min-w-[350px]' : 'flex-1'} flex flex-col bg-dark-surface border border-dark-border rounded-lg overflow-hidden transition-opacity duration-200 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}
        >
          {/* Tabs */}
          <div className="h-12 bg-dark-surface border-b border-dark-border flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center">
              <button
                onClick={() => setActiveTab('question')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'question'
                    ? 'text-dark-text-primary border-b-2 border-dark-accent-purple'
                    : 'text-dark-text-secondary hover:text-dark-text-primary'
                }`}
              >
                <BookOpen className="inline-block w-4 h-4 mr-1.5" />
                Concept
              </button>
              {unit.type === 'coding' && (
                <button
                  onClick={() => { setActiveTab('submissions'); fetchSubmissions(); }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'submissions'
                      ? 'text-dark-text-primary border-b-2 border-dark-accent-purple'
                      : 'text-dark-text-secondary hover:text-dark-text-primary'
                  }`}
                >
                  <History className="inline-block w-4 h-4 mr-1.5" />
                  Submissions
                </button>
              )}
            </div>
            {/* Difficulty badge — inline with the tab bar */}
            {unit.difficulty && (
              <span className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wide rounded border ${
                unit.difficulty === 'beginner'
                  ? 'border-dark-accent-green/40 text-dark-accent-green bg-dark-accent-green/10'
                  : unit.difficulty === 'intermediate'
                  ? 'border-dark-accent-yellow/40 text-dark-accent-yellow bg-dark-accent-yellow/10'
                  : 'border-red-400/40 text-red-400 bg-red-400/10'
              }`}>
                {unit.difficulty}
              </span>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 vscode-scrollbar">
            {activeTab === 'question' && (
              <>
                {/* Description */}
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-[#569cd6] mb-5">{unit.title}</h2>
                  <div className="text-[#cccccc] text-base leading-relaxed max-w-none">
                    <MarkdownRenderer content={unit.description} />
                  </div>
                </div>

                {/* Steps */}
                {unit.steps && unit.steps.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-[#4ec9b0] mb-4">Steps</h3>
                    <ol className="list-decimal list-inside space-y-2.5 text-[#cccccc] text-base leading-relaxed">
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
                      className="flex items-center justify-between w-full px-4 py-3 bg-dark-elevated hover:bg-dark-active border border-dark-border rounded-lg transition-colors"
                    >
                      <span className="text-base font-semibold text-[#dcdcaa] flex items-center gap-2">
                        💡 Hints ({unit.hints.length})
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-[#dcdcaa] transition-transform ${
                          hintsExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {hintsExpanded && (
                      <div className="mt-3 px-4 py-3 bg-dark-elevated border border-dark-border rounded-lg">
                        <ul className="space-y-3 text-[#cccccc] text-base leading-relaxed">
                          {unit.hints.map((hint, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-[#dcdcaa] font-bold">{idx + 1}.</span>
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

            {/* quiz/grading feature commented out */}
            {/* {activeTab === 'solution' && (...)} */}

            {activeTab === 'submissions' && (
              <div>
                {submissionsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-dark-accent-purple border-t-transparent rounded-full animate-spin" />
                    <span className="ml-3 text-dark-text-secondary text-sm">Loading submissions…</span>
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-dark-text-secondary">
                    <History size={32} className="opacity-30" />
                    <p className="text-sm font-medium">No submissions yet</p>
                    <p className="text-xs opacity-60 text-center max-w-[220px]">Run and validate your manifest to record a submission</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-dark-text-secondary uppercase tracking-wide">
                        Your Submissions
                      </h3>
                      <span className="text-xs text-dark-text-muted">{submissions.length} total</span>
                    </div>
                    {submissions.map((sub, idx) => (
                      <div key={sub.id} className="bg-dark-elevated border border-dark-border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              sub.status === 'passed' ? 'bg-dark-accent-green' : sub.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                            }`} />
                            <span className={`text-xs font-semibold uppercase tracking-wide ${
                              sub.status === 'passed' ? 'text-dark-accent-green' : sub.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {sub.status}
                            </span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-dark-accent-purple/20 text-dark-accent-purple border border-dark-accent-purple/30">
                                Latest
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-dark-text-muted">
                            {new Date(sub.submitted_at).toLocaleString()}
                          </span>
                        </div>
                        {sub.code_preview && (
                          <div className="border-t border-dark-border bg-dark-bg px-4 py-3">
                            <pre className="text-xs font-mono text-dark-text-secondary leading-relaxed whitespace-pre-wrap line-clamp-3 overflow-hidden">
                              {sub.code_preview}{sub.code_preview.length >= 120 ? '…' : ''}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resizer - only shown for coding units when right panel is open */}
        {rightPanelOpen && unit.type === 'coding' && (
          <div
            className="w-1.5 bg-transparent hover:bg-dark-accent-purple cursor-col-resize z-10 transition-colors shrink-0"
            onDrag={handleDrag}
            draggable
            onDragEnd={handleDrag}
          />
        )}

        {/* Pull-arrow strip - shown for conceptual units when right panel is closed */}
        {unit.type === 'conceptual' && !rightPanelOpen && (
          <button
            onClick={() => setRightPanelOpen(true)}
            className="w-6 shrink-0 flex items-center justify-center bg-dark-elevated border border-dark-border rounded-lg text-dark-text-muted hover:text-dark-accent-purple hover:bg-dark-hover transition-colors"
            title="Open quiz panel"
          >
            <ChevronRight size={13} />
          </button>
        )}

        {/* Right Panel - Editor (coding) / Future Quiz (conceptual) */}
        {rightPanelOpen && (
          <div ref={rightPanelRef} className={`flex-1 flex flex-col min-w-[400px] bg-dark-surface border border-dark-border rounded-lg overflow-hidden transition-opacity duration-200 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}>
            {/* Conceptual: placeholder with close arrow (future quiz panel) */}
            {unit.type === 'conceptual' && (
              <>
                <div className="h-12 bg-dark-elevated border-b border-dark-border flex items-center justify-between px-4 shrink-0">
                  <span className="text-sm font-medium text-dark-text-secondary">Quiz Panel</span>
                  <button
                    onClick={() => setRightPanelOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-dark-hover text-dark-text-muted hover:text-dark-text-primary transition-colors"
                    title="Close panel"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-dark-text-muted p-8">
                  <div className="text-4xl opacity-20 select-none">📋</div>
                  <p className="text-sm font-medium">Quiz coming soon</p>
                  <p className="text-xs text-center opacity-60 max-w-[180px]">Assessments will appear here once enabled</p>
                </div>
              </>
            )}

            {unit.type === 'coding' && unit.editor_config && (
            <>
              {/* Editor Header */}
              <div className="h-12 bg-dark-elevated border-b border-dark-border flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <span className="bg-dark-bg text-dark-text-primary text-sm px-3 py-1.5 rounded border border-dark-border capitalize">
                    {unit.editor_config.language}
                  </span>
                  {isCompleted && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded">
                      <span className="text-xs font-medium text-green-400">✓ Completed</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setCode(unit.editor_config!.initial_code)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-dark-text-primary hover:text-dark-accent-purple transition-colors"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>

              {/* Code Editor */}
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  language={unit.editor_config.language}
                />
              </div>

              {/* Console Resize Handle */}
              {consoleExpanded && (
                <div
                  onMouseDown={startConsoleResize}
                  className="h-1 min-h-[4px] bg-transparent hover:bg-dark-accent-purple cursor-row-resize transition-colors flex-shrink-0"
                />
              )}

              {/* Console + Submit Bar */}
              <div className="flex flex-col flex-shrink-0" style={consoleExpanded ? { height: `${consoleHeight}px` } : undefined}>
                <Console
                  isOpen={consoleExpanded}
                  onToggle={setConsoleExpanded}
                  validating={validating}
                  running={running}
                  runComplete={runComplete}
                  wsMessages={wsMessages}
                  validationResponse={validationResponse}
                  height={consoleExpanded ? consoleHeight - 56 : undefined}
                />
                <div className="h-14 bg-dark-surface border-t border-dark-border flex items-center justify-end px-4 gap-3 shrink-0">
                  <button
                    onClick={handleCodeSubmit}
                    disabled={running || validating}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-dark-elevated disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition-colors"
                  >
                    {running ? 'Deploying...' : 'Run'}
                  </button>
                  <button
                    onClick={handleValidate}
                    disabled={!runComplete || validating || running}
                    className="px-6 py-2 bg-dark-accent-green hover:bg-dark-accent-green/80 disabled:bg-dark-elevated disabled:cursor-not-allowed text-dark-bg rounded text-sm font-semibold transition-colors"
                  >
                    {validating ? 'Validating...' : 'Validate'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* quiz/grading feature commented out
          {unit.type === 'conceptual' && unit.quizzes && unit.quizzes.length > 0 && (
            <>
              Quiz Header:
              <div className="h-12 bg-dark-elevated border-b border-dark-border flex items-center justify-between px-4">
                <div className="text-sm font-medium text-dark-text-primary">Quiz Assessment</div>
                {isCompleted && completedScore !== null && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded">
                    <span className="text-xs font-medium text-green-400">✓ Passed</span>
                    <span className="text-xs text-green-300">{completedScore.toFixed(0)}%</span>
                  </div>
                )}
              </div>

              Quiz Content:
              <div className="flex-1 overflow-y-auto p-6 vscode-scrollbar">
                <div className="space-y-6 max-w-3xl">
                  {unit.quizzes.map((quiz, qIndex) => (
                    <div key={quiz.id} className="bg-dark-elevated border border-dark-border rounded-lg p-5">
                      <h3 className="text-base font-medium text-dark-text-primary mb-4 leading-relaxed">
                        <span className="text-dark-text-secondary mr-2">{qIndex + 1}.</span>
                        {quiz.question}
                      </h3>
                      <div className="space-y-2">
                        {quiz.options.map((option, optionIndex) => {
                          const isSelected = selectedAnswers[quiz.id] === option.id;
                          const hasResult = quizResults[quiz.id];
                          const isCorrectSelection = hasResult && isSelected && quizResults[quiz.id].is_correct;
                          const isWrongSelection = hasResult && isSelected && !quizResults[quiz.id].is_correct;
                          const isLocked = Object.keys(quizResults).length > 0; // Lock after submission

                          let borderColor = 'border-dark-border hover:border-dark-text-secondary';
                          let bgColor = 'bg-dark-bg';

                          if (hasResult && isSelected) {
                            if (isCorrectSelection) {
                              borderColor = 'border-green-500';
                              bgColor = 'bg-green-500/10';
                            } else if (isWrongSelection) {
                              borderColor = 'border-red-500';
                              bgColor = 'bg-red-500/10';
                            }
                          } else if (isSelected) {
                            borderColor = 'border-dark-accent-purple';
                            bgColor = 'bg-dark-active';
                          }

                          return (
                            <label
                              key={`${quiz.id}-${option.id}-${optionIndex}`}
                              className={`flex items-start gap-3 p-3 rounded border transition-all ${bgColor} ${borderColor} ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                            >
                              <input
                                type="radio"
                                name={quiz.id}
                                value={option.id}
                                checked={isSelected}
                                disabled={isLocked}
                                onChange={(e) => setSelectedAnswers({ ...selectedAnswers, [quiz.id]: e.target.value })}
                                className="mt-1 w-4 h-4 accent-purple-500 disabled:cursor-not-allowed"
                              />
                              <span className="text-sm text-dark-text-primary leading-relaxed flex-1">{option.text}</span>
                              {hasResult && isCorrectSelection && (
                                <span className="text-green-500 text-xs font-semibold">✓ Correct</span>
                              )}
                              {hasResult && isWrongSelection && (
                                <span className="text-red-500 text-xs font-semibold">✗ Wrong</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              Submit Bar:
              <div className="h-14 bg-dark-surface border-t border-dark-border flex items-center justify-end px-4 gap-3 shrink-0">
                {Object.keys(quizResults).length > 0 ? (
                  <button
                    onClick={handleRetryQuiz}
                    className="px-6 py-2 bg-dark-accent-purple hover:bg-dark-accent-purple/80 text-white rounded text-sm font-semibold transition-colors"
                  >
                    Retry Quiz
                  </button>
                ) : (
                  <button
                    onClick={handleQuizSubmit}
                    disabled={Object.keys(selectedAnswers).length !== unit.quizzes.length}
                    className="px-6 py-2 bg-dark-accent-green hover:bg-dark-accent-green/80 disabled:bg-dark-elevated disabled:cursor-not-allowed text-dark-bg rounded text-sm font-semibold transition-colors"
                  >
                    Submit
                  </button>
                )}
              </div>
            </>
          )} */}
          </div>
        )}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .vscode-scrollbar::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .vscode-scrollbar::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        .vscode-scrollbar::-webkit-scrollbar-thumb {
          background: #424242;
          border-radius: 5px;
        }
        .vscode-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4f4f4f;
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
