import React, { useRef, useState } from 'react';
import { ALL_CASES } from '@/game/caseData';
import { CASE_ENERGY_COST, CASE_GOLD_REWARD, FIRST_CLEAR_DIAMONDS } from '@/game/playerProfile';
import { useLang } from '@/lib/lang.jsx';

const DIFFICULTY_CONFIG = {
  NORMAL: { label: 'NORMAL', color: '#00ff88', bg: 'rgba(0,255,136,0.1)', stars: 1 },
  HARD:   { label: 'HARD',   color: '#ffaa00', bg: 'rgba(255,170,0,0.1)', stars: 2 },
  OMEGA:  { label: 'OMEGA',  color: '#ff3860', bg: 'rgba(255,56,96,0.12)', stars: 3 },
};

const CASE_COVER_ICONS = ['🏙️', '🔬', '🦋'];

export default function CaseSelect({ onSelect, onBack, preferredCaseId = null, profile }) {
  const { lang, t } = useLang();
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(preferredCaseId);
  const [startingId, setStartingId] = useState(null);
  const [error, setError] = useState('');
  const startingRef = useRef(false);

  const handleStart = async (caseData) => {
    if (startingRef.current) return;
    const energyCost = CASE_ENERGY_COST[caseData.difficulty] || 10;
    if ((profile?.energy || 0) < energyCost) {
      setError(lang === 'zh' ? `体力不足，需要 ${energyCost} 点体力。请返回侦探之家补给。` : `Not enough energy. This case requires ${energyCost}.`);
      return;
    }
    startingRef.current = true;
    setStartingId(caseData.case_id);
    setSelected(caseData.case_id);
    setError('');
    try {
      const result = await onSelect(caseData);
      if (result?.error) {
        startingRef.current = false;
        setStartingId(null);
        setSelected(preferredCaseId);
        setError(result.error === 'insufficient_energy'
          ? (lang === 'zh' ? `体力不足，需要 ${result.cost} 点体力。请返回侦探之家补给。` : `Not enough energy. This case requires ${result.cost}.`)
          : (lang === 'zh' ? '无法开始案件，请稍后重试。' : 'Unable to start the case. Please retry.'));
      }
    } catch {
      startingRef.current = false;
      setStartingId(null);
      setSelected(preferredCaseId);
      setError(lang === 'zh' ? '云端同步失败，体力未扣除。' : 'Cloud sync failed. Energy was not spent.');
    }
  };

  // Get localised fields for a case
  const loc = (c, field) => (lang === 'en' && c.en && c.en[field] !== undefined) ? c.en[field] : c[field];

  return (
    <div
      className="td-case-select td-page-shell min-h-screen flex flex-col items-center px-4 py-10"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #0a1628 0%, #050a14 60%, #020408 100%)',
        fontFamily: "'Courier New', monospace",
        color: 'white',
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="td-case-back td-ui-button td-button-ghost td-button-compact self-start text-xs opacity-70 hover:opacity-100 transition-opacity"
        style={{ color: '#00e5ff', fontFamily: 'monospace' }}
      >
        {t.backToLobby}
      </button>

      {/* Header */}
      <div className="text-center mb-10">
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.5em', color: 'rgba(0,229,255,0.5)', marginBottom: 8 }}>
          {t.selectInvestigation}
        </div>
        <div style={{
          fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
          fontWeight: 900,
          letterSpacing: '0.12em',
          color: '#fff',
          textShadow: '0 0 30px rgba(0,229,255,0.4)',
        }}>
          {t.caseArchiveTitle}
        </div>
        <div style={{ height: 2, margin: '10px auto', width: 160, background: 'linear-gradient(to right, transparent, #00e5ff, transparent)', borderRadius: 2 }} />
        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em' }}>
          {t.caseArchiveSubtitle}
        </div>
        <div className="td-case-wallet"><span>⚡ {profile?.energy || 0}</span><span>🪙 {(profile?.gold || 0).toLocaleString('en-US')}</span><span>💎 {(profile?.diamonds || 0).toLocaleString('en-US')}</span></div>
      </div>

      {/* Case cards */}
      {error && <div className="td-status-banner is-error" style={{ width: '100%', maxWidth: 860, margin: '-22px auto 18px' }}>{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl">
        {ALL_CASES.map((c, i) => {
          const diff = DIFFICULTY_CONFIG[c.difficulty] || DIFFICULTY_CONFIG.NORMAL;
          const isHover = hovered === c.case_id;
          const isSel   = selected === c.case_id;
          const title   = loc(c, 'title');
          const subtitle = loc(c, 'subtitle');
          const setting = loc(c, 'setting');
          const energyCost = CASE_ENERGY_COST[c.difficulty] || 10;
          const firstClear = !profile?.solved_cases?.includes(c.case_id);
          const canStart = (profile?.energy || 0) >= energyCost;
          const isStarting = startingId !== null;

          return (
            <div
              className={`td-ui-card td-case-card ${isSel ? 'is-selected' : ''} ${!canStart ? 'is-disabled' : ''}`}
              key={c.case_id}
              onMouseEnter={() => setHovered(c.case_id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => void handleStart(c)}
              style={{
                borderRadius: 20,
                border: `1.5px solid ${isHover || isSel ? diff.color : 'rgba(255,255,255,0.08)'}`,
                background: isHover
                  ? `radial-gradient(ellipse at 50% 0%, ${diff.color}15 0%, rgba(5,10,20,0.95) 70%)`
                  : 'rgba(8,16,30,0.9)',
                boxShadow: isHover
                  ? `0 0 40px ${diff.color}30, 0 8px 32px rgba(0,0,0,0.5)`
                  : '0 4px 20px rgba(0,0,0,0.4)',
                padding: '28px 24px',
                cursor: isStarting ? 'wait' : canStart ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
                transform: isHover ? 'translateY(-4px)' : isSel ? 'scale(0.97)' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isHover && (
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${diff.color}06 3px, ${diff.color}06 4px)`,
                  borderRadius: 20,
                }} />
              )}

              <div style={{ fontSize: '0.55rem', color: `${diff.color}60`, letterSpacing: '0.3em', marginBottom: 12 }}>
                CASE · {String(i + 1).padStart(2, '0')}
              </div>

              <div style={{
                fontSize: 48, textAlign: 'center', marginBottom: 16,
                filter: isHover ? `drop-shadow(0 0 16px ${diff.color})` : 'none',
                transition: 'filter 0.3s',
              }}>
                {CASE_COVER_ICONS[i]}
              </div>

              <div style={{
                fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
                fontWeight: 900,
                color: isHover ? diff.color : '#fff',
                textShadow: isHover ? `0 0 16px ${diff.color}` : 'none',
                letterSpacing: '0.08em',
                marginBottom: 4,
                transition: 'color 0.3s',
              }}>
                {title}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em', marginBottom: 12 }}>
                {subtitle}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div style={{
                  padding: '2px 10px', borderRadius: 6,
                  background: diff.bg,
                  border: `1px solid ${diff.color}50`,
                  color: diff.color,
                  fontSize: '0.55rem', fontWeight: 900,
                  letterSpacing: '0.15em',
                }}>
                  {diff.label}
                </div>
                <div>
                  {Array.from({ length: diff.stars }).map((_, s) => (
                    <span key={s} style={{ color: diff.color, fontSize: '0.7rem' }}>★</span>
                  ))}
                  {Array.from({ length: 3 - diff.stars }).map((_, s) => (
                    <span key={s} style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.7rem' }}>★</span>
                  ))}
                </div>
              </div>

              <div style={{
                fontSize: '0.62rem', color: 'rgba(200,220,255,0.5)',
                lineHeight: 1.6, marginBottom: 16,
                fontFamily: 'monospace',
              }}>
                {setting}
              </div>

              <div className="flex gap-3 mb-5" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                <span>🔍 {c.clue_dictionary.length} {t.clueStat}</span>
                <span>👤 {c.npcs.length} {t.npcStat}</span>
                <span>🗺️ {Object.keys(c.scene.zones).length} {t.zoneStat}</span>
              </div>

              <div className="td-case-economy">
                <span><small>{lang === 'zh' ? '调查消耗' : 'COST'}</small><b style={{ color: canStart ? '#ffd34d' : '#ff6685' }}>⚡ {energyCost}</b></span>
                <span><small>{lang === 'zh' ? '评级金币' : 'RANK GOLD'}</small><b>🪙 {CASE_GOLD_REWARD.D}–{CASE_GOLD_REWARD.S}</b></span>
                <span><small>{lang === 'zh' ? '首通奖励' : 'FIRST CLEAR'}</small><b>{firstClear ? `💎 ${FIRST_CLEAR_DIAMONDS[c.difficulty] || 0}` : '✓'}</b></span>
              </div>

              <button
                className="td-ui-button td-case-start-button"
                disabled={!canStart || isStarting}
                style={{
                  width: '100%', padding: '10px 0',
                  borderRadius: 10,
                  background: isHover
                    ? `linear-gradient(90deg, ${diff.color}30, ${diff.color}15)`
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isHover ? diff.color : 'rgba(255,255,255,0.1)'}`,
                  color: isHover ? diff.color : 'rgba(255,255,255,0.35)',
                  fontSize: '0.65rem', fontWeight: 900,
                  letterSpacing: '0.2em', fontFamily: 'monospace',
                  cursor: isStarting ? 'wait' : canStart ? 'pointer' : 'not-allowed',
                  opacity: canStart && !isStarting ? 1 : .46,
                  transition: 'all 0.3s',
                  boxShadow: isHover ? `0 0 20px ${diff.color}30` : 'none',
                }}
              >
                {startingId === c.case_id
                  ? t.loadingCase
                  : canStart
                    ? t.startCase
                    : (lang === 'zh' ? '体力不足' : 'LOW ENERGY')}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 40, fontSize: '0.55rem', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.2em', textAlign: 'center' }}>
        {t.caseArchiveFooter}
      </div>
    </div>
  );
}
