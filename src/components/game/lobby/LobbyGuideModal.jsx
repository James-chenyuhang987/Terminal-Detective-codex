import React, { useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useModalFocusTrap } from './useModalFocusTrap';

export default function LobbyGuideModal({ targetCase, onClose, restoreRef }) {
  const { lang } = useLang();
  const dialogRef = useRef(null);
  useModalFocusTrap(true, dialogRef, onClose, restoreRef);

  return <div onClick={onClose} style={{
    position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center',
    padding: 20, background: 'rgba(0,4,12,.82)', backdropFilter: 'blur(8px)',
  }}>
    <div ref={dialogRef} className="td-lobby-guide td-scroll-region" onClick={event => event.stopPropagation()} role="dialog" aria-label={lang === 'zh' ? '探员大厅快速指南' : 'Agent hall quick guide'} aria-modal="true" tabIndex={-1} style={{
      width: 'min(560px, 94vw)', padding: 24, borderRadius: 16,
      border: '1px solid rgba(112, 159, 154,.45)', background: '#101e2a',
      boxShadow: '0 0 45px rgba(112, 159, 154,.18)', fontFamily: 'monospace',
    }}>
      <div style={{ color: '#a5c8c0', fontWeight: 900, fontSize: '1rem' }}>{lang === 'zh' ? '探员大厅快速指南' : 'AGENT HALL QUICK GUIDE'}</div>
      <ol style={{ color: 'rgba(235,249,255,.7)', fontSize: '.68rem', lineHeight: 1.9, paddingLeft: 20 }}>
        {(lang === 'zh' ? [
          '查看案件简报，再选择主探员并分配专长点数。',
          '调整每名探员的行动优先级，决定其执行倾向。',
          '在指挥方案台选择一项指挥学说和应急预案。',
          targetCase ? '保存方案后部署，将直接开始目标案件。' : '保存方案后部署，将进入案件簿选择目标。',
        ] : [
          'Review the briefing, then select a primary agent and allocate specialty points.',
          'Set each agent’s action priorities to define their execution style.',
          'Choose one command doctrine and one contingency plan.',
          targetCase ? 'Save and deploy to begin the target case directly.' : 'Save and deploy to choose a target in the case archive.',
        ]).map(item => <li key={item}>{item}</li>)}
      </ol>
      <button type="button" onClick={onClose} style={{
        width: '100%', padding: 10, borderRadius: 8, cursor: 'pointer',
        border: '1px solid #709f9a80', background: 'rgba(112, 159, 154,.12)', color: '#a5c8c0',
        fontFamily: 'monospace', fontWeight: 900,
      }}>{lang === 'zh' ? '明白了' : 'CONTINUE'}</button>
    </div>
  </div>;
}
