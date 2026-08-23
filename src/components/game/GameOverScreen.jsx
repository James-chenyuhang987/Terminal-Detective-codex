import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  getLevelFromXP, getXPToNextLevel, SKILL_TREES, LEVEL_XP_TABLE, MAX_LEVEL,
} from '@/game/agentProgression';
import { normalizeAgentProgression } from '@/game/playerProfile';
import { useProfile } from '@/lib/ProfileContext.jsx';
import LevelUpModal from '@/components/game/LevelUpModal';

// ── XP formula ────────────────────────────────────────────────────────────────
const SCORE_XP = { S: 300, A: 220, B: 150, C: 80, D: 30 };
const SCORE_TITLES = {
  S: '至尊侦探', A: '精英探员', B: '资深调查官', C: '初级探员', D: '见习侦探',
};

function calcXPGain(judgeResult, gameState, caseData) {
  if (!judgeResult?.is_passed) {
    return { base: 0, clueBonus: 0, apBonus: 0, confusionBonus: 0, noBSoD: 0, passed: 0, total: 0 };
  }
  const base = SCORE_XP[judgeResult?.score] || 0;
  const cluePct = (gameState.unlocked_clues?.length || 0) / (caseData?.clue_dictionary?.length || 1);
  const clueBonus = Math.round(cluePct * 60);
  const apBonus = Math.min((gameState.action_points_left || 0) * 5, 80);
  const confusionCtrl = Math.max(0, 100 - (gameState.confusion_score || 0));
  const confusionBonus = Math.round((confusionCtrl / 100) * 50);
  const noBSoD = (gameState.confusion_score || 0) < 100 ? 40 : 0;
  const passedPenalty = judgeResult?.is_passed ? 0 : -50;
  return {
    base, clueBonus, apBonus, confusionBonus, noBSoD, passed: passedPenalty,
    total: Math.max(0, base + clueBonus + apBonus + confusionBonus + noBSoD + passedPenalty),
  };
}

// ── Particle burst on level up ────────────────────────────────────────────────
function LevelUpParticles({ color, trigger }) {
  const canvasRef = useRef(null);
  const particles = useRef([]);

  useEffect(() => {
    if (!trigger || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    particles.current = Array.from({ length: 28 }, () => ({
      x: canvas.width / 2, y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 10 - 3,
      life: 1, decay: 0.025 + Math.random() * 0.02,
      r: 2 + Math.random() * 4,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life -= p.decay;
        if (p.life <= 0) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color + Math.floor(p.life * 255).toString(16).padStart(2, '00');
        ctx.shadowBlur = 8; ctx.shadowColor = color; ctx.fill();
      });
      particles.current = particles.current.filter(p => p.life > 0);
      if (particles.current.length > 0) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [trigger]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }} />;
}

// ── Animated number counter ───────────────────────────────────────────────────
function Counter({ target, duration = 1200, color = '#00e5ff', suffix = '' }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - pct, 3)) * target));
      if (pct < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return <span style={{ color, fontFamily: 'monospace', fontWeight: 900 }}>{val >= 0 ? '+' : ''}{val}{suffix}</span>;
}

