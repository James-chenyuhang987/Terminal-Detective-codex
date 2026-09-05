import React from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/lang.jsx';

export default function RunPresentationControls({ active, theaterMode, onHome, onSwitch, onSettings }) {
  const { lang } = useLang();
  if (!active) return null;
  return createPortal(<nav className="td-run-presentation-controls" aria-label={lang === 'zh' ? '调查呈现控制（不消耗资源）' : 'Presentation controls (no resource cost)'}>
    <button type="button" onClick={onHome}>{lang === 'zh' ? '⌂ 主页 / 暂存' : '⌂ Home / suspend'}</button>
    <button type="button" onClick={onSwitch}>{theaterMode ? (lang === 'zh' ? '切换文字模式' : 'Switch to text') : (lang === 'zh' ? '切换 3D 模式' : 'Switch to 3D')}</button>
    <button type="button" onClick={onSettings}>{lang === 'zh' ? '设置' : 'Settings'}</button>
  </nav>, document.body);
}
