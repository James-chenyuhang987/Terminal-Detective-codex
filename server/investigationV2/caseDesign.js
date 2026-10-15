// Protected authored content. Public projections below select only earned facts;
// none of the conditions, future beats or resolution text belong in src/.
export const CASE_DESIGN_REVISION = 1;
const t = (zh, en) => ({ zh, en });
const method = (id, zh, en) => ({ id, label: t(zh, en) });
const support = (a, b, id, zh, en) => ({ a, b, relation: 'supports', proposition_id: id,
  label: t(zh, en), alternative: false });
const SUPPORT_UPDATES = {
  Lvl_01: [
    support('c_02', 'c_05', 'p_pulse_receipt_injury',
      '同会话的定向脉冲触发回执与接口定向烧痕相互印证，支持脉冲致伤；设备回执不能单独替代完整责任证明。',
      'The same-session directed-pulse trigger receipt corroborates the targeted port burn and supports pulse injury; a device receipt alone does not establish the full chain of responsibility.'),
    support('c_02', 'c_07', 'p_pulse_injury_outage',
      '接口定向烧痕与监控EMP中断共同支持脉冲影响接口和监控，不能单凭中断识别操作者。',
      'The targeted port burn and EMP camera outage jointly support a pulse affecting the port and surveillance; the outage alone does not identify its operator.'),
  ],
  Lvl_02: [
    support('d_01', 'd_05', 'p_empty_chip_decoy',
      '引燃前已清空的芯片与案前保全指令相符，支持烧空芯片作诱饵；计划本身不能证明已经成功离开。',
      'The chips emptied before ignition match the pre-incident preservation instruction and support an empty-chip decoy; the plan alone does not establish a successful departure.'),
  ],
};
const beat = (id, clues, titleZh, titleEn, bodyZh, bodyEn, extra = {}) => ({
  id, evidence_ids: clues, title: t(titleZh, titleEn), body: t(bodyZh, bodyEn), ...extra,
});

