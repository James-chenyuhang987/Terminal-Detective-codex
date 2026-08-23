import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];
const AGENT_NAMES  = ['隼目 · 观察型', '破心 · 审讯型', '幽灵 · 黑客型'];
const AGENT_ICONS  = ['👁️', '🔥', '💻'];

const ATTR_KEYS = {
  logic_power:       { label: '逻辑推理', icon: '🧠', color: '#00e5ff' },
  observation_focus: { label: '观察力',   icon: '👁️', color: '#a3ff47' },
  hack_level:        { label: '黑客技术', icon: '💻', color: '#a78bfa' },
};

const PROMPT_HINTS = [
  '为你的探员定义一条侦查原则，例如：遇到矛盾证词时如何处置…',
  '描述你的探员在高压场景下的行动偏好，例如：当混乱值超过50%时…',
  '为探员指定一个专属策略，例如：优先解密数字证据还是直接审讯嫌疑人…',
];

export default function PromptCalibration({ agents, onBonusApplied }) {
  const [prompts, setPrompts] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { bonuses: [{agent_idx, attr, points, reason}], summary }
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  const allValid = prompts.every(p => p.trim().length >= 10);

  const handleEvaluate = async () => {
    if (!allValid || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    setApplied(false);
    try {
      const res = await base44.functions.invoke('llmBridge', {
        action: 'calibrate_prompts',
        payload: {
          prompts,
          agents: agents.map((a, i) => ({
            idx: i,
            name: a.agent_id,
            role: a.role,
            stance: a.base_stance,
            logic_power: a.logic_power || 0,
            observation_focus: a.observation_focus || 0,
            hack_level: a.hack_level || 0,
          })),
        },
      });
      setResult(res.data);
    } catch (e) {
      setError('评估失败：' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!result?.bonuses) return;
    onBonusApplied(result.bonuses);
    setApplied(true);
  };

  return (
    <div className="rounded-2xl border mb-4 overflow-hidden"
      style={{ borderColor: 'rgba(163,255,71,0.2)', background: 'rgba(10,25,10,0.7)' }}>

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b"
        style={{ borderColor: 'rgba(163,255,71,0.12)' }}>
        <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#a3ff47', fontWeight: 700, letterSpacing: '0.1em' }}>
          ◈ 提示词校准协议
        </span>
        <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
          — 输入3条探员指令，AI评估后转化为额外能力点
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {prompts.map((p, i) => {
          const tooShort = p.trim().length > 0 && p.trim().length < 10;
          const ok = p.trim().length >= 10;
          return (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(163,255,71,0.6)', letterSpacing: '0.06em' }}>
                  DIRECTIVE-{i + 1}
                </span>
                <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                  {PROMPT_HINTS[i]}
                </span>
              </div>
              <div className="relative">
                <textarea
                  rows={2}
                  value={p}
                  onChange={e => setPrompts(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                  placeholder={`输入不少于10个字的探员指令…`}
                  disabled={loading || applied}
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none"
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: `1px solid ${ok ? '#a3ff4740' : tooShort ? '#ff386040' : 'rgba(255,255,255,0.1)'}`,
                    color: ok ? '#e0ffe0' : '#c0c8d0',
                    fontFamily: 'monospace',
                    transition: 'border-color 0.2s',
                  }}
                />
                <div className="absolute bottom-2 right-3 text-xs"
                  style={{ fontFamily: 'monospace', color: ok ? '#a3ff4780' : tooShort ? '#ff386080' : 'rgba(255,255,255,0.2)' }}>
                  {p.trim().length}/10+
                </div>
              </div>
            </div>
          );
        })}

        {/* Evaluate button */}
        {!result && (
          <button
            onClick={handleEvaluate}
            disabled={!allValid || loading}
            className="w-full py-2 rounded-xl text-xs font-bold tracking-widest transition-all"
            style={{
              background: allValid && !loading ? 'linear-gradient(90deg, #a3ff4720, #00e5ff20)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${allValid && !loading ? '#a3ff4760' : 'rgba(255,255,255,0.1)'}`,
              color: allValid && !loading ? '#a3ff47' : 'rgba(255,255,255,0.25)',
              fontFamily: 'monospace',
              cursor: allValid && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
                AI 正在解析指令…
              </span>
            ) : '▶ 提交校准 · AI 评估'}
          </button>
        )}

        {error && (
          <div style={{ color: '#ff3860', fontSize: '0.65rem', fontFamily: 'monospace', textAlign: 'center' }}>
            ⚠ {error}
          </div>
        )}

        {/* Result panel */}
        {result && (
          <div className="rounded-xl border p-3 space-y-3"
            style={{ borderColor: 'rgba(163,255,71,0.25)', background: 'rgba(0,0,0,0.3)' }}>

            {/* Summary */}
            {result.summary && (
              <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(200,255,200,0.7)', lineHeight: 1.6 }}>
                🧠 {result.summary}
              </div>
            )}

            {/* Bonus list */}
            <div className="space-y-2">
              {(result.bonuses || []).map((b, i) => {
                const agentColor = AGENT_COLORS[b.agent_idx] || '#fff';
                const attrMeta = ATTR_KEYS[b.attr] || { label: b.attr, icon: '⚡', color: '#fff' };
                return (
                  <div key={i} className="flex items-start gap-3 rounded-lg p-2"
                    style={{ background: `${agentColor}08`, border: `1px solid ${agentColor}20` }}>
                    <div style={{ fontSize: 16, flexShrink: 0 }}>{AGENT_ICONS[b.agent_idx]}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ color: agentColor, fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700 }}>
                          {AGENT_NAMES[b.agent_idx]}
                        </span>
                        <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>→</span>
                        <span style={{ color: attrMeta.color, fontSize: '0.6rem', fontFamily: 'monospace' }}>
                          {attrMeta.icon} {attrMeta.label}
                        </span>
                        <span style={{
                          background: `${attrMeta.color}20`,
                          border: `1px solid ${attrMeta.color}60`,
                          color: attrMeta.color,
                          fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 900,
                          padding: '0 6px', borderRadius: 6,
                        }}>
                          +{b.points} pt
                        </span>
                      </div>
                      <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 2, lineHeight: 1.5 }}>
                        {b.reason}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Apply / Applied button */}
            {!applied ? (
              <button
                onClick={handleApply}
                className="w-full py-2 rounded-xl text-xs font-bold tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(90deg, #a3ff47, #00e5ff)',
                  color: '#000',
                  fontFamily: 'monospace',
                  border: 'none',
                  letterSpacing: '0.12em',
                }}
              >
                ✦ 应用额外能力点到探员
              </button>
            ) : (
              <div className="text-center text-xs font-bold"
                style={{ color: '#a3ff47', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                ✓ 已应用 — 探员属性已强化
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}