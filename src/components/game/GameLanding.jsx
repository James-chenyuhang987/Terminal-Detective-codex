import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

const GOLD = '#e3b85b';

function MatrixRain({ color = GOLD }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ΑΒΓΔΨΩαβγδψω∑∞§#@!'.split('');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fontSize = 14;
    let drops = [];
    let frameId = 0;
    let lastFrame = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drops = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * -50);
    };

    const draw = () => {
      ctx.fillStyle = 'rgba(3, 5, 9, 0.18)';
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      ctx.fillStyle = `${color}38`;
      ctx.font = `${fontSize}px "Times New Roman", serif`;
      drops.forEach((y, index) => {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], index * fontSize, y * fontSize);
        if (y * fontSize > canvas.offsetHeight && Math.random() > 0.975) drops[index] = 0;
        drops[index] += 0.42;
      });
    };

    const animate = (timestamp) => {
      if (timestamp - lastFrame >= 66) {
        draw();
        lastFrame = timestamp;
      }
      frameId = requestAnimationFrame(animate);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);
    if (!reducedMotion) frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
    };
  }, [color]);

  return <canvas ref={canvasRef} className="td-landing-matrix" aria-hidden="true" />;
}

function Scanlines() {
  return <div className="td-landing-scanlines" aria-hidden="true" />;
}

function FeatureCard({ icon, title, desc, delay }) {
  return (
    <article className="td-ui-card td-feature-card td-landing-feature" style={{ animationDelay: `${delay}s` }}>
      <span className="td-landing-feature-corner" aria-hidden="true" />
      <div className="td-landing-feature-icon" aria-hidden="true">{icon}</div>
      <strong className="td-gold-flow-text">{title}</strong>
      <p>{desc}</p>
    </article>
  );
}

function TitleLogo({ t, lang }) {
  const copy = lang === 'zh'
    ? { eyebrow: '皇家侦探署 · 全息案件终端', motto: '真相藏在每一道微光之后' }
    : { eyebrow: 'ROYAL DETECTIVE BUREAU · HOLOGRAPHIC CASE TERMINAL', motto: 'Every glimmer conceals a fragment of truth' };

  return (
    <header className="td-landing-title">
      <div className="td-landing-eyebrow td-gold-flow-text">{copy.eyebrow}</div>
      <div className="td-landing-title-words" aria-label="Terminal Detective">
        <h1 className="td-gold-flow-text">TERMINAL</h1>
        <h1 className="td-gold-flow-text is-second">DETECTIVE</h1>
      </div>
      <p>{t.subtitle}</p>
      <div className="td-landing-motto"><span />{copy.motto}<span /></div>
    </header>
  );
}

