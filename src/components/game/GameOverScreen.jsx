import Icon, { IconText } from '@/components/ui/Icon';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  getLevelFromXP, getXPToNextLevel, SKILL_TREES, LEVEL_XP_TABLE, MAX_LEVEL,
} from '@/game/agentProgression';
import { DETECTIVE_LEVEL_CAP, XP_PER_LEVEL, normalizeAgentProgression } from '@/game/playerProfile';
import { useProfile } from '@/lib/ProfileContext.jsx';
import LevelUpModal from '@/components/game/LevelUpModal';
import { useLang } from '@/lib/lang.jsx';
import { normalizeCaseScore } from '@/game/caseEvaluation';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';
import SlicedTitle from '@/components/ui/SlicedTitle';
import { useSettings } from '@/lib/settings.jsx';

// ── XP formula ────────────────────────────────────────────────────────────────
const SCORE_TITLES = {
  S: '至尊侦探', A: '精英探员', B: '资深调查官', C: '合格调查员', D: '见习侦探',
};
const SCORE_TITLES_EN = {
  S: 'MASTER DETECTIVE', A: 'ELITE AGENT', B: 'SENIOR INVESTIGATOR', C: 'QUALIFIED INVESTIGATOR', D: 'DETECTIVE TRAINEE',
};

// ── Particle burst on level up ────────────────────────────────────────────────
function LevelUpParticles({ color, trigger }) {
  const { motionEnabled } = usePresentationMotion();
  const { settings } = useSettings();
  const canvasRef = useRef(null);
  const particles = useRef([]);

  useEffect(() => {
    if (!trigger || !canvasRef.current || !motionEnabled || !settings.particles) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); };
  }, [trigger, motionEnabled, color, settings.particles]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }} />;
}

// ── Animated number counter ───────────────────────────────────────────────────
function Counter({ target, duration = 1200, color = '#709f9a', suffix = '' }) {
  const { motionEnabled } = usePresentationMotion();
  const [val, setVal] = useState(motionEnabled ? 0 : target);
  const finished = useRef(false);
  useEffect(() => {
    if (!motionEnabled || finished.current) { setVal(target); finished.current = true; return; }
    let start = null;
    let frameId = 0;
    const step = (ts) => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - pct, 3)) * target));
      if (pct < 1) frameId = requestAnimationFrame(step);
      else finished.current = true;
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration, motionEnabled]);
  return <span style={{ color, fontFamily: 'monospace', fontWeight: 900 }}>{val >= 0 ? '+' : ''}{val}{suffix}</span>;
}