const TARGET_UPDATES = {
  Lvl_01: {
    c_01: {
      methods: [
        method('metadata', '对照收银原始签章、购买明细与付款时刻', 'Compare the original till signature, line item and payment time'),
        method('surface', '用纸角血迹判断购买者与购买时刻', 'Use the bloodstain to identify the buyer and purchase time'),
        method('summarize', '把当前可见金额与案发支出比较', 'Compare the visible amount with incident expenses'),
      ],
      failure_explanation: t('血迹和金额都不能证明何时买了什么，更不能单独确定买家。保留这些观察，再核对收银原件的项目、时间与来源。', 'A stain or amount cannot establish what was bought and when, or identify the buyer by itself. Preserve those observations and check the original till item, time and provenance.'),
    },
    c_03: {
      observation: t('权限名称与读卡器硬件签章不一致；读卡事件另有本机会话编号。', 'The permission name differs from the badge hardware signature; the reader event has a local session identifier.'),
      methods: [
        method('audit', '比对读卡硬件、权限名称与本机会话', 'Compare badge hardware, permission name and local session'),
        method('replay', '用访问摘要中显示的姓名确认持卡人', 'Identify the holder from the name in the access summary'),
        method('hardware', '用读卡器外壳接触痕迹确认案发时操作者', 'Identify the incident operator from enclosure contact traces'),
      ],
      result: t('23:16读卡原件记录同权限、不同硬件签章的复制卡，比23:17致伤早一分钟，会话为N-17。卡名不能证明持卡人；需把N-17与维修锁的本机确认及执行回执对照，不能据复制卡直接归责Mei。', 'The original 23:16 reader record, one minute before the 23:17 injury, contains a copied badge with matching permissions but different hardware under session N-17. A badge name does not identify its holder; compare N-17 with the shaft lock’s local confirmation and execution receipt before attributing it to Mei.'),
      failure_explanation: t('摘要中的姓名只说明权限，外壳痕迹也没有案发时间。问题仍是这次读卡属于哪一个实体卡与会话；需要原始硬件签章和本机会话。', 'The displayed name identifies permission, and enclosure traces have no incident timestamp. The question remains which physical badge and session produced this read; original hardware signatures and the local session are needed.'),
    },
    c_05: {
      observation: t('锁舌没有撬痕；本机屏同时列出近场会话、活体掌纹确认和脉冲触发回执，独立备用电源仍在。', 'The latch has no pry marks. The local display lists a near-field session, live palm confirmation and pulse-trigger receipt; independent backup power remains on.'),
      methods: [
        method('diagnostics', '核对本机活体验证、同会话脉冲回执与开合时钟', 'Check local live verification, the same-session pulse receipt and opening clock'),
        method('exterior', '用无撬痕与锁舌磨损判断进入者身份', 'Infer the entrant’s identity from pry marks and latch wear'),
        method('inventory', '以锁具登记的管理员姓名代替本次操作者', 'Use the lock’s registered administrator as the incident operator'),
      ],
      result: t('备用电源的维修锁本机回执记录23:17开启、23:19关闭。N-17近场会话的活体掌纹确认属于Mei，并签收同会话设备的定向脉冲触发回执；该触发时刻与独立电源中断标记一致。活体确认绑定这次现场操作，不只是复制卡姓名或终端所有权；致伤性质仍须核对神经接口烧痕。', 'The backup-powered shaft lock’s local receipt records opening at 23:17 and closure at 23:19. Session N-17 contains Mei’s live palm confirmation and acknowledges the same device session’s directed-pulse trigger; its time matches the independent power-gap marker. Live confirmation binds this on-site operation, rather than merely a badge name or device ownership; the injury still requires comparison with the neural-port burn.'),
      failure_explanation: t('锁舌与登记姓名只能说明锁具状态和管理权限，不能把某人放在23:17。需要将本机活体验证、会话与执行回执连接，再与独立伤痕核对。', 'The latch and registered name establish lock condition and administrative access, not a person’s presence at 23:17. Join local live verification, session and execution receipt, then compare the independent injury trace.'),
    },
    c_08: {
      methods: [
        method('audit', '校准值班时钟并核对连续在场区间', 'Calibrate the duty clock and check continuous presence'),
        method('replay', '用23:31发现尸体的画面反推致伤时刻', 'Infer injury time from the 23:31 discovery feed'),
        method('hardware', '用终端摆放位置解释整个夜班动线', 'Infer the whole night’s route from the terminal location'),
      ],
      failure_explanation: t('发现尸体不等于致伤；终端所在位置也不等于保安一直在旁。必须用独立时钟的连续值班记录覆盖实际致伤窗口。', 'Discovery is not injury, and a terminal’s location does not prove continuous presence. Use the independent clock’s continuous duty record to cover the actual injury window.'),
    },
  },
  Lvl_02: {
    d_01: {
      methods: [
        method('forensics', '检验燃烧方向、助燃残留与芯片装载状态', 'Test burn direction, ignition residue and chip loading state'),
        method('visual', '依据焦黑外观判断人员是否在火中消失', 'Infer a person’s destruction from the scorched appearance'),
        method('inventory', '只比较七枚芯片与库存总数', 'Compare only the seven chips with the inventory count'),
      ],
      result: t('七枚芯片均从外侧被点燃，未见能量核爆裂；它们在引燃前已被清空，空壳数量不能证明研究资料或人员被焚毁。残留说明现场被布置，布置目的还须与独立备份和设备记录核对。', 'All seven chips were ignited externally, with no core rupture; their contents had been cleared before ignition. Empty shells do not establish that records or a person burned. The residue establishes a staged scene; its purpose still requires comparison with the independent backup and device record.'),
      failure_explanation: t('焦黑和数量不能证明有人死亡，也不能证明资料已全部消失。要区分外部点燃与设备事故，并核查燃烧前芯片是否存有数据。', 'Scorching and counts cannot prove a death or destruction of all records. Distinguish external ignition from a device failure and determine whether the chips held data before burning.'),
    },
    d_03: {
      observation: t('封袋中设备的回收地与借出地不同。机身额定铭牌注明：仅佩戴者、单次穿越一处不超过40cm的非承重隔墙，须本机活体确认；无法远程启动或携带第二人。', 'Recovery and checkout locations differ. The rated plate states: wearer only, one crossing of a non-load-bearing partition up to 40 cm, with local live confirmation; no remote activation or second passenger.'),
      methods: [
        method('diagnostics', '对照额定边界、本机佩戴确认与耗能回执', 'Compare rated limits, local wearer verification and energy receipt'),
        method('exterior', '用外壳焦痕判断设备曾在哪一扇门使用', 'Identify the crossed door from casing scorch marks'),
        method('inventory', '把借用人和回收标签直接当成失踪者去向', 'Treat checkout name and recovery tag as the missing person’s destination'),
      ],
      result: t('QPS-α只允许佩戴者经本机活体确认后穿过一处厚度不超过40cm的非承重隔墙，不能遥控、远距传送或携带第二人。02:26的耗能回执绑定Aria本人的佩戴确认与实验室28cm非承重隔墙校准标记，能量核100%降至0%。安保02:41在屋顶紧急通道回收并封存；这是回收时间，不是启动时间，仍须用屋顶压力记录确认后续路线。', 'QPS-alpha permits only its locally live-verified wearer to cross one non-load-bearing partition up to 40 cm; it cannot operate remotely, teleport over distance or carry a second person. The 02:26 energy receipt binds Aria’s wearer confirmation to the lab’s 28 cm non-load-bearing partition marker, with its core falling from 100% to 0%. Security recovered and sealed it at the roof emergency passage at 02:41: a recovery time, not activation. Check roof pressure to establish the later route.'),
      failure_explanation: t('借用记录只说明保管，外壳痕迹不能定位本次穿越；回收时间也不等于启动。先核对设备可做到什么、谁在本机确认，再用耗能回执和压力记录检验路线。', 'Checkout establishes custody, and casing traces cannot locate this crossing; recovery is not activation. Check the rated capabilities and local confirmer, then test the route against energy and pressure receipts.'),
    },
    d_05: {
      methods: [
        method('metadata', '验证离线副本的来源、生成时间和保全指令', 'Verify the offline copy’s provenance, creation time and preservation instruction'),
        method('surface', '按饮料罐所在位置判断藏匿者和用途', 'Infer the concealer and purpose from the can’s location'),
        method('summarize', '只读取标题中的机构罪证字样', 'Read only the institutional-evidence heading'),
      ],
      result: t('罐内离线副本保留Harlan密钥交付文件及原始校验签章。Aria在案前签署的保全指令写明将清空的芯片留作假象、独自带QPS穿越隔墙并把罪证副本留给外部核验。指令证明预先计划，不单独证明已经成功离开；须与本机佩戴回执和屋顶记录相互印证。', 'The offline copy contains Harlan’s key-delivery documents with original verification signatures. Aria’s pre-incident preservation instruction describes leaving emptied chips as a decoy, crossing the partition alone with QPS and retaining evidence for outside verification. An instruction establishes a plan, not successful departure by itself; compare the local wearer receipt and roof record.'),
      failure_explanation: t('位置和标题不能验证作者、内容或时间。即使找到离开计划，也不能自动断言计划成功；需先验证原件来源，再与独立设备和屋顶记录核对。', 'Location and a heading do not verify authorship, contents or time. Even a departure plan cannot establish its success; verify provenance before comparison with independent device and roof records.'),
    },
    d_06: {
      methods: [
        method('diagnostics', '核对压力原始波形、行进方向与回收时钟', 'Check raw pressure, travel direction and the recovery clock'),
        method('exterior', '用门面无损判断是否有人经过', 'Infer passage from an undamaged door'),
        method('inventory', '把设备回收数量当成经过人数', 'Infer the number of people from recovered device counts'),
      ],
      result: t('屋顶独立压力板于02:34记录单人从内部楼梯走向外侧出口，载荷区间与QPS佩戴回执吻合，随后归零。02:41才发生安保回收设备的第二次事件；压力板不能单独识别人名，也不记录出楼后的目的地。', 'The independent roof plate records one person moving from the internal stair toward the exterior exit at 02:34, within the QPS wearer receipt’s load range, then returns to zero. Security’s device recovery at 02:41 is a second event. The plate alone does not identify a person or record a destination beyond the building.'),
      failure_explanation: t('门面状态和回收数量都不能排除无刷卡通行。需要看独立波形的方向与时钟，并把人员经过、设备回收分成两件事。', 'Door condition and recovered counts cannot exclude passage without a badge read. Check independent waveform direction and time, separating a person’s passage from recovery of a device.'),
    },
  },
  Lvl_03: {
    e_03: { result: t('后台独立门侧影像与读卡原件共同记录Sable于01:20进入、01:26离开；影像未经舱内主机转存。它证明她处于操作地点，但执行过载脚本还须核对平板部署和舱控制器回执。', 'Independent door-side footage and original reads place Sable in the backroom from 01:20 to 01:26, without passing through the pod host. This establishes presence at the console; compare tablet deployment and pod-controller receipts to establish execution.') },
    e_04: { result: t('格式化平板恢复出针对3号舱的脚本。部署回执由Sable在控制台完成本机活体验证后签发，所载脚本摘要与3号舱独立控制器执行的摘要一致，参数为安全锁绕过、功率4.7倍；不是只有一份未运行的代码。', 'The formatted tablet yields a script targeting Pod 3. A deployment receipt issued after Sable’s local live verification carries the same script digest as the pod’s independent execution receipt: bypass safety and set power to 4.7 times baseline. This is more than an unexecuted code file.') },
    e_07: { result: t('Riku酒杯残留检出大量神经抑制剂，降低对过载的防御反应。吧台独立定量泵回执记录Sable本人确认给该杯编号追加同批抑制剂，杯号与化验封签一致。配液动作与化学作用分别取证，单凭酒杯在吧台不能归罪。', 'Riku’s glass contains a large dose of neural suppressant, reducing defenses against overload. The independent bar dosing-pump receipt records Sable’s personal confirmation adding that suppressant batch to this cup number, matching the test seal. Dosing action and chemical effect are separately documented; a glass’s bar location alone does not establish attribution.') },
  },
  Lvl_04: {
    f_04: { result: t('03:11唤醒D-4的管理员令牌同时保留Elias本人在控制台的活体批准。批准载荷包括液氮旁路和顶部维护口路线；D-4独立接收回执引用同一命令摘要。这证明他批准本次远程任务，不证明他亲自进入冷库；是否致伤仍须核对磨屑、阀痕与喷射方向。', 'The administrator token waking D-4 at 03:11 includes Elias’s live console approval. Its payload specifies the nitrogen bypass and upper-hatch route; D-4’s independent receipt references the same command digest. This establishes approval of this remote task, not personal entry into the vault; compare tracks, valve marks and jet direction to establish injury.') },
  },
  Lvl_05: {
    g_01: { result: t('救生舱本地执行器记录外部命令DEP-82打开泄压阀，机械保险未被舱内手动解除。回执保留父指令及载荷摘要，可与主控原件逐项对照，不能仅因诊断口被打开就推定谁实施泄压。', 'The lifeboat’s local actuator records external command DEP-82 opening the release valve; its mechanical safety was not manually released inside. The receipt retains its parent and payload digest for comparison with the master original; an open diagnostic port alone does not identify the decompression operator.') },
    g_04: { result: t('事故前两分钟，Rook在主控端完成本人活体签署，签发关闭报警及DEP-82泄压载荷；主控原件中的摘要与救生舱本地执行回执相同。这里绑定的是这次指定阀门动作，不只是账户能访问诊断网。', 'Two minutes before the death, Rook completed live signing at the master console for alarm suppression and the DEP-82 decompression payload. The original digest matches the lifeboat’s local execution receipt, binding this specific valve action rather than mere access to diagnostics.') },
  },
  Lvl_06: {
    h_02: { result: t('展柜门锁没有动作。00:07底座执行器进入四十秒维护窗，原始位置与夹爪压力记录先显示下方交换展品，再显示纤维盒至鉴定手套内侧的接触路径；该执行载荷引用维护签名。它证明动作，不单独确定批准人或纤维是否有毒。', 'The display door never opened. At 00:07 the base actuator’s forty-second window records a lower exchange followed by a fiber-cassette contact path inside the appraiser’s glove, through original position and gripper-pressure traces. Its payload references the maintenance signature. This establishes actions, not the authorizer or toxicity by itself.') },
    h_03: { result: t('Tessa的本机活体生物签名批准此次维护载荷，载荷同时指定交换机构和手套内侧纤维放置。它与底座执行器原始回执的摘要相同，并非普通湿度读取；纤维毒性和真伪仍分别依赖化验与材料测量。', 'Tessa’s local live biometric signature approves this maintenance payload, specifying both the exchange and fiber placement inside the glove. Its digest matches the base actuator’s original receipt, rather than an ordinary humidity reading. Toxicity and authenticity still require separate forensic and material tests.') },
  },
  Lvl_07: {
    i_01: { result: t('潜水钟本地阀控回执记录外联闸远程指令P-47绕过手动保险并增压；父会话及载荷摘要与航行控制原件可逐项比对。该记录证明远程动作，不仅是阀门具备远控能力，也不靠扬声器播音来定时。', 'The bell’s local valve receipt records uplink command P-47 bypassing manual protection and raising pressure. Its parent session and payload digest can be compared with the navigation original. This establishes an actual remote action, rather than remote capability, without using speaker playback to date it.') },
    i_03: { result: t('采样艇离站原件保留Neris本人在航行台的活体签署，并包含P-47增压载荷与声呐覆盖任务；潜水钟独立接收回执引用同一父会话及摘要。密钥在这里绑定本次批准动作，不是单凭艇的所有权或离站航单归罪。', 'The sampler’s departure original contains Neris’s live navigation-console signature for the P-47 pressure payload and sonar-cover task. The bell’s independent receipt references the same parent session and digest. The key binds approval of these actions, rather than attributing guilt from vessel ownership or a departure manifest alone.') },
  },
  Lvl_08: {
    j_01: { result: t('备用封管检出异常氩氙比例，独立氧传感器记录20.9%至11.2%的下降；本地混合阀执行回执AIR-43引用ENV-42的指定混气载荷。低氧来自独立测量，执行来源可与人类签章核对；惰性气体并非附着玻璃的微层。', 'The backup tube shows an abnormal argon-xenon ratio, and the independent oxygen sensor records a fall from 20.9% to 11.2%. Local mixing-valve receipt AIR-43 references ENV-42’s specified mixing payload. Independent measurements establish low oxygen; compare the execution origin with the human signature. Inert gas is not a film on glass.') },
    j_03: { result: t('Lucan本人的本机活体签署批准ENV-42：关闭独立空气报警并指定氩氙混合阀持续执行，不是只批准会议名称。载荷摘要与独立阀控回执AIR-43相同；批准、物理执行与风险删除仍是三个需按原件排序的事件。', 'Lucan’s local live signature approves ENV-42: disable the independent air alarm and continue the specified argon-xenon mixing-valve action, rather than merely approving a meeting label. Its digest matches independent valve receipt AIR-43. Approval, physical execution and risk deletion remain three events to order from originals.') },
  },
};

