import React, { useRef, useEffect } from 'react';
import AIProcessingIndicator from './AIProcessingIndicator';

const Phase_Color_Map = {
  IDLE:      { color: '#8888aa', label: 'IDLE' },
  OBSERVE:   { color: '#00e5ff', label: 'OBS' },
  THINK:     { color: '#bf5fff', label: 'THK' },
  ACT:       { color: '#ff3860', label: 'ACT' },
  REPORTING: { color: '#00ff88', label: 'RPT' },
  SYSTEM:    { color: '#ffaa00', label: 'SYS' },
  NPC:       { color: '#ff9900', label: 'NPC' },
  ERROR:     { color: '#ff0040', label: 'ERR' },
  CLUE:      { color: '#00ff88', label: 'CLU' },
};

function LogEntry({ entry }) {
  const cfg = Phase_Color_Map[entry.type] || Phase_Color_Map.SYSTEM;
  return (
    <div className="mb-3 group">
      <div className="flex items-start gap-2">
        <span
          className="text-xs font-bold px-1 rounded flex-shrink-0 mt-0.5"
          style={{
            color: cfg.color,
            border: `1px solid ${cfg.color}40`,
            backgroundColor: `${cfg.color}10`,
            fontFamily: 'monospace',
            minWidth: '40px',
            textAlign: 'center',
          }}
        >
          {cfg.label}
        </span>
        <div className="flex-1">
          {entry.prefix && (
            <span className="text-xs font-bold mr-2" style={{ color: cfg.color, fontFamily: 'monospace' }}>
              [{entry.prefix}]
            </span>
          )}
          <span
            className="text-xs leading-relaxed"
            style={{
              color: entry.type === 'ERROR' ? '#ff6080' : 'rgba(255,255,255,0.85)',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {entry.text}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TerminalLog({ logs, streamingText, reactState, stressLevel, inputDisabled, onSubmitReport }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [reportMode, setReportMode] = React.useState(false);
  const [reportText, setReportText] = React.useState('');

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs, streamingText]);

  const handleReportSubmit = () => {
    if (reportText.trim()) {
      onSubmitReport(reportText);
      setReportMode(false);
      setReportText('');
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'monospace' }}>
      {/* Terminal header */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(0,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-80" />
          <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
        </div>
        <span className="text-xs opacity-50 ml-2">DETECTIVE_TERMINAL v2.7.1</span>
        <div className="ml-auto flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor: reactState === 'IDLE' ? '#444' : '#00ff88',
              boxShadow: reactState === 'IDLE' ? 'none' : '0 0 6px #00ff88',
            }}
          />
          <span className="text-xs" style={{ color: '#00ff88' }}>{reactState}</span>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4"
        style={{ backgroundColor: 'rgba(5,10,20,0.95)' }}
      >
        {/* Welcome banner */}
        <div className="mb-4 opacity-60 text-xs" style={{ color: '#00ffff' }}>
          <pre>{`
 ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     
    ██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║     
    ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║     
    ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     
    ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗
    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
  DETECTIVE v2.7.1 — LOGIC ARCHITECT EDITION`}
          </pre>
        </div>

        {logs.map((entry, i) => (
          <LogEntry key={i} entry={entry} />
        ))}

        {/* Streaming text */}
        {streamingText && (
          <div className="mb-3">
            <div className="flex items-start gap-2">
              <span
                className="text-xs font-bold px-1 rounded flex-shrink-0 mt-0.5"
                style={{
                  color: '#bf5fff',
                  border: '1px solid #bf5fff40',
                  backgroundColor: '#bf5fff10',
                  fontFamily: 'monospace',
                  minWidth: '40px',
                  textAlign: 'center',
                }}
              >
                THK
              </span>
              <span
                className="text-xs leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
              >
                {streamingText}
                <span className="animate-pulse" style={{ color: '#bf5fff' }}>▋</span>
              </span>
            </div>
          </div>
        )}

        {/* AI processing indicator */}
        {(reactState === 'THINK' || reactState === 'ACT') && !streamingText && (
          <AIProcessingIndicator phase={reactState} stressLevel={stressLevel} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Report input area */}
      <div
        className="border-t p-3 flex-shrink-0"
        style={{ borderColor: 'rgba(0,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.7)' }}
      >
        {reportMode ? (
          <div>
            <div className="text-xs mb-2" style={{ color: '#00ff88' }}>◈ SUBMIT FINAL CASE REPORT — Be thorough and precise</div>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              placeholder="State the suspect, motive, method, and timeline with evidence references..."
              className="w-full bg-transparent border rounded p-2 text-xs text-white resize-none mb-2"
              style={{ borderColor: '#00ff8840', minHeight: '80px', fontFamily: 'monospace' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleReportSubmit}
                className="px-4 py-1 rounded text-xs font-bold border"
                style={{ borderColor: '#00ff88', color: '#00ff88', backgroundColor: 'rgba(0,255,136,0.1)' }}
              >
                SUBMIT TO JUDGE
              </button>
              <button
                onClick={() => setReportMode(false)}
                className="px-4 py-1 rounded text-xs border opacity-50"
                style={{ borderColor: '#ffffff40', color: '#ffffff80' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#00ffff', opacity: 0.5 }}>❯</span>
            <button
              onClick={() => setReportMode(true)}
              disabled={inputDisabled}
              className="px-3 py-1 rounded text-xs border transition-all"
              style={{
                borderColor: inputDisabled ? '#ffffff20' : '#00ff8840',
                color: inputDisabled ? '#ffffff30' : '#00ff88',
                cursor: inputDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              SUBMIT REPORT
            </button>
            <span className="text-xs opacity-30 ml-auto">
              {inputDisabled ? '⊘ INPUT LOCKED' : 'Ready'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}