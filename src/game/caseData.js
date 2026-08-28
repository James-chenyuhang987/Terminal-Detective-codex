// ═══════════════════════════════════════════════════════════════════════════

import { Case_Data_Lvl_04, Case_Data_Lvl_05 } from './caseDataExtra.js';

export { Case_Data_Lvl_04, Case_Data_Lvl_05 } from './caseDataExtra.js';
// data_config.js — Static Case Database & Enums
// The absolute source of truth for all case data. No logic, no state.
// ═══════════════════════════════════════════════════════════════════════════

export const ReAct_Enum = {
  IDLE: 'IDLE',
  OBSERVE: 'OBSERVE',
  THINK: 'THINK',
  ACT: 'ACT',
  REPORTING: 'REPORTING',
  CRASHED: 'CRASHED',
};

export const Legal_Actions_List = [
  'talk_to_npc',
  'search_area',
  'examine_clue',
  'check_alibi',
  'present_evidence',
  'interrogate_suspect',
  'access_database',
  'analyze_forensics',
  'tail_suspect',
  'bribe_informant',
  'hack_terminal',
  'check_cctv',
];

export const Phase_Color_Map = {
  IDLE:       { bg: '#0a0f1e', accent: '#00ffff', label: 'STANDBY' },
  OBSERVE:    { bg: '#0a192f', accent: '#00e5ff', label: 'OBSERVING' },
  THINK:      { bg: '#200b3a', accent: '#bf5fff', label: 'PROCESSING' },
  ACT:        { bg: '#4a0e0e', accent: '#ff3860', label: 'EXECUTING' },
  REPORTING:  { bg: '#0a2010', accent: '#00ff88', label: 'FILING REPORT' },
  CRASHED:    { bg: '#1a0000', accent: '#ff0000', label: 'SYSTEM FAILURE' },
};

// ─── Helper: get localised case data ─────────────────────────────────────────
export function localizeCase(caseData, lang) {
  if (lang === 'en' && caseData.en) {
    return { ...caseData, ...caseData.en };
  }
  return caseData;
}