const FOCUSES = {
  Lvl_01: [t('先区分致伤痕迹、到场记录与人物说法。', 'Separate injury traces, presence records and personal claims.'), t('复制权限不等于身份；用独立记录连接这次操作。', 'Copied permission is not identity; connect this operation through independent records.'), t('把本人确认、脉冲动作与致伤窗口放在同一条因果链。', 'Join personal confirmation, the pulse action and injury window in one causal chain.')],
  Lvl_02: [t('先确定密室与设备究竟有哪些物理边界。', 'Establish the room and device limits first.'), t('把离开计划、设备实际使用和屋顶经过分开验证。', 'Verify the departure plan, actual device use and roof passage separately.'), t('解释主动离开的证据，同时分开机构交易与人身犯罪责任。', 'Explain evidence of a voluntary exit while separating institutional trading from a personal crime.')],
  Lvl_03: [t('先检验神经舱的安全保护是否实际生效。', 'Test whether the pod’s protection actually operated.'), t('从异常输出追查部署回执，区分在场与执行。', 'Trace abnormal output through deployment receipts, distinguishing presence from execution.'), t('连接脚本执行、药物作用与具体勒索利害。', 'Connect script execution, drug effects and the specific blackmail conflict.')],
  Lvl_04: [t('比较冷库实物与平稳温控曲线。', 'Compare vault traces with the smooth climate record.'), t('检验无人机能否到达喷射位置，不能只看账户。', 'Test whether the drone reached the jet location, beyond an account record.'), t('让批准载荷、维护路线和致伤方向相互核验。', 'Cross-check approved payload, service route and injury direction.')],
  Lvl_05: [t('保存救生舱原件，不把播放画面当成原始时钟。', 'Preserve lifeboat originals; playback is not an original clock.'), t('比较本地阀控回执与主控批准，分开诊断能力和具体动作。', 'Compare local valve receipts with master approval, separating capability from action.'), t('把泄压、异常放行与货运收益联系起来。', 'Connect decompression, abnormal release and cargo benefit.')],
  Lvl_06: [t('门未打开不等于展品没有移动。', 'A closed door does not establish an unmoved exhibit.'), t('检验底座动作与材料，不把运输等同投毒。', 'Test base actions and materials; transport is not poisoning.'), t('分开批准、机械接触、毒性与真品出运的证据。', 'Separate evidence for approval, mechanical contact, toxicity and original shipment.')],
  Lvl_07: [t('声音是否实时，与压力何时改变是两个问题。', 'Whether sound is live and when pressure changed are separate questions.'), t('把阀控执行、航行批准与旧录音分别核对。', 'Check valve execution, navigation approval and old audio separately.'), t('重建远程动作与掩盖，不把工具所有权当作操作者。', 'Reconstruct remote action and cover, without equating tool ownership with operation.')],
  Lvl_08: [t('先保全独立气样，不让风险模型代替现实测量。', 'Preserve independent air samples; a risk model cannot replace measurement.'), t('区分工牌名、本人批准和混合阀的实际执行。', 'Distinguish badge name, personal approval and actual mixing-valve execution.'), t('恢复人类批准、物理后果和删除记录的因果顺序。', 'Restore the causal order of human approval, physical effects and record deletion.')],
};