function DetectiveFigure({ lang }) {
  const copy = lang === 'zh'
    ? { role: '首席现场侦探', state: '等待部署', registry: '探员编号 · TD-01' }
    : { role: 'LEAD FIELD DETECTIVE', state: 'AWAITING DEPLOYMENT', registry: 'AGENT REGISTRY · TD-01' };

  return (
    <aside className="td-detective-figure" aria-label={copy.role}>
      <div className="td-detective-orbit is-outer" aria-hidden="true" />
      <div className="td-detective-orbit is-inner" aria-hidden="true" />
      <svg viewBox="0 0 480 620" role="img" aria-label={copy.role}>
        <defs>
          <linearGradient id="detective-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff2b0" />
            <stop offset="0.42" stopColor="#d7a542" />
            <stop offset="1" stopColor="#6d4412" />
          </linearGradient>
          <linearGradient id="detective-coat" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#31230f" />
            <stop offset="0.5" stopColor="#090b0e" />
            <stop offset="1" stopColor="#1b1208" />
          </linearGradient>
          <radialGradient id="detective-aura">
            <stop offset="0" stopColor="#f5c967" stopOpacity=".34" />
            <stop offset=".55" stopColor="#a9741b" stopOpacity=".1" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <filter id="detective-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="detective-lines" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 7.5H8" stroke="#f0c96c" strokeOpacity=".08" />
          </pattern>
        </defs>

        <ellipse cx="245" cy="326" rx="222" ry="276" fill="url(#detective-aura)" />
        <path d="M58 522H421" stroke="#d8aa50" strokeOpacity=".22" />
        <path d="M104 550H379" stroke="#d8aa50" strokeOpacity=".1" />
        <g opacity=".36" fill="none" stroke="#dcb45c">
          <path d="M78 117V70h48M402 117V70h-48M78 472v48h48M402 472v48h-48" />
          <circle cx="240" cy="286" r="193" strokeDasharray="2 13" />
        </g>

        <g className="td-detective-silhouette">
          <path d="M194 186c6-47 86-52 100-4 9 33-7 75-30 91-13 9-33 7-45-4-25-22-31-56-25-83Z" fill="#090a0b" stroke="url(#detective-gold)" strokeWidth="3" />
          <path d="M147 173c19-11 49-15 81-16l25-47 34 45c33 2 59 7 76 17-26 17-65 25-109 25-46 0-84-8-107-24Z" fill="url(#detective-coat)" stroke="url(#detective-gold)" strokeWidth="4" />
          <path d="M191 155l18-55h91l18 57c-41 12-84 12-127-2Z" fill="#090a0c" stroke="#d7a64a" strokeWidth="3" />
          <path d="M214 126h88" stroke="#f1ce75" strokeWidth="7" strokeOpacity=".78" />
          <path d="M212 212c14 6 31 8 49 6M214 237c17-6 35-6 52 0" fill="none" stroke="#e9bc5b" strokeWidth="2" strokeOpacity=".42" />
          <path d="M166 305c23-29 51-42 82-42 38 0 67 15 91 45l47 205H98l68-208Z" fill="url(#detective-coat)" stroke="url(#detective-gold)" strokeWidth="4" />
          <path d="m191 286 58 102 56-103M249 388v129" fill="none" stroke="#c28c31" strokeWidth="3" strokeOpacity=".72" />
          <path d="m221 275 28 113 30-114-30-18-28 19Z" fill="#d3a344" fillOpacity=".16" stroke="#e8c46b" strokeWidth="2" />
          <path d="M148 322 90 489l50 17 58-129M337 323l53 167-46 18-58-132" fill="#11100e" stroke="#b87d25" strokeWidth="3" />
          <path d="M101 492c-18 4-28 15-29 30 21 9 45 7 66-8l2-8-39-14ZM381 492c20 3 31 13 34 28-20 12-46 10-69-5l-2-7 37-16Z" fill="#080909" stroke="#d6a546" strokeWidth="3" />
          <path d="M176 313 144 516M313 311l31 205" stroke="#f0cf7e" strokeOpacity=".16" strokeWidth="8" />
          <path d="M101 513h286l-21 48H120l-19-48Z" fill="url(#detective-lines)" stroke="#d3a045" strokeWidth="2" />
        </g>

        <g className="td-detective-lens" filter="url(#detective-glow)">
          <circle cx="335" cy="310" r="38" fill="#0a1012" fillOpacity=".68" stroke="#f3d47d" strokeWidth="4" />
          <circle cx="335" cy="310" r="25" fill="#b77b22" fillOpacity=".1" stroke="#dba846" strokeWidth="2" />
          <path d="m309 340-34 44" stroke="#ebc96f" strokeWidth="9" strokeLinecap="round" />
          <path d="m312 338-35 45" stroke="#fff1ad" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
      <div className="td-detective-identity">
        <small>{copy.registry}</small>
        <strong className="td-gold-flow-text">{copy.role}</strong>
        <span><i />{copy.state}</span>
      </div>
    </aside>
  );
}