export const Case_Data_Lvl_01 = {
  case_id: "Lvl_01",
  initial_zone: "zone_datacenter",
  title: "霓虹血迹",
  subtitle: "Neon Blood",
  difficulty: "OMEGA",
  setting: "2157年，赛博朋克城市深处的顶层豪华公寓",
  scene: {
    description: "夜雨冲刷着霓虹灯的倒影。第47层豪华套房内，科技大亨 Victor Zhao 被发现死在他的数据中心。现场有明显的电磁脉冲痕迹，尸体旁散落着加密芯片的碎片。大楼的安保系统显示，案发前1小时内共有3人进入过此房间。",
    zones: {
      zone_datacenter: { dom_id: "area-datacenter", label: "数据中心 · 案发现场", entry_requirement: null },
      zone_lobby: { dom_id: "area-lobby", label: "大堂 · 监控中心", entry_requirement: "check_cctv" },
      zone_lab: { dom_id: "area-lab", label: "私人实验室", entry_requirement: "hack_terminal" },
      zone_balcony: { dom_id: "area-balcony", label: "天台阳台", entry_requirement: "search_area" },
    }
  },

  clue_dictionary: [
    { clue_id: "c_01", keyword: "染血收据", description: "在数据端子下方发现，时间戳 23:05。显示在附近的电子元器件店购买了高压电容器。", visual_icon: "🧾", weight: "CRITICAL" },
    { clue_id: "c_02", keyword: "EMP 烧痕", description: "Victor 脖颈处的神经接口有明显的高压电磁脉冲灼伤，与普通枪击或钝器伤完全不同。", visual_icon: "⚡", weight: "CRITICAL" },
    { clue_id: "c_03", keyword: "克隆门禁卡", description: "监控显示有人使用了与 Mei Lin 相同权限的门禁卡，但 Mei 声称她 23:00 后就离开了大楼。", visual_icon: "💳", weight: "HIGH" },
    { clue_id: "c_04", keyword: "NovaCorp 加密协议", description: "Victor 的加密硬盘中发现了与竞争对手 NovaCorp 签署的秘密交易协议——出售神经接口技术。", visual_icon: "📋", weight: "HIGH" },
    { clue_id: "c_05", keyword: "维修管道记录", description: "大楼维修管道的电子锁在 23:17 被激活，有人从内部进入，23:19 离开。这条管道直通案发楼层。", visual_icon: "🔧", weight: "MEDIUM" },
    { clue_id: "c_06", keyword: "Mei 的姐姐档案", description: "医院记录：Mei Lin 的姐姐是 NovaCorp 神经接口实验的受害者，目前处于植物人状态。", visual_icon: "🏥", weight: "HIGH" },
    { clue_id: "c_07", keyword: "抹除的监控", description: "案发时间段的所有摄像头数据均已损毁，符合 EMP 设备的干扰特征。", visual_icon: "📷", weight: "MEDIUM" },
    { clue_id: "c_08", keyword: "Kenji 不在场证明", description: "保安 Kenji 的刷卡记录证实他全程在地下停车场值班，不可能在案发时间出现在47层。", visual_icon: "🛡️", weight: "LOW" },
    { clue_id: "c_secret_99", keyword: "匿名黑客情报", description: "系统收到匿名加密信息：'Check maintenance shaft log at 23:17. She always hated him for what he did to her sister.'", visual_icon: "🔐", weight: "CRITICAL", unlock_turn: 8 }
  ],

  npcs: [
    { npc_id: "npc_01", name: "Mei Lin", role: "Victor 的私人助理", public_persona: "忠诚高效的助理，对 Victor 死亡表现悲痛", personality: "表面冷静克制，内心极度紧张，当证据出示时会崩溃", avatar: "👩‍💼", initial_statement: "我... 我不知道该说什么。Victor 死了，这太突然了。我昨晚 11 点前就离开了大楼，我发誓。" },
    { npc_id: "npc_02", name: "Kenji Mori", role: "大楼保安", public_persona: "尽职的保安，第一个发现尸体", personality: "紧张、多汗、说话磕磕绊绊", avatar: "🛡️", initial_statement: "是我发现他的... 23 点 31 分。我去送例行报告，门是开的，然后就看到他倒在地板上了。" },
    { npc_id: "npc_03", name: "Dr. Voss", role: "NovaCorp 研究员", public_persona: "来拜访的商业伙伴", personality: "傲慢、精于算计、擅长用法律术语回避问题", avatar: "🔬", initial_statement: "我与 Victor 博士有正当的商业往来。我的律师告诉我可以拒绝回答任何问题。" }
  ],

  conflict_dictionary: [{ clue_A: "c_08", clue_B: "c_03", reason: "Kenji's alibi is verified, so the cloned card must belong to someone else." }],
  hidden_clues: [{ clue_id: "c_secret_99", unlock_turn: 8, text: "系统警报：收到来自未知 IP 的加密数据包..." }],
  checkpoints: ["zone_datacenter", "zone_lobby"],
  zone_clue_map: { zone_datacenter: ['c_01','c_02','c_07'], zone_lobby: ['c_03','c_08'], zone_lab: ['c_04','c_05','c_secret_99'], zone_balcony: ['c_06'] },
  zone_layout: {
    zone_datacenter: { x: 50, y: 18, label: '数据中心', sublabel: '案发现场', icon: '💻', color: '#ff3860' },
    zone_lobby:      { x: 20, y: 60, label: '大堂',     sublabel: '监控中心', icon: '📹', color: '#00e5ff' },
    zone_lab:        { x: 80, y: 60, label: '私人实验室', sublabel: '黑客入口', icon: '🔬', color: '#a78bfa' },
    zone_balcony:    { x: 50, y: 85, label: '天台阳台', sublabel: '逃离路线', icon: '🌃', color: '#ffaa00' },
  },
  zone_connections: [['zone_datacenter','zone_lobby'],['zone_datacenter','zone_lab'],['zone_datacenter','zone_balcony'],['zone_lobby','zone_balcony'],['zone_lab','zone_balcony']],

  // ── English localisation ──────────────────────────────────────────────────
  en: {
    title: "Neon Blood",
    subtitle: "Case LVL-01",
    setting: "2157. A luxury penthouse in the depths of a cyberpunk metropolis.",
    scene: {
      description: "Night rain washes over neon reflections. On the 47th floor, tech mogul Victor Zhao is found dead in his personal data center. Electromagnetic pulse burns scar the room. Encrypted chip fragments litter the floor. Security logs show three individuals entered within the hour before death.",
      zones: {
        zone_datacenter: { dom_id: "area-datacenter", label: "Data Center · Crime Scene", entry_requirement: null },
        zone_lobby:      { dom_id: "area-lobby",      label: "Lobby · Surveillance Hub",  entry_requirement: "check_cctv" },
        zone_lab:        { dom_id: "area-lab",         label: "Private Laboratory",        entry_requirement: "hack_terminal" },
        zone_balcony:    { dom_id: "area-balcony",     label: "Roof Balcony",              entry_requirement: "search_area" },
      }
    },
    clue_dictionary: [
      { clue_id: "c_01", keyword: "Bloody Receipt", description: "Found beneath the data terminal, timestamp 23:05. Shows purchase of high-voltage capacitors from a nearby electronics store.", visual_icon: "🧾", weight: "CRITICAL" },
      { clue_id: "c_02", keyword: "EMP Burn Marks", description: "Victor's neural port at the neck shows high-voltage electromagnetic pulse burns — distinct from any blunt or ballistic wound.", visual_icon: "⚡", weight: "CRITICAL" },
      { clue_id: "c_03", keyword: "Cloned Access Card", description: "Surveillance shows someone used an access card with identical permissions to Mei Lin's — but Mei claims she left the building before 23:00.", visual_icon: "💳", weight: "HIGH" },
      { clue_id: "c_04", keyword: "NovaCorp Encrypted Contract", description: "Victor's encrypted drive contains a secret deal signed with rival NovaCorp — selling neural interface technology.", visual_icon: "📋", weight: "HIGH" },
      { clue_id: "c_05", keyword: "Maintenance Shaft Log", description: "The maintenance shaft's electronic lock was triggered at 23:17. Someone entered from inside and left at 23:19. The shaft connects directly to the crime floor.", visual_icon: "🔧", weight: "MEDIUM" },
      { clue_id: "c_06", keyword: "Mei's Sister File", description: "Hospital records: Mei Lin's sister is a victim of NovaCorp's neural interface experiments, currently in a vegetative state.", visual_icon: "🏥", weight: "HIGH" },
      { clue_id: "c_07", keyword: "Wiped Surveillance", description: "All camera footage during the incident window was destroyed — consistent with EMP interference signatures.", visual_icon: "📷", weight: "MEDIUM" },
      { clue_id: "c_08", keyword: "Kenji's Alibi", description: "Security guard Kenji's card log confirms he was on duty in the underground parking lot throughout — impossible to be on the 47th floor.", visual_icon: "🛡️", weight: "LOW" },
      { clue_id: "c_secret_99", keyword: "Anonymous Hacker Intel", description: "System received an anonymous encrypted message: 'Check maintenance shaft log at 23:17. She always hated him for what he did to her sister.'", visual_icon: "🔐", weight: "CRITICAL", unlock_turn: 8 }
    ],
    npcs: [
      { npc_id: "npc_01", name: "Mei Lin", role: "Victor's Personal Assistant", public_persona: "Loyal, efficient assistant — appears devastated by Victor's death", personality: "Outwardly composed, inwardly terrified — breaks down when confronted with evidence", avatar: "👩‍💼", initial_statement: "I... I don't know what to say. Victor is gone — it's so sudden. I left the building before 11 PM last night. I swear." },
      { npc_id: "npc_02", name: "Kenji Mori", role: "Building Security Guard", public_persona: "Diligent guard, first to discover the body", personality: "Nervous, sweating, stumbles over his words", avatar: "🛡️", initial_statement: "I found him... at 23:31. I was delivering a routine report, the door was open, and there he was on the floor." },
      { npc_id: "npc_03", name: "Dr. Voss", role: "NovaCorp Researcher", public_persona: "A visiting business partner", personality: "Arrogant, calculating — deflects with legal jargon", avatar: "🔬", initial_statement: "Dr. Victor and I had legitimate business dealings. My attorney advises me I may decline to answer any questions." }
    ],
    hidden_clues: [{ clue_id: "c_secret_99", unlock_turn: 8, text: "SYSTEM ALERT: Encrypted packet received from unknown IP..." }],
    zone_layout: {
      zone_datacenter: { x: 50, y: 18, label: 'Data Center',  sublabel: 'Crime Scene',   icon: '💻', color: '#ff3860' },
      zone_lobby:      { x: 20, y: 60, label: 'Lobby',        sublabel: 'Surveillance',   icon: '📹', color: '#00e5ff' },
      zone_lab:        { x: 80, y: 60, label: 'Private Lab',   sublabel: 'Hack Entry',    icon: '🔬', color: '#a78bfa' },
      zone_balcony:    { x: 50, y: 85, label: 'Roof Balcony', sublabel: 'Escape Route',   icon: '🌃', color: '#ffaa00' },
    },
  },
};

