// ═══════════════════════════════════════════════════════════════════════════
// crisisEvents.js — 危机事件引擎
// 每 4-6 轮随机触发：证据危机 / NPC 翻供 / 追踪者逼近
// 惩罚系数受组队专长匹配度影响（互补团队 -20%，幽灵协议再 -20%）
// ═══════════════════════════════════════════════════════════════════════════

// 下一次危机距今多少轮（4-6）
export function nextCrisisIn() {
  return 4 + Math.floor(Math.random() * 3);
}

function penaltyScale(agentStrategy) {
  let scale = 1;
  if ((agentStrategy?.specialty_match || 0) >= 0.66) scale *= 0.8;
  if ((agentStrategy?.synergy_skills || []).includes('ghost_protocol')) scale *= 0.8;
  return scale;
}

// 抽取一个危机事件
export function rollCrisis(gameState, caseData, lang = 'zh') {
  const zh = lang === 'zh';
  const types = [];
  if ((gameState.unlocked_clues || []).length > 0) types.push('evidence');
  if ((caseData.npcs || []).length > 0) types.push('npc_recant');
  types.push('tracker');

  const type = types[Math.floor(Math.random() * types.length)];

  if (type === 'evidence') {
    const clueId = gameState.unlocked_clues[Math.floor(Math.random() * gameState.unlocked_clues.length)];
    const clue = caseData.clue_dictionary?.find(c => c.clue_id === clueId);
    return {
      type: 'evidence',
      icon: '🔥',
      title: zh ? '证据危机' : 'EVIDENCE PURGE',
      desc: zh
        ? `检测到未知进程正在销毁证据：${clue?.visual_icon || '🔍'} 「${clue?.keyword || clueId}」。若不及时保全，该线索将永久丢失！`
        : `An unknown process is purging evidence: ${clue?.visual_icon || '🔍'} “${clue?.keyword || clueId}”. Secure it now or lose it permanently.`,
      payload: { clue_id: clueId, keyword: clue?.keyword || clueId },
      choices: [
        { id: 'secure_now', label: zh ? '紧急保全' : 'SECURE NOW', risk: zh ? '稳健' : 'STEADY', riskColor: '#00ff88', desc: zh ? '立即消耗 3 AP 锁定证据，确保安全' : 'Spend 3 AP immediately to secure the evidence' },
        { id: 'defer', label: zh ? '稍后处理' : 'DEFER', risk: zh ? '高风险' : 'HIGH RISK', riskColor: '#ff3860', desc: zh ? '2 轮内的调查行动有 50% 概率顺带保全，超时则永久丢失' : 'Actions have a 50% chance to secure it within 2 turns; then it is lost' },
      ],
    };
  }

  if (type === 'npc_recant') {
    const npc = caseData.npcs[Math.floor(Math.random() * caseData.npcs.length)];
    return {
      type: 'npc_recant',
      icon: '🎭',
      title: zh ? 'NPC 翻供' : 'TESTIMONY RETRACTED',
      desc: zh
        ? `${npc.avatar || '👤'} ${npc.name}（${npc.role}）突然撤回了之前的全部陈述，声称“记忆被篡改”。原有证词失效，需要重新审讯。`
        : `${npc.avatar || '👤'} ${npc.name} has withdrawn all prior statements, claiming their memory was altered. The testimony is invalid and requires a new interrogation.`,
      payload: { npc_id: npc.npc_id, npc_name: npc.name },
      choices: [
        { id: 'reinterrogate', label: zh ? '立即重新审讯' : 'REINTERROGATE', risk: zh ? '稳健' : 'STEADY', riskColor: '#00ff88', desc: zh ? '打开审讯面板，直接对峙（混乱 +5）' : 'Open interrogation and confront the witness (Confusion +5)' },
        { id: 'ignore', label: zh ? '暂时搁置' : 'SET ASIDE', risk: zh ? '激进' : 'AGGRESSIVE', riskColor: '#ffaa00', desc: zh ? '继续调查，但混乱值 +10，声望 -5' : 'Continue investigating (Confusion +10, Reputation -5)' },
      ],
    };
  }

  return {
    type: 'tracker',
    icon: '👁️',
    title: zh ? '追踪者逼近' : 'HOSTILE TRACE',
    desc: zh ? '一个敌对 AI 进程正在追踪你的调查信号，逻辑矩阵开始受到干扰（混乱值 +15）。必须立即做出应对！' : 'A hostile AI process is tracing your investigation signal and disrupting the logic matrix (Confusion +15). Respond immediately.',
    payload: {},
    choices: [
      { id: 'evade', label: zh ? '甩脱' : 'EVADE', risk: zh ? '稳健' : 'STEADY', riskColor: '#00ff88', desc: zh ? '消耗 2 AP 切换信道，抵消全部混乱冲击' : 'Spend 2 AP to switch channels and negate all confusion' },
      { id: 'confront', label: zh ? '对峙' : 'CONFRONT', risk: zh ? '高风险' : 'HIGH RISK', riskColor: '#ff3860', desc: zh ? '50% 概率反制成功（混乱 -10），失败则声望 -10' : '50% chance to counter (Confusion -10); failure costs 10 reputation' },
      { id: 'hide', label: zh ? '隐匿' : 'HIDE', risk: zh ? '激进' : 'AGGRESSIVE', riskColor: '#ffaa00', desc: zh ? '静默潜行：只承受一半混乱冲击，无 AP 消耗' : 'Go silent and take half the confusion impact without AP cost' },
    ],
  };
}

