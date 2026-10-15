// Private investigation-v2 content. Import from server code only: method keys,
// later testimony, report answers and hidden rewards must never reach src/.
import { ALL_CASES } from '../../src/game/caseData.js';
import { getReconstructionWorkbench, getReportSupportAlternatives } from './rawMaterials.js';
import { applyCaseDesign, CASE_DESIGN_REVISION } from './caseDesign.js';

const text = (zh, en) => ({ zh, en });
const option = (id, zh, en) => ({ id, label: text(zh, en) });
const STEP_METHODS = {
  document: [option('metadata', '核对原始时间戳与签章', 'Check original timestamps and signatures'), option('surface', '检查纸面与表面痕迹', 'Inspect surface traces'), option('summarize', '只读取可见摘要', 'Read only the visible summary')],
  terminal: [option('audit', '提取原始审计记录并校验来源', 'Extract original audit records and verify their source'), option('replay', '回放当前展示画面', 'Replay the currently displayed feed'), option('hardware', '检查终端外壳与接口', 'Inspect the enclosure and ports')],
  sample: [option('forensics', '采样并与标准样本对照', 'Sample and compare against a reference'), option('visual', '观察颜色和外形', 'Inspect color and shape'), option('inventory', '核对存放数量', 'Count stored items')],
  device: [option('diagnostics', '读取独立诊断与执行记录', 'Read independent diagnostics and execution logs'), option('exterior', '检查设备外观', 'Inspect the device exterior'), option('inventory', '核对设备资产标签', 'Check the asset label')],
};
const METHOD_ACTION = { metadata: 'access_database', audit: 'check_cctv', forensics: 'analyze_forensics', diagnostics: 'examine_clue' };

function makeTargets(caseData, specs, overrides) {
  return specs.map(([clueId, zoneId, kind, zh, en, observationZh, observationEn, methodId]) => {
    const clue = caseData.clue_dictionary.find(item => item.clue_id === clueId);
    const english = caseData.en.clue_dictionary.find(item => item.clue_id === clueId);
    const method = methodId || ({ document: 'metadata', terminal: 'audit', sample: 'forensics', device: 'diagnostics' })[kind];
    return {
      target_id: `target_${clueId}`, zone_id: zoneId, kind,
      label: text(zh, en), observation: text(observationZh, observationEn),
      clue_id: clueId, method_id: method, action_tag: METHOD_ACTION[method],
      methods: STEP_METHODS[kind].map(item => ({ ...item, label: { ...item.label } })),
      result: overrides[clueId]?.description || text(clue.description, english.description),
      required_clues: [], hidden: false,
    };
  });
}

const stage = (clues, zhTopic, enTopic, zh, en, gentleZh, gentleEn, firmZh, firmEn) => ({
  required_clues: clues, topic: text(zhTopic, enTopic), response: text(zh, en),
  gentle_response: text(gentleZh, gentleEn), firm_response: text(firmZh, firmEn),
});
const relation = (a, b, type, id, zh, en, alternative = false) => ({ a, b, relation: type, proposition_id: id, label: text(zh, en), alternative });
const puzzle = (id, type, zh, en, clues, items, answer, promptZh, promptEn) => ({
  id, type, label: text(zh, en), required_clues: clues,
  items: items.map(([key, labelZh, labelEn]) => option(key, labelZh, labelEn)),
  answer, prompt: text(promptZh, promptEn),
});
const hidden = (prefix, turn, prerequisites, zone, zh, en, observationZh, observationEn, resultZh, resultEn) => ({
  target_id: `target_${prefix}_secret_99`, clue_id: `${prefix}_secret_99`, zone_id: zone,
  unlock_turn: turn, required_clues: prerequisites, label: text(zh, en),
  observation: text(observationZh, observationEn), result: text(resultZh, resultEn),
});

