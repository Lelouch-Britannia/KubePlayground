import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Box, ScrollText, Activity, AlertTriangle, Layers, Loader2 } from 'lucide-react';
import type { ValidationResponse, WSMessage } from '../../types/api';

interface ConsoleProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  validating: boolean;
  running: boolean;
  runComplete: boolean;
  wsMessages: WSMessage[];
  validationResponse: ValidationResponse | null;
  /** Optional pixel height for the console. When set the console uses this height. */
  height?: number;
}

type Tab = 'output' | 'resources' | 'logs' | 'events' | 'tests';

export const Console: React.FC<ConsoleProps> = ({
  isOpen,
  onToggle,
  validating,
  running,
  runComplete,
  wsMessages,
  validationResponse,
  height,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('output');
  const outputEndRef = useRef<HTMLDivElement>(null);

  const res = validationResponse;
  const hasResources = res?.resource_status && res.resource_status.length > 0;
  const hasLogs = res?.pod_logs && res.pod_logs.length > 0;
  const hasEvents = res?.events && res.events.length > 0;
  const hasTests = res?.test_results && res.test_results.length > 0;

  // Also show tabs from streaming run data (before validation)
  const runCompleteMsg = wsMessages.find(m => m.type === 'run_complete' && m.status === 'success');
  const streamData = runCompleteMsg?.data as Record<string, unknown> | undefined;
  const streamResources = (streamData?.resource_status as unknown[]) || [];
  const streamLogs = (streamData?.pod_logs as unknown[]) || [];
  const streamEvents = (streamData?.events as unknown[]) || [];

  const showResources = hasResources || streamResources.length > 0;
  const showLogs = hasLogs || streamLogs.length > 0;
  const showEvents = hasEvents || streamEvents.length > 0;

  // Auto-scroll output during streaming
  useEffect(() => {
    if (running && outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wsMessages, running]);

  // Deduplicate WS messages: collapse phase_start + phase_complete into one line per phase.
  // If a phase has both start and complete, only show the complete message.
  const deduplicatedMessages = useMemo(() => {
    const completedPhases = new Set<string>();
    for (const msg of wsMessages) {
      if (msg.type === 'phase_complete' && msg.phase) {
        completedPhases.add(msg.phase);
      }
    }
    return wsMessages.filter(msg => {
      // Keep everything that isn't a phase_start
      if (msg.type !== 'phase_start') return true;
      // Keep phase_start only if no phase_complete exists yet for this phase
      return !completedPhases.has(msg.phase || '');
    });
  }, [wsMessages]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number; show: boolean }[] = [
    { id: 'output', label: 'Output', icon: <Terminal size={13} />, show: true },
    { id: 'resources', label: 'Resources', icon: <Layers size={13} />, count: res?.resource_status?.length || streamResources.length, show: showResources },
    { id: 'logs', label: 'Pod Logs', icon: <ScrollText size={13} />, count: res?.pod_logs?.length || streamLogs.length, show: showLogs },
    { id: 'events', label: 'Events', icon: <Activity size={13} />, count: res?.events?.length || streamEvents.length, show: showEvents },
    { id: 'tests', label: 'Tests', icon: <CheckCircle size={13} />, count: res?.test_results?.length, show: !!hasTests },
  ];

  return (
    <div
      className="border-t border-[#3e3e42] bg-[#1e1e1e] flex flex-col overflow-hidden"
      style={{
        height: isOpen ? (height ? `${height}px` : '250px') : '36px',
        transition: 'height 150ms ease-out',
      }}
    >
      {/* Header */}
      <div
        onClick={() => onToggle(!isOpen)}
        className="h-9 min-h-[36px] bg-[#252526] border-b border-[#3e3e42] flex items-center justify-between px-4 cursor-pointer hover:bg-[#2a2d2e]"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          <Terminal size={14} /> Cluster Output
          {running && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> DEPLOYING
            </span>
          )}
          {runComplete && !validating && !res && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              READY — Click Validate
            </span>
          )}
          {validating && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> VALIDATING
            </span>
          )}
          {res && (
            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${res.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {res.passed ? 'PASSED' : 'FAILED'}
            </span>
          )}
          {res && (
            <span className="text-[10px] text-gray-400 font-normal normal-case">
              {res.duration_ms}ms
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-gray-500 transition-transform ${isOpen ? '' : 'rotate-180'}`}
        />
      </div>

      {/* Tab bar */}
      {isOpen && (res || runComplete || wsMessages.length > 0) && (
        <div className="h-8 min-h-[32px] bg-gray-50 dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-gray-800 flex items-center gap-0 px-2 overflow-x-auto">
          {tabs.filter(t => t.show).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 h-full text-xs border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className="text-[10px] bg-gray-200 dark:bg-gray-700 px-1 rounded">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs bg-white dark:bg-[#1e1e1e]">
        {/* No data at all — idle state */}
        {!running && !validating && !res && wsMessages.length === 0 ? (
          <div className="text-gray-400 italic">
            Click &quot;Run&quot; to deploy your Kubernetes YAML to the cluster.
          </div>
        ) : (
          <>
            {/* === Output Tab === */}
            {activeTab === 'output' && (
              <div className="space-y-3">
                {/* Streaming phase lines from WebSocket */}
                {wsMessages.length > 0 && !res && (
                  <div className="space-y-1">
                    {deduplicatedMessages.map((msg, i) => (
                      <StreamingLine key={i} msg={msg} />
                    ))}
                    {running && (
                      <div className="flex items-center gap-2 text-gray-500 mt-2">
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span>Deploying...</span>
                      </div>
                    )}
                    {runComplete && !validating && !res && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 font-semibold">
                          <CheckCircle size={16} />
                          <span>Resources deployed! Click &quot;Validate&quot; to run tests.</span>
                        </div>
                      </div>
                    )}
                    <div ref={outputEndRef} />
                  </div>
                )}

                {/* Validating spinner */}
                {validating && (
                  <div className="flex items-center gap-2 text-gray-500 mt-2">
                    <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span>Running validation tests...</span>
                  </div>
                )}

                {/* Final phase timeline from ValidationResponse */}
                {res && res.phases && res.phases.length > 0 && (
                  <div className="space-y-1">
                    {res.phases.map((phase, i) => (
                      <PhaseRow key={i} phase={phase} />
                    ))}
                  </div>
                )}

                {/* Apply output */}
                {res?.apply_output && (
                  <div className="mt-3">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">kubectl apply</div>
                    <pre className="text-green-600 dark:text-green-400 bg-gray-50 dark:bg-[#252526] p-2 rounded border border-gray-200 dark:border-gray-700 whitespace-pre-wrap">
                      {res.apply_output}
                    </pre>
                  </div>
                )}

                {/* Validation error */}
                {res?.validation_error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 mt-2">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold mb-1">
                      <XCircle size={14} />
                      {res.validation_error.message}
                    </div>
                    {res.validation_error.code && (
                      <span className="text-[10px] text-red-500 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                        {res.validation_error.code}
                      </span>
                    )}
                  </div>
                )}

                {/* Summary footer */}
                {res && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
                    {res.passed ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                        <CheckCircle size={16} />
                        <span>{res.message || 'All tests passed!'} ✨</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                          <XCircle size={16} />
                          <span>{res.message || 'Validation failed'}</span>
                        </div>
                        {res.test_results?.[0]?.output && (
                          <pre className="text-xs text-gray-300 bg-[#1e1e1e] p-2 rounded border border-gray-700 whitespace-pre-wrap">
                            {res.test_results[0].output}
                          </pre>
                        )}
                        {res.test_results?.[0]?.error_output && (
                          <pre className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-800 whitespace-pre-wrap">
                            {res.test_results[0].error_output}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* === Resources Tab === */}
            {activeTab === 'resources' && (res?.resource_status || streamResources.length > 0) && (
              <div className="space-y-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-3">Kind</th>
                      <th className="py-1.5 pr-3">Name</th>
                      <th className="py-1.5 pr-3">Status</th>
                      <th className="py-1.5 pr-3">Ready</th>
                      <th className="py-1.5">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(res?.resource_status || streamResources as any[]).map((r: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-1.5 pr-3">
                          <span className="inline-flex items-center gap-1">
                            <Box size={12} className="text-blue-500" />
                            {r.kind}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{r.name}</td>
                        <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{r.status}</td>
                        <td className="py-1.5 pr-3">
                          {r.ready ? (
                            <CheckCircle size={14} className="text-green-500" />
                          ) : (
                            <Clock size={14} className="text-yellow-500" />
                          )}
                        </td>
                        <td className="py-1.5 text-gray-500">{r.age}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* === Pod Logs Tab === */}
            {activeTab === 'logs' && (res?.pod_logs || streamLogs.length > 0) && (
              <div className="space-y-4">
                {(res?.pod_logs || streamLogs as any[]).map((log: any, i: number) => (
                  <PodLogSection key={i} log={log} />
                ))}
              </div>
            )}

            {/* === Events Tab === */}
            {activeTab === 'events' && (res?.events || streamEvents.length > 0) && (
              <div className="space-y-1">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                      <th className="py-1.5 pr-2">Type</th>
                      <th className="py-1.5 pr-2">Reason</th>
                      <th className="py-1.5 pr-2">Object</th>
                      <th className="py-1.5 pr-2">Message</th>
                      <th className="py-1.5">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(res?.events || streamEvents as any[]).map((evt: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-1.5 pr-2">
                          {evt.type === 'Warning' ? (
                            <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                              <AlertTriangle size={12} /> {evt.type}
                            </span>
                          ) : (
                            <span className="text-gray-600 dark:text-gray-400">{evt.type}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300">{evt.reason}</td>
                        <td className="py-1.5 pr-2 text-gray-500">{evt.object}</td>
                        <td className="py-1.5 pr-2 text-gray-600 dark:text-gray-400 max-w-xs break-words">{evt.message}</td>
                        <td className="py-1.5 text-gray-500">{evt.age}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* === Tests Tab === */}
            {activeTab === 'tests' && res?.test_results && (
              <div className="space-y-4">
                {res.test_results.map((result, i) => (
                  <div key={i} className="border-l-2 border-gray-300 dark:border-gray-700 pl-3">
                    <div className="flex items-start gap-3 mb-2">
                      {result.passed ? (
                        <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-700 dark:text-gray-200">{result.name}</span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock size={12} />
                            {result.duration_ms.toFixed(0)}ms
                          </span>
                        </div>
                        {result.output && (
                          <pre className="text-gray-600 dark:text-gray-400 text-xs whitespace-pre-wrap bg-gray-50 dark:bg-[#252526] p-2 rounded border border-gray-200 dark:border-gray-700 mb-2">
                            {result.output}
                          </pre>
                        )}
                        {result.error_output && (
                          <div className="text-red-600 dark:text-red-400 text-xs whitespace-pre-wrap bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                            <div className="font-semibold mb-1">Error:</div>
                            {result.error_output}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                  {res.test_results.every(r => r.passed) ? (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                      <CheckCircle size={16} />
                      <span>All tests passed! ✨</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold">
                      <XCircle size={16} />
                      <span>{res.test_results.filter(r => !r.passed).length} test(s) failed</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// StreamingLine renders a single WebSocket message during live streaming
const StreamingLine: React.FC<{ msg: WSMessage }> = ({ msg }) => {
  const phaseLabels: Record<string, string> = {
    create_namespace: 'Create Namespace',
    syntax_check: 'Syntax Check',
    apply: 'Apply Manifest',
    wait_ready: 'Wait for Ready',
    resource_status: 'Resource Status',
    collect_logs: 'Collect Logs',
    collect_events: 'Collect Events',
    validation: 'Run Validation',
  };

  const phaseName = msg.phase ? (phaseLabels[msg.phase] || msg.phase) : '';

  if (msg.type === 'phase_start') {
    return (
      <div className="flex items-center gap-2 py-0.5 text-gray-500">
        <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
        <span className="text-gray-700 dark:text-gray-300">{phaseName}</span>
        <span className="text-[10px] text-gray-400">{msg.message}</span>
      </div>
    );
  }

  if (msg.type === 'phase_complete') {
    const dur = (msg.data as any)?.duration_ms;
    return (
      <div className="py-0.5">
        <div className="flex items-center gap-2">
          {msg.status === 'success' ? (
            <CheckCircle size={13} className="text-green-500 shrink-0" />
          ) : (
            <XCircle size={13} className="text-red-500 shrink-0" />
          )}
          <span className="text-gray-700 dark:text-gray-300">{phaseName}</span>
          {dur !== undefined && <span className="text-[10px] text-gray-400">{dur}ms</span>}
        </div>
        {msg.status === 'failed' && msg.message && (
          <pre className="text-[11px] text-red-400 mt-1 ml-5 whitespace-pre-wrap break-all bg-red-900/10 p-1.5 rounded border border-red-800/30">
            {msg.message}
          </pre>
        )}
      </div>
    );
  }

  if (msg.type === 'run_complete') {
    return null; // Handled by the parent component
  }

  if (msg.type === 'error') {
    return (
      <div className="flex items-center gap-2 py-0.5 text-red-500">
        <XCircle size={13} className="shrink-0" />
        <span>{msg.message}</span>
      </div>
    );
  }

  return null;
};

// PhaseRow renders a single execution phase in the timeline
const PhaseRow: React.FC<{ phase: { name: string; status: string; duration_ms: number; output?: string; error?: string } }> = ({ phase }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = phase.output || phase.error;

  const phaseLabels: Record<string, string> = {
    create_namespace: 'Create Namespace',
    syntax_check: 'Syntax Check',
    apply: 'Apply Manifest',
    wait_ready: 'Wait for Ready',
    resource_status: 'Resource Status',
    collect_logs: 'Collect Logs',
    collect_events: 'Collect Events',
    validation: 'Run Validation',
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-0.5 ${hasDetail ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-[#252526] rounded px-1 -mx-1' : ''}`}
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        {phase.status === 'success' ? (
          <CheckCircle size={13} className="text-green-500 shrink-0" />
        ) : phase.status === 'failed' ? (
          <XCircle size={13} className="text-red-500 shrink-0" />
        ) : (
          <Clock size={13} className="text-gray-400 shrink-0" />
        )}
        <span className="text-gray-700 dark:text-gray-300 text-xs">
          {phaseLabels[phase.name] || phase.name}
        </span>
        <span className="text-[10px] text-gray-400">{phase.duration_ms}ms</span>
        {hasDetail && (
          expanded ? <ChevronDown size={12} className="text-gray-400 ml-auto" /> : <ChevronRight size={12} className="text-gray-400 ml-auto" />
        )}
      </div>
      {expanded && hasDetail && (
        <div className="ml-5 mt-1 mb-2">
          {phase.output && (
            <pre className="text-[11px] text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[#252526] p-2 rounded border border-gray-200 dark:border-gray-700 whitespace-pre-wrap">
              {phase.output}
            </pre>
          )}
          {phase.error && (
            <pre className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800 whitespace-pre-wrap mt-1">
              {phase.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// PodLogSection renders logs from a single pod/container
const PodLogSection: React.FC<{ log: { pod_name: string; container_name: string; logs: string; phase: string; ready: boolean } }> = ({ log }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-[#252526] cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2a2a2b]"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Box size={12} className="text-blue-500" />
        <span className="text-gray-700 dark:text-gray-300 font-medium">{log.pod_name}</span>
        <span className="text-gray-500">/ {log.container_name}</span>
        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
          log.ready
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        }`}>
          {log.phase}
        </span>
      </div>
      {expanded && (
        <pre className="p-3 text-[11px] text-gray-300 bg-[#0d1117] whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto">
          {log.logs || '(no output)'}
        </pre>
      )}
    </div>
  );
};

export default Console;
