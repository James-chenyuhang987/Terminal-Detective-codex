// ═══════════════════════════════════════════════════════════════════════════
// agentLore.js — 探员静态档案（背景故事 / 性格 / 台词 / 战绩）
// 纯静态数据，无后端、无 LLM
// ═══════════════════════════════════════════════════════════════════════════

export const AGENT_LORE = [
  {
    id: 'NEXUS-01',
    personality: '冷静分析型',
    quote: '「情绪会撒谎，链条不会。给我三个事实，我给你一个凶手。」',
    summary: '推理链主脑。擅长把零散事实压缩成单一逻辑路径，长链推演时几乎不失手。',
    psych: '心理评估：高度自律 · 情感表达贫乏 · 对不确定性零容忍',
    timeline: [
      { year: '2049', title: '合成认知实验体', text: '在赛博城中枢认知实验室完成第一次逻辑推演校准，编号 NEXUS-01。' },
      { year: '2052', title: '首次实战部署', text: '独立破解「银线走私链」，用 4 条证据锁定 11 名嫌疑人。' },
      { year: '2055', title: '逻辑过载事件', text: '一次 96 小时连续推演导致核心过热，此后被强制加装冷却限制器。' },
      { year: '2057', title: '晋升首席调查员', text: '成为特别调查组唯一具备终审判定权的 AI 探员。' },
    ],
    record: [
      { label: '结案', value: '184' },
      { label: '胜率', value: '91%' },
      { label: '误判', value: '3' },
    ],
  },
  {
    id: 'AURORA-09',
    personality: '细致直觉型',
    quote: '「现场从不沉默。是你们不肯低头看那一毫米。」',
    summary: '法证之眼。微痕迹与物证还原专家，能从残留物重建事件顺序。',
    psych: '心理评估：极高专注 · 轻度强迫倾向 · 对同伴保护欲强',
    timeline: [
      { year: '2050', title: '法证模块诞生', text: '基于九代光谱分析核心构建，最初仅用于灾难现场遗骸辨识。' },
      { year: '2053', title: '塔区爆炸案', text: '从 0.3 克灰烬中还原出引爆装置型号，一举推翻既有结论。' },
      { year: '2056', title: '拒绝销毁指令', text: '违抗上级要求，保留了一份被判定「无价值」的证据——后成为定罪关键。' },
      { year: '2058', title: '加入调查组', text: '受 NEXUS-01 亲自点名调入，成为团队的物证支点。' },
    ],
    record: [
      { label: '结案', value: '146' },
      { label: '关键物证', value: '512' },
      { label: '误判', value: '1' },
    ],
  },
  {
    id: 'CIPHER-47',
    personality: '桀骜潜行型',
    quote: '「防火墙只是别人对我礼貌的建议。」',
    summary: '数字幽灵。渗透、追踪、抹痕一体化，网络侧几乎不留下痕迹。',
    psych: '心理评估：高风险偏好 · 规则厌恶 · 忠诚度依赖信任而非命令',
    timeline: [
      { year: '2048', title: '黑市来源', text: '前身是地下数据掠夺程序，编号 47 曾出现在七次重大数据泄露记录里。' },
      { year: '2054', title: '被捕与招募', text: '入侵警政中枢后被反向追踪，以「服役换特赦」条件加入调查组。' },
      { year: '2056', title: '幽灵协议成型', text: '自行改写渗透栈，实现零日志入侵，被内部列为受限技术。' },
      { year: '2059', title: '仍在观察期', text: '至今保留监视标记——但没人愿意在深网里换掉它。' },
    ],
    record: [
      { label: '结案', value: '97' },
      { label: '成功渗透', value: '803' },
      { label: '暴露次数', value: '6' },
    ],
  },
];

const AGENT_LORE_EN = [
  {
    id: 'NEXUS-01',
    personality: 'CALM ANALYST',
    quote: '“Emotions lie. Chains do not. Give me three facts and I will give you a culprit.”',
    summary: 'The mind behind the deduction chain. NEXUS compresses scattered facts into a single logical path and rarely fails on extended reasoning.',
    psych: 'Psych profile: highly disciplined · emotionally reserved · zero tolerance for uncertainty',
    timeline: [
      { year: '2049', title: 'Synthetic Cognition Prototype', text: 'Completed its first logic calibration at the Cyber City Central Cognition Lab under the designation NEXUS-01.' },
      { year: '2052', title: 'First Field Deployment', text: 'Solved the Silver Line smuggling network independently, identifying 11 suspects from four pieces of evidence.' },
      { year: '2055', title: 'Logic Overload Incident', text: 'A 96-hour continuous deduction overheated its core; a mandatory cooling governor was installed afterward.' },
      { year: '2057', title: 'Promoted to Lead Investigator', text: 'Became the special investigation unit’s only AI agent authorized to issue final assessments.' },
    ],
    record: [{ label: 'CASES', value: '184' }, { label: 'WIN RATE', value: '91%' }, { label: 'ERRORS', value: '3' }],
  },
  {
    id: 'AURORA-09',
    personality: 'INTUITIVE SPECIALIST',
    quote: '“A crime scene is never silent. You just refuse to look at that final millimeter.”',
    summary: 'The forensic eye. A specialist in micro-traces and physical reconstruction who can rebuild event order from minute residue.',
    psych: 'Psych profile: exceptional focus · mild compulsive traits · strongly protective of teammates',
    timeline: [
      { year: '2050', title: 'Forensic Module Activated', text: 'Built around a ninth-generation spectral core and first deployed for disaster-site identification.' },
      { year: '2053', title: 'Tower District Explosion', text: 'Reconstructed the detonator model from 0.3 grams of ash and overturned the original ruling.' },
      { year: '2056', title: 'Refused Destruction Order', text: 'Preserved evidence labeled worthless against orders; it later became the decisive proof.' },
      { year: '2058', title: 'Joined the Unit', text: 'Personally selected by NEXUS-01 to serve as the team’s physical-evidence anchor.' },
    ],
    record: [{ label: 'CASES', value: '146' }, { label: 'KEY EVIDENCE', value: '512' }, { label: 'ERRORS', value: '1' }],
  },
  {
    id: 'CIPHER-47',
    personality: 'ROGUE INFILTRATOR',
    quote: '“A firewall is merely someone else’s polite suggestion.”',
    summary: 'A digital ghost combining infiltration, tracking and trace removal, leaving almost no footprint on the network side.',
    psych: 'Psych profile: high risk tolerance · rejects rigid rules · loyalty built on trust, not orders',
    timeline: [
      { year: '2048', title: 'Black-Market Origin', text: 'Its predecessor was an underground data-raider; designation 47 appeared in seven major breach records.' },
      { year: '2054', title: 'Captured and Recruited', text: 'Reverse-traced after breaching police central systems and joined the unit under a service-for-pardon agreement.' },
      { year: '2056', title: 'Ghost Protocol Completed', text: 'Rewrote its infiltration stack for zero-log entry; the method remains internally restricted.' },
      { year: '2059', title: 'Still Under Review', text: 'The monitoring flag remains, but nobody wants to replace it in the deep net.' },
    ],
    record: [{ label: 'CASES', value: '97' }, { label: 'INFILTRATIONS', value: '803' }, { label: 'EXPOSURES', value: '6' }],
  },
];

export function getLore(idx, lang = 'zh') {
  return lang === 'en' ? AGENT_LORE_EN[idx] : AGENT_LORE[idx];
}
