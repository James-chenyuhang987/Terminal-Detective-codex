import React, { useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useModalFocusTrap } from './useModalFocusTrap';

export default function LobbyGuideModal({ targetCase, onClose, restoreRef = null }) {
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
          '查看出勤准备：能力达到 24 点可提供专业观察，达到 30 点可获得每案首检 1 AP 优惠。',
          '比较预设后应用，或逐人分配专长；应用可撤回。查看档案不会改变主探员，请单独指定。',
          '新版现场行动由你选择对象、方法和执行探员；行动偏好仅用于旧版自动调查与战术试演。',
          '在指挥方案台选择一项指挥学说和应急预案。',
          targetCase ? '保存方案后部署，将直接开始目标案件。' : '保存方案后部署，将进入案件簿选择目标。',
        ] : [
          'Review readiness: an ability of 24 enables professional observations; 30 enables a first-check 1 AP benefit per case.',
          'Preview and apply a preset, or allocate points individually. You can undo presets. Assign your primary agent explicitly.',
          'In manual investigations, choose each target, method and executor. Action preferences apply to legacy automatic investigation and rehearsals.',
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
