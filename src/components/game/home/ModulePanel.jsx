import React from 'react';
import { ACHIEVEMENT_TOTAL } from '@/game/playerProfile';

const CONTENT = {
  warehouse: { title: '🎒 物品仓库', body: '道具与材料。你尚未获得任何调查道具 —— 完成案件与每日签到可获得取证工具箱、加密解码器等物品。' },
  graph: { title: '🕸 线索图谱', body: '跨案件线索关联分析。进入案件后建立的推理连线会汇总到此处，形成你的全局真相拼图。' },
  tech: { title: '⚙️ 科技研发', body: '解锁科技能力：神经推理加速、EMP 溯源、声纹比对。需要消耗钻石与研究点数。' },
  comms: { title: '✉️ 探员通讯', body: '好友与聊天。目前没有新的通讯请求。' },
  settings: { title: '🔧 设置', body: '语言、音效与显示设置可在探员大厅与调查终端内调整。' },
  achievements: { title: '🏅 成就徽章', body: null },
  intel: { title: '📰 今日情报', body: '【城市迷案追踪】新增案件《消失的证物》—— 数据中心第 47 层的证物柜出现异常访问记录，建议优先调查。' },
  checkin: { title: '📅 每日签到', body: '点击资源条上的 ＋ 即可领取今日签到奖励：体力 +30、金币、钻石 +20。连续签到奖励递增。' },
  events: { title: '🎁 活动中心', body: '当前无进行中的限时活动。' },
  tutorial: { title: '📖 新手任务', body: '1. 输入你的侦探代号  2. 进入全息探员大厅配置探员  3. 选择案件并完成首次推理连线。' },
  goals: { title: '🎯 七日目标', body: '七日内完成 3 起案件即可获得稀有徽章「初代档案管理员」。' },
};

export default function ModulePanel({ moduleKey, profile, onClose }) {
  const c = CONTENT[moduleKey];
  if (!c) return null;
  const unlocked = (profile.achievements || []).length;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 20, fontFamily: 'monospace',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 460, border: '1px solid rgba(0,229,255,0.4)', borderRadius: 16,
        background: 'linear-gradient(160deg, rgba(8,20,34,0.97), rgba(0,0,0,0.95))', padding: '22px 24px',
        boxShadow: '0 0 60px rgba(0,229,255,0.2)',
      }}>
        <div style={{ color: '#00e5ff', fontWeight: 900, letterSpacing: '0.14em', fontSize: '0.95rem', marginBottom: 14 }}>{c.title}</div>
        {moduleKey === 'achievements' ? (
          <>
            <div style={{ color: '#e8c98a', fontSize: '1.4rem', fontWeight: 900, marginBottom: 12 }}>
              {unlocked}<span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}> / {ACHIEVEMENT_TOTAL}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(42px,1fr))', gap: 8 }}>
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} style={{
                  aspectRatio: '1', borderRadius: '50%', display: 'grid', placeItems: 'center',
                  border: `1px solid ${i < unlocked ? '#c5a059' : 'rgba(255,255,255,0.12)'}`,
                  background: i < unlocked ? 'rgba(197,160,89,0.18)' : 'rgba(255,255,255,0.03)',
                  fontSize: 14, opacity: i < unlocked ? 1 : 0.3,
                }}>{i < unlocked ? '🏅' : '🔒'}</div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', lineHeight: 1.9 }}>{c.body}</div>
        )}
        <button onClick={onClose} style={{
          marginTop: 20, width: '100%', padding: '10px', cursor: 'pointer', borderRadius: 9,
          border: '1px solid rgba(0,229,255,0.5)', background: 'rgba(0,229,255,0.1)',
          color: '#00e5ff', fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: '0.2em',
        }}>关闭</button>
      </div>
    </div>
  );
}