// ── XP Bar ────────────────────────────────────────────────────────────────────
function XPBar({ oldXP, newXP, color, agentIdx, agentName, agentIcon, delay = 0, onLevelUp }) {
  const { lang } = useLang();
  const { motionEnabled } = usePresentationMotion();
  const reported = useRef(new Set());
  const completedTarget = useRef(null);
  const notifyRef = useRef(onLevelUp);
  notifyRef.current = onLevelUp;
  const [displayed, setDisplayed] = useState(motionEnabled ? oldXP : newXP);
  const [flash, setFlash] = useState(false);
  const [particleTrigger, setParticleTrigger] = useState(0);
  const [visible, setVisible] = useState(false);
  const [levelUps, setLevelUps] = useState([]);

  useEffect(() => {
    if (!motionEnabled) { setVisible(true); return; }
    if (visible) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay, motionEnabled, visible]);

  useEffect(() => {
    if (!visible) return;
    let frameId = 0;
    const crossings = [];
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      if (LEVEL_XP_TABLE[lvl] > oldXP && LEVEL_XP_TABLE[lvl] <= newXP) crossings.push(lvl);
    }
    setLevelUps(crossings);
    const finish = () => {
      completedTarget.current = newXP;
      setDisplayed(newXP);
      setFlash(true);
      if (motionEnabled && crossings.some(lvl => !reported.current.has(lvl))) setParticleTrigger(t => t + 1);
      crossings.forEach((lvl, idx) => {
        if (reported.current.has(lvl)) return;
        reported.current.add(lvl);
        notifyRef.current?.({ fromLevel: idx === 0 ? getLevelFromXP(oldXP) : crossings[idx - 1], toLevel: lvl, agentIdx });
      });
    };
    if (!motionEnabled || completedTarget.current === newXP) { finish(); return; }

    const startTimer = setTimeout(() => {
      let start = null;
      const dur = 2200;
      const step = (ts) => {
        if (!start) start = ts;
        const pct = Math.min((ts - start) / dur, 1);
        setDisplayed(Math.round(oldXP + (1 - Math.pow(1 - pct, 4)) * (newXP - oldXP)));
        if (pct < 1) frameId = requestAnimationFrame(step);
        else finish();
      };
      frameId = requestAnimationFrame(step);
    }, 300);
    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(frameId);
    };
  }, [visible, oldXP, newXP, motionEnabled, agentIdx]);

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
          boxShadow: flash ? `0 0 0 3px ${color}20` : 'none',
          transition: 'all 0.6s ease',
          animation: didLevelUp && flash ? 'badge-pulse 1s ease-in-out 2' : 'none',
        }}>
          {level}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}><Icon name={agentIcon} /></span>
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
            <div style={{ height: '100%', width: '100%', transformOrigin: 'left', transform: `scaleX(${isMax ? 1 : pct / 100})`, background: `linear-gradient(to right, ${color}80, ${color})`, transition: 'transform 0.08s linear', borderRadius: 4 }}/>
            {!isMax && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)', transform: `translateX(${pct - 100}%)`, transition: 'transform 0.08s linear', pointerEvents: 'none' }}/>}
          </div>
        </div>
      </div>
      {flash && newXP > oldXP && (
        <div style={{ marginLeft: 48, marginBottom: 4, fontSize: '0.58rem', fontFamily: 'monospace', color: `${color}90`, animation: 'fade-in-up 0.4s ease both' }}>
          +{newXP - oldXP} XP {lang === 'zh' ? '获得' : 'EARNED'}
        </div>
      )}
    </div>
  );
}

