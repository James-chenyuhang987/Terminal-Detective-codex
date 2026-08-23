import React, { useState } from 'react';
import { ALL_CASES } from '@/game/caseData';
import { useLang } from '@/lib/lang.jsx';

const DIFFICULTY_CONFIG = {
  NORMAL: { label: 'NORMAL', color: '#00ff88', bg: 'rgba(0,255,136,0.1)', stars: 1 },
  HARD:   { label: 'HARD',   color: '#ffaa00', bg: 'rgba(255,170,0,0.1)', stars: 2 },
  OMEGA:  { label: 'OMEGA',  color: '#ff3860', bg: 'rgba(255,56,96,0.12)', stars: 3 },
};

const CASE_COVER_ICONS = ['🏙️', '🔬', '🦋'];

export default function CaseSelect({ onSelect, onBack }) {
  const { lang, t } = useLang();
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);

  const handleStart = (caseData) => {
    setSelected(caseData.case_id);
    setTimeout(() => onSelect(caseData), 400);
  };

  // Get localised fields for a case
  const loc = (c, field) => (lang === 'en' && c.en && c.en[field] !== undefined) ? c.en[field] : c[field];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #0a1628 0%, #050a14 60%, #020408 100%)',
        fontFamily: "'Courier New', monospace",
        color: 'white',
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        className="absolute top-6 left-6 text-xs opacity-40 hover:opacity-80 transition-opacity"
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
      </div>

      {/* Case cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl">
        {ALL_CASES.map((c, i) => {
          const diff = DIFFICULTY_CONFIG[c.difficulty] || DIFFICULTY_CONFIG.NORMAL;
          const isHover = hovered === c.case_id;
          const isSel   = selected === c.case_id;
          const title   = loc(c, 'title');
          const subtitle = loc(c, 'subtitle');
          const setting = loc(c, 'setting');

          return (
            <div
              key={c.case_id}
              onMouseEnter={() => setHovered(c.case_id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleStart(c)}
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
                cursor: 'pointer',
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

              <button
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
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: isHover ? `0 0 20px ${diff.color}30` : 'none',
                }}
              >
                {isSel ? t.loadingCase : t.startCase}
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