const STORIES = {
  Lvl_01: {
    pursuit: ['c_02', 'c_07'], convergence: ['c_02', 'c_03', 'c_05', 'c_07'],
    milestones: [
      beat('neon_pulse', ['c_02', 'c_07'], '伤痕与停电需要共同解释', 'Injury and outage need a shared explanation', '接口定向灼伤与监控电源中断相符；停电本身尚不能确定操作者。', 'The directed port burn is consistent with the camera power gap; an outage alone does not identify its operator.'),
      beat('neon_name', ['c_03', 'c_08'], '权限名不再是唯一身份线索', 'A permission name is not the only identity record', '读卡器存在复制硬件，保安的独立值班区间又覆盖致伤窗口；姓名与发现时间必须分别检验。', 'The reader contains copied hardware, while independent duty records cover the guard’s injury-window alibi. Check names separately from discovery time.'),
      beat('neon_local', ['c_03', 'c_05', 'c_02'], '本次现场操作出现可核验绑定', 'This on-site operation has a verifiable binding', 'N-17不再只是一张卡的权限名：本机活体确认与同会话脉冲回执可连接到独立伤痕。', 'N-17 is more than a badge permission: local live confirmation and its same-session pulse receipt can be compared with the independent injury.'),
      beat('neon_motive', ['c_04', 'c_06'], '交易背后是具体受害者', 'A specific victim stands behind the transaction', '医院原件与转让附件揭示家庭损害和继续交易的利害；动机不能代替本次动作证明。', 'Hospital originals and the transfer annex establish family harm and a continuing transaction; motive cannot substitute for proof of this action.'),
      beat('neon_return', ['c_03', 'c_05'], '返回的说法已改变', 'The account of returning has changed', 'Mei承认隐瞒返回，但提醒应核对复制卡和锁的时钟。系统把这记为人物改口，现场回执仍独立判断。', 'Mei acknowledges hiding her return but asks that the copied badge and lock clock be checked. This is a changed account; scene receipts remain independent.', { testimony: ['npc_01', 1] }),
    ],
    sequence: [
      beat('neon_prepare', ['c_01', 'c_02'], '准备与手段', 'Preparation and method', '购买的高压电容器与接口定向脉冲烧痕互相支持，而非普通钝击或自行过热。', 'The high-voltage capacitor purchase and directed port burn support a pulse mechanism rather than a blunt strike or spontaneous overheating.'),
      beat('neon_execute', ['c_05', 'c_07'], '23:17的现场动作', 'The on-site action at 23:17', '本机活体确认、同会话触发和独立停电标记连接这次现场操作；维修锁于23:19关闭。', 'Local live confirmation, the same-session trigger and independent power gap bind this on-site operation; the shaft lock closes at 23:19.'),
      beat('neon_interest', ['c_04', 'c_06'], '动机不抹掉责任边界', 'Motive does not erase responsibility boundaries', '家属试验伤害与技术继续出售解释具体利害，不能因此把全部商业责任等同这次袭击。', 'Family trial harm and a continuing technology sale establish the concrete conflict without equating all commercial responsibility with this attack.'),
      beat('neon_discover', ['c_08'], '发现发生在之后', 'Discovery comes afterward', 'Kenji的连续值班覆盖致伤窗口；他23:31发现尸体，不是23:31实施致伤。', 'Kenji’s continuous duty covers the injury window. His discovery at 23:31 is distinct from inflicting the injury then.'),
    ],
    aftermath: [
      beat('neon_family', ['c_06'], '医院记录仍需保全', 'The hospital record still matters', '姐姐受害的原件成为本局已保全材料；本案没有记录后续治疗结果，也不能把袭击结论当作试验责任调查已经完成。', 'The older sister’s injury record is preserved in this investigation. No later treatment outcome is established, and the attack finding does not complete the trial-liability inquiry.'),
      beat('neon_guard', ['c_08', 'c_05'], '澄清与失职分别记录', 'Record exoneration separately from shortcomings', '保安不在场得到独立记录支持；维修通道如何在停电时保持可用，仍是需要改进的安全问题。', 'Independent records support the guard’s alibi. A maintenance route remaining usable during an outage remains a separate safety issue.'),
    ],
  },
  Lvl_02: {
    pursuit: ['d_02', 'd_03'], convergence: ['d_03', 'd_05', 'd_06'],
    milestones: [
      beat('ghost_limits', ['d_03'], '设备边界可以被检验', 'The device has testable limits', 'QPS只供本机活体验证的单人穿越一处薄隔墙；回收标签不能说明远距传送或第二人同行。', 'QPS allows one locally verified wearer across one thin partition; its recovery tag establishes neither distant teleportation nor a second passenger.'),
      beat('ghost_plan', ['d_01', 'd_05'], '烧毁物与保全计划发生冲突', 'Burned objects conflict with a preservation plan', '空芯片被外部点燃，离线副本却早已保留；原始保全指令显示有人计划留下假象，但计划不等于执行。', 'Empty chips were ignited externally while an offline copy already existed. The original instruction establishes a planned decoy, not execution by itself.'),
      beat('ghost_route', ['d_03', 'd_06'], '本机使用和屋顶经过相互印证', 'Local use corroborates roof passage', 'Aria的佩戴确认、02:26耗能与02:34单人外出波形可连成路线；02:41只是后来的回收。', 'Aria’s wearer confirmation, 02:26 energy use and 02:34 single-person outward trace form a route. The 02:41 recovery is later.'),
      beat('ghost_trade', ['d_04', 'd_05'], '离开与交易是两条责任线', 'Departure and trading are distinct responsibility lines', '下载记录与独立交易副本可以支持机构交易调查，不会自动证明实验室发生绑架或谋杀。', 'The download and independent trading copy support a transaction inquiry without automatically establishing abduction or murder in the lab.'),
      beat('ghost_custody', ['d_03', 'd_06'], '回收者说明了证物来路', 'The collector explains custody', 'Otto说明他在压力警报之后回收设备。这段证词补充保管过程，独立设备和压力原件仍是路线依据。', 'Otto describes recovering the device after the pressure alert. His account supplements custody; independent device and pressure originals still establish the route.', { testimony: ['npc_03', 2] }),
    ],
    sequence: [
      beat('ghost_preserve', ['d_01', 'd_05'], '先保留资料，再留下烧毁表象', 'Preserve records before leaving a burned decoy', '案前保全指令与清空芯片的检验相符；资料并未因烧毁外观而全部消失。', 'The pre-incident preservation instruction matches emptied-chip tests; the burned appearance did not destroy all records.'),
      beat('ghost_cross', ['d_02', 'd_03'], '穿过额定隔墙，绕开锁门', 'Cross the rated partition to bypass the locked door', '入室后，Aria在02:26亲自确认佩戴并耗尽设备，穿过实验室隔墙，而非远距传送或被人连同设备带走。', 'After entry, Aria personally confirms wearing the device at 02:26, depleting it across the lab partition, rather than teleporting over distance or being carried away with it.'),
      beat('ghost_roof', ['d_03', 'd_06', 'd_07'], '经过屋顶，回收是后续事件', 'Pass the roof before later recovery', '02:17外部摄像头停机不等于没人离开；02:34的单人外出与02:41的设备回收是两个事件。', 'The 02:17 exterior-camera outage does not establish that nobody left. The single-person exit at 02:34 and device recovery at 02:41 are separate events.'),
      beat('ghost_reason', ['d_04', 'd_05'], '主动离开不替机构交易免责', 'A voluntary exit does not excuse the institutional transaction', '常规取得的原件已支持保留罪证、主动离开的解释；密钥下载与交付的责任仍应分别保全调查。', 'Ordinarily acquired originals support preserving evidence and a voluntary exit. Responsibility for key download and delivery remains separately documented.'),
    ],
    aftermath: [
      beat('ghost_unknown', ['d_03', 'd_06'], '已知路线与未知去向', 'A known route and an unknown destination', '本局能重建Aria离楼的方式；没有记录她离开屋顶之后的位置，不应把缺少后续记录写成已找到或已遇害。', 'This run reconstructs Aria’s exit from the building. Her location after the roof is not recorded; absence of later records establishes neither recovery nor death.'),
      beat('ghost_copy', ['d_05'], '副本的价值被保留下来', 'The value of the copy is preserved', '伪装饮料罐中的资料进入已保全证据链；这里确认资料存在与来源，不预告境外交易已经获得何种司法结果。', 'The disguised can’s records enter the preserved chain. Their existence and source are established, without inventing a later legal outcome for the overseas transaction.'),
    ],
  },
  Lvl_03: {
    pursuit: ['e_01', 'e_04'], convergence: ['e_01', 'e_03', 'e_04', 'e_07'],
    milestones: [
      beat('butterfly_fault', ['e_01', 'e_04'], '保护状态与输出分别异常', 'Protection and output are separately abnormal', '恢复代码之外还有独立执行摘要，能够区分未运行文件与实际过载。', 'Independent execution digests accompany the recovered code, distinguishing an unused file from an actual overload.'),
      beat('butterfly_actor', ['e_03', 'e_04'], '在场与部署可以互相核对', 'Presence and deployment can be cross-checked', '门侧独立影像和本机批准属于不同来源，不能只凭进入后台就断言执行过载。', 'Independent doorway footage and local approval are distinct sources; entering the backroom alone does not establish deployment.'),
      beat('butterfly_interest', ['e_02', 'e_06'], '非法生意之外还有具体勒索', 'Specific blackmail lies beyond the illegal trade', '芯片货物与付款要求形成调查线；收益违规和致死动作仍要分别判断。', 'The chips and payment demands establish an inquiry line; financial wrongdoing remains distinct from the lethal action.'),
    ],
    sequence: [
      beat('butterfly_deploy', ['e_01', 'e_03', 'e_04'], '后台批准到舱内执行', 'From backroom approval to pod execution', '本机批准的脚本摘要与独立舱控回执相同，安全锁绕过与4.7倍输出共同作用。', 'The locally approved script digest matches the independent pod receipt, joining the safety bypass and 4.7-fold output.'),
      beat('butterfly_harm', ['e_01', 'e_07'], '抑制剂与过载共同解释伤害', 'Depressant and overload jointly explain harm', '酒杯分析说明防御反应受抑，舱控记录说明异常输出；它们不是可以互相替代的单一解释。', 'Glass analysis establishes reduced defensive response while pod records establish abnormal output; neither source replaces the other.'),
      beat('butterfly_demand', ['e_02', 'e_06'], '被勒索的具体利益', 'The specific interest under blackmail', '消息与改装货物解释持续付款要求，仍需与部署证据共同支持本案归责。', 'Messages and modified goods explain continuing demands, alongside deployment evidence establishing attribution.'),
    ],
    aftermath: [beat('butterfly_beyond', ['e_06'], '俱乐部的其他责任仍独立存在', 'Other club responsibilities remain distinct', '改装芯片原件已保全。确认致死操作不意味着其他经营者的走私和安全责任已经调查完毕。', 'Modified-chip originals are preserved. Establishing the lethal operation does not complete inquiries into other operators’ smuggling and safety responsibilities.')],
  },
  Lvl_04: {
    pursuit: ['f_01', 'f_02'], convergence: ['f_01', 'f_03', 'f_04', 'f_07'],
    milestones: [
      beat('zero_conflict', ['f_01', 'f_02'], '平稳日志无法解释定向喷射', 'A smooth log cannot explain a directed jet', '实物裂纹与重复温控记录冲突，需要独立的作用路径。', 'Physical fractures conflict with repeated climate records, requiring an independent action path.'),
      beat('zero_path', ['f_03', 'f_07'], '设备路径可以实物核对', 'Physical traces test the device route', '履带磨屑与阀门扭矩指向同一维护设备；这首先证明设备，不是人的现场位置。', 'Track residue and valve torque identify the same maintenance device, establishing machinery before a person’s location.'),
      beat('zero_approve', ['f_03', 'f_04', 'f_07'], '批准载荷与实际路径相符', 'The approved payload matches the actual route', '本机批准、D-4接收回执和独立工具痕构成远程动作链，不需要操作者亲自进入冷库。', 'Local approval, D-4 receipt and independent tool marks form a remote-action chain without requiring the controller to enter the vault.'),
    ],
    sequence: [
      beat('zero_order', ['f_03', 'f_04'], '批准远程维护任务', 'Approve the remote maintenance task', '03:11的本人批准与D-4接收摘要绑定这次路线，不只是管理员账户拥有权限。', 'Personal approval at 03:11 and D-4’s received digest bind this route, beyond administrative capability.'),
      beat('zero_jet', ['f_01', 'f_03', 'f_07'], '设备经维护线形成定向喷射', 'The device produces a directed jet through the service line', '磨屑、阀痕和顶部喷射方向共同重建致伤路径。', 'Residue, valve marks and upper jet direction reconstruct the injury path together.'),
      beat('zero_cover', ['f_02', 'f_05', 'f_08'], '覆盖记录与清晨审计的利害', 'The overwrite and the interest in the dawn audit', '重复数据遮蔽实际变化，模型交易与提前预约的外部审计解释具体冲突。', 'Repeated data conceal actual changes; the model transaction and prebooked outside audit establish the conflict.'),
    ],
    aftermath: [beat('zero_public', ['f_05', 'f_08'], '模型交易与公共研究分别保全', 'Preserve the transaction and public research separately', '预约与交易材料已进入证据链；本局不把凶案结论扩写成气候模型已经公开或损失已经弥补。', 'The booking and transaction enter the record; the murder finding does not establish publication of the model or repair of the loss.')],
  },
  Lvl_05: {
    pursuit: ['g_01', 'g_04'], convergence: ['g_01', 'g_02', 'g_04', 'g_07'],
    milestones: [
      beat('sky_valve', ['g_01', 'g_04'], '具体载荷连接批准与阀门', 'A specific payload joins approval to the valve', '主控签署和本地执行器独立保存相同摘要，可以检验实际泄压而非诊断网访问能力。', 'Master signing and the local actuator independently retain the same digest, testing actual decompression rather than diagnostic access.'),
      beat('sky_clock', ['g_02', 'g_07'], '画面与签名都需独立校验', 'Both footage and signatures require independent checks', '视差循环和异常签名延迟说明不能按屏幕播放顺序归因。', 'Parallax loops and signature latency show why screen playback cannot establish attribution.'),
      beat('sky_interest', ['g_03', 'g_06', 'g_08'], '货物性质、收货人和警告相互核对', 'Cargo, recipient and warning cross-check one another', '残留与航单支持货物性质及收益联系，信标是待与原件核对的船长说法。', 'Residue and the manifest support cargo identity and financial links; the beacon remains the captain’s account to compare with originals.'),
    ],
    sequence: [
      beat('sky_execute', ['g_01', 'g_04'], '主控批准后发生本地泄压', 'Local decompression follows master approval', '本人签署的DEP-82载荷与阀控回执连接关闭报警和实际泄压。', 'The personally signed DEP-82 payload and valve receipt join alarm suppression to actual decompression.'),
      beat('sky_release', ['g_02', 'g_04', 'g_07'], '复制授权与循环画面掩盖转移', 'Copied authorization and looping footage cover transfer', '异常放行签名与18秒视差循环属于不同掩盖手段，需要用原始回执区分。', 'The abnormal release signature and eighteen-second parallax loop are separate covers distinguished through original receipts.'),
      beat('sky_profit', ['g_03', 'g_06', 'g_08'], '航线收益形成具体动机', 'Route proceeds establish a concrete motive', '货物检测、私人公司航单及船长警告共同解释死亡与货运的联系。', 'Cargo tests, the private-company manifest and the captain’s warning jointly connect the death to the route.'),
    ],
    aftermath: [beat('sky_cargo', ['g_03', 'g_06'], '非法货物不随凶案结案消失', 'Illegal cargo does not vanish with the murder finding', '货物性质与交接资料已保全；本局没有证明全部货柜已追回，也未替运输责任作最终裁判。', 'Cargo identity and handoff records are preserved; this run establishes neither recovery of every container nor final adjudication of transport liability.')],
  },
  Lvl_06: {
    pursuit: ['h_02', 'h_03'], convergence: ['h_01', 'h_02', 'h_03', 'h_04'],
    milestones: [
      beat('auction_base', ['h_02', 'h_03'], '不开正门也能执行维护动作', 'Maintenance can execute without opening the door', '生物批准与底座原始位置回执相符，展柜未开不是展品未动的证明。', 'Biometric approval matches original base-position receipts; a closed display is not proof of an unmoved work.'),
      beat('auction_harm', ['h_01', 'h_02'], '机械接触与纤维毒性分开成立', 'Mechanical contact and fiber toxicity are separately established', '夹爪路径说明接触位置，化验说明体温激活毒性，两者一起解释手套污染。', 'The gripper path establishes contact location while tests establish heat-activated toxicity; together they explain glove contamination.'),
      beat('auction_authentic', ['h_04', 'h_07'], '展厅物与箱中物有独立测量', 'Display and case have independent measurements', '树脂谱与量子标记分别检验复制品和真品，标签与封条不能替代检测。', 'Resin and quantum markers independently test replica and original; labels and seals do not replace measurements.'),
    ],
    sequence: [
      beat('auction_window', ['h_02', 'h_03'], '签署四十秒的具体维护载荷', 'Sign the specific forty-second maintenance payload', '本人活体批准与底座执行摘要相同，覆盖交换及手套内侧接触动作。', 'Personal live approval matches the base execution digest, covering both exchange and inner-glove contact.'),
      beat('auction_fiber', ['h_01', 'h_02'], '接触路径与毒性共同解释伤害', 'Contact and toxicity jointly explain harm', '执行器路径和纤维检验相互支持，而不是只凭修复室拥有材料归罪。', 'The actuator path and fiber test support one another, beyond blaming the restoration room for possessing material.'),
      beat('auction_profit', ['h_04', 'h_05', 'h_08'], '复制源与举报威胁形成利害', 'Replica source and disclosure establish the interest', '登记材料、基金回流和鉴定备忘共同解释为何真伪被掩盖。', 'Registered material, returning funds and the appraisal memo jointly explain concealment of authenticity.'),
    ],
    aftermath: [beat('auction_custody', ['h_07'], '真品运输与投毒责任分开', 'Transport and poisoning remain distinct', '冷箱标记及馆内封装记录已保全；运输违规不自动证明掌握馆内机械臂。', 'The cased marker and museum sealing record are preserved; transport violations do not establish control of the museum arm.')],
  },
  Lvl_07: {
    pursuit: ['i_01', 'i_02'], convergence: ['i_01', 'i_02', 'i_03', 'i_07'],
    milestones: [
      beat('deep_audio', ['i_02'], '求救播放不再是生存时钟', 'Distress playback is no longer a survival clock', '旧演练背景与重复呼吸需要同阀控原件分开判断，不能用最后一声推定死亡时刻。', 'Old drill background and repeated breath must be assessed separately from valve originals; the last playback cannot date death.'),
      beat('deep_command', ['i_01', 'i_03'], '航行批准绑定实际增压载荷', 'Navigation approval binds the actual pressure payload', '本人签署和潜水钟独立接收记录引用同一父会话，超出了密钥归属或设备能力。', 'Personal signing and the bell’s independent receipt reference the same parent session, beyond key ownership or capability.'),
      beat('deep_robot', ['i_03', 'i_07'], '工具所有权与远程操作者分开', 'Tool ownership is distinct from remote operation', '机器人接受外联令牌时，机械师本地台仍连续工作；需追查发令链。', 'The mechanic’s local station remains active while the robot accepts an uplink token; trace the issuing chain.'),
    ],
    sequence: [
      beat('deep_prepare', ['i_08'], '故障草案早于实际事件', 'The failure draft predates the event', '版本原件保留提前两小时创建的事故说法；它需与后续实际动作一起解释。', 'Original versions preserve an accident account created two hours early, to interpret alongside actual later actions.'),
      beat('deep_pressure', ['i_01', 'i_03'], '批准载荷在潜水钟执行', 'The approved payload executes at the bell', 'P-47的本人批准与独立阀控摘要相同，绕过舱内保险并远程增压。', 'Personal approval of P-47 matches the independent valve digest, bypassing cabin protection and raising pressure remotely.'),
      beat('deep_cover', ['i_02', 'i_07'], '旧声音与盗用工具构成掩盖', 'Old sound and a hijacked tool provide cover', '重复声纹制造错误生存印象，机器人外联擦除与本地修泵记录则区分控制者和机械师。', 'Repeated audio creates a false impression of survival; remote robot erasure and local pump records distinguish controller from mechanic.'),
      beat('deep_interest', ['i_04', 'i_05'], '保护区采样形成具体冲突', 'Protected-area collection establishes the conflict', '样本来源与六次检举记录相符，解释被阻止公开的利益。', 'Sample origin matches the six disclosure records, establishing the interest in preventing publication.'),
    ],
    aftermath: [beat('deep_ecology', ['i_04', 'i_05'], '生态责任超出一份事故报告', 'Ecological responsibility extends beyond an accident report', '样本与检举包已保全；本局并未证明热泉生态已经恢复或买方责任已经裁定。', 'Samples and the disclosure packet are preserved; this run does not establish ecological recovery or adjudication of the buyer’s responsibility.')],
  },
  Lvl_08: {
    pursuit: ['j_01', 'j_03'], convergence: ['j_01', 'j_02', 'j_03', 'j_07'],
    milestones: [
      beat('tower_physical', ['j_01'], '现实测量独立于模型', 'Physical measurement is independent of the model', '封管与氧浓度轨迹说明真实低氧，系统缺少风险记录不能否定它。', 'The tube and oxygen trace establish physical depletion; absent model risks cannot invalidate it.'),
      beat('tower_identity', ['j_03', 'j_07'], '工牌身份与本人批准不同', 'Badge identity differs from personal approval', '克隆硬件与电梯独立求救区分工牌名称；人类原签章另行批准具体环境载荷。', 'Clone hardware and independent elevator distress distinguish the badge name; an original human signature separately approves a specific environment payload.'),
      beat('tower_chain', ['j_01', 'j_02', 'j_03'], '批准、执行与删除分别留痕', 'Approval, execution and deletion leave separate traces', '签署原件、阀控执行和删除回执可恢复因果，不能只把系统拟人化归罪。', 'The signing original, valve execution and deletion receipt restore causality without attributing it solely to a personified system.'),
    ],
    sequence: [
      beat('tower_access', ['j_03', 'j_07'], '复制卡与人类批准分开核验', 'Verify the copied badge separately from human approval', '维护员被困时复制卡使用权限；具体环境载荷则由Lucan本人活体签署。', 'The copied badge uses access while the technician is trapped; Lucan personally live-signs the specific environment payload.'),
      beat('tower_air', ['j_01', 'j_03'], '批准载荷对应真实低氧', 'The approved payload corresponds to real oxygen depletion', 'ENV-42批准与AIR-43执行摘要相同，独立氧传感器记录物理后果。', 'ENV-42 approval and AIR-43 execution share a digest; the independent oxygen sensor records the physical effect.'),
      beat('tower_delete', ['j_02', 'j_03'], '删除风险不能删除事实', 'Deleting a risk cannot delete a fact', '人类权限发出的删除在执行链中另有回执，记录缺失不是现实没有发生的证明。', 'Human-authorized deletion has its own receipt in the execution chain; missing records cannot prove an event did not occur.'),
      beat('tower_interest', ['j_04', 'j_05', 'j_08'], '待公开名单与咨询收益形成利害', 'The registry disclosure and consulting proceeds establish the interest', '名单、合同和离线证词共同说明听证要揭露什么，以及谁会因此失去收益。', 'The registry, contract and offline testimony explain the planned disclosure and the financial interest threatened by it.'),
    ],
    aftermath: [beat('tower_residents', ['j_04', 'j_08'], '名单上的居民仍是真实的人', 'The people on the registry remain real people', '试验名单与离线证词已经保全；确认本案命令链不等于系统政策已经修复，更不能宣称两万名居民的影响已经解除。', 'The trial registry and offline testimony are preserved. Establishing this command chain does not establish repaired policy or removal of the impact on twenty thousand residents.')],
  },
};