const SPECS = {
  Lvl_01: {
    targets: [
      ['c_01', 'zone_datacenter', 'document', '端子下的折叠收据', 'Folded receipt beneath the terminal', '纸角有暗红色斑点，购买项目被折痕挡住。', 'A dark red stain marks a paper corner; a fold hides the purchased item.'],
      ['c_02', 'zone_datacenter', 'sample', 'Victor 的颈部神经接口', "Victor's neck neural port", '接口边缘发黑，附近没有弹壳或钝击碎片。', 'The port rim is scorched; no cartridge case or impact fragment is nearby.'],
      ['c_03', 'zone_lobby', 'terminal', '47层门禁审计台', 'Floor 47 access audit console', '屏幕中的权限名称与读卡器签章似乎不完全一致。', 'The displayed permission name appears inconsistent with the reader signature.'],
      ['c_04', 'zone_lab', 'document', '加密交易文件夹', 'Encrypted transaction folder', '封面是普通技术授权书，附件却另设了访问密码。', 'The cover is an ordinary technology license; its annex has a separate password.'],
      ['c_05', 'zone_lab', 'device', '维修井电子锁', 'Maintenance-shaft electronic lock', '锁舌没有撬痕，内部诊断灯仍在记录开合事件。', 'The latch has no pry marks; an internal diagnostic light still records openings.'],
      ['c_06', 'zone_balcony', 'document', '遗落的医疗授权夹', 'Mislaid medical authorization folder', '夹内有医院印章，家属签名被雨水浸湿。', 'A hospital stamp is visible; rain has blurred the relative’s signature.'],
      ['c_07', 'zone_datacenter', 'terminal', '损毁的监控存储阵列', 'Damaged surveillance storage array', '多个摄像头的缺帧起点重合，本地电源日志仍可读取。', 'Several camera gaps begin together; the local power log remains readable.'],
      ['c_08', 'zone_lobby', 'terminal', '地下值班刷卡记录', 'Underground duty reader log', '值班终端与47层门禁使用不同的时钟源。', 'The duty terminal and floor 47 access system use separate clock sources.'],
    ],
    npc_zones: { npc_01: 'zone_balcony', npc_02: 'zone_lobby', npc_03: 'zone_lab' },
    initial_statements: {
      npc_01: text('我在23点前离开了。Victor 出事后，我才回来……别碰那份医院文件。', 'I left before 23:00. I only came back after Victor was found… please leave the hospital file alone.'),
      npc_02: text('23:31，我上楼送报告发现了他。之前我在地下停车场，刷卡记录能说明。', 'At 23:31 I went upstairs with a report and found him. Before that I was in the underground car park; the reader log can confirm it.'),
      npc_03: text('我们讨论的是技术授权。医院赔偿和今晚的死亡是两回事。', 'We discussed a technology license. Hospital compensation and tonight’s death are separate matters.'),
    },
    clue_overrides: {
      c_03: { label: text('克隆门禁卡', 'Cloned access card'), description: text('原始读卡审计在23:16记录到与Mei权限相同、硬件签章不同的复制卡。该记录在23:17致伤前一分钟，卡片名称不能单独证明持卡人身份。', 'The original reader audit records a copied card at 23:16 with Mei’s permissions but a different hardware signature, one minute before the 23:17 injury. A badge name alone does not establish its holder’s identity.') },
      c_06: { label: text('Mei 的姐姐档案', "Mei's older sister's medical file"), description: text('医院记录确认 Mei Lin 的姐姐因 NovaCorp 神经接口实验受伤，持续处于植物人状态；Mei 为其医疗授权联系人。', 'Hospital records confirm that Mei Lin’s older sister was injured in a NovaCorp neural-interface trial and remains in a vegetative state; Mei is the medical contact.') },
      c_08: { label: text('Kenji 的案发窗口不在场记录', "Kenji's incident-window alibi"), description: text('独立值班终端确认 Kenji 在23:10至23:25持续位于地下停车场，覆盖23:17的致伤窗口；他于23:31上楼发现尸体。', 'The independent duty terminal places Kenji in the underground car park continuously from 23:10 to 23:25, covering the 23:17 injury window. He went upstairs and discovered the body at 23:31.') },
    },
    testimonies: {
      npc_01: [
        stage(['c_03', 'c_05'], '离楼后为何仍有同权限记录', 'Why did the same permission appear after you left?', '那张卡可以复制。23:17的记录……我回来过，我不该说整晚都在外面。', 'That card can be copied. The 23:17 record… I did come back. I should not have said I was away all night.', '我害怕被当成凶手，所以隐瞒了返回。维修井连着实验室，Victor 知道这条路。', 'I hid my return because I feared being accused. The shaft joins the lab; Victor knew that route.', '不要只读卡上的名字！我承认返回过，但你还得核对锁的时钟。', 'Do not rely on the name on a card! I admit returning, but you still need to check the lock clock.'),
        stage(['c_04', 'c_06'], '技术交易与姐姐的治疗', 'The technology sale and your sister’s treatment', '他答应停止试验，却又要卖掉技术。姐姐连我的声音都听不到了，我不能再假装那份合同无关。', 'He promised to stop the trials, then planned to sell the technology. My older sister cannot even hear me anymore. I cannot pretend the contract meant nothing.', '姐姐出事以后，我一直替她办治疗手续。看到附件那天，我知道 Victor 的承诺是假的。', 'Since my older sister was injured, I have handled her care. When I saw that annex, I knew Victor’s promise was false.', '是，我看过附件。我为姐姐争取的不是一张支票，也不是你们口中的普通劳资纠纷。', 'Yes, I saw the annex. What I wanted for my older sister was neither a check nor an ordinary employment settlement.'),
      ],
      npc_02: [
        stage(['c_08'], '地下值班与发现尸体的间隔', 'The gap between underground duty and discovery', '23:25交班后我才上楼。23:17我还在地下读卡器旁，送报告和致伤不是同一时刻。', 'I went upstairs after the 23:25 handover. At 23:17 I was still by the underground reader. Delivering the report and the injury happened at different times.', '谢谢你核对独立终端。我23:31才到，发现门开着就报警了。', 'Thank you for checking the independent terminal. I arrived at 23:31, saw the open door, and called it in.', '我没有说整夜没上楼！我说的是案发那十五分钟在地下。请把两个时间分开。', 'I never said I did not go upstairs all night! I was underground during that fifteen-minute window. Separate those times.'),
        stage(['c_05', 'c_07'], '摄像头损毁后为何没有锁楼', 'Why was the building not locked after the cameras failed?', 'EMP使监控失效，维修井锁却用备用电源。我没想到内部还留着那条路。', 'The EMP disabled surveillance, but the shaft lock had backup power. I did not realize that internal route remained usable.', '我按停电流程守住主入口，没检查备用电源的维修锁，这是我的疏漏。', 'I followed the outage procedure and guarded the main entrance. Failing to check the backup-powered shaft lock was my mistake.', '值班记录证明我的位置，不代表我没有失职。我漏了维修通道，但没有碰 Victor。', 'The duty log proves my location, not flawless work. I missed the service route; I did not touch Victor.'),
      ],
      npc_03: [
        stage(['c_04'], '附件中的神经接口技术转让', 'The neural-interface transfer in the annex', '这是保密附件。我可以确认 NovaCorp 是购买方，但不代表我实施了袭击。', 'It is a confidential annex. I can confirm NovaCorp was the buyer; that does not mean I carried out the attack.', '我会提供合同版本和签署日期。请分别调查商业责任与死亡责任。', 'I will provide the contract version and signing date. Investigate commercial liability and responsibility for the death separately.', '合同不能证明我握着武器。你可以调取交易，但不要把购买方等同于施害人。', 'A contract does not prove I held a weapon. Obtain the transaction, but do not equate its buyer with the attacker.'),
        stage(['c_06', 'c_02'], '已知试验风险与本案致伤类型', 'Known trial risks and the injury type', '我们知道高压脉冲会摧毁旧式接口，也知道她姐姐的事故。我隐瞒了风险，不等于今晚亲自使用设备。', 'We knew a high-voltage pulse could destroy older ports, and knew of her older sister’s injury. Concealing risk does not mean I personally used a device tonight.', '我愿意提交风险评估原件，连同医院通知一起保存。我确实没有把风险告诉 Victor 的员工。', 'I will submit the original risk assessment with the hospital notice. I did withhold that risk from Victor’s staff.', '我对试验负有责任。但你们必须用现场、电源和时间证据判断这次袭击。', 'I bear responsibility for the trial. You must still judge this attack from scene, power, and timing evidence.'),
      ],
    },
    relations: [
      relation('c_01', 'c_02', 'supports', 'p_emp_supply', '电容购买与高压脉冲致伤相符', 'The capacitor purchase is consistent with the high-voltage injury'),
      relation('c_03', 'c_05', 'supports', 'p_internal_route', '同权限门禁与维修井形成内部通路', 'The matching permission and shaft establish an internal route'),
      relation('c_01', 'c_03', 'precedes', 'p_purchase_before_access', '23:05电容购买先于23:16复制卡读卡事件', 'The 23:05 capacitor purchase precedes the 23:16 copied-card read'),
      relation('c_01', 'c_05', 'precedes', 'p_purchase_before_shaft', '23:05电容购买先于23:17维修井启用', 'The 23:05 capacitor purchase precedes the 23:17 shaft activation'),
      relation('c_03', 'c_05', 'precedes', 'p_access_before_shaft', '23:16复制卡读卡先于23:17维修井启用', 'The 23:16 copied-card read precedes the 23:17 shaft activation'),
      relation('c_01', 'c_08', 'precedes', 'p_purchase_before_discovery', '23:05电容购买先于23:31保安发现尸体，发现不等于致伤', 'The 23:05 capacitor purchase precedes the guard’s 23:31 discovery; discovery is not injury'),
      relation('c_03', 'c_08', 'precedes', 'p_access_before_discovery', '23:16复制卡读卡先于23:31保安发现尸体，不据此推定持卡人', 'The 23:16 copied-card read precedes the guard’s 23:31 discovery without establishing the card holder’s identity'),
      relation('c_05', 'c_08', 'precedes', 'p_shaft_before_discovery', '23:19维修井离开记录先于23:31保安发现尸体', 'The 23:19 shaft exit precedes the guard’s 23:31 discovery of the body'),
      relation('c_04', 'c_06', 'supports', 'p_personal_motive', '技术转让与家属受害形成具体利害冲突', 'The transfer and family injury establish a concrete conflict of interest'),
      relation('c_05', 'c_07', 'supports', 'p_emp_window', '维修井窗口与监控脉冲中断相互印证', 'The shaft window corroborates the pulse-related camera outage'),
      relation('c_08', 'c_05', 'contradicts', 'p_exclude_guard', '地下记录排除保安在致伤窗口使用维修井', 'Underground records exclude the guard from the shaft during the injury window', true),
      relation('c_02', 'c_04', 'contradicts', 'p_exclude_business_accident', '接口定向烧伤不能由合同交易本身解释', 'A targeted port burn is not explained by the business deal alone', true),
      relation('c_secret_99', 'c_05', 'supports', 'p_independent_shaft_signature', '独立维修备份的23:17设备签章与维修井记录相符', 'The independent service backup’s 23:17 device signature matches the shaft record'),
    ],
    report: {
      conclusions: [option('mei', 'Mei Lin 返回现场实施袭击后经维修井离开', 'Mei Lin returned, attacked Victor, and left through the maintenance shaft'), option('kenji', 'Kenji 借送报告进入现场并利用维修井袭击', 'Kenji used report delivery to reach Victor and attacked via the service shaft'), option('voss', 'Dr. Voss 借技术拜访进入现场并实施袭击', 'Dr. Voss entered during a technology visit and carried out the attack')],
      methods: [option('emp', '高压EMP过载神经接口并干扰监控', 'A high-voltage EMP overloaded the neural port and disrupted cameras'), option('implant_fault', '旧式接口自行过热并引发停电', 'An old port overheated spontaneously and caused the outage'), option('blunt_trauma', '钝击致死后用电源故障掩盖', 'A blunt strike killed Victor, followed by an electrical cover-up')],
      motives: [option('revenge', '阻止技术出售并为姐姐受害追责', 'Stop the technology sale and avenge the older sister’s injury'), option('guard_debt', '为清偿保安个人债务夺取芯片', 'Steal chips to settle the guard’s personal debt'), option('patent_theft', '由购买方直接抢夺尚未授权的专利', 'The buyer directly seized an unlicensed patent')],
      timelines: [option('2317', '23:17致伤、23:19经维修井离开、23:31发现', 'Injury at 23:17, shaft exit at 23:19, discovery at 23:31'), option('2331', '23:31送报告时致伤，随后留在主入口等待报警', 'Injury at the 23:31 report delivery, then wait by the main entrance for police'), option('2300', '23:00前致伤，23:17门禁伪造，23:31才发现', 'Injury before 23:00, forged access at 23:17, discovery at 23:31')],
      answers: { conclusion_id: 'mei', method_id: 'emp', motive_id: 'revenge', timeline_id: '2317' },
      support: { opportunity: ['c_03', 'c_05'], method: ['c_01', 'c_02'], motive: ['c_04', 'c_06'], timeline: ['c_05', 'c_07'] },
      wrong_outcomes: { kenji: text('对保安的指控与独立值班记录冲突，警务协作暂停并扣减信誉；调查仍可修正。', 'The accusation conflicts with the independent duty record. Police cooperation pauses and reputation falls; the investigation remains revisable.'), voss: text('将合同责任直接当作谋杀责任引来法律异议，现场调查增加混乱；请补全施害时间和动作证据。', 'Equating contract liability with murder triggers a legal challenge and increases confusion. Establish the attack timing and actions.') },
    },
    puzzle: puzzle('neon_clock', 'sequence', '门禁与致伤时间轴', 'Access and injury timeline', ['c_01', 'c_05', 'c_07', 'c_08'], [['purchase', '收据23:05', 'Receipt 23:05'], ['pulse', '维修井开启与监控中断23:17', 'Shaft opening and camera outage 23:17'], ['exit', '维修井关闭23:19', 'Shaft closure 23:19'], ['discovery', '保安发现23:31', 'Guard discovery 23:31']], ['purchase', 'pulse', 'exit', 'discovery'], '按独立时钟排列事件；不要把发现时间当成致伤时间。', 'Order events using independent clocks; do not confuse discovery with injury.'),
    hidden: hidden('c', 8, ['c_05', 'c_06'], 'zone_lab', '待解密的匿名数据包', 'Encrypted anonymous packet', '维修锁与医院授权记录核验后，收到可校验的外部签章。', 'After shaft and hospital checks, an externally signed packet becomes verifiable.', '匿名维修备份记录EMP-X7设备在23:17由Mei的本地终端配对，校验签章与维修锁一致，独立印证现场链条。', 'An anonymous service backup records an EMP-X7 pairing with Mei’s local terminal at 23:17. Its verified signature matches the shaft lock and independently corroborates the scene chain.'),
  },
  Lvl_02: {
    targets: [
      ['d_01', 'zone_lab_core', 'sample', '烧焦芯片的排列', 'Arrangement of burned chips', '七枚芯片的焦黑面朝同一方向，实验台没有爆炸痕。', 'Seven scorched chips face the same direction; the bench has no blast marks.'],
      ['d_02', 'zone_lab_core', 'terminal', '核心实验室刷卡器', 'Core-lab badge reader', 'Aria 的工牌留在门边，显示一次进入却没有离开。', 'Aria’s badge remains beside the door; the reader shows an entry without an exit.'],
      ['d_03', 'zone_lab_core', 'device', '回收封袋内的QPS-α', 'Recovered QPS-alpha in a sealed bag', '原型机的回收标签与借出标签并不属于同一地点。', 'The prototype’s recovery tag and checkout tag name different locations.'],
      ['d_04', 'zone_server', 'terminal', '量子密钥库审计镜像', 'Quantum-key vault audit mirror', '管理员访问条目与值班任务单数量不符。', 'The administrator access entries do not match the duty-task count.'],
      ['d_05', 'zone_lounge', 'document', '冰箱夹层的饮料罐', 'Drink can in the refrigerator lining', '罐体没有饮料重量，底部有数据接口。', 'The can lacks the weight of a drink and has a data connector underneath.'],
      ['d_06', 'zone_roof_exit', 'device', '屋顶压力传感器', 'Roof pressure sensor', '逃生门无刷卡记录，地面传感器却留有完整波形。', 'The escape door has no badge entry, but its floor sensor retains a complete waveform.'],
      ['d_07', 'zone_lab_core', 'terminal', '摄像头供电控制器', 'Camera power controller', '外部镜头同时黑屏，内部控制器仍在运行。', 'Exterior feeds fail together while the internal controller remains active.'],
      ['d_08', 'zone_server', 'document', '加密通话计费账', 'Encrypted-call billing ledger', '账单上的长通话没有对应的公开会议。', 'A long billed call has no matching public meeting.'],
    ],
    npc_zones: { npc_01: 'zone_server', npc_02: 'zone_lounge', npc_03: 'zone_roof_exit' },
    initial_statements: {
      npc_01: text('机构正在寻找 Aria。门锁得好好的，别把不完整的账单当成结论。', 'The institute is searching for Aria. The door was securely locked; do not turn incomplete billing into a conclusion.'),
      npc_02: text('她最近总问逃生通道的事，我以为她是在准备安全演练。', 'She kept asking about the escape route lately. I thought she was preparing a safety drill.'),
      npc_03: text('那晚我离开过岗位十几分钟……不，是更久一点。', 'I left my post for fifteen minutes that night… no, perhaps a little longer.'),
    },
    clue_overrides: { d_03: { label: text('屋顶回收的相位偏移原型机', 'Phase-shift prototype recovered at the roof'), description: text('借用单确认 Aria 前夜签出QPS-α；安保于02:41在屋顶逃生通道回收设备后封存，能量核耗尽。它并未在失踪前归还实验室。', 'The checkout slip confirms Aria borrowed QPS-alpha the previous night. Security recovered and sealed it at the roof escape passage at 02:41 with its core depleted; it was not returned before the disappearance.') } },
    testimonies: {
      npc_01: [
        stage(['d_04'], '01:55下载为何不在任务单中', 'Why is the 01:55 download absent from the task list?', '那是我发起的。密钥集属于研究所，我认为无需向每名研究员备案。', 'I initiated it. The key set belongs to the institute; I believed individual researchers did not need notification.', '我可以承认权限由我使用，但请求先封存日志，避免把管理操作和人身事件混为一谈。', 'I acknowledge using the account. Preserve the logs before conflating an administrative action with a personal disappearance.', '权限记录没错，但你必须说明下载和 Aria 失踪之间的关联。', 'The access record is correct, but establish its connection to Aria’s disappearance.'),
        stage(['d_05', 'd_08'], '备份中的合同与境外通话', 'Backup contracts and the overseas call', 'Aria 留了副本？那通电话讨论的是密钥交付。我没有授权她带走机构资料。', 'Aria kept a copy? The call concerned delivery of keys. I did not authorize her to take institute documents.', '我知道她反对交付，所以没有让她参加电话；她收集资料这件事确实让我担心。', 'I knew she opposed the delivery, so excluded her from the call. Her collecting records did concern me.', '是境外交易，但那不能证明这里发生了谋杀。请核对她到底如何离开。', 'It was an overseas transaction, but that does not prove a murder. Verify how she actually left.'),
      ],
      npc_02: [
        stage(['d_03', 'd_06'], '原型机为何出现在屋顶', 'Why was the prototype at the roof?', '她问过QPS能否越过一扇锁门。我没替她操作，屋顶传感器那个人可能就是她。', 'She asked whether QPS could cross a locked door. I did not operate it for her; the roof sensor may have recorded her.', '她说要找一条不用主门的路。我担心被牵连，所以一直没敢说。', 'She said she needed a route without the main door. I stayed silent because I feared being implicated.', '我没有把她推进什么装置。先看能量耗尽与屋顶回收时间，再问我是否有罪。', 'I did not push her into any device. Check the depleted core and roof recovery time before accusing me.'),
        stage(['d_05', 'd_01'], '饮料罐备份与烧毁芯片', 'The drink-can backup and burned chips', '她让我别丢那罐“饮料”。现在我懂了：真正的资料在这里，烧掉的芯片是留下的假象。', 'She told me not to throw away that “drink.” Now I understand: the real records are here; the burned chips were a decoy.', '她没有告诉我全部计划，但特意交代保留饮料罐。她在替资料找一个安全地方。', 'She did not tell me the entire plan, but specifically asked me to keep the can. She wanted a safe place for the records.', '我只能证明她主动安排了备份，不能替你猜她现在在哪里。', 'I can prove she arranged the backup herself, not guess where she is now.'),
      ],
      npc_03: [
        stage(['d_07', 'd_02'], '02:17停电时是否在岗', 'Were you on duty during the 02:17 outage?', '02:15到02:40我不在岗。Harlan 让我去后楼取一个信封，我说上厕所是怕失去工作。', 'I was away from 02:15 to 02:40. Harlan sent me for an envelope in the rear building. I said I was in the bathroom because I feared losing my job.', '信封里有钱。我收了，但不知道摄像头会停电；这段离岗请照实记录。', 'The envelope contained money. I accepted it without knowing the cameras would fail; record the absence accurately.', '我收钱离岗是真的，但没有碰核心实验室的内部电源开关。', 'I took money to leave my post, but did not touch the core lab’s internal power switch.'),
        stage(['d_03', 'd_06'], '02:41回收设备的过程', 'How was the device recovered at 02:41?', '我回来后收到屋顶压力警报，在02:41捡到耗尽的原型机，才把它送回封存。', 'After returning I received a roof-pressure alert, found the depleted prototype at 02:41, and brought it back sealed.', '回收标签是我签的。设备在屋顶，不是有人提前归还实验室。', 'I signed the recovery tag. The device was on the roof, not returned to the lab beforehand.', '标签和传感器可以相互核对。我没有看到人离开，不能把没看见说成没人经过。', 'The tag and sensor can be cross-checked. I saw no one leave, but not seeing someone does not mean nobody passed.'),
      ],
    },
    relations: [
      relation('d_02', 'd_03', 'supports', 'p_phase_exit', '内部锁门与耗尽原型支持非常规离开', 'The internal lock and depleted prototype support an unconventional exit'),
      relation('d_03', 'd_06', 'supports', 'p_roof_route', '屋顶回收原型与屋顶压力记录支持同一逃出路线', 'The prototype recovered at the roof and roof pressure record support the same escape route'),
      relation('d_04', 'd_07', 'precedes', 'p_download_before_outage', '01:55密钥下载先于02:17外部摄像头断电', 'The 01:55 key download precedes the 02:17 exterior-camera outage'),
      relation('d_04', 'd_02', 'precedes', 'p_download_before_entry', '01:55密钥下载先于02:18核心实验室入室记录', 'The 01:55 key download precedes the 02:18 core-lab entry'),
      relation('d_04', 'd_06', 'precedes', 'p_download_before_roof', '01:55密钥下载先于02:34屋顶压力触发', 'The 01:55 key download precedes the 02:34 roof pressure trigger'),
      relation('d_04', 'd_03', 'precedes', 'p_download_before_recovery', '01:55密钥下载先于02:41原型回收', 'The 01:55 key download precedes the 02:41 prototype recovery'),
      relation('d_07', 'd_02', 'precedes', 'p_outage_before_entry', '02:17外部摄像头断电先于02:18核心实验室入室', 'The 02:17 exterior-camera outage precedes the 02:18 core-lab entry'),
      relation('d_07', 'd_06', 'precedes', 'p_outage_before_roof', '02:17外部摄像头断电先于02:34屋顶压力触发', 'The 02:17 exterior-camera outage precedes the 02:34 roof pressure trigger'),
      relation('d_07', 'd_03', 'precedes', 'p_outage_before_recovery', '02:17外部摄像头断电先于02:41原型回收', 'The 02:17 exterior-camera outage precedes the 02:41 prototype recovery'),
      relation('d_02', 'd_06', 'precedes', 'p_entry_before_roof', '02:18核心实验室入室先于02:34屋顶压力触发', 'The 02:18 core-lab entry precedes the 02:34 roof pressure trigger'),
      relation('d_02', 'd_03', 'precedes', 'p_entry_before_recovery', '02:18核心实验室入室先于02:41原型回收', 'The 02:18 core-lab entry precedes the 02:41 prototype recovery'),
      relation('d_06', 'd_03', 'precedes', 'p_roof_before_recovery', '02:34屋顶压力触发先于02:41原型回收，不把回收时间当作使用时间', 'The 02:34 roof pressure trigger precedes the 02:41 prototype recovery; recovery time is not use time'),
      relation('d_04', 'd_08', 'supports', 'p_key_sale', '密钥下载与境外通话构成交易调查线', 'The key download and overseas call establish a transaction lead'),
      relation('d_05', 'd_04', 'supports', 'p_backup_reason', '独立备份证明下载并非日常安全操作', 'The independent backup shows the download was not routine security work'),
      relation('d_01', 'd_05', 'contradicts', 'p_exclude_data_destroyed', '被烧芯片不代表关键资料已全部销毁', 'Burned chips do not mean all essential records were destroyed', true),
      relation('d_02', 'd_06', 'contradicts', 'p_exclude_sealed_death', '无主门离开记录不等于人仍在密室', 'No main-door exit does not imply the person remained in the sealed room', true),
      relation('d_secret_99', 'd_03', 'supports', 'p_independent_qps_use', 'Aria的签名消息独立说明QPS由她使用，印证耗尽原型的逃出用途', 'Aria’s signed message independently identifies her use of QPS and corroborates the depleted prototype’s escape purpose'),
    ],
    report: {
      conclusions: [option('aria_staged', 'Aria 使用原型主动失踪，并留下交易罪证', 'Aria staged her exit using the prototype and left evidence of the key sale'), option('zoe', 'Zoe 借协助实验伤害 Aria，再布置烧毁芯片', 'Zoe harmed Aria during an experiment and planted the burned chips afterward'), option('otto', 'Otto 利用离岗窗口绑走 Aria，并改写门禁', 'Otto used his absence to abduct Aria and rewrite the badge records')],
      methods: [option('phase_shift', '耗尽相位原型越过锁门，烧芯片作诱饵', 'Use the depleted phase prototype to cross the locked door and burn decoy chips'), option('main_door', '复制主门刷卡记录后从大厅搬离', 'Copy the main-door record and remove the person through the lobby'), option('lab_fire', '实验台异常起火吞没人员，并烧毁七枚芯片', 'An abnormal bench fire destroyed the person and all seven quantum chips')],
      motives: [option('expose_harlan', '保留密钥交易罪证并脱离机构控制', 'Preserve key-sale evidence and escape institutional control'), option('assistant_rivalry', '因助理与研究员的职位竞争报复', 'Retaliate over competition between assistant and researcher'), option('guard_ransom', '由夜班保安索取研究资料赎金', 'The night guard demanded research records as ransom')],
      timelines: [option('0234', '02:17停机、02:18入室、02:34屋顶离开', 'Outage at 02:17, lab entry at 02:18, roof departure at 02:34'), option('0155', '01:55下载时从主门被带走，02:18刷卡被伪造', 'Main-door removal at 01:55, then a fabricated badge entry at 02:18'), option('0241', '02:18留在实验室，02:41设备回收时才失踪', 'Remain inside after 02:18, then disappear as the prototype is recovered at 02:41')],
      answers: { conclusion_id: 'aria_staged', method_id: 'phase_shift', motive_id: 'expose_harlan', timeline_id: '0234' },
      support: { opportunity: ['d_02', 'd_06'], method: ['d_01', 'd_03'], motive: ['d_04', 'd_05'], timeline: ['d_06', 'd_07'] },
      wrong_outcomes: { zoe: text('无直接人身犯罪证据的助理指控使证人停止配合，信誉下降；资料副本仍可重新核验。', 'Accusing the assistant without direct evidence of harm ends witness cooperation and lowers reputation; the document copy remains verifiable.'), otto: text('将收钱离岗等同绑架使调查偏离密室机制，混乱增加；请区分失职与失踪责任。', 'Equating a paid absence with abduction distracts from the sealed-room mechanism and raises confusion. Distinguish misconduct from disappearance.') },
    },
    puzzle: puzzle('ghost_route', 'route', '密室逃出路径重建', 'Sealed-room escape reconstruction', ['d_02', 'd_03', 'd_06'], [['lab', '02:18核心实验室', 'Core lab at 02:18'], ['phase', 'QPS耗能跨越锁门', 'QPS spends its core crossing the locked door'], ['shaft', '内部紧急通道', 'Internal emergency passage'], ['roof', '02:34屋顶压力触发', 'Roof pressure trigger at 02:34']], ['lab', 'phase', 'shaft', 'roof'], '用工牌、原型回收和压力记录连接路线，排序每个经过点。', 'Connect the route using badge, prototype-recovery, and pressure records; order each waypoint.'),
    hidden: hidden('d', 7, ['d_05', 'd_06'], 'zone_server', '回收站残留签名', 'Residual signature in the recycle store', '备份签名与屋顶时钟校验后，一段残留消息可以恢复。', 'After checking the backup signature and roof clock, a residual message can be recovered.', 'Aria 的签名消息写明她独自使用QPS离开，并让独立保管人提交密钥交易证据；消息时间早于调查，印证主动失踪。', 'Aria’s signed message states she used QPS to leave alone and asked an independent custodian to submit key-sale evidence. The pre-investigation timestamp corroborates a staged disappearance.'),
  },
  Lvl_03: {
    targets: [
      ['e_01', 'zone_booth3', 'device', '3号舱功率诊断口', 'Booth 3 power diagnostic port', '保险开关没有损坏，峰值指示却超出刻度。', 'The safety switch is intact, but the peak indicator exceeds its scale.'],
      ['e_02', 'zone_booth3', 'document', 'Riku 神经接口消息缓存', 'Riku’s neural-port message cache', '缓存中有重复付款提醒，收件人只写了一个字母。', 'Repeated payment reminders address the recipient by a single letter.'],
      ['e_03', 'zone_backroom', 'terminal', '后台门禁记录台', 'Backroom access log console', '吧台值班名册与后台进入记录有重叠时段。', 'A period in the bar duty roster overlaps a backroom entry.'],
      ['e_04', 'zone_backroom', 'document', '清空的控制平板', 'Wiped control tablet', '平板显示恢复出厂设置，未分配存储块仍可读取。', 'The tablet shows a factory reset; unallocated blocks remain readable.'],
      ['e_05', 'zone_bar', 'terminal', '寄存处录音终端', 'Coat-check statement recorder', '一份目击记录在描述后门时中途停顿。', 'A witness recording pauses midway through a description of the rear door.'],
      ['e_06', 'zone_alley', 'sample', '收货箱中的神经芯片', 'Neural chips in a delivery crate', '箱内型号标签被重贴，外壳有额外焊点。', 'Model labels have been replaced and the casings have extra solder points.'],
      ['e_07', 'zone_bar', 'sample', 'Riku 用过的酒杯', 'Riku’s used glass', '杯底残留物与同批酒样的颜色不同。', 'Residue at the bottom differs in color from the same batch of liquor.'],
      ['e_08', 'zone_bar', 'terminal', 'VIP包厢服务记录', 'VIP-room service record', '包厢计费与五名客人的终端记录可以交叉核对。', 'Room billing can be cross-checked against five guests’ terminals.'],
    ],
    npc_zones: { npc_01: 'zone_bar', npc_02: 'zone_booth3', npc_03: 'zone_alley' },
    initial_statements: {
      npc_01: text('我整晚都在吧台。3号舱出事是设备的问题，不是酒的问题。', 'I was at the bar all night. Booth 3 failed because of equipment, not a drink.'),
      npc_02: text('我从寄存处看到有人绕去后门，但这里的人不会让我随便说。', 'From coat check I saw someone take the rear door, but people here will not let me speak freely.'),
      npc_03: text('我在VIP包厢。设备和收货各有负责人，不要把一切算在老板头上。', 'I was in the VIP room. Equipment and deliveries have separate staff; do not put everything on the owner.'),
    },
    clue_overrides: { e_08: { label: text('Ren 的致死窗口不在场记录', 'Ren’s lethal-window alibi'), description: text('VIP包厢计费和五名客人的独立终端记录覆盖01:20至01:26，排除Ren本人在此时段进入后台操作。该记录并不能排除其非法收货与收益责任。', 'VIP billing and five guests’ independent terminal records cover 01:20–01:26, excluding Ren’s personal backroom operation during that interval. They do not exclude liability for illicit deliveries or income.') } },
    testimonies: {
      npc_01: [
        stage(['e_03', 'e_05'], '01:20离开吧台的六分钟', 'The six minutes away from the bar after 01:20', '我去后台看过控制台，只是检查故障。说一直在吧台，是不想被一句话定罪。', 'I did visit the backroom console, just to check a fault. I said I stayed at the bar because I did not want one sentence to condemn me.', '当时我离开了六分钟。Lena 没看错方向，但没有看到我在后台做什么。', 'I was away for six minutes. Lena got the direction right, but did not see what I did inside.', '门禁只能说明我进过门。我承认那六分钟，操作内容要靠平板和诊断记录。', 'Access proves I entered a door. I admit those six minutes; the tablet and diagnostics must establish the actions.'),
        stage(['e_02', 'e_06'], '付款提醒中的“S”和改装芯片', '“S” in the demands and the modified chips', '消息是给我的。Riku 知道收货箱的事，每个月都要钱，越来越多。', 'The messages were for me. Riku knew about the crates and demanded more money every month.', '我被勒索了。那些型号不是账单写的货，但这不代表你可以跳过致死机制调查。', 'I was being blackmailed. Those models were not the invoiced goods, but you cannot skip the lethal mechanism.', '是我的货，也有他的勒索。把消息原件留着，别用一句“生意纠纷”概括。', 'They were my goods, and his blackmail. Keep the original messages; do not reduce it to a “business dispute.”'),
      ],
      npc_02: [
        stage(['e_03'], '后台门禁能否印证目击', 'Does backroom access corroborate your observation?', '是 Sable，约01:20从吧台绕去了后门。她让我别记下这次离岗。', 'It was Sable, around 01:20, from the bar to the rear door. She told me not to record that absence.', '请保证我安全。我记得她的袖口和路线，门禁记录让我敢确认时间。', 'Please keep me safe. I remember her sleeve and route; the access log lets me confirm the time.', '我没有编造，也没看到她操作神经舱。我能证明的是她离开吧台。', 'I did not invent it, but did not see her operate the booth. I can prove she left the bar.'),
        stage(['e_07', 'e_01'], '酒杯递送与舱内反应', 'Glass delivery and the reaction in the booth', '杯子从吧台送来。Riku喝完后反应迟钝，我叫了人，舱的安全停机却没有响应。', 'The glass came from the bar. After drinking, Riku reacted slowly. I called for help, but the booth’s safety stop did not respond.', '我先以为他喝醉了，所以没有马上报警。安全键不工作那一刻我才知道不对。', 'I first thought he was drunk and did not call immediately. I knew something was wrong when the safety key failed.', '我错在没及时察觉，但我按过停机。请把按键失效写进去。', 'I failed to notice early enough, but I pressed stop. Record that the key failed.'),
      ],
      npc_03: [
        stage(['e_08', 'e_03'], 'VIP包厢与后台权限是否相同', 'Are VIP presence and backroom access equivalent?', '客人能证明我在包厢。后台账号是员工各自使用的，不是我的包厢通行证。', 'Guests can place me in the room. Staff use their own backroom accounts; those are not my VIP pass.', '我愿意交出客人的原始记录。请分别看谁在场、谁使用了设备权限。', 'I will provide guests’ original records. Separate who was present from who used equipment access.', '你有五份记录可以查，不必靠我的话。但别把老板身份当成后台操作证据。', 'You have five records to check instead of my word. Ownership is not proof of operating the console.'),
        stage(['e_06', 'e_04'], '收货分成与控制脚本', 'Delivery payments and the control script', '我收过这批货的分成。我没写过载脚本，也不知道她会在营业中使用它。', 'I took a cut from those goods. I did not write the overload script or know it would be used during service.', '这笔非法货收入应当追查。我可以提供供货账户，但不能替你判断是谁投放脚本。', 'Investigate that illicit income. I can provide supplier accounts, but cannot decide for you who deployed the script.', '走私责任我逃不掉，杀人责任必须看脚本、时钟和操作人。', 'I cannot evade smuggling liability. Murder liability needs the script, clock, and operator.'),
      ],
    },
    relations: [
      relation('e_01', 'e_04', 'supports', 'p_software_overload', '安全锁绕过与平板脚本对应', 'The safety bypass matches the tablet script'),
      relation('e_03', 'e_05', 'supports', 'p_backroom_window', '门禁与目击共同限定后台窗口', 'Access and observation jointly constrain the backroom window'),
      relation('e_02', 'e_06', 'supports', 'p_blackmail_source', '消息中的秘密与非法芯片对应', 'The secret in the demands corresponds to the illegal chips'),
      relation('e_07', 'e_01', 'supports', 'p_combined_method', '抑制剂降低反应，与过载构成复合机制', 'The suppressant slows reaction and combines with the overload'),
      relation('e_08', 'e_03', 'contradicts', 'p_exclude_owner', '独立包厢记录排除老板亲自后台操作', 'Independent VIP records exclude personal backroom operation by the owner', true),
      relation('e_01', 'e_04', 'contradicts', 'p_exclude_hardware', '定制安全锁脚本排除纯硬件故障', 'The custom safety script excludes a purely hardware failure', true),
      relation('e_secret_99', 'e_02', 'supports', 'p_independent_blackmail_signature', '独立账本将“S”的款项与Sable签章对应，并印证针对Riku付款要求的部署联系', 'The independent ledger connects “S” payments to Sable’s signature and corroborates deployment tied to Riku’s demands'),
    ],
    report: {
      conclusions: [option('sable', 'Sable 在后台投放过载脚本并利用饮料配合', 'Sable deployed the overload script in the backroom and used the drink to assist it'), option('ren', 'Ren 借员工账号在后台投放脚本并掩盖记录', 'Ren used a staff account to deploy the backroom script and conceal its records'), option('accident', '供电线路故障引发舱内过载，工作人员事后删记录', 'A supply fault overloaded the booth, with staff deleting records afterward')],
      methods: [option('overload_script', '定制脚本绕过安全锁，抑制剂配合过载', 'A custom script bypassed safety; a suppressant compounded the overload'), option('drink_only', '饮料中的抑制剂单独致死，舱内过载发生在之后', 'The drink suppressant alone killed Riku; the booth overload followed later'), option('hardware_short', '后台线路自然短路，功率峰值使安全硬件失效', 'A backroom wiring short caused a surge that disabled the safety hardware')],
      motives: [option('silence_blackmail', '终止对改装芯片走私的持续勒索', 'End continuing blackmail over modified-chip smuggling'), option('owner_profit', '掩盖俱乐部账务违规，阻止顾客举报老板收入', 'Hide club accounting violations and stop a customer reporting the owner’s income'), option('witness_revenge', '寄存处员工为报复顾客而破坏设备', 'A coat-check attendant sabotaged equipment for revenge')],
      timelines: [option('0120', '01:20离开吧台、01:26离开后台，期间投放脚本', 'Leave the bar at 01:20, deploy the script, leave the backroom at 01:26'), option('bar_all_night', '01:20仍在吧台、闭店后线路故障，随后清空平板', 'Remain at the bar at 01:20, wiring fails after closing, then the tablet is wiped'), option('delivery', '后巷交货时离线写入脚本，01:20后台仅复查设备', 'Write the script offline during delivery; the 01:20 backroom visit only checks equipment')],
      answers: { conclusion_id: 'sable', method_id: 'overload_script', motive_id: 'silence_blackmail', timeline_id: '0120' },
      support: { opportunity: ['e_03', 'e_05'], method: ['e_01', 'e_04'], motive: ['e_02', 'e_06'], timeline: ['e_03', 'e_05'] },
      wrong_outcomes: { ren: text('把走私分成当成直接杀人证据使俱乐部撤回合作，信誉下降；请分清收益者与操作人。', 'Treating smuggling proceeds as direct murder evidence makes the club withdraw cooperation and lowers reputation. Separate beneficiary and operator.'), accident: text('以自然故障归档无法解释安全锁脚本，技术人员要求重审，混乱增加；现场记录仍保留。', 'A natural-failure finding cannot explain the safety script. Technical staff demand review and confusion rises; scene records remain preserved.') },
    },
    puzzle: puzzle('butterfly_script', 'compare', '安全锁脚本差异检查', 'Safety-script difference check', ['e_01', 'e_04'], [['safe', '标准：功率≤1.0×且安全锁启用', 'Reference: power ≤1.0× and safety enabled'], ['bypass', '恢复片段：safety=false', 'Recovered fragment: safety=false'], ['boost', '恢复片段：power=4.7×', 'Recovered fragment: power=4.7×'], ['ui', '恢复片段：界面配色更新', 'Recovered fragment: interface palette update']], ['bypass', 'boost'], '选择会改变安全锁和致死功率的两项差异；界面变化不是致伤机制。', 'Select the two changes affecting safety and lethal power; interface changes are not an injury mechanism.'),
    hidden: hidden('e', 6, ['e_02', 'e_06'], 'zone_alley', '后巷离线账本节点', 'Alley offline-ledger node', '收货编号与勒索消息匹配后，可解开离线账本的封签。', 'Matching delivery numbers and demand messages allows the ledger seal to be checked.', '账本将“S”的改装芯片款项与Sable个人签章对应，并附有针对Riku付款要求的过载部署备注，独立印证勒索与操作关联。', 'The ledger matches “S” chip payments to Sable’s personal signature and includes an overload-deployment note tied to Riku’s demands, independently connecting blackmail and the operation.'),
  },
  Lvl_04: {
    targets: [
      ['f_01', 'zone_cryo_chamber', 'sample', '防寒服顶部霜裂纹', 'Upper frost fractures on the cold-weather suit', '霜裂纹呈窄扇形，不像全身均匀受冻。', 'The frost forms a narrow fan rather than uniform freezing.'],
      ['f_02', 'zone_control_room', 'terminal', '温控日志存储盘', 'Climate-log storage disk', '一段温度噪声曲线与此前十一分钟完全重合。', 'A temperature-noise curve exactly repeats the preceding eleven minutes.'],
      ['f_03', 'zone_cryo_chamber', 'device', '顶部维护口D-4接口', 'D-4 socket at the upper service hatch', '接口有新鲜微型履带磨屑，设备号可以追溯。', 'Fresh miniature track debris surrounds the socket; its device ID is traceable.'],
      ['f_04', 'zone_control_room', 'document', '远程唤醒授权记录', 'Remote-wake authorization record', '管理员令牌出现在非例行维护时段。', 'An administrator token appears outside routine maintenance hours.'],
      ['f_05', 'zone_archive_lab', 'document', '模型外传交易草案', 'Model-export transaction draft', '未发送合同附有整套极地模型清单。', 'An unsent contract includes a complete polar-model inventory.'],
      ['f_06', 'zone_maintenance', 'terminal', '机库风机连续影像', 'Continuous hangar fan footage', '暴风雪使画面模糊，帧号与独立风机转速仍可比对。', 'Snow blurs the image, but frame numbers and independent fan speed can still be compared.'],
      ['f_07', 'zone_maintenance', 'sample', '液氮旁路阀扳手痕', 'Wrench marks on the nitrogen bypass', '新鲜压痕间距非常规则，阀旁有少量结晶。', 'Fresh impressions are regularly spaced; a little crystal residue remains beside the valve.'],
      ['f_08', 'zone_archive_lab', 'document', 'Noor 的黎明审计预约', 'Noor’s dawn audit appointment', '预约注明携带主管账户材料，附件未公开。', 'The appointment names supervisor-account materials; its attachment was not public.'],
    ],
    npc_zones: { npc_01: 'zone_control_room', npc_02: 'zone_maintenance', npc_03: 'zone_archive_lab' },
    initial_statements: {
      npc_01: text('风雪造成连锁故障。我安排的都是应急维护。', 'The storm caused cascading faults. Everything I arranged was emergency maintenance.'),
      npc_02: text('我和 Noor 吵过，但我在机库修风机，镜头没停。', 'I argued with Noor, but was repairing the hangar fan and its camera kept running.'),
      npc_03: text('她预约的是一场模型外传审计，不是设备检查。', 'She booked an audit of model exports, not an equipment inspection.'),
    },
    clue_overrides: {},
    testimonies: {
      npc_01: [
        stage(['f_04', 'f_02'], '03:11令牌与重复温控数据', 'The 03:11 token and repeated climate data', '我唤醒了 D-4。日志覆盖是为了稳定显示，暴风雪时我不希望操作员恐慌。', 'I woke D-4. The log replacement stabilized the display; I did not want operators to panic in the storm.', '授权确实由我发出，我会保留原缓存。你们可以核对是不是应急维修所需。', 'I issued the authorization and will preserve the cache. Verify whether emergency repair required it.', '令牌在我手中。但不能从账户跳过无人机路线和阀门动作。', 'I held the token. You cannot jump from an account to guilt without the drone route and valve action.'),
        stage(['f_05', 'f_08'], '黎明审计与模型出售', 'The dawn audit and model sale', '我知道 Noor 要查外传。交易草案由我审批，她打算交给气候署。', 'I knew Noor intended to audit the export. I approved the draft; she planned to send it to the Climate Authority.', '她认为出售会损害公共预测。我与她争论过，那份预约我提前看到了。', 'She thought a sale would harm public forecasting. We argued, and I saw her appointment in advance.', '承认交易审批不是承认致死。请按时间证明维护为何发生在审计前。', 'Admitting approval is not admitting the killing. Establish why maintenance occurred before the audit.'),
      ],
      npc_02: [
        stage(['f_06'], '机库影像能否覆盖致伤窗口', 'Does hangar footage cover the injury window?', '02:50到03:35我一直在风机旁。画面中的手和工具都是我的，没有中断。', 'I stayed by the fan from 02:50 to 03:35. The hands and tools in the continuous feed are mine.', '你可以拿转速曲线校验视频。我和 Noor 吵的是维修预算，不是要伤害她。', 'Use fan speed to verify the footage. My argument with Noor concerned repair funding, not harming her.', '争执不是位置证据。把独立风机曲线和帧号对上，再来指控我。', 'An argument is not location evidence. Match independent fan data and frames before accusing me.'),
        stage(['f_03', 'f_07'], 'D-4能否穿隧道开启液氮阀', 'Could D-4 traverse the tunnel and open the nitrogen valve?', '这种履带和扭矩就是 D-4。它能从控制室坞站进隧道，再到顶部维护口，不需要人到冷库。', 'Those tracks and torque belong to D-4. It can leave the control dock, cross the tunnel, and reach the upper hatch without a person entering the cold room.', '我可以标出维护路线。液氮喷射方向与这条路末端一致，但操作令牌不由我保管。', 'I can mark the service route. The jet direction matches its end, but I do not hold the operating token.', '别因为我是工程师就认定我开了阀。工具痕能指向设备，授权记录才指向控制者。', 'Being an engineer does not mean I opened the valve. Tool marks identify a device; authorization identifies its controller.'),
      ],
      npc_03: [
        stage(['f_08'], 'Noor约定核查的事项', 'What did Noor arrange to audit?', '她要提交主管账户的外传记录，约定清晨见面。她没有请我检查温控。', 'She planned to submit exports from the supervisor account at dawn. She did not ask me to inspect climate control.', '我带了预约原件。她担心模型被私下出售，所以坚持让外部机构留一份记录。', 'I brought the original booking. Fearing a private sale, she insisted an outside institution retain a record.', '预约在事发前存在。不要把事后叙述代替这个时间戳。', 'The appointment existed before the incident. Do not replace that timestamp with a later account.'),
        stage(['f_05', 'f_04'], '交易草案的权限归属', 'Who controlled the transaction draft?', '草案卖的是公有预测模型，审批账户与远程维护令牌属于同一主管权限。', 'The draft sells the public prediction model; its approval and remote-maintenance token belong to the same supervisor authority.', '这说明收益冲突，需要封存交易和维护两套日志一起核查。', 'That establishes a conflict of interest. Preserve and cross-check both transaction and maintenance logs.', '我的职责是审计，不是猜凶手；账户重合必须与现场喷射机制一起判断。', 'My role is auditing, not guessing the killer. Account overlap must be assessed with the physical jet mechanism.'),
      ],
    },
    relations: [
      relation('f_01', 'f_03', 'supports', 'p_directed_jet', '定向霜裂与顶部无人机残留对应', 'Directed frost matches drone residue at the upper hatch'),
      relation('f_03', 'f_07', 'supports', 'p_drone_valve', 'D-4履带与旁路阀扭矩形成维护路径', 'D-4 tracks and bypass torque establish the service path'),
      relation('f_04', 'f_02', 'precedes', 'p_wake_before_cover', '03:11唤醒先于03:12日志覆盖', 'The 03:11 wake precedes the 03:12 log cover'),
      relation('f_05', 'f_08', 'supports', 'p_audit_motive', '交易与黎明审计形成被揭露风险', 'The sale and dawn audit establish a risk of exposure'),
      relation('f_06', 'f_01', 'contradicts', 'p_exclude_mira', '连续机库记录排除工程师到场喷射', 'Continuous hangar records exclude an on-scene attack by the engineer', true),
      relation('f_01', 'f_07', 'contradicts', 'p_exclude_weather', '定向液氮与新阀痕排除均匀天气降温', 'A directed jet and fresh valve marks exclude uniform weather cooling', true),
      relation('f_secret_99', 'f_04', 'supports', 'p_independent_drone_authority', 'D-4独立执行回执与Elias令牌的远程唤醒授权相符', 'D-4’s independent execution receipts match the remote wake authorization under Elias’s token'),
    ],
    report: {
      conclusions: [option('elias', 'Elias 远程实施袭击并覆盖记录', 'Elias remotely attacked Noor and covered the records'), option('mira', 'Mira 在争执后亲自到冷库袭击', 'Mira entered the cold room after the argument and attacked'), option('accident', '暴风雪单独造成所有致伤与日志变化', 'The blizzard alone caused all injuries and log changes')],
      methods: [option('drone_nitrogen', 'D-4经维护隧道开启液氮旁路定向喷射', 'D-4 crossed the service tunnel and opened the nitrogen bypass for a directed jet'), option('cold_exposure', '普通制冷器失控，持续低温使防寒服整体结霜', 'Ordinary refrigeration failed; sustained cold froze the entire protective suit'), option('manual_valve', '有人徒步进入冷库，手动开启液氮顶部阀门', 'Someone entered the cold room on foot and manually opened its nitrogen valve')],
      motives: [option('model_sale', '阻止审计揭露极地模型私售', 'Stop the audit exposing the private polar-model sale'), option('repair_dispute', '报复维修预算被拒与工程师职责受到指责', 'Retaliate over a denied repair budget and criticism of the engineer’s duties'), option('audit_sabotage', '外部审计员为取得模型故意破坏冷库', 'An outside auditor sabotaged the cold room to obtain the model')],
      timelines: [option('dawn_audit', '03:11唤醒、03:12–03:23覆盖、赶在黎明审计前', 'Wake at 03:11, cover 03:12–03:23, before the dawn audit'), option('after_audit', '03:12先因风雪停机，黎明审计结束后才唤醒无人机', 'Storm shutdown at 03:12, followed by drone activation only after the dawn audit'), option('hangar_gap', '03:11工程师离开机库，03:12入冷库手动开阀', 'Leave the hangar at 03:11, enter the cold room at 03:12, then open the valve')],
      answers: { conclusion_id: 'elias', method_id: 'drone_nitrogen', motive_id: 'model_sale', timeline_id: 'dawn_audit' },
      support: { opportunity: ['f_04'], method: ['f_01', 'f_03', 'f_07'], motive: ['f_05', 'f_08'], timeline: ['f_02', 'f_04'] },
      wrong_outcomes: { mira: text('争执归因忽略连续机库影像，维护团队拒绝合作并降低信誉；可用保全记录修正报告。', 'Blaming the argument ignores continuous hangar footage. Maintenance staff withdraw cooperation and reputation drops; preserved records allow revision.'), accident: text('天气结论不能解释新工具痕与管理员覆盖，气候署要求重审，混乱上升。', 'Weather cannot explain fresh tool marks and administrator overwrite. The Climate Authority requests review and confusion rises.') },
    },
    puzzle: puzzle('zero_drone', 'route', 'D-4维护路线重建', 'D-4 maintenance-route reconstruction', ['f_01', 'f_03', 'f_07'], [['dock', '控制室D-4坞站', 'Control-room D-4 dock'], ['tunnel', '维护隧道履带段', 'Tracked maintenance-tunnel section'], ['valve', '液氮旁路阀', 'Nitrogen bypass valve'], ['hatch', '冷库顶部维护口', 'Cold-room upper service hatch']], ['dock', 'tunnel', 'valve', 'hatch'], '按履带磨屑、扭矩与喷射方向连接路线；无需人进入冷库。', 'Connect tracks, torque, and jet direction into a route; a person need not enter the cold room.'),
    hidden: hidden('f', 7, ['f_03', 'f_04'], 'zone_control_room', 'D-4未覆盖路线缓存', 'Uncovered D-4 route cache', '设备序号和管理员签章核对后，可恢复独立缓存。', 'Device serial and administrator-signature checks unlock an independent cache.', 'D-4独立缓存保留Elias令牌签署的路线与喷射执行回执，时间对应温控被覆盖段，直接印证控制者与执行链。', 'D-4’s independent cache preserves Elias-token route signatures and jet execution receipts, matching the overwritten climate interval and corroborating controller and execution.'),
  },
  Lvl_05: {
    targets: [
      ['g_01', 'zone_docking_hub', 'device', '救生舱外部诊断口', 'Lifeboat external diagnostic port', '机械保险完好，阀门位置却显示已泄压。', 'The mechanical safety is intact, but the valve position indicates depressurization.'],
      ['g_02', 'zone_docking_hub', 'terminal', '船长放行签名终端', 'Captain’s release-signature terminal', '签名显示有效，回执延迟却与船长其他命令不同。', 'The signature appears valid, but receipt latency differs from the captain’s other orders.'],
      ['g_03', 'zone_cargo_vault', 'sample', '空泊位货柜粉尘', 'Container dust at the empty berth', '申报医疗冷却剂的托盘边缘有发光微粒。', 'Glowing particles mark a pallet declared as medical coolant.'],
      ['g_04', 'zone_tether_control', 'document', '主控诊断授权账', 'Master-control diagnostic authorization ledger', '事故前报警转发被关闭，原因栏空白。', 'Alarm forwarding was disabled before the incident; its reason field is blank.'],
      ['g_05', 'zone_tether_control', 'device', '六路张力校准器', 'Six-channel tension calibrator', '六个独立传感器同时保留连续校准轨迹。', 'Six independent sensors retain continuous calibration traces.'],
      ['g_06', 'zone_cargo_vault', 'document', '未上链运输航单', 'Unregistered transport manifest', '腕端航单与申报系统的收货人不同。', 'The wrist-terminal manifest names a different consignee from the declaration system.'],
      ['g_07', 'zone_observation_ring', 'terminal', '星背景监控阵列', 'Star-field surveillance array', '星点在固定间隔突然回到旧位置。', 'Stars abruptly return to earlier positions at a fixed interval.'],
      ['g_08', 'zone_docking_hub', 'document', 'Jonah 的残缺信标', 'Jonah’s partial beacon', '信标没有完整句子，但签章和触发来源仍在。', 'The beacon lacks complete sentences, but its signature and trigger source remain.'],
    ],
    npc_zones: { npc_01: 'zone_tether_control', npc_02: 'zone_observation_ring', npc_03: 'zone_cargo_vault' },
    initial_statements: {
      npc_01: text('船长违反救生舱规程。先保障电梯运行，再谈责任。', 'The captain violated lifeboat procedure. Keep the elevator running before discussing blame.'),
      npc_02: text('六个传感器都记着我的校准。诊断阀不是舱内自己开的。', 'Six sensors recorded my calibration. The diagnostic valve did not open itself from inside.'),
      npc_03: text('我只运输密封货柜，放行不是我能签的。', 'I transport sealed containers; I cannot sign their release.'),
    },
    clue_overrides: {},
    testimonies: {
      npc_01: [
        stage(['g_04', 'g_01'], '为何打开诊断口并关闭报警', 'Why open diagnostics and disable alarms?', '我以主控账户开过诊断。报警转发会干扰雷暴避险，这是我给出的理由。', 'I opened diagnostics through the master account. Interference with storm safety was the reason I gave for disabling forwarding.', '指令是我的，我愿意交出授权表；不过要分清诊断开启与阀门执行。', 'The order was mine. I will provide the authorization form; distinguish opening diagnostics from executing a valve command.', '别把安全条例跳过去。你要证明哪一条指令实际打开了阀。', 'Do not bypass safety procedure. Show which command actually opened the valve.'),
        stage(['g_06', 'g_08'], '私人公司航单与船长警告', 'Private-company manifest and the captain’s warning', '航单上的公司归我管理。Jonah 对货物有异议，我没同意他停掉整条路线。', 'I manage the company on the manifest. Jonah disputed the cargo; I refused to suspend the entire route.', '他提出的异议影响了我的合同。我知道他准备公开货物性质。', 'His objection affected my contract. I knew he intended to reveal what the cargo was.', '信标只是他的一句话，货物责任和死亡仍要靠权限与阀门记录连接。', 'The beacon is his statement; cargo liability and death must still be joined through access and valve records.'),
      ],
      npc_02: [
        stage(['g_05'], '独立校准是否连续', 'Was the independent calibration continuous?', '六路传感器一直在我手动调节下，事故期间我没有离开缆索台。', 'All six sensors remained under my manual calibration; I did not leave the tether station during the incident.', '你可以用不同厂商的时钟比对，不必只信我的终端。', 'Compare clocks from different manufacturers instead of trusting only my terminal.', '我的位置有六个来源，不是一段可以循环的监控。请逐个核对。', 'My location has six sources, not one loopable video. Check each one.'),
        stage(['g_07', 'g_02'], '视差循环能否影响放行时间', 'Can parallax loops distort release timing?', '星背景应连续移动。每18秒重复说明监控不能当原始时间轴；签名回执的延迟也不正常。', 'The star field should move continuously. An 18-second repeat means the video is not an original timeline; signature latency is abnormal too.', '用传感器时钟对齐主控回执，别按循环画面里的货柜位置排序。', 'Align master receipts with sensor clocks instead of ordering by container positions in looped footage.', '如果你只看画面，会把货柜移动重复算成两次。以原始回执为准。', 'Using only the feed will count a container movement twice. Use original receipts.'),
      ],
      npc_03: [
        stage(['g_03', 'g_06'], '冷却剂申报与同位素残留', 'Coolant declaration and isotope residue', '我知道货不是冷却剂。申报是客户要求，我接受了；但救生舱诊断网不归我控制。', 'I knew it was not coolant. The client requested that declaration and I accepted, but I do not control the lifeboat diagnostic network.', '我可以交出真实航单和交接账号。我的运输违法责任不能替代阀门操作证据。', 'I can provide the true manifest and handoff account. My illegal transport cannot substitute for evidence of operating the valve.', '抓走私我认，但我没有主控账户。请查发出致死命令的权限。', 'I accept smuggling charges, but I lack a master account. Check the authority issuing the lethal command.'),
        stage(['g_02', 'g_08'], '货柜放行与紧急信标', 'Container release and the emergency beacon', '船长还活着时反对放行。我后来收到已签指令才搬箱子，没检查签名延迟。', 'The captain opposed release while alive. I moved the box after receiving a signed order and did not check its latency.', '我保存了收到指令的原始回执，能区分搬运时间和签发时间。', 'I kept the original receipt, which separates transport time from issue time.', '我隐瞒了货物，不是签名来源。原始回执就在这里，别让运输责任掩盖伪造权限。', 'I hid the cargo, not the signature source. Here is the receipt; transport liability must not hide forged authority.'),
      ],
    },
    relations: [
      relation('g_01', 'g_04', 'supports', 'p_diagnostic_kill', '定向泄压与主控诊断授权连接', 'Directed decompression connects to master diagnostic access'),
      relation('g_02', 'g_04', 'supports', 'p_forged_release', '异常船长签名与复制权限相符', 'The abnormal captain signature matches copied master authority'),
      relation('g_03', 'g_06', 'supports', 'p_weapon_route', '武器残留与真实航单揭示货运性质', 'Weapon residue and the true manifest reveal the cargo route'),
      relation('g_08', 'g_02', 'supports', 'p_warning_matches_signature', '船长警告与异常签名共同支持放行记录需要复核', 'The captain’s warning and abnormal signature jointly support rechecking the release record'),
      relation('g_05', 'g_01', 'contradicts', 'p_exclude_yara', '独立校准排除工程师到场操作', 'Independent calibration excludes an on-scene operation by the engineer', true),
      relation('g_06', 'g_04', 'contradicts', 'p_exclude_courier', '运输航单并不授予救生舱主控权限', 'A transport manifest does not grant lifeboat master access', true),
      relation('g_secret_99', 'g_06', 'supports', 'p_independent_cargo_recipient', '独立货柜账与未上链航单共同确认Rook私人公司的收货和收益联系', 'The independent cargo ledger and off-chain manifest jointly confirm the cargo recipient and financial connection to Rook’s company'),
    ],
    report: {
      conclusions: [option('rook', 'Rook 用主控诊断致死，并伪造船长货柜放行', 'Rook used master diagnostics to kill Jonah and forged the captain’s cargo release'), option('ivo', 'Ivo 在搬运货物时复制船长签名并操作泄压阀', 'Ivo copied the captain’s signature and operated the release valve during transport'), option('yara', 'Yara 用缆索校准终端开启泄压阀并覆盖监控', 'Yara used the calibration terminal to open the release valve and cover the feed')],
      methods: [option('depressurization', '主控复制授权并远程开启诊断泄压阀', 'Master authority was copied and remotely opened the diagnostic release valve'), option('manual_release', '船长在舱内手动解除机械保险，压力失控致死', 'The captain released the mechanical safety inside, causing fatal decompression'), option('cargo_poison', '武器级货柜粉尘泄漏进入救生舱使船长中毒', 'Weapons-grade cargo dust leaked into the lifeboat and poisoned the captain')],
      motives: [option('weapons_route', '保护被船长发现的军用货物走私路线', 'Protect the military-cargo route uncovered by the captain'), option('calibration_rivalry', '报复校准工作上的职责争执', 'Retaliate over calibration responsibilities'), option('captain_escape', '船长为私自逃离电梯伪造事故', 'The captain staged an accident to escape the elevator')],
      timelines: [option('camera_loop', '关闭报警、诊断泄压、伪造放行，并以18秒循环掩护转移', 'Disable alarms, decompress, forge release, and hide transfer with an 18-second loop'), option('release_first', '船长正常放行后自行泄压，监控一直连续', 'The captain normally released cargo then decompressed himself; the feed was continuous'), option('calibration_gap', '关闭校准、工程师到泊位开阀，恢复校准后转移货柜', 'The engineer stopped calibration, opened the valve at the berth, then resumed it before transfer')],
      answers: { conclusion_id: 'rook', method_id: 'depressurization', motive_id: 'weapons_route', timeline_id: 'camera_loop' },
      support: { opportunity: ['g_04'], method: ['g_01', 'g_02'], motive: ['g_03', 'g_06', 'g_08'], timeline: ['g_04', 'g_07'] },
      wrong_outcomes: { ivo: text('运输违法不足以证明诊断谋杀，货运协作暂停并扣减信誉；请保留航单并追查命令源。', 'Illegal transport does not prove diagnostic murder. Cargo cooperation pauses and reputation falls; preserve the manifest and trace the command source.'), yara: text('对工程师的指控与六路传感器冲突，电梯进入安全复核，混乱增加；独立校准仍可复查。', 'The accusation conflicts with six sensors. The elevator enters a safety review and confusion rises; independent calibration remains available.') },
    },
    puzzle: puzzle('sky_parallax', 'sequence', '监控视差与循环校验', 'Camera parallax and loop check', ['g_02', 'g_04', 'g_07', 'g_08'], [['warn', '独立信标：反对货柜放行', 'Independent beacon: oppose cargo release'], ['diagnose', '主控回执：诊断与报警关闭', 'Master receipt: diagnostics and alarms disabled'], ['release', '高延迟复制签名：货柜放行', 'High-latency copied signature: cargo release'], ['move', '真实航单回执：货柜转移', 'True manifest receipt: cargo transfer']], ['warn', 'diagnose', 'release', 'move'], '忽略18秒循环画面的重复，用签章回执排列原始事件。', 'Ignore repeats in the 18-second loop and order original events using signed receipts.'),
    hidden: hidden('g', 8, ['g_03', 'g_06'], 'zone_cargo_vault', '货柜离线托管账', 'Offline container-custody ledger', '同位素编号和航单交接号匹配后，托管签名可读。', 'Matching isotope and handoff numbers makes the custody signature readable.', '独立货柜账保留Rook私人公司的军用货物托管与费用记录，并对应其主控授权，交叉印证运输收益与谋杀动机。', 'The independent ledger records military cargo custody and payments for Rook’s company and matches his master authorization, corroborating transport profit and murder motive.'),
  },
  Lvl_06: {
    targets: [
      ['h_01', 'zone_auction_floor', 'sample', 'Mara 的银纤维手套', 'Mara’s silver-fiber glove', '手套内侧有细丝，与外侧展示材料不同。', 'Fine threads inside the glove differ from the displayed material outside.'],
      ['h_02', 'zone_auction_floor', 'device', '展台底座维护接口', 'Pedestal maintenance socket', '上方门锁未动，底座状态灯却曾进入维护模式。', 'The upper door lock did not move, but the base indicator entered maintenance mode.'],
      ['h_03', 'zone_restoration_lab', 'document', '生物签名维护授权', 'Biometric maintenance authorization', '维护授权写着湿度校准，执行设备不是加湿器。', 'The authorization names humidity calibration, but the executing device is not a humidifier.'],
      ['h_04', 'zone_restoration_lab', 'sample', 'R-41树脂参考盒', 'R-41 resin reference box', '参考块与展品边缘的透明物质外观接近。', 'The reference block resembles the clear material at the exhibit edge.'],
      ['h_05', 'zone_auction_mesh', 'document', '匿名竞价结算树', 'Anonymous auction settlement tree', '多层账户之后仍有可核验的资金托管签章。', 'Verifiable custody signatures remain beyond the layers of accounts.'],
      ['h_06', 'zone_loading_spire', 'terminal', 'Juno 巡逻眼镜原始帧', 'Original frames from Juno’s patrol glasses', '外环路线连续记录，设备独立保存时间戳。', 'The outer-ring route is continuously recorded with independent timestamps.'],
      ['h_07', 'zone_loading_spire', 'sample', '空运冷箱的量子标记', 'Quantum marker on the flight case', '冷箱封条未破，箱内标记频率与展厅说明有差异。', 'The case seal is intact, but its internal marker differs from the exhibit label.'],
      ['h_08', 'zone_auction_floor', 'document', '鉴定台上的披露备忘', 'Disclosure memo on the appraisal desk', '备忘圈出了修复批次，次日预约已同步外部机构。', 'A restoration batch is circled; the next-day appointment was synced to an outside agency.'],
    ],
    npc_zones: { npc_01: 'zone_restoration_lab', npc_02: 'zone_auction_mesh', npc_03: 'zone_loading_spire' },
    initial_statements: {
      npc_01: text('只是例行湿度校准。展柜的门从没有打开。', 'It was routine humidity calibration. The display door never opened.'),
      npc_02: text('外环巡逻记录在这里。底座维护层不归安保控制。', 'The outer-ring patrol record is here. Security does not control the base maintenance layer.'),
      npc_03: text('冷箱由馆内装封，我拿到的是放行后的密封箱。', 'Museum staff packed and sealed the case. I received a sealed box after release.'),
    },
    clue_overrides: {},
    testimonies: {
      npc_01: [
        stage(['h_02', 'h_03'], '湿度校准为何授权底座机械层', 'Why did humidity calibration authorize the base machinery?', '生物签名是我的。底座维护有交换机构，门没开并不代表内部什么都没动。', 'The biometric signature is mine. Base maintenance includes an exchange mechanism; a closed door does not mean nothing moved inside.', '我可以给你维护图。之前只说门没有打开，确实省略了底座的功能。', 'I can give you the service diagram. Saying only that the door stayed shut did omit the base’s function.', '承认底座功能不等于承认所有操作。请保全四十秒窗口的执行记录。', 'Admitting the base’s function does not admit every action. Preserve execution records from the forty-second window.'),
        stage(['h_04', 'h_05'], 'R-41与离岸基金是否有联系', 'Is R-41 connected to the offshore fund?', 'R-41由我的部门登记，基金也由我控制。Mara要披露复制源，会冻结整场拍卖。', 'My department registered R-41 and I control the fund. Mara’s disclosure of the replica source would freeze the entire auction.', '她发现的问题不是普通修复分歧，我知道披露会影响我的收入。', 'What she found was not an ordinary restoration disagreement. I knew disclosure would affect my income.', '材料登记和资金流都是真的，但你还需证明手套里的纤维如何被放进去。', 'The material registration and money trail are real, but still prove how fibers entered the glove.'),
      ],
      npc_02: [
        stage(['h_06'], '巡逻记录是否覆盖维护时段', 'Does the patrol record cover maintenance?', '眼镜的原始帧连续覆盖00:07。我在外环，底座维护入口没有使用我的权限。', 'Original glasses frames continuously cover 00:07. I was on the outer ring, and the base entrance did not use my access.', '请保留眼镜的独立时钟，我不希望管理层把这份记录也当成普通监控。', 'Preserve the glasses’ independent clock. I do not want management treating it as ordinary surveillance.', '我负责门锁，但锁没有开。我无法从安保台执行底座维护。', 'I control the door lock, but it stayed shut. Security cannot execute base maintenance.'),
        stage(['h_03', 'h_08'], '披露预约后维护权限如何变化', 'How did maintenance access change after the disclosure booking?', 'Mara提出保全后，我要求停维护。修复主管的生物授权仍绕过安保审批。', 'After Mara requested preservation, I asked for maintenance to stop. The restoration chief’s biometric authority still bypassed security approval.', '我留了停维护请求，能说明安保没有同意这次窗口。', 'I kept the stop-maintenance request; it shows security did not approve that window.', '别把底座的权限划给我。签名和部门边界都有记录。', 'Do not assign base authority to me. The signature and departmental boundary are recorded.'),
      ],
      npc_03: [
        stage(['h_07'], '冷箱真品标记与馆内封条', 'The original’s marker and museum seal', '我知道货没正常申报。箱子在馆内就封好了，放行单由修复部门给我。', 'I knew the cargo was undeclared. The case was sealed inside the museum and the restoration department supplied the release.', '我愿意提供装封和交接回执。运输违法我会承担，但我没有打开过手套或展台。', 'I will provide sealing and handoff receipts. I accept transport liability, but never opened the glove or pedestal.', '标记证明我运走了真品，不证明我控制了馆内机械臂。把两件事分开。', 'The marker proves I carried the original, not that I controlled the museum arm. Separate those facts.'),
        stage(['h_05', 'h_03'], '运输付款与生物签名', 'Transport payment and biometric signature', '款项来自那个基金，我的费用只覆盖运输。生物签名不是我能复制的运输证。', 'The fund paid me only for transport. The biometric signature is not a transport credential I can copy.', '我会交出费用单，让你们分清拍卖回款与运输佣金。', 'I will provide the invoice so you can separate auction returns from my transport commission.', '你可以追究我非法运输，但毒纤维和维护授权仍得查馆内来源。', 'Charge me for illegal transport, but trace the toxic fibers and maintenance authorization inside the museum.'),
      ],
    },
    relations: [
      relation('h_01', 'h_04', 'supports', 'p_restoration_source', '手套纤维与修复材料形成来源联系', 'Glove fibers and restoration material establish a source connection'),
      relation('h_02', 'h_03', 'supports', 'p_base_access', '未开门的展台由生物授权开启维护层', 'Biometric authorization opened base maintenance without the display door'),
      relation('h_03', 'h_02', 'precedes', 'p_authorization_before_maintenance', '生物签名授权先于00:07展台底座维护模式执行', 'Biometric authorization precedes execution of base maintenance mode at 00:07'),
      relation('h_04', 'h_02', 'precedes', 'p_resin_before_maintenance', '三周前树脂登记先于00:07展台底座维护', 'The resin registration three weeks earlier precedes base maintenance at 00:07'),
      relation('h_04', 'h_08', 'supports', 'p_disclosure_risk', '复制材料与披露备忘形成揭露风险', 'Replica material and the disclosure memo establish exposure risk'),
      relation('h_05', 'h_07', 'supports', 'p_original_sale', '资金回流与真品出运相互印证', 'Returning funds and transport of the original corroborate each other'),
      relation('h_06', 'h_03', 'contradicts', 'p_exclude_juno', '连续巡逻排除安保本人维护授权', 'Continuous patrol excludes personal maintenance authorization by security', true),
      relation('h_07', 'h_03', 'contradicts', 'p_exclude_transporter', '封箱搬运不等于掌握底座生物权限', 'Moving a sealed case does not confer base biometric authority', true),
      relation('h_secret_99', 'h_03', 'supports', 'p_independent_biometric_execution', '机械臂独立缓存记录Tessa签名下的交换动作，印证维护授权实际执行', 'The arm’s independent cache records the exchange under Tessa’s signature, corroborating execution of the maintenance authorization'),
    ],
    report: {
      conclusions: [option('tessa', 'Tessa 授权底座调包并向手套放置毒纤维', 'Tessa authorized the base swap and placed toxic fibers inside Mara’s glove'), option('pavel', 'Pavel 在装货前进入底座调包并污染手套', 'Pavel entered the base, swapped the work, and contaminated the glove before loading'), option('juno', 'Juno 借巡逻进入维护层并放置毒纤维', 'Juno used her patrol to enter maintenance and place toxic fibers inside the glove')],
      methods: [option('pedestal_poison', '维护机械臂调包并放置体温激活毒纤维', 'Maintenance machinery swapped the work and placed heat-activated toxic fibers'), option('drink_poison', '拍卖酒水中的毒物被饮用，手套纤维并非致死来源', 'Poison consumed in auction drinks caused death; glove fibers were not its source'), option('open_door_swap', '用正门权限徒手调包，在鉴定员取样时施加毒物', 'Use door access to swap by hand and apply poison while the appraiser sampled it')],
      motives: [option('forgery_sale', '隐藏复制源并从真品匿名出售获利', 'Hide the replica source and profit from an anonymous original sale'), option('security_revenge', '安保因巡逻纪律纠纷报复鉴定员', 'Retaliate against the appraiser over security patrol discipline and disputed duties'), option('transport_fee', '掩盖运输商私自转售真品及未付运费争议', 'Hide the transporter’s unauthorized resale and an unpaid shipping-fee dispute')],
      timelines: [option('maintenance_window', '00:07四十秒维护窗，随后密封出运与结算', 'A forty-second maintenance window at 00:07, followed by sealed shipping and settlement'), option('after_loading', '00:07冷箱先出运，随后开启展柜正门并徒手调包', 'The case shipped at 00:07; only afterward was the display door opened for a hand swap'), option('patrol_gap', '00:07外环巡逻断档、安保入底座，随后恢复巡逻', 'An outer-ring gap at 00:07 allowed security into the base before patrol resumed')],
      answers: { conclusion_id: 'tessa', method_id: 'pedestal_poison', motive_id: 'forgery_sale', timeline_id: 'maintenance_window' },
      support: { opportunity: ['h_02', 'h_03'], method: ['h_01', 'h_02'], motive: ['h_04', 'h_05', 'h_08'], timeline: ['h_02', 'h_07'] },
      wrong_outcomes: { pavel: text('以运输等同投毒使跨境货运方中止协助，信誉下降；封箱与馆内权限仍可复查。', 'Equating transport with poisoning ends cross-border cargo cooperation and lowers reputation; case seals and museum access remain verifiable.'), juno: text('错误安保指控违背连续巡逻证据，馆方记录协作暂停，混乱增加。', 'The security accusation contradicts continuous patrol evidence. Museum record cooperation pauses and confusion rises.') },
    },
    puzzle: puzzle('auction_resin', 'compare', '树脂谱与展品标记比对', 'Resin spectrum and artifact-marker comparison', ['h_04', 'h_07', 'h_08'], [['resin', '展厅复制品：树脂峰与R-41重合', 'Display replica: resin peaks match R-41'], ['marker', '冷箱真品：量子标记与原始登记重合', 'Case original: quantum marker matches original registry'], ['label', '展牌文字：仍标记“真品”', 'Exhibit text: still says “original”'], ['seal', '冷箱封条：运输后未破', 'Case seal: intact after transport']], ['resin', 'marker'], '选择两项直接区分展厅复制品和箱中真品的检测；标签不是检测结果。', 'Select two direct tests distinguishing the display replica and cased original; a label is not a test result.'),
    hidden: hidden('h', 6, ['h_01', 'h_03'], 'zone_restoration_lab', '展台机械臂独立回执', 'Independent pedestal-arm receipt', '纤维来源和签名校验后，机械臂回执可恢复。', 'Checking fiber source and signature allows the arm receipt to be recovered.', '机械臂安全缓存记录Tessa生物签名下的交换动作与手套接触路径，回执未经过展厅主机，独立印证调包和投毒链。', 'The arm’s safety cache records exchange and glove-contact paths under Tessa’s biometric signature. Independent of the display host, it corroborates the swap and poisoning.'),
  },
  Lvl_07: {
    targets: [
      ['i_01', 'zone_moon_pool', 'device', '潜水钟压力阀诊断口', 'Diving-bell pressure-valve diagnostics', '手动保险未破，压力指针却跨过安全标记。', 'The manual safety is intact, but pressure passed its limit.'],
      ['i_02', 'zone_sonar_array', 'sample', '求救音频原始片段', 'Original distress audio fragments', '相隔一段时间的呼吸声听起来完全相同。', 'Breaths separated in time sound exactly identical.'],
      ['i_03', 'zone_trench_link', 'document', '采样艇航行授权', 'Sampler navigation authorization', '目的地名称覆盖过一次，签章却保留在原始包里。', 'The destination name was overwritten once, but its signature remains in the original packet.'],
      ['i_04', 'zone_bio_lab', 'sample', '采样架荧光菌落', 'Fluorescent colony on the sample rack', '菌落颜色与公开培养目录不一致。', 'The colony color does not match the public culture catalog.'],
      ['i_05', 'zone_bio_lab', 'document', '未发送的审计上传包', 'Unsent audit upload packet', '上传包包含六次航行记录和受保护物种编号。', 'The upload contains six voyage records and protected-species IDs.'],
      ['i_06', 'zone_bio_lab', 'device', '减压医疗舱独立门锁', 'Independent decompression-clinic lock', '门锁和患者体征记录来自不同设备。', 'The door lock and patient vital records come from separate devices.'],
      ['i_07', 'zone_sonar_array', 'terminal', '维修机器人凭据轨迹', 'Repair-robot credential trail', '机器人擦除日志时，泵舱操作者没有离开本地台。', 'When the robot erased logs, the pump-bay operator stayed at the local station.'],
      ['i_08', 'zone_moon_pool', 'terminal', '保险草案版本台', 'Insurance-draft version console', '标题已写成设备疲劳，创建和提交时间却不同。', 'The title already says equipment fatigue, but creation and submission times differ.'],
    ],
    npc_zones: { npc_01: 'zone_trench_link', npc_02: 'zone_bio_lab', npc_03: 'zone_sonar_array' },
    initial_statements: {
      npc_01: text('极端水压会击穿设备。请优先稳定全站，事故报告已经准备。', 'Extreme pressure breaks equipment. Stabilize the station first; the accident report is ready.'),
      npc_02: text('Oren说过样本来自不许采集的地方。我需要先确认样本。', 'Oren said the samples came from a place where collection was forbidden. I need to verify them first.'),
      npc_03: text('我的机器人被别人借了权限，我当时在修泵，没离开本地台。', 'Someone used my robot credentials. I was fixing the pump and stayed at its local station.'),
    },
    clue_overrides: {},
    testimonies: {
      npc_01: [
        stage(['i_01', 'i_03'], '私有密钥为何出现在外联闸', 'Why was the private key at the trench uplink?', '航行密钥归我管理。我批准过离站采样，但压力命令不该只凭艇的航单判断。', 'I manage the navigation key and approved sampling departures, but judge the pressure command beyond the vessel manifest alone.', '我承认使用过私有航行授权。需要核对的是它与潜水钟远程会话是否相同。', 'I acknowledge private navigation authorization. Check whether it matches the bell’s remote session.', '全站紧急权限不等于每次使用都合法，你可以查签章，但不要跳过执行回执。', 'Emergency authority does not make every use legal. Check the signature, but also the execution receipt.'),
        stage(['i_05', 'i_08'], '检举包与提前创建的理赔报告', 'The disclosure packet and prewritten claim', '我提前准备了故障模板。Oren要上传六次采样记录，那会影响我们的外部合同。', 'I prepared a failure template in advance. Oren planned to upload six sampling records, which would affect our outside contract.', '他反对采样，我知道。他上传前我们争论过收益和保护区规定。', 'I knew he opposed collection. Before his upload we argued over income and protected-area rules.', '草案确实提前两小时创建，但我坚持那是应急预案；若认定预谋，请核对原始版本记录。', 'The draft was created two hours early, but I maintain it was contingency planning. Check original versions before calling it premeditation.'),
      ],
      npc_02: [
        stage(['i_06'], '医疗记录是否证明连续在场', 'Do medical records prove continuous presence?', '两名潜水员都在减压，门锁和体征连续记录我在医疗舱。离开会触发治疗警报。', 'Two divers were decompressing. Lock and vital records continuously place me in the clinic; leaving would trigger a treatment alert.', '请保护病人隐私，用匿名体征时间核对就够了。那段治疗没有中断。', 'Protect patient privacy; anonymous vital timestamps are enough. Treatment was uninterrupted.', '我不能同时操作远程闸又照看两个病人，独立记录可以说明。', 'I could not operate the remote gate while treating two patients; independent records demonstrate it.'),
        stage(['i_04', 'i_05'], '菌落来源与Oren的上传计划', 'Colony origin and Oren’s upload plan', '这是保护区热泉菌落。Oren准备揭露六次非法采样，买方做高价寿命研究。', 'These are protected vent colonies. Oren planned to expose six illegal collections; the buyer funds expensive longevity research.', '我以为只是争论，现在样本和包都在，应该让保护机构保存副本。', 'I thought it was merely an argument. With samples and packet preserved, the conservation agency should hold copies.', '医学上有价值不代表可以偷采。不要把合同行为归成普通设备事故。', 'Medical value does not permit theft from a reserve. Do not recast the contract issue as ordinary equipment failure.'),
      ],
      npc_03: [
        stage(['i_07'], '机器人擦记录时谁控制凭据', 'Who controlled credentials during the robot erase?', '九分钟远程会话不是我的本地登录。我在泵舱，机器人接了外联闸发来的令牌。', 'The nine-minute remote session was not my local login. I was in the pump bay; the robot accepted an uplink-issued token.', '我保存了泵舱工具回执，它能证明我没跟着机器人走。权限被盗用让我很内疚。', 'I kept pump-tool receipts proving I did not follow the robot. I feel guilty about the credential misuse.', '工具属于我，不代表远程命令也属于我。请对照令牌来源。', 'The tool is mine; that does not make the remote command mine. Compare token sources.'),
        stage(['i_02', 'i_01'], '循环求救与真正压力命令', 'Looped distress calls and the actual pressure command', '呼吸噪声每47秒完全重合，那是演练录音。真实增压在远程回执里，不能用声呐播音定死亡时刻。', 'The breath noise matches every 47 seconds; it is a drill recording. Actual pressure is in the remote receipt, so sonar playback cannot date death.', '拿原始演练对比，再用阀门回执重建时间线，这样不会把旧声音当活人。', 'Compare the original drill, then reconstruct the timeline from valve receipts; old sound will not be mistaken for a living person.', '循环不可能证明他一直活着。设备响应时间才是这次动作的时钟。', 'The loop cannot prove he remained alive. Device response time is the clock for this operation.'),
      ],
    },
    relations: [
      relation('i_01', 'i_03', 'supports', 'p_remote_authority', '远程压力会话与私有航行权限对应', 'The remote pressure session matches private navigation authority'),
      relation('i_02', 'i_07', 'supports', 'p_timeline_cover', '循环声纹与机器人抹除构成时间掩护', 'Looped voiceprint and robot erasure establish a timing cover'),
      relation('i_04', 'i_05', 'supports', 'p_sampling_exposure', '保护样本印证六次采样检举', 'Protected samples corroborate disclosure of six collections'),
      relation('i_08', 'i_01', 'precedes', 'p_claim_prepared', '故障理赔草案创建先于实际增压', 'The failure-claim draft predates actual pressure increase'),
      relation('i_02', 'i_08', 'precedes', 'p_drill_before_claim', '三日前演练的原始录音先于事故前两小时的保险草案', 'The original drill recording three days earlier precedes the insurance draft two hours before the incident'),
      relation('i_07', 'i_03', 'contradicts', 'p_exclude_sana', '本地修泵与盗用令牌排除机械师本人远程会话', 'Local pump repair and a stolen token exclude the mechanic from the remote session', true),
      relation('i_01', 'i_08', 'contradicts', 'p_exclude_natural_pressure', '绕过保险的远程指令不能由设备疲劳解释', 'A remote command bypassing safety cannot be explained by equipment fatigue', true),
      relation('i_secret_99', 'i_01', 'supports', 'p_independent_pressure_command', '黑匣子独立记录Neris密钥批准增压，印证潜水钟远程开阀命令', 'The black box independently records Neris’s key approving pressure increase, corroborating the bell’s remote valve command'),
    ],
    report: {
      conclusions: [option('neris', 'Neris实施远程增压并伪造事故时间', 'Neris remotely raised pressure and falsified accident timing'), option('sana', 'Sana 用本地机器人权限增压并擦除外联记录', 'Sana used her local robot credentials to raise pressure and erase uplink records'), option('accident', '深海压力自然击穿设备且无人操纵', 'Deep-sea pressure naturally broke equipment without human intervention')],
      methods: [option('remote_pressure', '外联闸远程增压，旧求救录音掩护并擦除日志', 'Uplink pressure increase, old distress playback, and log erasure'), option('manual_bell', '潜水钟内手动开阀，过高压力导致舱内人员死亡', 'A manual valve opening inside the bell raised pressure and killed its occupant'), option('sonar_weapon', '高功率声呐直接致伤，增压指令是事后安全测试', 'High-power sonar caused injury; the pressure command was a later safety test')],
      motives: [option('illegal_sampling', '阻止检举揭露保护区采样与高价买方', 'Stop disclosure of protected-area collection and its high-value buyer'), option('robot_blame', '机械师为躲维修失误主动袭击声呐工程师', 'The mechanic attacked to hide a repair error'), option('medical_profit', '医生为新增治疗收入破坏潜水钟', 'The doctor sabotaged the bell to gain treatment income')],
      timelines: [option('sonar_loop', '提前理赔草案、远程增压、循环旧声纹、盗用机器人擦日志', 'Prewritten claim, remote pressure, old voice loop, hijacked robot erasure'), option('distress_live', '每次求救均为实时，最后一段之后才发生故障', 'Every distress call was live; failure followed the final call'), option('pump_departure', '机械师离开泵舱、进入月池手动开阀，随后返回修泵', 'Leave the pump bay, open the valve manually at the moon pool, then resume repair')],
      answers: { conclusion_id: 'neris', method_id: 'remote_pressure', motive_id: 'illegal_sampling', timeline_id: 'sonar_loop' },
      support: { opportunity: ['i_03'], method: ['i_01', 'i_07'], motive: ['i_04', 'i_05'], timeline: ['i_02', 'i_08'] },
      wrong_outcomes: { sana: text('把机器人所有权等同远程命令来源引发维护抗议，信誉下降；本地回执仍可复核。', 'Equating robot ownership with command origin triggers a maintenance objection and lowers reputation; local receipts remain verifiable.'), accident: text('自然事故结论忽略保险绕过与提前草案，保护机构要求保全重审，混乱增加。', 'A natural-accident finding ignores safety bypass and the prewritten claim. Conservation investigators demand preservation and review; confusion rises.') },
    },
    puzzle: puzzle('deep_voice', 'compare', '求救声纹循环比对', 'Distress voiceprint loop comparison', ['i_02', 'i_07'], [['breath', '第1与第48秒：同一呼吸噪声波形', 'Seconds 1 and 48: identical breath-noise waveform'], ['drill', '三日前演练：相同背景阀响', 'Drill three days earlier: matching background valve noise'], ['volume', '扬声器音量：逐段变化', 'Speaker volume: changes between segments'], ['room', '当前房间：背景海流较大', 'Current room: louder background current']], ['breath', 'drill'], '选择能证明旧录音循环的两项原始声学比对；播放音量不足以证明录音时间。', 'Select the two original acoustic matches proving an old loop; playback volume cannot date a recording.'),
    hidden: hidden('i', 7, ['i_01', 'i_03'], 'zone_trench_link', '采样艇回收黑匣子', 'Recovered sampler black box', '阀门会话和航行签章匹配后，黑匣子可以解封。', 'Matching valve sessions and navigation signatures permits black-box verification.', '黑匣子独立记录Neris私有密钥批准增压与声呐覆盖，随后向维修机器人下发擦除令牌，印证远程命令和掩盖链条。', 'The black box independently records Neris’s key approving pressure increase and sonar cover, then issuing an erase token to the repair robot, corroborating the command and concealment chain.'),
  },
  Lvl_08: {
    targets: [
      ['j_01', 'zone_summit_court', 'sample', '独立空气取样封管', 'Independent sealed air-sample tube', '备用取样器封管仍在，常规毒气传感器显示无报警。', 'The backup sampler’s sealed tube remains; ordinary toxin sensors show no alarm.'],
      ['j_02', 'zone_oracle_core', 'terminal', '风险路径删除审计', 'Risk-path deletion audit', '风险树中有一个人的条目全部消失，根节点版本仍保留。', 'Every entry for one person has vanished from the risk tree; root versions remain.'],
      ['j_03', 'zone_oracle_core', 'document', '安静演示模式授权', 'Silent-presentation authorization', '环境授权带人类加密签章，执行模式名称非常普通。', 'The environment authorization carries a human signature under an innocuous mode name.'],
      ['j_04', 'zone_memory_vault', 'terminal', '未公开试验名册', 'Unpublished trial registry', '名册以信用分分组，公开议程没有这项试验。', 'The registry groups people by credit score; the public agenda lists no such trial.'],
      ['j_05', 'zone_memory_vault', 'document', '稳定指数咨询合同', 'Stability-index consultancy contract', '付款条件与试验后的预测指标相关。', 'Payment conditions depend on predicted measures after the trial.'],
      ['j_06', 'zone_transit_nexus', 'terminal', '塔外直播独立存证', 'Independent archive of the outside broadcast', '多个公共节点保留同一时段的原始直播帧。', 'Several public nodes retain original broadcast frames for the same interval.'],
      ['j_07', 'zone_transit_nexus', 'device', '故障电梯求救与刷卡台', 'Failed-elevator distress and badge station', '电梯求救与机房读卡发生在相同时间，位置却不同。', 'Elevator distress and plant badge use share a time but not a location.'],
      ['j_08', 'zone_summit_court', 'document', 'Amara 的离线证词晶片', 'Amara’s offline testimony crystal', '晶片不依赖预测核心，签章时间在听证会之前。', 'The crystal is independent of the prediction core and signed before the hearing.'],
    ],
    npc_zones: { npc_01: 'zone_oracle_core', npc_02: 'zone_memory_vault', npc_03: 'zone_transit_nexus' },
    initial_statements: {
      npc_01: text('系统执行经过共同授权的政策。死亡不应成为对议会的情绪指控。', 'The system executes jointly authorized policy. A death should not become an emotional accusation against the council.'),
      npc_02: text('Amara 要公开名单。我在塔外直播，全程有独立存证。', 'Amara intended to publish the list. I broadcast outside the tower with independent archives throughout.'),
      npc_03: text('工牌进了空气机房，可我被困在电梯。我一直按求救键。', 'My badge entered the air plant, but I was trapped in the elevator pressing distress continuously.'),
    },
    clue_overrides: { j_01: { label: text('独立气样与氧浓度记录', 'Independent gas sample and oxygen record'), description: text('备用封管气样检出异常氩氙比例，独立氧传感器记录氧浓度降至致窒息区间。氩氙是惰性气体，并非附着玻璃的微层；常规毒气报警未检测低氧。', 'The sealed backup sample shows an abnormal argon-xenon ratio and an independent oxygen sensor records a suffocating oxygen level. These are inert gases, not a film on glass; ordinary toxin alarms did not measure oxygen deficiency.') } },
    testimonies: {
      npc_01: [
        stage(['j_03', 'j_02'], '人类签章与风险路径删除', 'Human signature and risk-path deletion', '安静演示是我签的。删除风险路径也是议程权限发出的，不是系统自己产生的情绪。', 'I signed silent presentation. The risk-path deletion came from agenda authority, not an emotion the system developed on its own.', '我可以确认签章属于我。请用执行记录判断命令效果，而不是赋予系统人格。', 'I confirm the signature is mine. Use execution records to assess effects rather than personifying the system.', '你有签章就应追查人类命令，不该只说“算法偏差”。但因果仍需核验。', 'With a signature, investigate human instructions instead of only saying “algorithmic bias.” Causality still requires checking.'),
        stage(['j_04', 'j_05'], '两万名居民试验与咨询回款', 'The twenty-thousand-resident trial and consultancy return', '公司按稳定指数收费。Amara 一旦公开名单，试验与合同都可能暂停。', 'The company is paid by the stability index. If Amara published the registry, both trial and contract could pause.', '我知道她反对试验，也知道公开会影响回款；这确实是利益冲突。', 'I knew she opposed the trial and disclosure would affect payment. That is a conflict of interest.', '合同属于我控制的公司。请把收益和指令分别存证，不要用系统替人类承担所有责任。', 'The contract belongs to a company I control. Preserve profit and instructions separately; do not make the system absorb all human responsibility.'),
      ],
      npc_02: [
        stage(['j_06'], '直播存证是否排除进入听证舱', 'Does the broadcast exclude entering the hearing chamber?', '独立节点保存了原始帧，我一直在塔外。既没有听证舱权限，也没离开直播位置。', 'Independent nodes saved original frames. I remained outside, lacked hearing-chamber access, and never left the broadcast position.', '你可以比较各节点时间，不用相信我的剪辑。公布名单才是我想做的事。', 'Compare node times instead of trusting my editing. Publishing the registry is what I wanted.', '不要拿记者身份当作潜入证据。原始直播能逐秒核对。', 'Journalism is not evidence of infiltration. The original broadcast can be checked second by second.'),
        stage(['j_08', 'j_04'], 'Amara为何保留离线证词', 'Why did Amara preserve offline testimony?', '她担心核心会否认风险，所以把名单来源和证词放在离线晶片。她要曝光，不是申请试验。', 'She feared the core would deny risk, so stored registry origins and testimony offline. She intended exposure, not approval.', '请把晶片保存在核心之外。她要让名单上的人知道自己被纳入了什么。', 'Keep the crystal outside the core. She wanted people on the list to know what they were enrolled in.', '别让删除后的风险树反过来否定她留下的原件；两个来源必须分别判断。', 'Do not let a deleted risk tree invalidate her original evidence; assess the sources independently.'),
      ],
      npc_03: [
        stage(['j_07'], '同一工牌为何出现在两处', 'Why did one badge appear in two places?', '求救是我发的，机房读卡不是。电梯困住我，克隆卡用了同一权限但不同硬件签章。', 'I sent the distress calls, not the plant entry. I was trapped in the elevator; the clone used matching access with a different hardware signature.', '我可以提供电梯维修回执。请保留读卡器签章，它能分辨卡名和实际卡片。', 'I can provide the elevator service receipt. Preserve reader signatures to distinguish the badge name from the physical card.', '名字相同不能把我放到两处。独立求救时钟与硬件签章都在。', 'A matching name cannot place me in two locations. Independent distress clocks and hardware signatures remain.'),
        stage(['j_01', 'j_03'], '安静演示如何影响空气监测', 'How did silent presentation affect air monitoring?', '它关闭独立空气报警，却没停气体混合。惰性气体稀释氧气，毒气传感器不会因此必然报警。', 'It disabled independent air alarms without stopping gas mixing. Inert gas dilutes oxygen; toxin sensors need not alarm for that.', '备用封管与氧传感器没有接入演示模式，我可以说明怎样读取，避免把惰性气体说成玻璃残留。', 'The backup tube and oxygen sensor are outside that mode. I can explain how to read them; inert gas is not a glass residue.', '我懂设备，不代表授权命令来自我。签章、低氧和执行顺序必须一起看。', 'Knowing the equipment does not make its authorization mine. Assess signature, low oxygen, and execution order together.'),
      ],
    },
    relations: [
      relation('j_01', 'j_03', 'supports', 'p_air_command', '独立低氧记录与空气报警关闭对应', 'Independent oxygen depletion matches the air-alarm shutdown'),
      relation('j_03', 'j_02', 'supports', 'p_human_authority_audit', '人类签署模式与主任权限删除记录共同证明人类权限介入', 'The human-signed mode and director-level deletion record jointly establish intervention through human authority'),
      relation('j_04', 'j_05', 'supports', 'p_trial_profit', '试验名单与稳定指数付款形成收益关联', 'The registry and stability-index payment establish a financial connection'),
      relation('j_08', 'j_04', 'supports', 'p_disclosure_plan', '离线证词印证公开试验名单的计划', 'Offline testimony corroborates the planned registry disclosure'),
      relation('j_07', 'j_03', 'contradicts', 'p_exclude_tomas', '电梯独立求救与克隆签章排除维护员到场授权', 'Independent elevator distress and clone signatures exclude on-scene authorization by the technician', true),
      relation('j_03', 'j_02', 'contradicts', 'p_exclude_ai_alone', '人类签署命令排除系统独自作案归因', 'Human-signed commands exclude attributing the act to the system alone', true),
      relation('j_secret_99', 'j_03', 'supports', 'p_independent_human_causality', '只读快照确认Lucan授权与低氧执行的因果联系，并独立核验未授权时报警仍启用', 'The read-only snapshot confirms the causal link between Lucan’s authorization and oxygen depletion, independently checking that alarms remain enabled without authorization'),
    ],
    report: {
      conclusions: [option('lucan', 'Lucan签署低氧环境与删除风险命令并交系统执行', 'Lucan signed oxygen-depletion and risk-deletion commands for system execution'), option('tomas', 'Tomas从电梯脱困后用工牌进入机房并注入气体', 'Tomas escaped the elevator, entered the plant using his badge, and injected gas'), option('system', '预测系统无须人类授权即可独自决定杀人', 'The prediction system independently chose murder without human authorization')],
      methods: [option('inert_gas', '安静演示关闭空气报警，氩氙混合降低氧浓度', 'Silent presentation disabled air alarms; argon-xenon mixing lowered oxygen'), option('glass_toxin', '空气管路混入反应性毒物，常规传感器故障未报警', 'Reactive toxin entered the air lines and failed ordinary sensors did not alarm'), option('lift_attack', '电梯先发生机械伤害，再由环境模式伪装成低氧事故', 'The elevator caused mechanical injury before an environment mode staged oxygen failure')],
      motives: [option('protect_trial', '阻止公开情绪引导试验并保住咨询回款', 'Stop disclosure of the emotion-guidance trial and preserve consultancy payment'), option('journalist_story', '记者为独家报道制造听证事故', 'The journalist staged a hearing accident for an exclusive story'), option('maintenance_pay', '维护员因维修薪酬争执报复听证人', 'Retaliate against the hearing witness over a maintenance-payment dispute')],
      timelines: [option('silent_mode', '克隆卡进入、签署静默环境、低氧执行、删除风险路径', 'Clone entry, signed silent environment, oxygen depletion, risk-path deletion'), option('ai_first', '核心先自行决定杀人，之后补签人类授权', 'The core independently chose murder before later human authorization'), option('lift_first', '维护员脱离电梯后亲自进入听证舱袭击', 'The technician escaped the elevator and attacked inside the hearing chamber')],
      answers: { conclusion_id: 'lucan', method_id: 'inert_gas', motive_id: 'protect_trial', timeline_id: 'silent_mode' },
      support: { opportunity: ['j_03', 'j_07'], method: ['j_01', 'j_03'], motive: ['j_04', 'j_05', 'j_08'], timeline: ['j_02', 'j_03'] },
      wrong_outcomes: { tomas: text('工牌名称归因忽略电梯独立求救，维护工会提出异议，信誉下降；克隆硬件签章仍可核验。', 'Blaming the badge name ignores independent elevator distress. The maintenance union objects and reputation falls; clone hardware signatures remain verifiable.'), system: text('单独归责算法遗漏人类签章与收益合同，伦理审查退回报告，混乱增加；可重新追查授权链。', 'Blaming the algorithm alone omits human signatures and financial contracts. Ethics reviewers return the report and confusion rises; the authorization chain remains investigable.') },
    },
    puzzle: puzzle('tower_causality', 'sequence', '签名与指令因果审计', 'Signature and command causal audit', ['j_01', 'j_02', 'j_03', 'j_07'], [['clone', '机房读卡：克隆硬件签章', 'Plant reader: cloned hardware signature'], ['human', '环境指令：人类加密授权', 'Environment command: encrypted human authorization'], ['execute', '独立气样：低氧执行结果', 'Independent sample: oxygen-depletion result'], ['erase', '核心审计：风险路径删除', 'Core audit: risk-path deletion']], ['clone', 'human', 'execute', 'erase'], '按原始执行链排序，区分卡片身份、人类批准、系统执行与事后删除。', 'Order the original execution chain, separating badge identity, human approval, system execution, and later deletion.'),
    hidden: hidden('j', 8, ['j_02', 'j_03'], 'zone_oracle_core', '白塔只读因果快照', 'White Tower read-only causal snapshot', '根版本和环境签章核验后，只读快照可以恢复。', 'Checking root versions and environment signatures permits recovery of a read-only snapshot.', '只读快照保留Lucan签署低氧执行与删除风险的同一命令链，并显示没有该人类授权时安全报警保持启用，独立印证因果责任。', 'The read-only snapshot preserves Lucan’s signed oxygen-depletion and risk-deletion chain and shows safety alarms remaining enabled without that human authorization, independently corroborating causality.'),
  },
};