// ── Score grade ring ──────────────────────────────────────────────────────────
function ScoreRing({ score, isPassed }) {
  const { lang } = useLang();
  const { motionEnabled } = usePresentationMotion();
  const colors = { S: '#8aaa91', A: '#709f9a', B: '#c19a63', C: '#c19a63', D: '#c77c78' };
  const color = colors[score] || '#888';
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!motionEnabled) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, [motionEnabled]);
  return (
    <div style={{
      width: 110, height: 110, borderRadius: '50%', flexShrink: 0,
      border: `3px solid ${color}`,
      background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 0 6px ${color}0c`,
      transform: visible ? 'scale(1)' : 'scale(0.3)', opacity: visible ? 1 : 0,
      transition: 'all 0.6s cubic-bezier(.22,1,.36,1)',
    }}>
      <div style={{ fontSize: '3rem', fontWeight: 900, fontFamily: 'monospace', color, textShadow: 'none', lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: '0.5rem', fontFamily: 'monospace', color: `${color}80`, letterSpacing: '0.15em', marginTop: 2 }}>{isPassed ? (lang === 'zh' ? '已侦破' : 'SOLVED') : (lang === 'zh' ? '失败' : 'FAILED')}</div>
    </div>
  );
}

// ── XP Source Row ─────────────────────────────────────────────────────────────
function XPSourceRow({ label, val, color, icon, delay, sublabel }) {
  const { motionEnabled } = usePresentationMotion();
  const [visible, setVisible] = useState(!motionEnabled);
  const [counted, setCounted] = useState(!motionEnabled);
  useEffect(() => {
    if (!motionEnabled) { setVisible(true); setCounted(true); return; }
    const t1 = setTimeout(() => setVisible(true), delay);
    const t2 = setTimeout(() => setCounted(true), delay + 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay, motionEnabled]);
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
        <span style={{ fontSize: 14 }}><Icon name={icon} /></span>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', fontFamily: 'monospace' }}>{label}</div>
          {sublabel && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.55rem', fontFamily: 'monospace' }}>{sublabel}</div>}
        </div>
      </div>
      <div style={{ color: val < 0 ? '#c77c78' : color, fontWeight: 900, fontSize: '0.78rem', fontFamily: 'monospace', textShadow: 'none', minWidth: 60, textAlign: 'right' }}>
        {counted ? <Counter target={val} color={val < 0 ? '#c77c78' : color} suffix=" XP" duration={900} /> : `${val >= 0 ? '+' : ''}${val} XP`}
      </div>
    </div>
  );
}

// ── Main GameOverScreen ───────────────────────────────────────────────────────
const AGENT_NAMES  = ['隼目', '破心', '幽灵'];
const AGENT_ICONS  = ['👁️', '🔥', '💻'];
const AGENT_COLORS = ['#709f9a', '#c77c78', '#9b9aae'];

export default function GameOverScreen({ judgeResult, gameState, caseData, onReturnToLobby, onReturnToLanding, onSettlement }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const { profile } = useProfile();
  const { motionEnabled } = usePresentationMotion();
  const [xpGain, setXpGain] = useState(null);
  const [oldProg] = useState(() => normalizeAgentProgression(profile?.agent_progression));
  const [oldDetective] = useState(() => ({ level: profile?.level || 1, xp: profile?.xp || 0 }));
  const [newProg, setNewProg] = useState(null);
  const [settledDetective, setSettledDetective] = useState(null);
  const [phase, setPhase] = useState('summary');
  const settlementSentRef = useRef(false);
  const [settlementStatus, setSettlementStatus] = useState('saving');

  // Level-up modal queue
  const [modalQueue, setModalQueue] = useState([]); // [{agentIdx, fromLevel, toLevel}]
  const [currentModal, setCurrentModal] = useState(null);

  useEffect(() => {
    if (!motionEnabled) { setPhase('xp'); return; }
    const t = setTimeout(() => setPhase('xp'), 1400);
    return () => clearTimeout(t);
  }, [motionEnabled]);

  const syncSettlement = useCallback(async () => {
    if (settlementSentRef.current) return;
    settlementSentRef.current = true;
    setSettlementStatus('saving');
    try {
      const result = await onSettlement?.();
      const breakdown = result?.result?.xp_breakdown || result?.xp_breakdown;
      if (result?.error || result?.result?.error || result?.pending || !result?.profile
        || !breakdown || !Number.isFinite(breakdown.total)) throw new Error('UNCONFIRMED_SETTLEMENT');
      setXpGain(breakdown);
      setNewProg(normalizeAgentProgression(result.profile.agent_progression));
      setSettledDetective(result?.profile ? {
        level: result.profile.level,
        xp: result.profile.xp,
      } : null);
      setSettlementStatus('saved');
    } catch {
      settlementSentRef.current = false;
      setSettlementStatus('error');
    }
  }, [onSettlement]);

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

  const score = normalizeCaseScore(judgeResult?.score);
  const isPassed = judgeResult?.is_passed === true;
  const scoreTitle = zh ? (SCORE_TITLES[score] || '见习侦探') : (SCORE_TITLES_EN[score] || 'DETECTIVE TRAINEE');
  const mainColor = isPassed ? '#8aaa91' : '#c77c78';
  const settlementCanLeave = settlementStatus === 'saved';

  const BONUS_ROWS = xpGain ? [
    { label: zh ? `案件评分 · ${score} 级` : `CASE RANK · ${score}`, sublabel: scoreTitle, val: xpGain.base, color: { S: '#8aaa91', A: '#709f9a', B: '#c19a63', C: '#c19a63', D: '#c77c78' }[score] || '#888', icon: { S: '🏆', A: '⭐', B: '🔰', C: '📋', D: '📝' }[score] || '📋' },
    { label: `${zh ? '线索收集' : 'CLUES COLLECTED'} · ${gameState.unlocked_clues?.length || 0}/${caseData?.clue_dictionary?.length || 0}`, sublabel: `${zh ? '完成度' : 'COMPLETION'} ${Math.round(((gameState.unlocked_clues?.length || 0) / (caseData?.clue_dictionary?.length || 1)) * 100)}%${isPassed ? '' : (zh ? ' · 过程经验减半' : ' · PROCESS XP AT 50%')}`, val: xpGain.clueBonus, color: '#9b9aae', icon: '🔍' },
    { label: `${zh ? 'AP 效率 · 剩余' : 'AP EFFICIENCY · REMAINING'} ${gameState.action_points_left || 0}${zh ? ' 点' : ''}`, sublabel: zh ? '结合调查完成度计算，上限 60 XP' : 'Weighted by investigation progress, maximum 60 XP', val: xpGain.apBonus, color: '#c19a63', icon: '⚡' },
    { label: `${zh ? '混乱控制 · 最终' : 'CONFUSION CONTROL · FINAL'} ${gameState.confusion_score || 0}%`, sublabel: zh ? '结合调查完成度计算（满分 45 XP）' : 'Weighted by investigation progress (maximum 45 XP)', val: xpGain.confusionBonus, color: '#8aaa91', icon: '🧠' },
    { label: zh ? '无系统崩溃' : 'NO SYSTEM CRASH', sublabel: zh ? '按云端记录的崩溃次数结算' : 'Based on the cloud-recorded crash count', val: xpGain.noBSoD, color: '#9b9aae', icon: '🛡️' },
    ...(xpGain.outcomeAdjustment < 0 ? [{ label: zh ? '未结案经验调整' : 'UNSOLVED CASE ADJUSTMENT', sublabel: zh ? '报告未通过，但已保留调查过程经验' : 'The report was rejected, but process XP is retained', val: xpGain.outcomeAdjustment, color: '#c77c78', icon: '📝' }] : []),
  ] : [];

  return (
    <div className="td-game-over td-page-shell" style={{
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse at 30% 10%, #08121c 0%, #08121c 60%)',
      fontFamily: "'Courier New', monospace",
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 16px', overflowY: 'auto', color: '#fff',
    }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px)' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 700 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28, animation: 'go-in 0.6s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ display: 'inline-block', border: `1px solid ${mainColor}50`, borderRadius: 6, padding: '3px 14px', fontSize: '0.55rem', fontFamily: 'monospace', color: `${mainColor}80`, letterSpacing: '0.25em', marginBottom: 12, background: `${mainColor}08` }}>
            ◈ {zh ? '案件归档' : 'CASE CLOSED'} · {caseData?.case_id || 'NEON_BLOOD_01'} · {new Date().toLocaleDateString(zh ? 'zh-CN' : 'en-US')}
          </div>
          <SlicedTitle as="h1" style={{ fontSize: 'clamp(1.6rem, 5vw, 3rem)', margin: 0, color: mainColor }}>
            {isPassed ? (zh ? '案件终结' : 'CASE SOLVED') : (zh ? '调查失败' : 'INVESTIGATION FAILED')}
          </SlicedTitle>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: 6, letterSpacing: '0.2em' }}>{caseData?.title} · {caseData?.subtitle}</div>
        </div>

        {/* Score + critique */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24, animation: 'go-in 0.6s 0.15s cubic-bezier(.22,1,.36,1) both', flexWrap: 'wrap' }}>
          <ScoreRing score={score} isPassed={isPassed} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: mainColor, fontSize: '0.75rem', fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em' }}>{scoreTitle}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem', lineHeight: 1.7, marginBottom: 10 }}>{judgeResult?.critique || (zh ? '调查记录已归档。' : 'Investigation record archived.')}</div>
            <div style={{ color: isPassed ? 'rgba(138, 170, 145,.72)' : 'rgba(193, 154, 99,.78)', fontSize: '0.56rem', lineHeight: 1.6, marginBottom: 10 }}>
              {isPassed
                ? (zh ? 'C 级为基础结案门槛；效率与证据完整度用于提高评级和经验。' : 'Grade C is the closure threshold; efficiency and evidence completeness improve rank and XP.')
                : (zh ? 'D 级表示核心结论仍不正确；本局调查过程经验不会清零。' : 'Grade D means the core conclusion is still incorrect; process XP from this run is retained.')}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {[
                { label: zh ? '总回合' : 'TURNS', val: gameState.turn_count || 0, icon: '🔄' },
                { label: zh ? '发现线索' : 'CLUES', val: `${gameState.unlocked_clues?.length || 0}/${caseData?.clue_dictionary?.length || 0}`, icon: '🔍' },
                { label: zh ? '剩余AP' : 'AP LEFT', val: gameState.action_points_left || 0, icon: '⚡' },
                { label: zh ? '混乱峰值' : 'CONFUSION', val: `${gameState.confusion_score || 0}%`, icon: '🌀' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ color: mainColor, fontSize: '1rem', fontWeight: 900 }}><Icon name={s.icon} /> {s.val}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.5rem', letterSpacing: '0.1em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* XP breakdown */}
        <div className="td-ui-card td-result-panel" style={{ border: '1px solid rgba(112, 159, 154,0.15)', borderRadius: 14, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '16px 18px', marginBottom: 20, animation: 'go-in 0.6s 0.3s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ color: 'rgba(112, 159, 154,0.7)', fontSize: '0.58rem', letterSpacing: '0.2em', marginBottom: 10, fontFamily: 'monospace' }}>◈ {zh ? '经验值结算明细' : 'XP BREAKDOWN'}</div>
          {BONUS_ROWS.map((r, i) => (
            <XPSourceRow key={i} label={r.label} val={r.val} color={r.color} icon={r.icon} delay={400 + i * 180} sublabel={r.sublabel} />
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 10, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace' }}>{zh ? '本局总计获得' : 'TOTAL EARNED'}</span>
            <span style={{ color: '#8aaa91', fontSize: '1.2rem', fontWeight: 900, fontFamily: 'monospace', textShadow: 'none' }}>
              {!xpGain ? (zh ? '等待云端确认' : 'AWAITING CLOUD') : phase !== 'summary' ? <Counter target={xpGain.total} suffix=" XP" color="#8aaa91" duration={1200} /> : `+${xpGain.total} XP`}
            </span>
          </div>
        </div>

        {phase === 'xp' && settledDetective && (
          <div className={`td-ui-card td-result-panel td-detective-level-result ${settledDetective.level > oldDetective.level ? 'is-level-up' : ''}`} style={{
            border: `1px solid ${settledDetective.level > oldDetective.level ? 'rgba(197, 166, 111,.48)' : 'rgba(112, 159, 154,.2)'}`,
            borderRadius: 14, padding: '14px 16px', marginBottom: 20, position: 'relative', overflow: 'hidden',
            background: settledDetective.level > oldDetective.level
              ? 'linear-gradient(135deg,rgba(197, 166, 111,.15),rgba(112, 159, 154,.07))'
              : 'linear-gradient(135deg,rgba(112, 159, 154,.08),rgba(0,0,0,.5))',
            animation: 'go-in .55s cubic-bezier(.22,1,.36,1) both',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(197, 166, 111,.72)', background: 'rgba(197, 166, 111,.1)', color: '#c5a66f', fontWeight: 900, boxShadow: '0 0 18px rgba(197, 166, 111,.2)' }}>{settledDetective.level}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: settledDetective.level > oldDetective.level ? '#e1d0ac' : '#a5c8c0', fontSize: '.67rem', fontWeight: 900, letterSpacing: '.1em' }}>
                  {settledDetective.level > oldDetective.level
                    ? (zh ? `侦探等级提升 · LV.${settledDetective.level}` : `DETECTIVE LEVEL UP · LV.${settledDetective.level}`)
                    : (zh ? `侦探成长 · LV.${settledDetective.level}` : `DETECTIVE PROGRESS · LV.${settledDetective.level}`)}
                </div>
                <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.08)', marginTop: 8 }}>
                  <div style={{ width: `${settledDetective.level >= DETECTIVE_LEVEL_CAP ? 100 : Math.min(100, settledDetective.xp / XP_PER_LEVEL * 100)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#709f9a,#a5c8c0,#e1d0ac)', boxShadow: '0 0 12px rgba(112, 159, 154,.5)' }} />
                </div>
                <div style={{ color: 'rgba(230, 223, 207,.42)', fontSize: '.52rem', marginTop: 5 }}>
                  {settledDetective.level >= DETECTIVE_LEVEL_CAP ? 'MAX' : `${settledDetective.xp}/${XP_PER_LEVEL} XP`}
                </div>
              </div>
              <div style={{ color: '#8aaa91', fontWeight: 900, fontSize: '.75rem', whiteSpace: 'nowrap' }}>+{xpGain.total} XP</div>
            </div>
            {settledDetective.level > oldDetective.level && <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(197, 166, 111,.15)', color: 'rgba(244,220,167,.68)', fontSize: '.54rem' }}>{zh ? '新的等级奖励已解锁，可在首页“等级之路”领取。' : 'A new reward is ready on the Level Road at Home.'}</div>}
          </div>
        )}

        {/* Agent XP bars */}
        {phase === 'xp' && newProg && (
          <div className="td-ui-card td-result-panel" style={{ border: '1px solid rgba(155, 154, 174,0.2)', borderRadius: 14, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', padding: '16px 18px', marginBottom: 20, animation: 'go-in 0.5s cubic-bezier(.22,1,.36,1) both', position: 'relative', overflow: 'hidden' }}>
            <div style={{ color: 'rgba(155, 154, 174,0.8)', fontSize: '0.58rem', letterSpacing: '0.2em', marginBottom: 14, fontFamily: 'monospace' }}>◈ {zh ? '探员晋升档案' : 'AGENT ADVANCEMENT'}</div>
            {AGENT_NAMES.map((name, i) => (
              <XPBar
                key={i} agentIdx={i} agentName={zh ? name : ['NEXUS-01', 'AURORA-09', 'CIPHER-47'][i]}
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
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.52rem', letterSpacing: '0.2em', marginBottom: 4, fontFamily: 'monospace' }}>{zh ? '本局评定称号' : 'CASE TITLE EARNED'}</div>
              <div style={{ color: mainColor, fontSize: '1.2rem', fontWeight: 900, fontFamily: 'monospace', textShadow: 'none' }}>{scoreTitle}</div>
            </div>
          </div>
        )}

        <div role="status" style={{
          marginBottom: 12, textAlign: 'center', fontFamily: 'monospace', fontSize: '.58rem',
          color: settlementStatus === 'saved' ? '#8aaa91' : settlementStatus === 'error' ? '#c77c78' : '#c19a63',
        }}>
          <IconText text={settlementStatus === 'saved'
            ? (zh ? '✓ 调查档案已同步至 Cloudflare' : '✓ INVESTIGATION SYNCED TO CLOUDFLARE')
            : settlementStatus === 'error'
              ? (zh ? '⚠ 云端结算尚未确认；重试会核对同一案件，不会重复发奖。' : '⚠ CLOUD SETTLEMENT UNCONFIRMED. RETRY CHECKS THE SAME RUN WITHOUT DUPLICATE REWARDS.')
              : (zh ? '⟳ 正在同步调查结算…' : '⟳ SYNCING CASE SETTLEMENT…')} />
          {settlementStatus === 'error' && <button className="td-ui-button td-button-danger td-button-compact" onClick={() => void syncSettlement()} style={{ marginLeft: 9 }}>{zh ? '重试' : 'RETRY'}</button>}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', animation: 'go-in 0.6s 0.6s cubic-bezier(.22,1,.36,1) both' }}>
          <button className="td-ui-button td-button-primary" onClick={onReturnToLobby} disabled={!settlementCanLeave} style={{ padding: '14px 36px', fontSize: '0.8rem', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.08em', borderRadius: 10, cursor: settlementCanLeave ? 'pointer' : 'wait', opacity: settlementCanLeave ? 1 : .45 }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            ↺ {zh ? '重新配置编队' : 'RECONFIGURE SQUAD'}
          </button>
          <button className="td-ui-button td-button-ghost" onClick={onReturnToLanding} disabled={!settlementCanLeave} style={{ padding: '14px 36px', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.6)', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, cursor: settlementCanLeave ? 'pointer' : 'wait', opacity: settlementCanLeave ? 1 : .45, transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}>
            ← {zh ? '返回主页' : 'RETURN HOME'}
          </button>
        </div>
      </div>

      {/* Level-up modal */}
      {currentModal && (
        <LevelUpModal
          agentName={zh ? AGENT_NAMES[currentModal.agentIdx] : ['NEXUS-01', 'AURORA-09', 'CIPHER-47'][currentModal.agentIdx]}
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