// ── XP Bar ────────────────────────────────────────────────────────────────────
function XPBar({ oldXP, newXP, color, agentIdx, agentName, agentIcon, delay = 0, onLevelUp }) {
  const [displayed, setDisplayed] = useState(oldXP);
  const [flash, setFlash] = useState(false);
  const [particleTrigger, setParticleTrigger] = useState(0);
  const [visible, setVisible] = useState(false);
  const [levelUps, setLevelUps] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!visible) return;
    const crossings = [];
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      if (LEVEL_XP_TABLE[lvl] > oldXP && LEVEL_XP_TABLE[lvl] <= newXP) crossings.push(lvl);
    }
    setLevelUps(crossings);

    const startTimer = setTimeout(() => {
      let start = null;
      const dur = 2200;
      const step = (ts) => {
        if (!start) start = ts;
        const pct = Math.min((ts - start) / dur, 1);
        setDisplayed(Math.round(oldXP + (1 - Math.pow(1 - pct, 4)) * (newXP - oldXP)));
        if (pct < 1) requestAnimationFrame(step);
        else {
          setFlash(true);
          if (crossings.length > 0) {
            setParticleTrigger(t => t + 1);
            // Stagger modal per crossing level
            crossings.forEach((lvl, idx) => {
              setTimeout(() => {
                onLevelUp?.({ fromLevel: idx === 0 ? getLevelFromXP(oldXP) : crossings[idx - 1], toLevel: lvl, agentIdx });
              }, idx * 200);
            });
          }
        }
      };
      requestAnimationFrame(step);
    }, 300);
    return () => clearTimeout(startTimer);
  }, [visible, oldXP, newXP]);

  const level = getLevelFromXP(displayed);
  const { current, needed, pct } = getXPToNextLevel(displayed);
  const isMax = level >= MAX_LEVEL;
  const didLevelUp = levelUps.length > 0;
  const finalLevel = getLevelFromXP(newXP);

  return (
    <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(-12px)', transition: 'all 0.4s ease', marginBottom: 20, position: 'relative' }}>
      <LevelUpParticles color={color} trigger={particleTrigger} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${color}`,
          background: didLevelUp && flash ? `${color}40` : `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', fontWeight: 900, fontSize: '0.85rem', color,
          boxShadow: flash ? `0 0 24px ${color}, 0 0 48px ${color}60` : `0 0 8px ${color}40`,
          transition: 'all 0.6s ease',
          animation: didLevelUp && flash ? 'badge-pulse 1s ease-in-out 2' : 'none',
        }}>
          {level}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>{agentIcon}</span>
              <span style={{ color, fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700 }}>{agentName}</span>
              {didLevelUp && flash && (
                <span style={{ fontSize: '0.5rem', color: '#fff', fontFamily: 'monospace', background: color, borderRadius: 4, padding: '1px 6px', fontWeight: 900, animation: 'level-badge-in 0.4s cubic-bezier(.22,1,.36,1) both' }}>
                  Lv.{getLevelFromXP(oldXP)} → Lv.{finalLevel}
                </span>
              )}
            </div>
            <span style={{ color: `${color}70`, fontSize: '0.58rem', fontFamily: 'monospace' }}>
              {isMax ? 'MAX LEVEL' : `${current} / ${needed} XP`}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: '100%', width: isMax ? '100%' : `${pct}%`, background: `linear-gradient(to right, ${color}50, ${color})`, boxShadow: `0 0 10px ${color}80`, transition: 'width 0.08s linear', borderRadius: 4 }}/>
            {!isMax && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)', transform: `translateX(${pct - 100}%)`, transition: 'transform 0.08s linear', pointerEvents: 'none' }}/>}
          </div>
        </div>
      </div>
      {flash && newXP > oldXP && (
        <div style={{ marginLeft: 48, marginBottom: 4, fontSize: '0.58rem', fontFamily: 'monospace', color: `${color}90`, animation: 'fade-in-up 0.4s ease both' }}>
          +{newXP - oldXP} XP 获得
        </div>
      )}
    </div>
  );
}

