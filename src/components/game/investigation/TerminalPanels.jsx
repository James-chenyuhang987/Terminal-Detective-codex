import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import InterrogationHints, { EmotionBadge } from '@/components/game/InterrogationHints';

export function TerminalLine({ line, accentColor }) {
  const colors = {
    default: '#c0c0d0', phase: accentColor, observe: '#00e5ff', thought: '#bf5fff',
    action: '#00ff88', narration: '#e0e0f0', clue_desc: '#8888aa', success: '#00ff88',
    error: '#ff3860', warning: '#ffaa00', trap: '#ff6600', system: '#8888aa', divider: '#ffffff15',
  };
  return (
    <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: colors[line.type] || colors.default, fontFamily: 'monospace' }}>
      {line.text}
    </div>
  );
}

export function NPCDialogBox({ npc, dialogue, onSend, onClose, isProcessing, accentColor, emotion, hints }) {
  const { t } = useLang();
  const [msg, setMsg] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dialogue]);

  const send = () => {
    const value = msg.trim();
    if (!value || isProcessing) return;
    onSend(value);
    setMsg('');
  };

  return (
    <div className="border-t p-3" style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold flex items-center gap-2" style={{ color: accentColor }}>
          <span>{npc.avatar} {t.interrogating}: {npc.name} · {npc.role}</span>
          <EmotionBadge level={emotion?.level} />
        </div>
        <button type="button" onClick={onClose} className="text-xs opacity-40 hover:opacity-80" style={{ color: accentColor }} aria-label={t.close || 'Close'}>✕</button>
      </div>
      <div ref={ref} className="max-h-32 overflow-y-auto space-y-1 mb-2">
        {dialogue.map((entry, index) => (
          <div key={`${entry.role}-${index}`} className="text-xs" style={{
            color: entry.role === 'agent' ? '#00ff88' : entry.role === 'npc' ? '#ffaa00' : '#8888aa',
            fontStyle: entry.role === 'system' ? 'italic' : 'normal',
          }}>
            {entry.role === 'agent' ? '> AGENT: ' : entry.role === 'npc' ? `${npc.avatar} ${entry.name}: ` : ''}{entry.text}
          </div>
        ))}
      </div>
      <InterrogationHints hints={hints} onPick={setMsg} />
      <div className="flex gap-2">
        <input
          className="flex-1 bg-transparent border rounded px-2 py-1 text-xs outline-none"
          style={{ borderColor: `${accentColor}40`, color: accentColor }}
          placeholder={`${t.interrogating}: ${npc.name}...`}
          value={msg}
          onChange={event => setMsg(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') send(); }}
          disabled={isProcessing}
        />
        <button type="button" onClick={send} disabled={isProcessing || !msg.trim()}
          className="px-3 text-xs rounded border disabled:opacity-30"
          style={{ borderColor: `${accentColor}50`, color: accentColor }}>
          {t.sendBtn}
        </button>
      </div>
    </div>
  );
}

export function JudgeResult({ result }) {
  const { t } = useLang();
  const scoreColors = { S: '#00ff88', A: '#00ffff', B: '#ffaa00', C: '#ff6600', D: '#ff3860' };
  const color = scoreColors[result.score] || '#ffffff';
  return (
    <div className="mt-3 p-3 rounded border" style={{ borderColor: `${color}50`, backgroundColor: `${color}10` }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="text-3xl font-bold" style={{ color, textShadow: `0 0 20px ${color}` }}>{result.score}</div>
        <div className="text-xs" style={{ color }}>{result.is_passed ? t.caseClosedTag : t.reportRejectedTag}</div>
      </div>
      <div className="text-xs" style={{ color: `${color}cc` }}>{result.critique}</div>
    </div>
  );
}