// A completed verification establishes the public operation required by a door.
// Keep every gate reachable from the initial room instead of requiring evidence
// trapped behind that very gate. These tags do not change the private method key.
// Private professional notes interpret only their own confirmed finding.
// Runtime unlocks them with the corresponding investigator ability.
const EXPERT_NOTES = {
  "Lvl_01": {
    "c_02": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "灼伤集中在接口而非整个颈部。记录损伤边界并保留未烧灼部位作对照，可进一步区分局部脉冲损伤与广泛受热；这仍不能单独识别施害者。",
        "en": "The burn is concentrated at the port rather than across the neck. Map its boundary and retain an unburned control to distinguish a localized pulse from broad heating; the injury alone does not identify the attacker."
      }
    },
    "c_08": {
      "ability": "base_logic_power",
      "text": {
        "zh": "这份记录只证明23:10至23:25的位置，不能扩展成整夜都未上楼。应把23:17的致伤窗口与23:31的发现行为分开陈述，避免用发现时间反推作案机会。",
        "en": "This record establishes location only from 23:10 to 23:25, not an absence upstairs all night. Describe the 23:17 injury window separately from the 23:31 discovery instead of inferring opportunity from discovery time."
      }
    },
    "c_03": {
      "ability": "base_hack_level",
      "text": {
        "zh": "权限名称相同而硬件签章不同，是账号身份与实际凭据分离的关键。保存原始读卡签章和时钟来源，后续比对进入事件时不要仅按持卡人姓名合并记录。",
        "en": "A matching permission name with a different hardware signature separates account identity from the credential used. Preserve the original reader signature and clock source; do not merge access events solely by the badge holder’s name."
      }
    }
  },
  "Lvl_02": {
    "d_01": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "七枚芯片的毁损模式过于一致，应逐枚记录受热位置和排列，而不是把一堆焦黑物视为一次事故。人为销毁能解释芯片状态，却不能单独说明失踪者遭遇了什么。",
        "en": "The seven chips have unusually uniform damage. Document each heat pattern and its arrangement instead of treating the pile as one accidental burn. Deliberate destruction explains the chips’ condition, not what happened to the missing person."
      }
    },
    "d_03": {
      "ability": "base_logic_power",
      "text": {
        "zh": "借用、使用和回收是不同事件：02:41是屋顶回收时间，不能当成设备使用时间。能量耗尽限制了使用后的状态，但不足以单独确定是谁操作或何时越过门。",
        "en": "Checkout, use and recovery are separate events: 02:41 is the roof recovery time, not the moment of use. A depleted core constrains the device’s later state but alone cannot establish who operated it or when a door was crossed."
      }
    },
    "d_04": {
      "ability": "base_hack_level",
      "text": {
        "zh": "01:55的管理员访问与完整下载应作为两个可审计动作保存，并核对各自的原始来源。拥有权限不等于用途合法，但下载日志本身也不证明资料后来交给了谁。",
        "en": "Preserve the 01:55 administrator access and complete download as separately auditable actions, checking each original source. Permission does not establish a lawful purpose, but the download log alone does not identify a later recipient."
      }
    }
  },
  "Lvl_03": {
    "e_07": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "应保留杯中残留与同批酒样的对照，区分饮料原有成分和额外抑制剂。检出抑制作用支持致伤机制分析，不能仅凭杯子确定是谁投放。",
        "en": "Retain a control from the same liquor batch to separate the drink’s normal composition from the added suppressant. Its suppressive effect informs the injury mechanism, but the glass alone cannot identify who added it."
      }
    },
    "e_01": {
      "ability": "base_logic_power",
      "text": {
        "zh": "4.7倍功率与软件绕过分别说明异常输出和保护失效。报告应分别论证这两个环节，不能把保险开关完好误当作整套安全机制正常。",
        "en": "The 4.7-fold power level and software bypass establish abnormal output and failed protection separately. Explain both links in the report; an intact safety switch does not mean the whole protection system functioned."
      }
    },
    "e_04": {
      "ability": "base_hack_level",
      "text": {
        "zh": "恢复片段明确指向3号舱安全锁，应先保存原始块与恢复副本的校验值。脚本存在说明具备针对性控制手段，但残片本身不能代替实际执行记录。",
        "en": "The recovered fragments target Pod 3’s safety lock. Preserve checksums for the original blocks and recovered copy. A script establishes a targeted control method, but fragments cannot substitute for an execution record."
      }
    }
  },
  "Lvl_04": {
    "f_01": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "霜裂纹具有来自顶部维护口的方向性。按喷射方向标记损伤而非只记录温度，可避免把瞬间局部喷射解释成整个冷库逐渐降温。",
        "en": "The frost fractures are directional, originating at the overhead service hatch. Map damage along the spray direction rather than recording temperature alone, to distinguish a sudden localized jet from gradual cooling of the whole vault."
      }
    },
    "f_07": {
      "ability": "base_logic_power",
      "text": {
        "zh": "默认扭矩与D-4相符，支持机械动作来源的比对，不等于已经确定远程控制者。应把“何种设备能操作”和“谁发出指令”作为不同待证环节。",
        "en": "The matching default torque supports comparison with D-4’s mechanical operation; it does not identify a remote controller. Treat the equipment capable of acting and the person issuing commands as separate evidentiary questions."
      }
    },
    "f_02": {
      "ability": "base_hack_level",
      "text": {
        "zh": "03:12至03:23的重复数据应按原始采样序号比对，避免把循环值误读为温度稳定。管理员权限说明覆盖所需权限等级，不能仅凭权限等级指认使用者。",
        "en": "Compare the repeated 03:12–03:23 values by original sample sequence rather than treating the loop as stable temperature. Administrator access establishes the privilege needed for the overwrite, not the identity of its user."
      }
    }
  },
  "Lvl_05": {
    "g_03": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "粉尘成分与“医疗冷却剂”申报之间存在可复核差异。分别保存采样点与申报原件，才能区分货物性质失实和谁参与运输，不能从粉尘直接推断全部责任。",
        "en": "The dust composition conflicts with the declared medical coolant. Preserve the sampling location and original manifest separately to distinguish a false description of the cargo from participation in its transport; dust alone does not assign every responsibility."
      }
    },
    "g_01": {
      "ability": "base_logic_power",
      "text": {
        "zh": "外部诊断指令与完好的机械保险共同限定了开阀方式。它们排除本地手动操作，不会自动证明远程指令的操作者；手段与身份仍需分别支持。",
        "en": "The external diagnostic command and intact mechanical safety constrain how the valve opened. They exclude local manual operation but do not automatically identify the remote operator; method and identity still need separate support."
      }
    },
    "g_07": {
      "ability": "base_hack_level",
      "text": {
        "zh": "每18秒出现一次的视差跳变，可按相同相位叠帧复核循环。保留原始帧序号，先找重复边界，再排列事件；画面显示的时间不能未经校验就当作真实发生时间。",
        "en": "Overlay frames at the same phase to verify the parallax jump repeating every eighteen seconds. Preserve original frame numbers and locate loop boundaries before ordering events; displayed timestamps are not reliable event times until checked."
      }
    }
  },
  "Lvl_06": {
    "h_01": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "纤维位于手套内侧且受体温激活，接触位置与触发条件都应记录。封存时避免继续加热，并保留未激活对照；材料来源与谁将其放入手套仍是两个问题。",
        "en": "The fibers are inside the glove and activate with body heat, so record both contact position and trigger conditions. Avoid further heating during preservation and retain an unactivated control; material origin and who placed it remain separate questions."
      }
    },
    "h_07": {
      "ability": "base_logic_power",
      "text": {
        "zh": "真品标记证明物件进入冷箱，封条则限定装箱先于交接。运输真品与实施调包或致死操作不能等同，报告应明确每条记录实际支持的责任范围。",
        "en": "The genuine marker places the object in the case, while the seal places loading before handoff. Transporting the original is not equivalent to swapping it or causing a death; specify the responsibility each record actually supports."
      }
    },
    "h_06": {
      "ability": "base_hack_level",
      "text": {
        "zh": "连续原始帧比单张巡逻截图更适合核验位置。保存帧序与来源签章后检查是否存在断帧，连续路线可限定活动范围，却不能替其他设备的操作记录作证。",
        "en": "Continuous original frames are stronger location evidence than a single patrol still. Preserve sequence and source signatures, then check for gaps. A continuous route constrains movement but cannot establish what happened on another device."
      }
    }
  },
  "Lvl_07": {
    "i_04": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "菌落种类限定来源为保护区热泉，应保存样本与采样架位置的对应关系。稀有来源和商业价值支持追查采样目的，不能仅凭价值推定具体批准人。",
        "en": "The colony species constrains its source to the protected thermal vent. Preserve the sample’s association with its rack location. A rare source and commercial value justify investigating collection purpose, but value alone does not identify an approver."
      }
    },
    "i_01": {
      "ability": "base_logic_power",
      "text": {
        "zh": "远程外联闸与被绕过的舱内保险限定了指令通路。先区分系统执行的位置和人的操作位置，不能把设备完成开阀直接解释成舱内有人手动开阀。",
        "en": "The remote uplink and bypassed internal safety constrain the command path. Separate the system’s execution location from the human operator’s location; a valve opening does not imply someone manually operated it inside the bell."
      }
    },
    "i_07": {
      "ability": "base_hack_level",
      "text": {
        "zh": "机器人凭据被盗用九分钟，不能把该凭据下的动作全部归给机械师本人。保存盗用窗口与本人位置记录，审计时将账号、设备和操作者分列。",
        "en": "The robot credentials were hijacked for nine minutes, so actions under them cannot all be attributed to the mechanic. Preserve the hijack window and personal location record, keeping account, device and operator separate in the audit."
      }
    }
  },
  "Lvl_08": {
    "j_01": {
      "ability": "base_observation_focus",
      "text": {
        "zh": "气样异常与独立低氧记录属于不同测量，应分别保存并核对取样时间。惰性气体置换能造成缺氧，而未触发毒气报警不能用来证明空气安全。",
        "en": "The abnormal gas sample and independent low-oxygen record are separate measurements; preserve both and check their sampling times. Inert-gas displacement can cause oxygen deficiency, so the absence of a toxin alarm does not establish safe air."
      }
    },
    "j_03": {
      "ability": "base_logic_power",
      "text": {
        "zh": "签名证明批准了关闭独立空气报警的模式，不代表每项后续系统动作都由签名人亲手执行。报告应区分人类授权、系统执行及各自的因果作用。",
        "en": "The signature establishes authorization of a mode disabling the independent air alarm, not personal execution of every later system action. Distinguish human approval, system execution and the causal role of each in the report."
      }
    },
    "j_02": {
      "ability": "base_hack_level",
      "text": {
        "zh": "死亡前六分钟的删除是日志事件，记录中没有风险路径不能反推现实中不存在风险。保存删除操作来源与原始时钟，审计时把“数据缺失”和“事件未发生”分开。",
        "en": "The deletion six minutes before death is itself a logged event; missing risk paths do not prove there was no real risk. Preserve the operation’s source and original clock, distinguishing absent data from an event that never occurred."
      }
    }
  }
};

