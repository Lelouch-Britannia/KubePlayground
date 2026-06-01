import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RotateCcw, ChevronDown, BookOpen, History, Menu, Lightbulb, ListOrdered, Play, Maximize2, Minimize2, CheckCircle } from 'lucide-react';
import { apiClient } from '../services/api';
import type { UnitDetail, SyllabusItem, ValidationResponse, WSMessage, RunCompleteData, ValidateOnlyResponse, UserSubmission } from '../types/api';
import MarkdownRenderer from '../components/shared/MarkdownRenderer';
import Toast from '../components/shared/Toast';
import Confetti from '../components/shared/Confetti';
import CodeEditor from '../components/RightPanel/CodeEditor';
import { Console } from '../components/RightPanel/Console';
import UserMenu from '../components/shared/UserMenu';
import ProblemListPanel from '../components/shared/ProblemListPanel';

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
  // const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({}); // quiz/grading feature commented out
  const [leftWidth, setLeftWidth] = useState(50);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
    // score?: number;  // scoring feature commented out
    // total?: number;  // scoring feature commented out
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeTab, setActiveTab] = useState<'question' | 'submissions'>('question');
  const [submissions, setSubmissions] = useState<UserSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);

  const [openHints, setOpenHints] = useState<Set<number>>(new Set());
  const [consoleHeight, setConsoleHeight] = useState(250);
  const [consoleOpen, setConsoleOpen] = useState(false);
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
  const [showProblemList, setShowProblemList] = useState(false);
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  const [leftMaximized, setLeftMaximized] = useState(false);
  const [rightMaximized, setRightMaximized] = useState(false);

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

  // Draft autosave debounce ref
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Autosave draft to backend (debounced 2s)
  useEffect(() => {
    if (!unit?.slug || unit.type !== 'coding' || !unit.editor_config) return;
    if (code === unit.editor_config.initial_code) {
      apiClient.deleteDraft(unit.slug).catch(() => {});
      setAutosaveStatus('idle');
      return;
    }
    setAutosaveStatus('saving');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      apiClient.saveDraft(unit.slug, code, unit.editor_config!.language || 'yaml')
        .then(() => setAutosaveStatus('saved'))
        .catch(() => setAutosaveStatus('idle'));
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [code, unit]);

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
      setValidating(false);
      setActiveTab('question');
      setSubmissions([]);
      setExpandedSubmissionId(null);

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
        // Restore draft from backend, fall back to initial_code
        try {
          const [draftRes, nsRes] = await Promise.all([
            apiClient.getDraft(unitSlug).catch(() => ({ code: null })),
            apiClient.getNamespace(unitSlug).catch(() => ({ namespace: null })),
          ]);
          setCode((draftRes as any).code || data.editor_config.initial_code);
          const savedNs = (nsRes as any).namespace;
          if (savedNs) {
            setRunNamespace(savedNs);
            setRunComplete(true);
          }
        } catch {
          setCode(data.editor_config.initial_code);
        }
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

  const startConsoleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    consoleResizing.current = true;
    const startY = e.clientY;
    const startHeight = consoleHeight;
    const onMove = (ev: MouseEvent) => {
      if (!consoleResizing.current) return;
      const delta = startY - ev.clientY;
      const panelRect = rightPanelRef.current?.getBoundingClientRect();
      const maxHeight = panelRect ? panelRect.height - 80 : 600;
      setConsoleHeight(Math.max(80, Math.min(maxHeight, startHeight + delta)));
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
      setConsoleOpen(true);
      setRunComplete(false);
      setRunNamespace(null);
      setRunData(null);
      setValidationResponse(null);
      setValidating(false);
      setWsMessages([]);
      if (unit) apiClient.deleteNamespace(unit.slug).catch(() => {});

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
                if (data?.namespace && unit) apiClient.saveNamespace(unit.slug, data.namespace).catch(() => {});
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
      setConsoleOpen(true);

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
          { name: 'validation', status: result.passed ? 'success' : 'failed', duration_ms: result.duration_ms, output: result.test_results?.[0]?.output || result.message, error: result.test_results?.[0]?.error_output },
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
        setAllUnits(prev => prev.map(u => u.slug === unit.slug ? { ...u, status: 'completed' } : u));
        setPanelRefreshKey(k => k + 1);
      }

      // Refresh submissions list so new entry appears immediately
      fetchSubmissions();

      if (result.passed) {
        try { await apiClient.cleanupNamespace(runNamespace); } catch { /* non-critical */ }
        setRunNamespace(null);
        setRunComplete(false);
        if (unit) {
          apiClient.deleteNamespace(unit.slug).catch(() => {});
          apiClient.deleteDraft(unit.slug).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Validation error:', err);
      setToast({ show: true, type: 'error', message: 'Validation failed. Please try again.' });
    } finally {
      setValidating(false);
    }
  };

  const handleMarkRead = async () => {
    if (!unit || isCompleted) return;
    try {
      await apiClient.updateProgress({ unit_slug: unit.slug, status: 'completed' });
      setIsCompleted(true);
      // Update local syllabus so ProblemListPanel reflects completion immediately
      setAllUnits(prev => prev.map(u => u.slug === unit.slug ? { ...u, status: 'completed' } : u));
      setPanelRefreshKey(k => k + 1);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      setToast({ show: true, type: 'success', message: 'Unit marked as complete!' });
    } catch (err) {
      console.error('Failed to mark complete:', err);
      setToast({ show: true, type: 'error', message: 'Failed to mark complete. Please try again.' });
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
      {/* Single compact top bar */}
      <header className="h-12 bg-dark-surface border-b border-dark-border flex items-center px-3 gap-2 shrink-0 relative">
        {isNavigating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-dark-accent-green animate-pulse" />
        )}

        {/* Logo icon — far left */}
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-dark-hover cursor-pointer"
          title="Home"
        >
          <div className="w-6 h-6 bg-gradient-to-br from-dark-accent-blue to-dark-accent-green rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
            </svg>
          </div>
        </button>

        {/* Panel toggle (hamburger) */}
        <button
          onClick={() => setShowProblemList(prev => !prev)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text-primary transition-colors"
          title="Problem list"
        >
          <Menu size={16} />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-dark-border mx-1" />

        {/* Prev / counter / Next */}
        <button
          onClick={() => navigateToUnit('prev')}
          disabled={!hasPrev || isNavigating}
          className="w-7 h-7 flex items-center justify-center rounded text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs text-dark-text-muted font-medium tabular-nums min-w-[44px] text-center select-none">
          {currentIndex + 1} / {allUnits.length}
        </span>
        <button
          onClick={() => navigateToUnit('next')}
          disabled={!hasNext || isNavigating}
          className="w-7 h-7 flex items-center justify-center rounded text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>

        {/* Center cluster — Run icon button + Submit text button */}
        {unit.type === 'coding' && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            {/* Run icon button */}
            <button
              onClick={handleCodeSubmit}
              disabled={running || validating}
              className="w-8 h-8 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-dark-elevated flex items-center justify-center text-white transition-colors"
              title="Run"
            >
              {running ? (
                <div className="animate-spin border-2 border-white border-t-transparent rounded-full w-3 h-3" />
              ) : (
                <Play size={14} />
              )}
            </button>
            {/* Submit text button */}
            <button
              onClick={handleValidate}
              disabled={!runComplete || validating || running}
              className="px-4 py-1.5 bg-dark-accent-green hover:bg-dark-accent-green/80 disabled:bg-dark-elevated disabled:cursor-not-allowed text-dark-bg rounded text-sm font-semibold transition-colors"
            >
              {validating ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        )}

        {/* Flex-1 spacer pushes UserMenu to the right */}
        <div className="flex-1" />

        {/* User Menu */}
        <UserMenu />
      </header>

      {/* Problem List Panel */}
      {showProblemList && <ProblemListPanel currentUnitSlug={unit.slug} onClose={() => setShowProblemList(false)} refreshKey={panelRefreshKey} />}

      {/* Main Workspace — bg-dark-bg fills gaps between panels like LeetCode */}
      <div className="flex-1 flex overflow-hidden relative px-2 pt-2 pb-0 gap-2 bg-dark-bg">
        {/* Left Panel - Description/Content with Tabs */}
        {!rightMaximized && (
        <div
          style={rightPanelOpen && !leftMaximized ? { width: `${leftWidth}%` } : undefined}
          className={`${leftMaximized ? 'flex-1' : rightPanelOpen ? 'min-w-[350px]' : 'flex-1'} flex flex-col bg-dark-surface border border-dark-border rounded-t-lg overflow-hidden transition-opacity duration-200 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}
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
            {/* Difficulty + Mark as Read (conceptual) + maximize button */}
            <div className="flex items-center gap-2">
              {unit.difficulty && (
                <span className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wide rounded border ${
                  unit.difficulty === 'beginner'
                    ? 'border-dark-accent-green/40 text-dark-accent-green bg-dark-accent-green/10'
                    : unit.difficulty === 'intermediate'
                    ? 'border-dark-accent-yellow/40 text-dark-accent-yellow bg-dark-accent-yellow/10'
                    : 'border-red-400/40 text-red-400 bg-red-400/10'
                }`}>
                  {unit.difficulty}
                </span>
              )}
              {unit.type === 'conceptual' && (
                isCompleted ? (
                  <div className="flex items-center gap-1.5 text-dark-accent-green text-xs font-medium">
                    <CheckCircle size={14} />
                    <span>Completed</span>
                  </div>
                ) : (
                  <button
                    onClick={handleMarkRead}
                    className="flex items-center gap-1.5 px-3 py-1 bg-dark-accent-green/10 hover:bg-dark-accent-green/20 border border-dark-accent-green/40 text-dark-accent-green text-xs font-medium rounded transition-colors"
                  >
                    <CheckCircle size={13} />
                    Mark as Read
                  </button>
                )
              )}
              <button
                onClick={() => { setLeftMaximized(v => !v); setRightMaximized(false); }}
                className="w-7 h-7 flex items-center justify-center rounded text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-hover transition-colors"
                title={leftMaximized ? 'Restore' : 'Maximize'}
              >
                {leftMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 vscode-scrollbar">
            {activeTab === 'question' && (
              <>
                {/* Description */}
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-[#569cd6] mb-3">{unit.title}</h2>
                  <div className="text-[#cccccc] text-sm leading-relaxed max-w-none">
                    <MarkdownRenderer content={unit.description} />
                  </div>
                </div>

                {/* Exercise (Steps) — flat inline section, no dropdown */}
                {unit.steps && unit.steps.length > 0 && (
                  <div className="mb-4">
                    <div className="border-t border-dark-border mb-3" />
                    <div className="flex items-center gap-2 mb-3">
                      <ListOrdered size={15} className="text-dark-text-muted shrink-0" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-dark-text-muted">Exercise</span>
                    </div>
                    <ol className="space-y-2 list-none">
                      {unit.steps.map((step, idx) => (
                        <li key={idx} className="flex gap-2.5 items-start">
                          <span className="text-[#c586c0] font-mono text-xs mt-0.5 shrink-0 w-4 select-none">{idx + 1}.</span>
                          <span className="text-sm text-[#cccccc] leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Hints accordion — one row per hint */}
                {unit.hints && unit.hints.length > 0 && (
                  <div>
                    <div className="border-t border-dark-border" />
                    {unit.hints.map((hint, idx) => (
                      <React.Fragment key={idx}>
                        <button
                          onClick={() => {
                            setOpenHints(prev => {
                              const next = new Set(prev);
                              next.has(idx) ? next.delete(idx) : next.add(idx);
                              return next;
                            });
                          }}
                          className="flex items-center gap-3 px-0 py-3 cursor-pointer hover:text-dark-text-primary border-b border-dark-border w-full text-left"
                        >
                          <Lightbulb size={15} className="text-dark-accent-yellow shrink-0" />
                          <span className="text-sm font-medium text-dark-text-primary flex-1">Hint {idx + 1}</span>
                          <ChevronDown
                            size={15}
                            className={`text-dark-text-muted transition-transform shrink-0 ${openHints.has(idx) ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {openHints.has(idx) && (
                          <div className="py-3 px-1 text-sm text-dark-text-secondary leading-relaxed border-b border-dark-border">
                            {hint}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
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
                        {/* Card header */}
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

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 px-4 pb-3 border-b border-dark-border">
                          <button
                            onClick={() => {
                              setCode(sub.code);
                              setActiveTab('question');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-dark-accent-blue/40 text-dark-accent-blue hover:bg-dark-accent-blue/10 transition-colors"
                          >
                            <RotateCcw size={11} /> Load in Editor
                          </button>
                          <button
                            onClick={() => setExpandedSubmissionId(expandedSubmissionId === sub.id ? null : sub.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-dark-border text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-secondary transition-colors"
                          >
                            {expandedSubmissionId === sub.id ? (
                              <><ChevronLeft size={11} /> Collapse</>
                            ) : (
                              <><ChevronRight size={11} /> View Full</>
                            )}
                          </button>
                        </div>

                        {/* Expanded full code view */}
                        {expandedSubmissionId === sub.id && (
                          <div className="bg-dark-bg max-h-[400px] overflow-y-auto vscode-scrollbar">
                            <pre className="text-xs font-mono text-dark-text-primary leading-relaxed whitespace-pre p-4">
                              {sub.code}
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
        )}

        {/* Resizer - only shown for coding units when right panel is open and neither panel is maximized */}
        {rightPanelOpen && unit.type === 'coding' && !leftMaximized && !rightMaximized && (
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
        {rightPanelOpen && !leftMaximized && (
          <div ref={rightPanelRef} className={`flex-1 flex flex-col ${rightMaximized ? '' : 'min-w-[400px]'} bg-dark-bg transition-opacity duration-200 ${isNavigating ? 'opacity-50' : 'opacity-100'}`}>
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
              {/* Editor sub-panel */}
              <div className="flex-1 flex flex-col min-h-0 border border-dark-border rounded-t-lg overflow-hidden bg-dark-surface">
              {/* Editor Header */}
              <div className="h-10 bg-dark-elevated border-b border-dark-border flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-dark-text-secondary text-xs font-mono uppercase tracking-wide">
                    {unit.editor_config.language}
                  </span>
                  {isCompleted && (
                    <span className="text-xs font-medium text-green-400">✓ Completed</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setCode(unit.editor_config!.initial_code); apiClient.deleteDraft(unit.slug).catch(() => {}); }}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                  <button
                    onClick={() => { setRightMaximized(v => !v); setLeftMaximized(false); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-hover transition-colors"
                    title={rightMaximized ? 'Restore' : 'Maximize'}
                  >
                    {rightMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>

              {/* Editor — takes remaining space above console */}
              <div className="flex-1 overflow-hidden min-h-0">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  language={unit.editor_config.language}
                />
              </div>

              {/* Autosave status bar */}
              <div className="h-5 shrink-0 px-3 flex items-center justify-end bg-[#1e1e1e] border-t border-dark-border">
                {autosaveStatus === 'saving' && (
                  <span className="flex items-center gap-1 text-[10px] text-dark-text-muted">
                    <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Saving…
                  </span>
                )}
                {autosaveStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-[10px] text-dark-accent-green">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    Draft saved
                  </span>
                )}
                {autosaveStatus === 'idle' && (
                  <span className="text-[10px] text-dark-text-muted opacity-40">draft</span>
                )}
              </div>

              </div>{/* end editor sub-panel */}

              {/* Resize handle — drag upward to resize console */}
              <div
                onMouseDown={startConsoleResize}
                className="h-2 shrink-0 bg-dark-bg hover:bg-dark-accent-purple/40 cursor-row-resize transition-colors flex items-center justify-center"
              >
                <div className="w-8 h-0.5 bg-dark-border rounded-full" />
              </div>

              {/* Console pane — minimizable, resizable */}
              <div
                className="shrink-0 rounded-t-lg overflow-hidden border border-dark-border bg-[#1e1e1e] transition-all duration-150"
                style={{ height: consoleOpen ? `${consoleHeight}px` : '36px' }}
              >
                <Console
                  isOpen={consoleOpen}
                  onToggle={setConsoleOpen}
                  validating={validating}
                  running={running}
                  runComplete={runComplete}
                  wsMessages={wsMessages}
                  validationResponse={validationResponse}
                  height={consoleOpen ? consoleHeight - 36 : undefined}
                />
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
          // score={toast.score}  // scoring feature commented out
          // total={toast.total}  // scoring feature commented out
          onClose={() => setToast(null)}
        />
      )}

      {/* Confetti on success */}
      {showConfetti && <Confetti />}
    </div>
  );
}
