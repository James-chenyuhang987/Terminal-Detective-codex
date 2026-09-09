import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon';

export default function AIProcessingIndicator({ phase = 'THINK', stressLevel = 0 }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const color = phase === 'THINK' ? '#c5a66f' : '#709f9a';

  return (
    <div
      className="td-processing-indicator relative rounded-lg overflow-hidden border my-3"
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: '#101e2a',
        borderColor: `${color}55`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        minHeight: '80px',
      }}
    >
      <div className="relative z-10 flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border"
          style={{ color, borderColor: `${color}40`, background: `${color}0c` }}>
          <Icon name={phase === 'THINK' ? 'brain' : 'shield'} size={24} />
        </div>

        <div>
          <div
            className="text-xs font-bold tracking-widest mb-1"
            style={{ color }}
          >
            {phase === 'THINK'
              ? (zh ? '本地战术分析' : 'LOCAL TACTICAL ANALYSIS')
              : (zh ? '确定性规则校验' : 'DETERMINISTIC RULE VALIDATION')}
          </div>
          <div className="text-xs opacity-50" style={{ color, fontFamily: 'monospace' }}>
            {stressLevel > 50
              ? <><Icon name="warning" /> {zh ? `战术负载 ${stressLevel}%` : `TACTICAL LOAD ${stressLevel}%`}</>
              : (zh ? '正在校验公开案件数据…' : 'Validating public case data…')
            }
          </div>
        </div>

        {/* Stress bar */}
        {stressLevel > 0 && (
          <div className="ml-auto flex-shrink-0 w-24">
            <div className="text-xs opacity-50 mb-1" style={{ color }}>{zh ? '负载' : 'STRESS'}</div>
            <div className="h-1 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${stressLevel}%`,
                  backgroundColor: stressLevel > 70 ? '#c77c78' : stressLevel > 40 ? '#c19a63' : color,
                  boxShadow: 'none',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status rule */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ backgroundColor: color, opacity: 0.4 }}
      />
    </div>
  );
}