// ── Score grade ring ──────────────────────────────────────────────────────────
function ScoreRing({ score, isPassed }) {
  const colors = { S: '#00ff88', A: '#00e5ff', B: '#ffaa00', C: '#ff6600', D: '#ff3860' };
  const color = colors[score] || '#888';
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 200); }, []);
  return (
    <div style={{
      width: 110, height: 110, borderRadius: '50%', flexShrink: 0,
      border: `3px solid ${color}`,
      background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 40px ${color}60, inset 0 0 20px ${color}10`,
      transform: visible ? 'scale(1)' : 'scale(0.3)', opacity: visible ? 1 : 0,
      transition: 'all 0.6s cubic-bezier(.22,1,.36,1)',
    }}>
      <div style={{ fontSize: '3rem', fontWeight: 900, fontFamily: 'monospace', color, textShadow: `0 0 20px ${color}`, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: '0.5rem', fontFamily: 'monospace', color: `${color}80`, letterSpacing: '0.15em', marginTop: 2 }}>{isPassed ? 'SOLVED' : 'FAILED'}</div>
    </div>
  );
}

// ── XP Source Row ─────────────────────────────────────────────────────────────
function XPSourceRow({ label, val, color, icon, delay, sublabel }) {
  const [visible, setVisible] = useState(false);
  const [counted, setCounted] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), delay);
    const t2 = setTimeout(() => setCounted(true), delay + 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay]);
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 10px', marginBottom: 4, borderRadius: 8,
      background: visible ? `${color}08` : 'transparent',
      border: `1px solid ${visible ? color + '25' : 'transparent'}`,
      opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(-10px)',
      transition: 'all 0.35s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontFamily: 'monospace' }}>{label}</div>
          {sublabel && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.55rem', fontFamily: 'monospace' }}>{sublabel}</div>}
        </div>
      </div>
      <div style={{ color: val < 0 ? '#ff3860' : color, fontWeight: 900, fontSize: '0.78rem', fontFamily: 'monospace', textShadow: `0 0 8px ${val < 0 ? '#ff3860' : color}80`, minWidth: 60, textAlign: 'right' }}>
        {counted ? <Counter target={val} color={val < 0 ? '#ff3860' : color} suffix=" XP" duration={900} /> : `${val >= 0 ? '+' : ''}${val} XP`}
      </div>
    </div>
  );
}

// ── Main GameOverScreen ───────────────────────────────────────────────────────
const AGENT_NAMES  = ['隼目', '破心', '幽灵'];
const AGENT_ICONS  = ['👁️', '🔥', '💻'];
const AGENT_COLORS = ['#00e5ff', '#ff6b6b', '#a78bfa'];

export default function GameOverScreen({ judgeResult, gameState, caseData, rewardEligible = false, onReturnToLobby, onReturnToLanding, onSettlement }) {
  const { profile } = useProfile();
  const xpGain = calcXPGain(rewardEligible ? judgeResult : null, gameState, caseData);
  const [oldProg] = useState(() => normalizeAgentProgression(profile?.agent_progression));
  const [newProg, setNewProg] = useState(null);
  const [phase, setPhase] = useState('summary');
  const settlementSentRef = useRef(false);
  const [settlementStatus, setSettlementStatus] = useState('saving');

  // Level-up modal queue
  const [modalQueue, setModalQueue] = useState([]); // [{agentIdx, fromLevel, toLevel}]
  const [currentModal, setCurrentModal] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPhase('xp');
    }, 1400);
    return () => clearTimeout(t);
  }, []);

  const syncSettlement = useCallback(async () => {
    if (settlementSentRef.current) return;
    settlementSentRef.current = true;
    setSettlementStatus('saving');
    try {
      const result = await onSettlement?.({
        xpGain: xpGain.total,
      });
      if (result?.error) throw new Error(result.error);
      setNewProg(normalizeAgentProgression(result?.profile?.agent_progression || oldProg));
      setSettlementStatus('saved');
    } catch {
      settlementSentRef.current = false;
      setSettlementStatus('error');
    }
  }, [oldProg, onSettlement, xpGain.total]);

  useEffect(() => { void syncSettlement(); }, [syncSettlement]);

  // Process modal queue sequentially
  useEffect(() => {
    if (!currentModal && modalQueue.length > 0) {
      setCurrentModal(modalQueue[0]);
      setModalQueue(q => q.slice(1));
    }
  }, [currentModal, modalQueue]);

  const handleLevelUp = useCallback(({ fromLevel, toLevel, agentIdx }) => {
    // Collect all newly unlocked skills between fromLevel+1 and toLevel
    const newSkills = (SKILL_TREES[agentIdx] || []).filter(
      s => s.unlock_level > fromLevel && s.unlock_level <= toLevel
    );
    setModalQueue(q => [...q, { agentIdx, fromLevel, toLevel, newSkills }]);
  }, []);

  const score = judgeResult?.score || 'D';
  const isPassed = !!judgeResult?.is_passed;
  const scoreTitle = SCORE_TITLES[score] || '见习侦探';
  const mainColor = isPassed ? '#00ff88' : '#ff3860';

  const BONUS_ROWS = [
    { label: `案件评分 · ${score} 级`, sublabel: scoreTitle, val: xpGain.base, color: { S: '#00ff88', A: '#00e5ff', B: '#ffaa00', C: '#ff6600', D: '#ff3860' }[score] || '#888', icon: { S: '🏆', A: '⭐', B: '🔰', C: '📋', D: '📝' }[score] || '📋' },
    { label: `线索收集 · ${gameState.unlocked_clues?.length || 0}/${caseData?.clue_dictionary?.length || 0}`, sublabel: `完成度 ${Math.round(((gameState.unlocked_clues?.length || 0) / (caseData?.clue_dictionary?.length || 1)) * 100)}%`, val: xpGain.clueBonus, color: '#a78bfa', icon: '🔍' },
    { label: `AP 效率 · 剩余 ${gameState.action_points_left || 0} 点`, sublabel: '每点 AP = 5 XP，上限 80', val: xpGain.apBonus, color: '#ffaa00', icon: '⚡' },
    { label: `混乱控制 · 最终 ${gameState.confusion_score || 0}%`, sublabel: '越低奖励越高（满分 50 XP）', val: xpGain.confusionBonus, color: '#00ff88', icon: '🧠' },
    { label: '无系统崩溃', sublabel: gameState.confusion_score < 100 ? '全程稳定运行' : '触发过 BSoD', val: xpGain.noBSoD, color: '#ff3aff', icon: '🛡️' },
    ...(xpGain.passed < 0 ? [{ label: '破案失败惩罚', sublabel: '报告未通过审判', val: xpGain.passed, color: '#ff3860', icon: '💀' }] : []),
  ];

  return (
    <div className="td-game-over" style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse at 30% 10%, #0a0020 0%, #03060f 60%)',
      fontFamily: "'Courier New', monospace",
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 16px', overflowY: 'auto', color: '#fff',
    }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px)' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 700 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28, animation: 'go-in 0.6s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ display: 'inline-block', border: `1px solid ${mainColor}50`, borderRadius: 6, padding: '3px 14px', fontSize: '0.55rem', fontFamily: 'monospace', color: `${mainColor}80`, letterSpacing: '0.25em', marginBottom: 12, background: `${mainColor}08` }}>
            ◈ CASE CLOSED · {caseData?.case_id || 'NEON_BLOOD_01'} · {new Date().toLocaleDateString('zh-CN')}
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', fontWeight: 900, margin: 0, background: isPassed ? 'linear-gradient(135deg, #00ff88 0%, #00e5ff 100%)' : 'linear-gradient(135deg, #ff3860 0%, #ff6600 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '0.08em' }}>
            {isPassed ? '◈ 案件终结' : '◈ 调查失败'}
          </h1>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: 6, letterSpacing: '0.2em' }}>{caseData?.title} · {caseData?.subtitle}</div>
        </div>

        {/* Score + critique */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24, animation: 'go-in 0.6s 0.15s cubic-bezier(.22,1,.36,1) both', flexWrap: 'wrap' }}>
          <ScoreRing score={score} isPassed={isPassed} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: mainColor, fontSize: '0.75rem', fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em' }}>{scoreTitle}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem', lineHeight: 1.7, marginBottom: 10 }}>{judgeResult?.critique || '调查记录已归档。'}</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {[
                { label: '总回合', val: gameState.turn_count || 0, icon: '🔄' },
                { label: '发现线索', val: `${gameState.unlocked_clues?.length || 0}/${caseData?.clue_dictionary?.length || 0}`, icon: '🔍' },
                { label: '剩余AP', val: gameState.action_points_left || 0, icon: '⚡' },
                { label: '混乱峰值', val: `${gameState.confusion_score || 0}%`, icon: '🌀' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ color: mainColor, fontSize: '1rem', fontWeight: 900 }}>{s.icon} {s.val}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.5rem', letterSpacing: '0.1em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* XP breakdown */}
        <div style={{ border: '1px solid rgba(0,229,255,0.15)', borderRadius: 14, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '16px 18px', marginBottom: 20, animation: 'go-in 0.6s 0.3s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ color: 'rgba(0,229,255,0.7)', fontSize: '0.58rem', letterSpacing: '0.2em', marginBottom: 10, fontFamily: 'monospace' }}>◈ 经验值结算明细</div>
          {BONUS_ROWS.map((r, i) => (
            <XPSourceRow key={i} label={r.label} val={r.val} color={r.color} icon={r.icon} delay={400 + i * 180} sublabel={r.sublabel} />
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace' }}>本局总计获得</span>
            <span style={{ color: '#00ff88', fontSize: '1.2rem', fontWeight: 900, fontFamily: 'monospace', textShadow: '0 0 16px #00ff88' }}>
              {phase !== 'summary' ? <Counter target={xpGain.total} suffix=" XP" color="#00ff88" duration={1200} /> : `+${xpGain.total} XP`}
            </span>
          </div>
        </div>

        {/* Agent XP bars */}
        {phase === 'xp' && newProg && (
          <div style={{ border: '1px solid rgba(167,139,250,0.2)', borderRadius: 14, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '16px 18px', marginBottom: 20, animation: 'go-in 0.5s cubic-bezier(.22,1,.36,1) both', position: 'relative', overflow: 'hidden' }}>
            <div style={{ color: 'rgba(167,139,250,0.8)', fontSize: '0.58rem', letterSpacing: '0.2em', marginBottom: 14, fontFamily: 'monospace' }}>◈ 探员晋升档案</div>
            {AGENT_NAMES.map((name, i) => (
              <XPBar
                key={i} agentIdx={i} agentName={name}
                agentIcon={AGENT_ICONS[i]} color={AGENT_COLORS[i]}
                oldXP={oldProg[i]?.xp || 0} newXP={newProg[i]?.xp || 0}
                delay={i * 350}
                onLevelUp={({ fromLevel, toLevel }) => handleLevelUp({ fromLevel, toLevel, agentIdx: i })}
              />
            ))}
          </div>
        )}

        {/* Title banner */}
        {phase === 'xp' && (
          <div style={{ textAlign: 'center', marginBottom: 20, animation: 'go-in 0.6s 0.5s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ display: 'inline-block', border: `2px solid ${mainColor}60`, borderRadius: 12, padding: '10px 32px', background: `${mainColor}10`, backdropFilter: 'blur(8px)' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.52rem', letterSpacing: '0.2em', marginBottom: 4, fontFamily: 'monospace' }}>本局评定称号</div>
              <div style={{ color: mainColor, fontSize: '1.2rem', fontWeight: 900, fontFamily: 'monospace', textShadow: `0 0 16px ${mainColor}` }}>{scoreTitle}</div>
            </div>
          </div>
        )}

        <div role="status" style={{
          marginBottom: 12, textAlign: 'center', fontFamily: 'monospace', fontSize: '.58rem',
          color: settlementStatus === 'saved' ? '#00ff88' : settlementStatus === 'error' ? '#ff6b84' : '#ffaa00',
        }}>
          {settlementStatus === 'saved' ? '✓ 调查档案已同步至 Base44' : settlementStatus === 'error' ? '⚠ 云端结算失败，奖励尚未写入' : '⟳ 正在同步调查结算…'}
          {settlementStatus === 'error' && <button onClick={() => void syncSettlement()} style={{ marginLeft: 9, border: '1px solid #ff6b8480', borderRadius: 6, padding: '3px 8px', background: 'rgba(255,56,96,.1)', color: '#ff8da0', cursor: 'pointer', fontFamily: 'monospace' }}>重试</button>}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', animation: 'go-in 0.6s 0.6s cubic-bezier(.22,1,.36,1) both' }}>
          <button onClick={onReturnToLobby} disabled={settlementStatus !== 'saved'} style={{ padding: '14px 36px', fontSize: '0.8rem', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.15em', color: '#fff', background: 'linear-gradient(135deg, #00c8ff 0%, #a78bfa 100%)', border: 'none', borderRadius: 12, cursor: settlementStatus === 'saved' ? 'pointer' : 'wait', opacity: settlementStatus === 'saved' ? 1 : .45, boxShadow: '0 0 30px rgba(0,200,255,0.4)', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            ↺ 重新配置编队
          </button>
          <button onClick={onReturnToLanding} disabled={settlementStatus !== 'saved'} style={{ padding: '14px 36px', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.6)', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, cursor: settlementStatus === 'saved' ? 'pointer' : 'wait', opacity: settlementStatus === 'saved' ? 1 : .45, transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}>
            ← 返回主页
          </button>
        </div>
      </div>

      {/* Level-up modal */}
      {currentModal && (
        <LevelUpModal
          agentName={AGENT_NAMES[currentModal.agentIdx]}
          agentIcon={AGENT_ICONS[currentModal.agentIdx]}
          color={AGENT_COLORS[currentModal.agentIdx]}
          fromLevel={currentModal.fromLevel}
          toLevel={currentModal.toLevel}
          newSkills={currentModal.newSkills || []}
          onClose={() => setCurrentModal(null)}
        />
      )}

      <style>{`
        @keyframes go-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes level-badge-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes badge-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
      `}</style>
    </div>
  );
}