function StatRow({ t }) {
  const stats = [
    { label: t.zones, value: '4', unit: 'ZONES' },
    { label: t.suspects, value: '3', unit: 'SUSPECTS' },
    { label: t.clues, value: '9', unit: 'CLUES' },
    { label: t.difficulty, value: 'Ω', unit: 'OMEGA' },
  ];

  return (
    <div className="td-landing-stats">
      {stats.map((stat) => (
        <div key={stat.unit}>
          <strong className="td-gold-flow-text">{stat.value}</strong>
          <small>{stat.unit}</small>
          <span>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

const PREVIEW_LINES_ZH = [
  '◈ 回合 1 — 观察阶段',
  '> 现场：47层数据中心，神经接口留有 EMP 灼痕。',
  '◈ 推理链 — 解析电磁脉冲残留...',
  '▶ 已下达行动：[区域搜索]',
  '◆ 新证据：染血收据 · 时间戳 23:05',
];
const PREVIEW_LINES_EN = [
  '◈ TURN 1 — OBSERVATION PHASE',
  '> SCENE: 47F Data Center. Neural port shows EMP burns.',
  '◈ REASONING — Parsing electromagnetic residue...',
  '▶ ACTION ISSUED: [SEARCH AREA]',
  '◆ NEW EVIDENCE: Bloody receipt · 23:05',
];

function TerminalPreview({ lang }) {
  const lines = lang === 'zh' ? PREVIEW_LINES_ZH : PREVIEW_LINES_EN;
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setVisibleLines(lines.length);
      return undefined;
    }

    setVisibleLines(0);
    let index = 0;
    let timer;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      index += 1;
      setVisibleLines(index);
      timer = setTimeout(() => {
        if (index < lines.length) tick();
        else {
          index = 0;
          setVisibleLines(0);
          timer = setTimeout(tick, 650);
        }
      }, index < lines.length ? 620 : 1700);
    };
    timer = setTimeout(tick, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lang, lines.length]);

  return (
    <div className="td-terminal-preview td-landing-terminal">
      <div><span /> CASE TERMINAL · LIVE</div>
      {lines.slice(0, visibleLines).map((line) => <p key={line}>{line}</p>)}
      <i aria-hidden="true">▊</i>
    </div>
  );
}

function StartButton({ onClick, t, lang }) {
  const copy = lang === 'zh'
    ? { label: '开启案件调查', action: '进入调查终端', hint: '确认身份 · 连接全息现场 · 部署探员' }
    : { label: 'OPEN CASE INVESTIGATION', action: 'ENTER CASE TERMINAL', hint: 'VERIFY IDENTITY · LINK SCENE · DEPLOY AGENTS' };

  return (
    <div className="td-landing-start-wrap">
      <div className="td-landing-case-seal" aria-hidden="true"><span>TD</span><small>Ω</small></div>
      <small>{copy.label}</small>
      <h2 className="td-gold-flow-text">{t.startBtn}</h2>
      <p>{t.startHint}</p>
      <button className="td-landing-start" onClick={onClick}>
        <span aria-hidden="true">◆</span>
        <strong>{copy.action}</strong>
        <small>{copy.hint}</small>
      </button>
    </div>
  );
}

function LangToggle() {
  const { lang, t, setLang } = useLang();
  return (
    <button className="td-landing-lang" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
      {t.langBtn}
    </button>
  );
}

function CaseLaunchPanel({ lang, t, onStart }) {
  const copy = lang === 'zh'
    ? { dossier: '最高机密案件档案', state: '案件通道已加密', caseName: '霓虹血迹', danger: 'Ω 级高危案件' }
    : { dossier: 'TOP SECRET CASE DOSSIER', state: 'CASE CHANNEL ENCRYPTED', caseName: 'NEON BLOOD', danger: 'OMEGA-CLASS THREAT' };

  return (
    <section className="td-landing-case-panel">
      <header>
        <div>
          <small>{copy.dossier}</small>
          <strong className="td-gold-flow-text">{copy.caseName}</strong>
        </div>
        <span><i />{copy.state}</span>
      </header>
      <div className="td-landing-case-meta">
        <span>{t.caseBadge}</span>
        <b>{copy.danger}</b>
      </div>
      <StatRow t={t} />
      <div className="td-landing-case-action">
        <TerminalPreview lang={lang} />
        <StartButton lang={lang} onClick={onStart} t={t} />
      </div>
    </section>
  );
}

export default function GameLanding({ onStart }) {
  const { lang, t } = useLang();

  return (
    <div className="td-page-shell td-landing">
      <MatrixRain />
      <Scanlines />
      <div className="td-landing-ambient" aria-hidden="true" />
      <div className="td-landing-frame" aria-hidden="true" />

      <div className="td-landing-topbar">
        <div className="td-gold-flow-text">{t.systemVersion}</div>
        <div className="td-landing-statuses">
          {[t.online, t.secure, t.ready].map((status, index) => (
            <span key={status} className={index === 0 ? 'is-online' : ''}>{index === 0 ? '●' : index === 1 ? '◆' : '⚡'} {status}</span>
          ))}
          <LangToggle />
        </div>
      </div>

      <main className="td-landing-main">
        <section className="td-landing-hero">
          <div className="td-landing-copy">
            <TitleLogo lang={lang} t={t} />
            <CaseLaunchPanel lang={lang} onStart={onStart} t={t} />
          </div>
          <DetectiveFigure lang={lang} />
        </section>

        <section className="td-landing-features">
          {t.features.map((feature, index) => (
            <FeatureCard key={feature.title} {...feature} delay={0.15 + index * 0.08} />
          ))}
        </section>
      </main>

      <footer className="td-landing-footer">{t.bottomBar}</footer>
    </div>
  );
}