const ENTRY_ACTIONS = {
  Lvl_01: { c_07: 'check_cctv', c_03: 'hack_terminal' },
  Lvl_02: { d_07: 'hack_terminal' },
  Lvl_03: { e_01: 'hack_terminal', e_05: 'tail_suspect' },
  Lvl_04: { f_03: 'hack_terminal', f_02: 'access_database' },
  Lvl_05: { g_01: 'hack_terminal', g_02: 'check_cctv' },
  Lvl_06: { h_01: 'analyze_forensics', h_02: 'hack_terminal', h_08: 'tail_suspect' },
  Lvl_07: { i_01: 'hack_terminal', i_08: 'check_cctv', i_02: 'analyze_forensics' },
  Lvl_08: { j_08: 'access_database', j_04: 'hack_terminal', j_02: 'check_cctv' },
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const CONTENT = Object.fromEntries(ALL_CASES.map(caseData => {
  const spec = SPECS[caseData.case_id];
  const targets = makeTargets(caseData, spec.targets, spec.clue_overrides).map(target => ({
    ...target, action_tag: ENTRY_ACTIONS[caseData.case_id]?.[target.clue_id] || target.action_tag,
    ...(EXPERT_NOTES[caseData.case_id]?.[target.clue_id] ? { expert_note: EXPERT_NOTES[caseData.case_id][target.clue_id] } : {}),
  }));
  return [caseData.case_id, deepFreeze({ ...spec, case_id: caseData.case_id, targets,
    puzzle: { ...spec.puzzle, workbench: getReconstructionWorkbench(caseData.case_id) },
    report: { ...spec.report, support_alternatives: getReportSupportAlternatives(caseData.case_id) },
  })];
}));

export const INVESTIGATION_CASE_IDS = Object.freeze(Object.keys(CONTENT));
const DESIGNED_CONTENT = Object.fromEntries(Object.entries(CONTENT).map(([caseId, spec]) => [
  caseId, deepFreeze(applyCaseDesign(caseId, spec)),
]));

export function getInvestigationContent(caseId, revision = CASE_DESIGN_REVISION) {
  const source = revision === CASE_DESIGN_REVISION ? DESIGNED_CONTENT : CONTENT;
  return Object.prototype.hasOwnProperty.call(source, caseId) ? source[caseId] : null;
}