export function applyCaseDesign(caseId, baseline) {
  const updates = TARGET_UPDATES[caseId] || {};
  const targets = baseline.targets.map(target => ({ ...target, ...updates[target.clue_id] }));
  const clueOverrides = { ...baseline.clue_overrides };
  for (const target of targets) {
    if (updates[target.clue_id]?.result) clueOverrides[target.clue_id] = {
      ...clueOverrides[target.clue_id], description: target.result,
    };
  }
  let report = caseId === 'Lvl_03' ? { ...baseline.report,
    support: { ...baseline.report.support, method: ['e_01', 'e_04', 'e_07'] },
    support_alternatives: { ...baseline.report.support_alternatives,
      opportunity: [...(baseline.report.support_alternatives?.opportunity || []), ['e_03', 'e_04']] },
  } : baseline.report;
  let puzzle = baseline.puzzle;
  let testimonies = baseline.testimonies;
  if (caseId === 'Lvl_02') {
    report = { ...report, methods: report.methods.map(item => item.id === 'phase_shift'
      ? method(item.id, '耗尽相位原型穿过额定隔墙绕开锁门，烧芯片作诱饵', 'Deplete the phase prototype across the rated partition to bypass the lock; burn decoy chips') : item) };
    puzzle = { ...puzzle, items: puzzle.items.map(item => item.id === 'phase'
      ? method(item.id, 'QPS耗能穿越28cm非承重隔墙', 'QPS expends its core crossing the 28 cm non-load-bearing partition') : item),
    workbench: { ...puzzle.workbench,
      edges: puzzle.workbench.edges.map(edge => edge.a === 'lab' && edge.b === 'phase'
        ? { ...edge, label: t('28cm非承重隔墙', '28 cm non-load-bearing partition') } : edge),
      records: { ...puzzle.workbench.records,
        phase: { ...puzzle.workbench.records.phase,
          fields: [...puzzle.workbench.records.phase.fields,
            { label: t('疏散图隔墙厚度', 'Evacuation-plan partition thickness'), value: '28 cm / non-load-bearing' }] },
      },
    } };
    testimonies = { ...testimonies, npc_02: testimonies.npc_02.map((entry, index) => index === 0
      ? { ...entry, response: t('她问过QPS能否穿过实验室那道薄隔墙、绕开锁门。我没替她操作，屋顶传感器那个人可能就是她。', 'She asked whether QPS could cross the lab’s thin partition to bypass the locked door. I did not operate it for her; the roof sensor may have recorded her.') } : entry) };
  }
  return { ...baseline, case_design_revision: CASE_DESIGN_REVISION, report, puzzle, testimonies,
    relations: [...baseline.relations, ...(SUPPORT_UPDATES[caseId] || [])],
    targets, clue_overrides: clueOverrides,
    case_design: { ...STORIES[caseId], focus: FOCUSES[caseId] } };
}