// ─── Case 2: 幽灵协议 ─────────────────────────────────────────────────────────
export const Case_Data_Lvl_02 = {
  case_id: "Lvl_02",
  initial_zone: "zone_lab_core",
  title: "幽灵协议",
  subtitle: "Ghost Protocol",
  difficulty: "HARD",
  setting: "2159年，顶级私人量子研究所。一名科学家在封闭实验室中神秘消失，留下燃烧的数据和一个反锁的房间。",
  scene: {
    description: "量子实验室的防火门从内部锁死。Dr. Aria Chen 的工牌还挂在门口，但人已不见踪影。只有被烧毁的量子芯片和一段被删除的实验日志。所有外部摄像头在同一时刻宕机。",
    zones: {
      zone_lab_core:   { dom_id: "area-lab-core",   label: "量子核心实验室", entry_requirement: null },
      zone_server:     { dom_id: "area-server",     label: "数据服务器间",   entry_requirement: "hack_terminal" },
      zone_lounge:     { dom_id: "area-lounge",     label: "员工休息区",     entry_requirement: null },
      zone_roof_exit:  { dom_id: "area-roof-exit",  label: "紧急逃生通道",   entry_requirement: "search_area" },
    }
  },
  clue_dictionary: [
    { clue_id: "d_01", keyword: "燃烧的芯片", description: "实验台上发现7枚被人为引燃的量子芯片，销毁模式太过规整——这不是事故，是刻意为之。", visual_icon: "🔥", weight: "HIGH" },
    { clue_id: "d_02", keyword: "Aria 的工牌", description: "工牌刷卡记录显示她在 02:18 进入核心实验室后再未刷出。但门从内部锁死，外部无法操作。", visual_icon: "🪪", weight: "CRITICAL" },
    { clue_id: "d_03", keyword: "相位偏移原型机", description: "实验室存货记录显示一台「QPS-α相位偏移设备」在案发前夜被 Aria 签出，现已归还但能量核已耗尽。", visual_icon: "🌀", weight: "CRITICAL" },
    { clue_id: "d_04", keyword: "Harlan 的服务器日志", description: "凌晨01:55，所长 Dr. Harlan 以管理员权限访问了量子密钥库，下载了完整的加密协议集。", visual_icon: "💾", weight: "HIGH" },
    { clue_id: "d_05", keyword: "隐藏备份驱动器", description: "休息区冰箱夹层中发现一个伪装成饮料罐的加密驱动器，内含 Aria 收集的所有 Harlan 罪证文件。", visual_icon: "🥤", weight: "CRITICAL" },
    { clue_id: "d_06", keyword: "屋顶重量传感器", description: "逃生通道屋顶出口的压力传感器记录在 02:34 检测到一个成人体重的压力，随后归零。", visual_icon: "📊", weight: "HIGH" },
    { clue_id: "d_07", keyword: "同步宕机记录", description: "所有外部摄像头在 02:17 同时断电，与实验室内部的供电控制器联动——这是内部人员操作。", visual_icon: "📷", weight: "MEDIUM" },
    { clue_id: "d_08", keyword: "Harlan 的通话记录", description: "Harlan 在案发当晚 23:40 拨打了一个加密号码，通话时长 18 分钟，接收方 IP 指向境外。", visual_icon: "📞", weight: "HIGH" },
    { clue_id: "d_secret_99", keyword: "Aria 的遗留信息", description: "服务器垃圾回收站中找到未彻底删除的文本：「If you find this, I'm safe. The real criminal is Harlan. Check the lounge fridge.」", visual_icon: "📨", weight: "CRITICAL", unlock_turn: 7 }
  ],
  npcs: [
    { npc_id: "npc_01", name: "Dr. Harlan", role: "研究所所长", public_persona: "忧心忡忡的领导，声称竭尽全力寻找 Aria", personality: "老练权威，极善于用官僚话语转移焦点，被追问时会引用「正当程序」", avatar: "🧑‍🔬", initial_statement: "这太不可思议了。Aria 是我最优秀的研究员。我们正在全力配合调查，请相信机构会给出答案。" },
    { npc_id: "npc_02", name: "Zoe Park", role: "实验室助理", public_persona: "震惊且悲伤，与 Aria 关系密切", personality: "情绪化，容易在压力下透露细节，但会立刻后悔并收回", avatar: "👩‍🔬", initial_statement: "Aria... 她最近很紧张。有时候我看她盯着 Harlan 的办公室方向，眼神很奇怪。" },
    { npc_id: "npc_03", name: "Otto", role: "夜班安保", public_persona: "平凡尽职的保安，当晚值班", personality: "憨厚，有轻微内疚，被追问时容易暴露矛盾", avatar: "💂", initial_statement: "那晚我... 我去了趟卫生间。也就十几分钟？回来什么都正常。" }
  ],
  conflict_dictionary: [{ clue_A: "d_02", clue_B: "d_06", reason: "If she never left via the main door (d_02), the roof exit sensor (d_06) confirms an alternate escape route." }],
  hidden_clues: [{ clue_id: "d_secret_99", unlock_turn: 7, text: "系统检测到：数据回收站中存在未完全覆写的残留数据..." }],
  checkpoints: ["zone_lab_core", "zone_server"],
  zone_clue_map: { zone_lab_core: ['d_01','d_02','d_03','d_07'], zone_server: ['d_04','d_secret_99'], zone_lounge: ['d_05'], zone_roof_exit: ['d_06'] },
  zone_layout: {
    zone_lab_core:  { x: 50, y: 18, label: '量子核心实验室', sublabel: '案发现场', icon: '⚛️',  color: '#ff3860' },
    zone_server:    { x: 80, y: 55, label: '服务器间',        sublabel: '数字入口', icon: '💾',  color: '#a78bfa' },
    zone_lounge:    { x: 20, y: 55, label: '员工休息区',      sublabel: '隐藏证据', icon: '☕',  color: '#00e5ff' },
    zone_roof_exit: { x: 50, y: 85, label: '紧急逃生通道',    sublabel: '逃跑路线', icon: '🚪', color: '#ffaa00' },
  },
  zone_connections: [['zone_lab_core','zone_server'],['zone_lab_core','zone_lounge'],['zone_lab_core','zone_roof_exit'],['zone_lounge','zone_roof_exit'],['zone_server','zone_roof_exit']],

  // ── English localisation ──────────────────────────────────────────────────
  en: {
    title: "Ghost Protocol",
    subtitle: "Case LVL-02",
    setting: "2159. A top-secret private quantum research institute. A scientist has vanished from a sealed lab, leaving burning data and a locked room.",
    scene: {
      description: "The quantum lab's fire door is locked from the inside. Dr. Aria Chen's badge still hangs by the entrance — but she is nowhere to be found. Only burned quantum chips and a deleted experiment log remain. All external cameras went offline at the same moment.",
      zones: {
        zone_lab_core:   { dom_id: "area-lab-core",   label: "Quantum Core Lab",    entry_requirement: null },
        zone_server:     { dom_id: "area-server",     label: "Data Server Room",    entry_requirement: "hack_terminal" },
        zone_lounge:     { dom_id: "area-lounge",     label: "Staff Lounge",        entry_requirement: null },
        zone_roof_exit:  { dom_id: "area-roof-exit",  label: "Emergency Exit Shaft", entry_requirement: "search_area" },
      }
    },
    clue_dictionary: [
      { clue_id: "d_01", keyword: "Burned Chips", description: "Seven quantum chips found deliberately ignited on the lab bench. The destruction pattern is too uniform — this was intentional.", visual_icon: "🔥", weight: "HIGH" },
      { clue_id: "d_02", keyword: "Aria's Badge", description: "Badge scan records show she entered the core lab at 02:18 and never scanned out. But the door was locked from inside — impossible to operate from outside.", visual_icon: "🪪", weight: "CRITICAL" },
      { clue_id: "d_03", keyword: "Phase-Shift Prototype", description: "Lab inventory shows a 'QPS-α Phase Shift Device' was signed out by Aria the night before the incident. Now returned — but the energy core is fully depleted.", visual_icon: "🌀", weight: "CRITICAL" },
      { clue_id: "d_04", keyword: "Harlan's Server Log", description: "At 01:55 AM, Director Dr. Harlan used admin credentials to access the quantum key vault and downloaded the full encryption protocol archive.", visual_icon: "💾", weight: "HIGH" },
      { clue_id: "d_05", keyword: "Hidden Backup Drive", description: "Found in a concealed compartment in the lounge fridge, disguised as a drink can. Contains all of Aria's compiled evidence against Harlan.", visual_icon: "🥤", weight: "CRITICAL" },
      { clue_id: "d_06", keyword: "Roof Weight Sensor", description: "The pressure sensor at the emergency shaft's roof exit recorded adult-weight pressure at 02:34, then immediately dropped to zero.", visual_icon: "📊", weight: "HIGH" },
      { clue_id: "d_07", keyword: "Synchronized Outage", description: "All external cameras powered off simultaneously at 02:17, linked to the lab's internal power controller — an inside job.", visual_icon: "📷", weight: "MEDIUM" },
      { clue_id: "d_08", keyword: "Harlan's Call Log", description: "Harlan made an encrypted call at 23:40 on the night of the incident — 18 minutes long. The receiving IP traces to an overseas location.", visual_icon: "📞", weight: "HIGH" },
      { clue_id: "d_secret_99", keyword: "Aria's Hidden Message", description: "Recovered from server trash (not fully overwritten): 'If you find this, I'm safe. The real criminal is Harlan. Check the lounge fridge.'", visual_icon: "📨", weight: "CRITICAL", unlock_turn: 7 }
    ],
    npcs: [
      { npc_id: "npc_01", name: "Dr. Harlan", role: "Institute Director", public_persona: "Concerned leader, claims to be doing everything to find Aria", personality: "Authoritative, skilled at deflecting with bureaucratic language — cites 'due process' when pressed", avatar: "🧑‍🔬", initial_statement: "This is unbelievable. Aria was my finest researcher. We are cooperating fully with the investigation. Trust that this institution will provide answers." },
      { npc_id: "npc_02", name: "Zoe Park", role: "Lab Assistant", public_persona: "Shocked and grieving, was close to Aria", personality: "Emotional, prone to revealing details under pressure but quickly regrets it and backtracks", avatar: "👩‍🔬", initial_statement: "Aria... she's been so tense lately. I'd sometimes catch her staring in the direction of Harlan's office, with this strange look in her eyes." },
      { npc_id: "npc_03", name: "Otto", role: "Night Security Guard", public_persona: "Ordinary, dutiful guard on duty that night", personality: "Simple, mildly guilty — contradictions surface under questioning", avatar: "💂", initial_statement: "That night I... I went to the bathroom. Maybe ten or fifteen minutes? Everything was normal when I got back." }
    ],
    hidden_clues: [{ clue_id: "d_secret_99", unlock_turn: 7, text: "SYSTEM DETECTED: Unfully-overwritten residual data in the server trash bin..." }],
    zone_layout: {
      zone_lab_core:  { x: 50, y: 18, label: 'Quantum Core Lab', sublabel: 'Crime Scene',  icon: '⚛️',  color: '#ff3860' },
      zone_server:    { x: 80, y: 55, label: 'Server Room',       sublabel: 'Digital Entry', icon: '💾',  color: '#a78bfa' },
      zone_lounge:    { x: 20, y: 55, label: 'Staff Lounge',      sublabel: 'Hidden Evidence', icon: '☕', color: '#00e5ff' },
      zone_roof_exit: { x: 50, y: 85, label: 'Emergency Exit',    sublabel: 'Escape Route',  icon: '🚪', color: '#ffaa00' },
    },
  },
};

