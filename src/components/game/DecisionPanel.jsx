import React, { useState, useEffect, useRef } from 'react';

// 关键决策面板 — AI 推荐 3 个行动，玩家 30 秒内选择
const ACTION_LABELS = {
  talk_to_npc: 'NPC 对话', search_area: '区域搜索', examine_clue: '线索检验',
  check_alibi: '不在场核查', present_evidence: '出示证据', interrogate_suspect: '审讯嫌疑人',
  access_database: '访问数据库', analyze_forensics: '法证分析', tail_suspect: '跟踪嫌疑人',
  bribe_informant: '收买线人', hack_terminal: '入侵终端', check_cctv: '调取监控',
};

export default function DecisionPanel({ pending, onChoose }) {
  const [timeLeft, setTimeLeft] = useState(30);
  const chosenRef = useRef(false);

  useEffect(() => {
    setTimeLeft(30);
    chosenRef.current = false;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(id);
          if (!chosenRef.current) {
            chosenRef.current = true;
            onChoose(pending.recommended);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pending]);

  const choose = (tag) => {
    if (chosenRef.current) return;
    chosenRef.current = true;
    onChoose(tag);
  };

  const urgent = timeLeft <= 10;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2,4,14,0.6)', backdropFilter: 'blur(6px)',
      fontFamily: 'monospace',
    }}>
      <div style={{
        width: 520, maxWidth: '92vw',
        border: '1px solid #ffaa0060', borderRadius: 14,
        background: 'rgba(4,8,20,0.97)',
        boxShadow: '0 0 60px #ffaa0025, inset 0 0 30px rgba(255,170,0,0.04)',
        padding: '20px 22px',
        animation: 'dp-in 0.3s cubic-bezier(.22,1,.36,1) both',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div>
            <div style={{ color: '#ffaa00', fontWeight: 900, fontSize: '0.85rem', letterSpacing: '0.12em', textShadow: '0 0 12px #ffaa0080' }}>
              ⚡ 关键决策节点 · CRITICAL DECISION
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.55rem', marginTop: 3 }}>
              局势已达临界点 — AI 挂起自动执行，等待架构师指令
            </div>
          </div>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            border: `3px solid ${urgent ? '#ff3860' : '#ffaa00'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: urgent ? '#ff3860' : '#ffaa00',
            fontSize: '1.15rem', fontWeight: 900, flexShrink: 0,
            boxShadow: `0 0 16px ${urgent ? '#ff386060' : '#ffaa0040'}`,
            animation: urgent ? 'dp-pulse 0.6s ease-in-out infinite' : 'none',
          }}>
            {timeLeft}
          </div>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.52rem', marginBottom: 14 }}>
          触发原因：{pending.reason}
        </div>

        {/* Options */}
        {pending.options.map((opt, i) => (
          <button key={opt.tag} onClick={() => choose(opt.tag)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '12px 14px', marginBottom: 8, borderRadius: 10,
            border: `1px solid ${opt.riskColor}45`,
            background: `${opt.riskColor}0a`, cursor: 'pointer',
            textAlign: 'left', transition: 'all 0.15s',
            animation: `dp-opt-in 0.3s ${0.08 * i}s ease both`,
            fontFamily: 'monospace',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = `${opt.riskColor}20`; e.currentTarget.style.transform = 'translateX(4px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = `${opt.riskColor}0a`; e.currentTarget.style.transform = 'none'; }}
          >
            <div style={{
              fontSize: '0.44rem', fontWeight: 900, color: opt.riskColor,
              border: `1px solid ${opt.riskColor}60`, borderRadius: 4,
              padding: '2px 7px', flexShrink: 0, background: `${opt.riskColor}12`,
            }}>{opt.risk}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: '0.68rem', fontWeight: 700 }}>
                {ACTION_LABELS[opt.tag] || opt.tag}
                {opt.tag === pending.recommended && (
                  <span style={{ marginLeft: 8, fontSize: '0.42rem', color: '#00ff88', border: '1px solid #00ff8850', borderRadius: 3, padding: '1px 5px' }}>AI 推荐</span>
                )}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.5rem', marginTop: 3 }}>{opt.desc}</div>
            </div>
            <div style={{ color: opt.riskColor, fontSize: '0.8rem', opacity: 0.6 }}>▶</div>
          </button>
        ))}

        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.45rem', textAlign: 'center', marginTop: 6 }}>
          超时将自动执行 AI 推荐方案
        </div>
      </div>
      <style>{`
        @keyframes dp-in { from{opacity:0;transform:scale(0.92) translateY(12px)} to{opacity:1;transform:none} }
        @keyframes dp-opt-in { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:none} }
        @keyframes dp-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
      `}</style>
    </div>
  );
}