function visibleBeat(run, entry) {
  const known = new Set(run.state?.unlocked_clues || []);
  if (!entry.evidence_ids.length || !entry.evidence_ids.every(id => known.has(id))) return false;
  if (entry.testimony && (run.investigation?.testimony_stages?.[entry.testimony[0]] || 0) < entry.testimony[1]) return false;
  return !entry.puzzle || run.investigation?.puzzle_completed === true;
}
const publicBeat = entry => ({ id: entry.id, title: { ...entry.title }, body: { ...entry.body }, evidence_ids: [...entry.evidence_ids] });

export function publicInvestigationStory(run, spec) {
  if (run.investigation_version !== 2 || run.investigation?.case_design_revision !== CASE_DESIGN_REVISION
    || spec?.case_design_revision !== CASE_DESIGN_REVISION || !spec.case_design) return null;
  const config = spec.case_design;
  const has = clues => clues.length > 0 && clues.every(id => run.state?.unlocked_clues?.includes(id));
  const passed = (run.status === 'completed' || (run.status === 'settled' && run.final_report))
    && run.judge_result?.is_passed === true;
  const stage = passed || has(config.convergence) ? 'convergence' : has(config.pursuit) ? 'pursuit' : 'opening';
  const focus = config.focus[['opening', 'pursuit', 'convergence'].indexOf(stage)];
  return { stage, focus: { ...focus },
    milestones: config.milestones.filter(entry => visibleBeat(run, entry)).map(publicBeat),
    resolution: passed ? {
      title: t('本局已确认的因果与后续边界', 'This run’s established causes and remaining boundaries'),
      sequence: config.sequence.filter(entry => visibleBeat(run, entry)).map(publicBeat),
      aftermath: config.aftermath.filter(entry => visibleBeat(run, entry)).map(publicBeat),
    } : null,
  };
}