// 结算玩家应对：返回 { changes, resultText }
// changes: { confusion_delta, ap_delta, reputation_delta, lose_clue, defer_evidence, reopen_npc }
export function applyCrisisChoice(event, choiceId, gameState, agentStrategy, lang = 'zh') {
  const zh = lang === 'zh';
  const scale = penaltyScale(agentStrategy);
  const p = (n) => Math.round(n * scale);

  if (event.type === 'evidence') {
    if (choiceId === 'secure_now') {
      return {
        changes: { ap_delta: -3 },
        resultText: zh ? `✅ 证据「${event.payload.keyword}」已紧急加密封存，威胁解除。（AP -3）` : `✅ Evidence “${event.payload.keyword}” encrypted and secured. Threat cleared. (AP -3)`,
      };
    }
    return {
      changes: { defer_evidence: { clue_id: event.payload.clue_id, keyword: event.payload.keyword, deadline: gameState.turn_count + 2 } },
      resultText: zh ? `⏳ 你选择了冒险：「${event.payload.keyword}」将在 2 轮后被销毁，期间每次行动有 50% 概率顺带保全。` : `⏳ Risk accepted: “${event.payload.keyword}” will be destroyed in 2 turns; each action has a 50% chance to secure it.`,
    };
  }

  if (event.type === 'npc_recant') {
    if (choiceId === 'reinterrogate') {
      return {
        changes: { confusion_delta: p(5), reopen_npc: event.payload.npc_id },
        resultText: zh ? `🎤 你决定立即与 ${event.payload.npc_name} 对峙，重新审讯已开启。（混乱 +${p(5)}）` : `🎤 You confront ${event.payload.npc_name}; reinterrogation opened. (Confusion +${p(5)})`,
      };
    }
    return {
      changes: { confusion_delta: p(10), reputation_delta: -5 },
      resultText: zh ? `😤 你搁置了翻供事件，调查可信度受损。（混乱 +${p(10)}，声望 -5）` : `😤 The retraction was set aside, damaging investigation credibility. (Confusion +${p(10)}, Reputation -5)`,
    };
  }

  // tracker
  if (choiceId === 'evade') {
    return {
      changes: { ap_delta: -2 },
      resultText: zh ? '🛰️ 信道已切换，追踪者失去目标。混乱冲击被完全抵消。（AP -2）' : '🛰️ Channel switched. The tracker lost your signal and the confusion impact was negated. (AP -2)',
    };
  }
  if (choiceId === 'confront') {
    const win = Math.random() < 0.5;
    return win
      ? { changes: { confusion_delta: -10 }, resultText: zh ? '⚔️ 反制成功！你入侵了追踪者的进程并将其瓦解。（混乱 -10）' : '⚔️ Counter successful. You breached and dismantled the tracker process. (Confusion -10)' }
      : { changes: { confusion_delta: p(15), reputation_delta: -10 }, resultText: zh ? `💥 对峙失败，追踪者突破了防火墙。（混乱 +${p(15)}，声望 -10）` : `💥 Confrontation failed; the tracker breached the firewall. (Confusion +${p(15)}, Reputation -10)` };
  }
  // hide
  return {
    changes: { confusion_delta: p(8) },
    resultText: zh ? `🌫️ 你潜入数据阴影中，只承受了一半冲击。（混乱 +${p(8)}）` : `🌫️ You vanished into the data shadows and absorbed half the impact. (Confusion +${p(8)})`,
  };
}
