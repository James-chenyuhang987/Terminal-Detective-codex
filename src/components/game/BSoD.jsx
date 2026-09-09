import React from 'react';
import Icon from '@/components/ui/Icon';
import { useLang } from '@/lib/lang.jsx';

export default function BSoD({ agentId, onDismiss }) {
  const { lang } = useLang();
  const zh = lang === 'zh';

  const errorCode = '0x' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-300"
      style={{
        backgroundColor: '#08121c',
        color: '#e6dfcf',
        borderTop: '4px solid #c77c78',
        overflowY: 'auto',
        fontFamily: '"Courier New", monospace',
      }}
    >
      <div className="text-white max-w-2xl w-full p-8">
        <div className="text-4xl font-bold mb-8" style={{ color: '#c77c78' }}><Icon name="warning" /></div>
        <h1 className="text-xl mb-6">
          {zh ? '侦探终端遇到逻辑异常，需要重启探员模块。' : 'Your detective PC ran into a problem and needs to restart.'}
        </h1>
        <div className="text-sm mb-8 leading-relaxed opacity-80">
          {zh ? `探员模块 [${agentId}] 遇到严重逻辑异常。` : `AGENT MODULE [${agentId}] ENCOUNTERED A FATAL LOGIC EXCEPTION.`}
          <br />
          {zh ? '混乱超过阈值，神经通路已受损。' : 'Confusion threshold exceeded. Neural pathways corrupted.'}
          <br />
          {zh ? '错误信息已收集，可以重启模块。' : "We're collecting some error info, then we'll restart the module."}
        </div>
        <div className="text-sm mb-2">{zh ? '诊断完成 100%' : '100% complete'}</div>
        <div className="w-full h-2 mb-8" style={{ background: '#172936' }}>
          <div className="h-2 w-full" style={{ background: '#c5a66f' }} />
        </div>
        <div className="text-xs opacity-60 mb-2">{zh ? '异常详情：' : 'For more information about this issue:'}</div>
        <div className="text-xs opacity-60 mb-6">
          STOP CODE: AGENT_LOGIC_OVERFLOW
          <br />
          FAILED MODULE: REACT_ENGINE.SYS — {errorCode}
        </div>
        <div className="text-sm opacity-60">
          {zh ? '故障模块：' : 'What failed:'} {agentId}
        </div>
        <button
          onClick={onDismiss}
          className="td-ui-button td-button-primary mt-8 px-6 py-3 border text-sm"
        >
          {zh ? '重启探员模块' : 'REBOOT AGENT MODULE'}
        </button>
      </div>
    </div>
  );
}
