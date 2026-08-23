import React, { useEffect, useState } from 'react';

export default function BSoD({ agentId, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
  }, []);

  const errorCode = '0x' + Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-300"
      style={{
        backgroundColor: '#0000aa',
        opacity: visible ? 1 : 0,
        fontFamily: '"Courier New", monospace',
      }}
    >
      <div className="text-white max-w-2xl w-full p-8">
        <div className="text-4xl font-bold mb-8">:(</div>
        <div className="text-xl mb-6">
          Your detective PC ran into a problem and needs to restart.
        </div>
        <div className="text-sm mb-8 leading-relaxed opacity-80">
          AGENT MODULE [{agentId}] ENCOUNTERED A FATAL LOGIC EXCEPTION.
          <br />
          Confusion threshold exceeded. Neural pathways corrupted.
          <br />
          We're collecting some error info, then we'll restart the module.
        </div>
        <div className="text-sm mb-2">100% complete</div>
        <div className="w-full bg-blue-800 h-2 mb-8">
          <div className="bg-white h-2 w-full animate-pulse" />
        </div>
        <div className="text-xs opacity-60 mb-2">For more information about this issue:</div>
        <div className="text-xs opacity-60 mb-6">
          STOP CODE: AGENT_LOGIC_OVERFLOW
          <br />
          FAILED MODULE: REACT_ENGINE.SYS — {errorCode}
        </div>
        <div className="text-sm opacity-60">
          What failed: {agentId}
        </div>
        <button
          onClick={onDismiss}
          className="mt-8 px-6 py-2 border border-white text-white text-sm hover:bg-white hover:text-blue-900 transition-colors"
        >
          REBOOT AGENT MODULE
        </button>
      </div>
    </div>
  );
}