// ─── Case 3: 红蝶陷阱 ─────────────────────────────────────────────────────────
export const Case_Data_Lvl_03 = {
  case_id: "Lvl_03",
  initial_zone: "zone_booth3",
  title: "红蝶陷阱",
  subtitle: "Red Butterfly",
  difficulty: "NORMAL",
  setting: "2155年，地下区第九街区的非法神经娱乐俱乐部「蝶巢」。一名常客在私人神经沉浸舱中死亡，死因疑似神经过载。",
  scene: {
    description: "「蝶巢」的神经沉浸舱区灯光昏暗，酒精与机油的气味混杂。受害者 Riku Tanaka 被发现时仍坐在3号舱，脑波输出设备显示神经信号过载——但这款设备有安全锁。有人绕过了它。",
    zones: {
      zone_booth3:  { dom_id: "area-booth3",  label: "3号神经沉浸舱", entry_requirement: null },
      zone_bar:     { dom_id: "area-bar",     label: "吧台·调酒区",   entry_requirement: null },
      zone_backroom:{ dom_id: "area-backroom",label: "后台控制室",     entry_requirement: "hack_terminal" },
      zone_alley:   { dom_id: "area-alley",   label: "后巷·收货区",   entry_requirement: "tail_suspect" },
    }
  },
  clue_dictionary: [
    { clue_id: "e_01", keyword: "过载神经舱", description: "3号舱的神经信号过载痕迹显示峰值功率是标准上限的4.7倍，且安全锁被软件层面绕过，非硬件故障。", visual_icon: "🧠", weight: "CRITICAL" },
    { clue_id: "e_02", keyword: "Riku 的敲诈信息", description: "从 Riku 的神经接口缓存中提取到6条加密消息，内容是他向「S」索要每月5万信用点以保持沉默。", visual_icon: "💬", weight: "CRITICAL" },
    { clue_id: "e_03", keyword: "Sable 的访问日志", description: "后台控制室的门禁记录显示 Sable 在 01:20 进入，01:26 离开——与 Riku 死亡时间窗口完全吻合。", visual_icon: "🔑", weight: "CRITICAL" },
    { clue_id: "e_04", keyword: "擦除的平板", description: "控制室内发现一台被格式化的平板，数据恢复显示残留代码片段——是一个针对3号舱安全锁的自定义过载脚本。", visual_icon: "📱", weight: "HIGH" },
    { clue_id: "e_05", keyword: "Lena 的证词", description: "寄存处的 Lena 表示她看到 Sable「有点慌张地」绕过吧台走向后门，时间是 01:20 左右。", visual_icon: "👁️", weight: "HIGH" },
    { clue_id: "e_06", keyword: "改装神经芯片", description: "后巷收货区的一个隐藏箱子里发现12枚改装神经芯片，型号与 Sable 供应商账单不符——这是非法走私货。", visual_icon: "💿", weight: "HIGH" },
    { clue_id: "e_07", keyword: "吧台酒精分析", description: "Riku 杯中残留物显示他被灌入了大量神经抑制剂，这会降低他对过载信号的防御反应——配合过载效果致命。", visual_icon: "🍸", weight: "MEDIUM" },
    { clue_id: "e_08", keyword: "俱乐部老板 Ren 证词", description: "老板 Ren 声称案发时他在VIP包厢陪客户，有5名客人可作证，时间段完全吻合。他与本案无直接关联。", visual_icon: "🤵", weight: "LOW" },
    { clue_id: "e_secret_99", keyword: "Sable 的走私账本", description: "解密后巷箱子底部夹层：一本手写账本记录了 Sable 三年来的非法芯片交易，以及 Riku 的姓名旁标注「威胁清除」。", visual_icon: "📒", weight: "CRITICAL", unlock_turn: 6 }
  ],
  npcs: [
    { npc_id: "npc_01", name: "Sable", role: "首席调酒师", public_persona: "冷静专业，对 Riku 的死表示遗憾，声称自己一直在吧台忙碌", personality: "极度冷静，几乎没有情绪波动，但面对具体时间线追问时会有短暂停顿", avatar: "🦋", initial_statement: "Riku 是我们的老客户了。今晚生意很忙，我一直在吧台。这种事太不幸了。" },
    { npc_id: "npc_02", name: "Lena", role: "寄存处服务员", public_persona: "胆小善良，目击者，愿意配合调查", personality: "声音颤抖，容易被安慰后打开话匣子，需要一定压力才说全", avatar: "🌸", initial_statement: "我... 我不确定我看到了什么。你能保护我吗？这个地方的人都不好惹。" },
    { npc_id: "npc_03", name: "Ren", role: "俱乐部老板", public_persona: "精明的生意人，急于撇清俱乐部与此事的关系", personality: "防御性强，用金钱和律师威胁，但在无法辩解时会用 Sable 作挡箭牌", avatar: "🎭", initial_statement: "这是个意外，设备故障而已。我们的设备都有合规认证，我的律师会处理一切。" }
  ],
  conflict_dictionary: [{ clue_A: "e_08", clue_B: "e_03", reason: "Ren's alibi is solid; the backroom access log points directly to Sable." }],
  hidden_clues: [{ clue_id: "e_secret_99", unlock_turn: 6, text: "系统提示：后巷收货区传感器检测到一个被遗忘的数据节点..." }],
  checkpoints: ["zone_booth3", "zone_bar"],
  zone_clue_map: { zone_booth3: ['e_01','e_07'], zone_bar: ['e_05','e_08'], zone_backroom: ['e_03','e_04','e_secret_99'], zone_alley: ['e_06','e_02'] },
  zone_layout: {
    zone_booth3:   { x: 50, y: 18, label: '3号神经沉浸舱', sublabel: '案发现场', icon: '🧠', color: '#ff3860' },
    zone_bar:      { x: 15, y: 60, label: '吧台·调酒区',   sublabel: '嫌疑人地盘', icon: '🍸', color: '#00e5ff' },
    zone_backroom: { x: 85, y: 60, label: '后台控制室',     sublabel: '关键证据', icon: '💻', color: '#a78bfa' },
    zone_alley:    { x: 50, y: 85, label: '后巷收货区',     sublabel: '走私窝点', icon: '📦', color: '#ffaa00' },
  },
  zone_connections: [['zone_booth3','zone_bar'],['zone_booth3','zone_backroom'],['zone_booth3','zone_alley'],['zone_bar','zone_alley'],['zone_backroom','zone_alley']],

  // ── English localisation ──────────────────────────────────────────────────
  en: {
    title: "Red Butterfly",
    subtitle: "Case LVL-03",
    setting: "2155. An illegal neural entertainment club 'The Nest' in Sector 9 of the Underground District. A regular patron is found dead in a private neural immersion pod, cause of death: suspected neural overload.",
    scene: {
      description: "The neural pod section of 'The Nest' is dimly lit, reeking of alcohol and machine oil. Victim Riku Tanaka is found still seated in Pod 3 — brainwave output shows a fatal neural overload. But this device has a safety lock. Someone bypassed it.",
      zones: {
        zone_booth3:  { dom_id: "area-booth3",  label: "Pod 3 · Neural Booth", entry_requirement: null },
        zone_bar:     { dom_id: "area-bar",     label: "Bar · Mixing Counter", entry_requirement: null },
        zone_backroom:{ dom_id: "area-backroom",label: "Backroom Control Room", entry_requirement: "hack_terminal" },
        zone_alley:   { dom_id: "area-alley",   label: "Back Alley · Receiving", entry_requirement: "tail_suspect" },
      }
    },
    clue_dictionary: [
      { clue_id: "e_01", keyword: "Overloaded Neural Pod", description: "Pod 3's overload trace shows peak power 4.7× the safety limit. The safety lock was bypassed at the software level — not a hardware failure.", visual_icon: "🧠", weight: "CRITICAL" },
      { clue_id: "e_02", keyword: "Riku's Blackmail Messages", description: "Six encrypted messages extracted from Riku's neural implant cache — demanding 50,000 credits/month from 'S' in exchange for silence.", visual_icon: "💬", weight: "CRITICAL" },
      { clue_id: "e_03", keyword: "Sable's Access Log", description: "The backroom control room's door log shows Sable entered at 01:20 and left at 01:26 — perfectly overlapping the window of Riku's death.", visual_icon: "🔑", weight: "CRITICAL" },
      { clue_id: "e_04", keyword: "Wiped Tablet", description: "A factory-reset tablet found in the control room. Data recovery reveals code fragments — a custom overload script targeting Pod 3's safety lock.", visual_icon: "📱", weight: "HIGH" },
      { clue_id: "e_05", keyword: "Lena's Testimony", description: "Coat-check girl Lena says she saw Sable 'rush a little nervously' past the bar toward the back door at around 01:20.", visual_icon: "👁️", weight: "HIGH" },
      { clue_id: "e_06", keyword: "Modified Neural Chips", description: "A hidden crate in the back alley yielded 12 modified neural chips — model numbers don't match Sable's supplier invoices. Illegal contraband.", visual_icon: "💿", weight: "HIGH" },
      { clue_id: "e_07", keyword: "Bar Chemical Analysis", description: "Residue in Riku's glass shows a heavy neural suppressant dose — lowering his defensive response to overload signals. In combination: lethal.", visual_icon: "🍸", weight: "MEDIUM" },
      { clue_id: "e_08", keyword: "Club Owner Ren's Statement", description: "Owner Ren claims he was in the VIP lounge with clients when the incident occurred. Five guests can vouch for him. No direct connection to the case.", visual_icon: "🤵", weight: "LOW" },
      { clue_id: "e_secret_99", keyword: "Sable's Smuggling Ledger", description: "Decrypted from a hidden compartment in the alley crate: a handwritten ledger of Sable's three-year illegal chip trade, with Riku's name annotated 'Threat Eliminated'.", visual_icon: "📒", weight: "CRITICAL", unlock_turn: 6 }
    ],
    npcs: [
      { npc_id: "npc_01", name: "Sable", role: "Head Bartender", public_persona: "Calm and professional — expresses regret about Riku's death, claims she was busy at the bar all evening", personality: "Ice-cold, almost no emotional fluctuation — brief pauses when pressed on the specific timeline", avatar: "🦋", initial_statement: "Riku was a regular here. It was a busy night — I was at the bar the whole time. Such a tragedy." },
      { npc_id: "npc_02", name: "Lena", role: "Coat-Check Attendant", public_persona: "Timid and kind, a witness willing to cooperate", personality: "Voice trembles, opens up once comforted — needs pressure to tell the full story", avatar: "🌸", initial_statement: "I... I'm not sure what I saw. Can you protect me? The people here aren't to be messed with." },
      { npc_id: "npc_03", name: "Ren", role: "Club Owner", public_persona: "Sharp businessman, eager to distance the club from the incident", personality: "Highly defensive — threatens with money and lawyers, but will throw Sable under the bus when cornered", avatar: "🎭", initial_statement: "It was an accident. Equipment malfunction. All our gear is certified compliant. My lawyers will handle everything." }
    ],
    hidden_clues: [{ clue_id: "e_secret_99", unlock_turn: 6, text: "SYSTEM ALERT: Sensor in back alley receiving area detected a forgotten data node..." }],
    zone_layout: {
      zone_booth3:   { x: 50, y: 18, label: 'Neural Pod 3',    sublabel: 'Crime Scene',    icon: '🧠', color: '#ff3860' },
      zone_bar:      { x: 15, y: 60, label: 'Bar Counter',     sublabel: "Suspect's Turf",  icon: '🍸', color: '#00e5ff' },
      zone_backroom: { x: 85, y: 60, label: 'Control Room',    sublabel: 'Key Evidence',   icon: '💻', color: '#a78bfa' },
      zone_alley:    { x: 50, y: 85, label: 'Back Alley',      sublabel: 'Smuggling Den',  icon: '📦', color: '#ffaa00' },
    },
  },
};

// ─── Case catalogue (for selection screen) ────────────────────────────────────
export const ALL_CASES = [Case_Data_Lvl_01, Case_Data_Lvl_02, Case_Data_Lvl_03, Case_Data_Lvl_04, Case_Data_Lvl_05];

export const DEFAULT_AGENT_CONFIG = {
  agent_id: "AXIOM-7",
  role: "Lead_Investigator",
  base_stance: "analytical",
  visual_parameters: {
    base_color: "#00ffff",
    pulse_rate_ms: 2000,
  },
  combat_attributes: {
    logic_power: 70,
    observation_focus: 60,
  },
  engine_modifiers: {
    confusion_resistance: 0.7,
    ap_cost_discount: 0.0,
  },
  custom_rules: [
    { condition: "When NPC refuses to answer", action: "Present evidence immediately" },
    { condition: "When confusion is high", action: "Re-examine known clues before acting" }
  ]
};
