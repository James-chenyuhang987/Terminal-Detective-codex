// Authored evidence scopes are private until the corresponding material is
// obtained. Roles describe relevance, never a public checklist of answer routes.
import { INVESTIGATION_RAW_MATERIALS_REVISION } from './rawMaterials.js';
import { CASE_DESIGN_REVISION } from './caseDesign.js';

export const REPORT_EXPLANATION_REVISION = 1;
const DIMENSIONS = ['opportunity', 'method', 'motive', 'timeline'];
const note = (dimensions, zh, en) => ({ dimensions, text: { zh, en } });
const NOTES = {
  Lvl_01: {
    c_01: note(['method', 'timeline'],
      '收据证明23:05购买过高压电容器，能说明物料准备和付款时间；它不单独证明购买者就是操作者，或电容器已经用于致伤。',
      'The receipt establishes a high-voltage capacitor purchase at 23:05, supporting preparation and payment time. It does not identify the operator or establish that these parts caused the injury.'),
    c_02: note(['method'],
      '颈部接口的灼伤支持高压电磁脉冲这一致伤机制，区别于枪击或钝击；伤型本身不能指认使用设备的人。',
      'The neck-port burn supports a high-voltage electromagnetic pulse mechanism rather than a gunshot or blunt impact. The wound type does not identify who used a device.'),
    c_03: note(['opportunity', 'timeline'],
      '读卡原件固定23:16的复制卡事件和N-17会话，说明权限被使用；硬件签章不同，不能把卡上姓名直接当成现场持卡人。',
      'The original read fixes the copied-card event and N-17 session at 23:16, establishing use of a permission. Different hardware means the displayed name is not proof of the on-site holder.'),
    c_04: note(['motive'],
      '协议证明Victor与NovaCorp存在神经接口技术出售安排，可用于说明交易利害；交易身份不能代替本次袭击的动作证据。',
      'The agreement establishes a neural-interface sale between Victor and NovaCorp and its commercial stakes. Participation in the deal does not establish the act of this attack.'),
    c_05: note(['opportunity', 'method', 'timeline'],
      '维修锁原件将Mei的本机活体确认、N-17同会话脉冲回执和23:17至23:19的开合绑定到本次操作；回执不单独鉴定伤口的致伤性质。',
      'The original shaft-lock record binds Mei’s local live confirmation, the N-17 pulse receipt and the 23:17–23:19 opening interval to this operation. A receipt alone does not diagnose the wound mechanism.'),
    c_06: note(['motive'],
      '医院原件确认Mei的姐姐因NovaCorp试验受伤及Mei的家属身份，说明具体损害与关切；家属受害本身不证明实施袭击。',
      'The hospital original establishes Mei’s older sister’s trial injury and Mei’s family connection, explaining a concrete harm and concern. A relative’s injury does not establish commission of the attack.'),
    c_07: note(['method', 'timeline'],
      '摄像头在案发窗口损毁的特征与EMP干扰相符，可约束监控中断和设备作用；缺帧并不能单独指认操作者。',
      'The incident-window camera destruction is consistent with EMP interference, constraining the outage and device effect. Missing footage does not identify the operator.'),
    c_08: note(['opportunity', 'timeline'],
      '独立值班记录把Kenji置于23:10至23:25的地下停车场，并把23:31发现尸体分开记录；它澄清窗口，不代表整晚从未上楼。',
      'The independent duty record places Kenji underground from 23:10 to 23:25 and separately records discovery at 23:31. It clarifies that interval without proving he never went upstairs all night.'),
  },
  Lvl_02: {
    d_01: note(['method'],
      '燃烧残留证明七枚芯片先被清空、再从外侧点燃，支持现场经过布置；空壳不能证明人员死亡或全部研究资料毁灭。',
      'Burn traces establish that seven chips were emptied before external ignition, supporting a staged scene. Empty shells do not establish a death or destruction of every research record.'),
    d_02: note(['opportunity', 'timeline'],
      '工牌原件记录02:18进入且没有刷出，门锁状态显示从内锁死；没有刷出记录不等于没有其他离开路径。',
      'The badge original records entry at 02:18 without an exit scan, and the door was locked inside. No exit scan does not exclude every other departure route.'),
    d_03: note(['opportunity', 'method', 'timeline'],
      '设备回执证明Aria于02:26活体确认、耗尽QPS穿过额定内的28cm隔墙；02:41只记设备回收，不能据此补写她离楼后的目的地。',
      'The device receipt establishes Aria’s live-confirmed QPS use at 02:26 across a permitted 28 cm partition, exhausting its core. The 02:41 recovery records the device, not her later destination.'),
    d_04: note(['motive', 'timeline'],
      '密钥库原件固定Harlan在01:55下载完整协议集的管理员访问，说明资料被取出；单凭下载不能断言失踪者如何离开。',
      'The vault original fixes Harlan’s administrator download of the protocol archive at 01:55, establishing extraction of records. A download alone says nothing about how the missing person departed.'),
    d_05: note(['method', 'motive'],
      '离线副本保全密钥交付文件和Aria事前留下诱饵、携证离开的指令，说明保全动因及预先计划；书面计划不等于路线已经完成。',
      'The offline copy preserves key-delivery papers and Aria’s pre-incident decoy and evidence-preservation instruction, explaining motive and planning. A written plan does not prove completed travel.'),
    d_06: note(['opportunity', 'timeline'],
      '压力板把02:34单人向外通行与02:41设备回收分成两次事件，约束屋顶路线；载荷和方向不能单独识别人名或楼外去向。',
      'The plate separates one outward passage at 02:34 from device recovery at 02:41, constraining the roof route. Load and direction alone do not establish a name or destination beyond the building.'),
    d_07: note(['opportunity', 'timeline'],
      '外部摄像头在02:17同步断电且与实验室内部控制器联动，说明遮蔽窗口和控制来源；内部控制来源不直接等于某个具体人。',
      'The external cameras lose power together at 02:17 through the lab’s internal controller, establishing the obscured interval and control origin. An internal origin alone is not a person’s identity.'),
    d_08: note(['motive', 'timeline'],
      '通话原件证明Harlan在23:40与境外地址加密通话18分钟；地点和时长不披露通话内容，也不能单独证明交易或失踪责任。',
      'The call original establishes Harlan’s eighteen-minute encrypted overseas call at 23:40. Address and duration do not reveal its contents or independently establish a deal or responsibility for the disappearance.'),
  },
  Lvl_03: {
    e_01: note(['method'],
      '舱内痕迹证明峰值达到上限4.7倍且保护被软件绕过，支持人为过载机制；设备异常不能单独确定部署人。',
      'Pod traces establish a peak at 4.7 times the limit and a software safety bypass, supporting an induced overload. The equipment anomaly alone does not identify the deployer.'),
    e_02: note(['motive'],
      '接口缓存保存每月五万信用点的封口索款，说明勒索压力；代号和金钱要求不能替代现场动作证明。',
      'The implant cache preserves a demand for fifty thousand credits monthly for silence, establishing extortion pressure. A code name and demand do not establish the on-site act.'),
    e_03: note(['opportunity', 'timeline'],
      '独立门侧影像与原始读卡把Sable置于01:20至01:26的后台，支持操作地点与窗口；在场不自动证明执行过载脚本。',
      'Independent door-side footage and original reads place Sable in the backroom from 01:20 to 01:26, supporting location and interval. Presence does not by itself establish script execution.'),
    e_04: note(['opportunity', 'method'],
      '平板部署回执将Sable的本机活体验证与安全绕过、4.7倍功率脚本连接，并与舱控制器摘要一致；它证明部署执行，不等于已经解释所有致伤因素。',
      'The tablet deployment receipt binds Sable’s local live verification to the safety-bypass and 4.7-times-power script, matching the pod receipt. It establishes deployment without necessarily explaining every factor in the injury.'),
    e_05: note(['opportunity', 'timeline'],
      'Lena的证词将Sable向后门移动的观察置于约01:20；这是方向和大致时间的证词，不是具体操作的执行记录。',
      'Lena places her observation of Sable moving toward the rear door at about 01:20. This is testimony about direction and approximate time, not a record of a specific executed action.'),
    e_06: note(['motive'],
      '芯片型号与供应商账单不符，证明有未如实登记的改装货物，可解释走私利害；持有货物不直接证明致死操作。',
      'The modified chips do not match supplier invoices, establishing unreported goods and a smuggling interest. Possession does not establish the lethal operation.'),
    e_07: note(['method', 'opportunity'],
      '酒杯检验与独立定量泵原件分别证明抑制剂作用、同杯编号及Sable确认的配液动作；杯子放在吧台本身不能归责。',
      'The glass test and independent dosing-pump original separately establish suppressant effect, the matching cup and Sable’s confirmed dosing action. A glass’s location at the bar is insufficient for attribution.'),
    e_08: note(['opportunity', 'timeline'],
      'VIP计费与五份独立终端记录排除Ren在01:20至01:26亲自进入后台；它不澄清其非法收货和收益责任。',
      'VIP billing and five independent terminals exclude Ren’s personal backroom presence from 01:20 to 01:26. They do not resolve liability for illicit deliveries or proceeds.'),
  },
  Lvl_04: {
    f_01: note(['method'],
      '霜裂纹指向顶部维护口瞬时液氮喷射，而非环境缓慢降温；喷射方向本身不识别下令或实施的人。',
      'The frost fractures indicate an instantaneous nitrogen jet from the upper service hatch rather than gradual ambient cooling. Jet direction does not identify who ordered or performed it.'),
    f_02: note(['timeline', 'opportunity'],
      '03:12至03:23的温控数值被循环覆盖，说明记录失真且覆盖需要管理员权限；权限要求并不是具体操作者身份。',
      'Climate values from 03:12 to 03:23 were overwritten with a loop, establishing distorted records and required administrator access. A permission requirement does not identify its user.'),
    f_03: note(['method'],
      '顶部管道磨屑与液氮结晶符合D-4履带型号，支持该型号设备经过喷射通路；型号匹配本身不证明批准身份。',
      'Upper-duct track debris and nitrogen crystals match the D-4 model, supporting that equipment’s passage along the spray route. A model match does not identify who approved it.'),
    f_04: note(['opportunity', 'method', 'timeline'],
      '03:11的本机活体批准与D-4独立回执把Elias连接到指定液氮旁路及顶部路线任务；这证明远程批准，不要求他本人进入冷库。',
      'The 03:11 live console approval and independent D-4 receipt bind Elias to the specified nitrogen bypass and upper route. They establish remote approval without requiring his personal entry into the vault.'),
    f_05: note(['motive'],
      '境外出售草案以Noor准备公开的预测模型为交易对象，说明公开与出售间的利益冲突；草案不是已经成交的收款证明。',
      'The foreign sale draft offers the prediction model Noor planned to publish, establishing a publication-versus-sale conflict. A draft is not proof of a completed payment.'),
    f_06: note(['opportunity', 'timeline'],
      '机库连续影像把Mira置于02:50至03:35的风机维修工作，排除同期亲自进入冷库；位置记录不解释其他设备上的指令。',
      'Continuous hangar footage places Mira at turbine repairs from 02:50 to 03:35, excluding personal entry into the vault then. Location records do not explain commands on other equipment.'),
    f_07: note(['method'],
      '旁路阀的新鲜电动扳手痕迹与D-4默认扭矩相符，支持阀门被该类工具操作；工具参数不能单独指认下令者。',
      'Fresh powered-wrench marks on the bypass valve match D-4 torque, supporting manipulation by that tool class. Tool settings do not identify the person issuing an order.'),
    f_08: note(['motive', 'timeline'],
      'Noor的清晨审计预约和留言说明她准备追查主管账户外传，建立公开风险；留言中的指控仍需独立记录核实。',
      'Noor’s dawn audit booking and note establish her plan to challenge exports from the supervisor account and the risk of exposure. The allegation still requires independent verification.'),
  },
  Lvl_05: {
    g_01: note(['method', 'timeline'],
      '救生舱本地原件记录DEP-82外部指令实际打开泄压阀，且非舱内手动解除保险；执行回执本身不识别外部批准人。',
      'The lifeboat original records external command DEP-82 actually opening the release valve without an internal manual safety release. An execution receipt alone does not identify the external authorizer.'),
    g_02: note(['method', 'opportunity'],
      '放行签名的延迟与Jonah神经密钥不符，支持高权限复制签名；署名不能直接证明Jonah亲自放行，也不单独说明致死动作。',
      'Release-signature latency differs from Jonah’s neural key, supporting a privileged copy. The name does not establish his personal release or independently explain the lethal action.'),
    g_03: note(['motive'],
      '泊位武器级氚化物与医疗冷却剂申报不符，说明货物性质被隐瞒；物质类型不直接识别交易收益者或致死操作人。',
      'Weapons-grade tritide at the berth conflicts with the coolant declaration, establishing concealed cargo identity. Its type does not identify the beneficiary or lethal operator.'),
    g_04: note(['opportunity', 'method', 'timeline'],
      '主控原件将Rook的活体签署绑定到事故前两分钟的报警关闭和DEP-82载荷，并与本地执行摘要一致；这针对本次阀门动作，不只是诊断权限。',
      'The master original binds Rook’s live signature to alarm suppression and DEP-82 two minutes before the death, matching local execution. It concerns this valve action rather than mere diagnostic privileges.'),
    g_05: note(['opportunity', 'timeline'],
      '六个独立传感器连续记录Yara在事故期间进行缆索校准，澄清其工作位置；这些记录不代替主控操作的执行原件。',
      'Six independent sensors continuously place Yara at tether calibration during the incident, clarifying location. They do not replace original master-console execution records.'),
    g_06: note(['motive'],
      '未上链航单把收货人代号连接到Rook私人公司的标识，说明运输利益关联；收货关系本身不证明实施致死动作。',
      'The off-chain manifest links its recipient code to Rook’s private company, establishing a transport interest. A receiving relationship does not establish the lethal action.'),
    g_07: note(['timeline'],
      '每18秒重复的星背景视差证明监控正在循环，不能把重播次数当作真实经过时间；它不单独确定谁替换画面。',
      'Starfield parallax repeating every eighteen seconds establishes looped surveillance; replay counts are not elapsed event time. The loop alone does not identify its maker.'),
    g_08: note(['motive', 'timeline'],
      '临终信标保存Jonah对军用货出售和放行记录的质疑，说明当事人的担忧；残缺指控不能替代货物与交易的独立证据。',
      'The final beacon preserves Jonah’s concerns about military cargo sales and the release record. A fragmentary allegation does not replace independent cargo and transaction evidence.'),
  },
  Lvl_06: {
    h_01: note(['method'],
      '手套纤维的体温释毒特性和封装设备来源支持接触致毒机制；材料来源本身不识别本次放置人。',
      'The glove fibers’ heat-triggered neurotoxin and sealing-rig origin support contact poisoning. A material source does not identify who placed them this time.'),
    h_02: note(['opportunity', 'method', 'timeline'],
      '00:07底座四十秒维护窗的原始轨迹记录下方交换和手套内侧接触，且展柜门未开；轨迹本身不鉴定纤维毒性或批准身份。',
      'Original traces in the base’s forty-second 00:07 window record a lower exchange and contact inside the glove without opening the display door. A path alone establishes neither toxicity nor the authorizer.'),
    h_03: note(['opportunity', 'method'],
      'Tessa的本机活体签名批准交换及手套纤维载荷，并与执行器摘要一致；签名证明本次批准，不替代毒性与真伪测量。',
      'Tessa’s local live signature approves the exchange and glove-fiber payload, matching the actuator digest. It establishes this approval without replacing toxicity or authenticity tests.'),
    h_04: note(['motive', 'method'],
      '赝品树脂匹配修复室三周前登记批次，说明复制材料的来源联系；批次一致不直接证明是谁实施致死操作。',
      'The replica resin matches a restoration-lab batch registered three weeks earlier, establishing a source link. A matching batch does not identify the lethal operator.'),
    h_05: note(['motive'],
      '中标款经七层账户回流Tessa控制的基金，说明实际资金受益；资金流本身不能替代致死操作的现场证据。',
      'The winning funds return through seven accounts to Tessa’s controlled fund, establishing a financial benefit. Money flow does not replace scene evidence of the lethal action.'),
    h_06: note(['opportunity', 'timeline'],
      'Juno眼镜的连续外环影像排除她进入展厅维护层，澄清其巡逻范围；不因此推定所有有维护权限者都实施了操作。',
      'Juno’s continuous outer-ring recording excludes her entry into the gallery service level, clarifying patrol limits. It does not establish that everyone with service access acted.'),
    h_07: note(['timeline', 'method'],
      '冷箱量子标记和馆内预封痕迹证明真品在交接前被装入，约束运输先后；承运人持有冷箱不自动等于实施馆内致死操作。',
      'The case marker and museum pre-sealing traces establish that the original was loaded before handoff, constraining transport order. Holding the case does not establish performance of the lethal gallery action.'),
    h_08: note(['motive', 'timeline'],
      'Mara的笔记与次日举报预约记录她准备公开R-41复制来源，说明暴露风险；笔记不能单独证明谁因此实施致死动作。',
      'Mara’s note and next-day disclosure booking establish her intention to expose the R-41 copying source and the risk of exposure. They do not identify who responded with a lethal action.'),
  },
  Lvl_07: {
    i_01: note(['method', 'timeline'],
      '潜水钟阀控原件证明P-47指令实际绕过保险并增压，保留父会话和摘要；动作不能靠扬声器播放次数定时，也不单独识别批准人。',
      'The bell’s valve original establishes that P-47 actually bypassed protection and raised pressure, retaining its parent and digest. Playback counts cannot date the action or identify its authorizer.'),
    i_02: note(['timeline', 'method'],
      '音频来自三日前演练且每47秒重复同一呼吸声，证明求救为拼接重播；最后一次播放不是可靠的致死时间。',
      'Audio from a drill three days earlier repeats the same breath every forty-seven seconds, establishing a composite replay. Its last playback is not a reliable time of death.'),
    i_03: note(['opportunity', 'method', 'timeline'],
      '离站原件把Neris的航行台活体签署绑定到P-47增压与声呐覆盖，并与独立接收摘要一致；这证明本次批准，不是仅据艇的所有权归责。',
      'The departure original binds Neris’s live console signature to P-47 pressure and sonar cover, matching the independent receipt. It establishes this approval rather than attributing responsibility from boat ownership.'),
    i_04: note(['motive'],
      '保护区特有菌落和高价研究用途说明非法采样的资源价值；经济价值不能单独证明谁批准采样或实施伤害。',
      'Protected-vent colonies and their expensive research use establish the resource’s value. Value alone identifies neither the approving account nor the person causing harm.'),
    i_05: note(['motive'],
      '审计包记录六次非法采样并指向站长账户，说明Oren准备揭露的事项；账户责任不自动等于本次致死动作。',
      'The audit packet records six illegal collections and the approving station account, establishing what Oren intended to expose. Account responsibility does not by itself establish the lethal action.'),
    i_06: note(['opportunity', 'timeline'],
      '医疗舱门和生命体征连续记录Lio在案发时治疗两名潜水员，支持其位置解释；治疗记录不解释其他地点的具体动作。',
      'Medical-lock and vital-sign records continuously place Lio treating two divers during the incident, supporting location. Treatment records do not explain specific actions elsewhere.'),
    i_07: note(['method', 'opportunity', 'timeline'],
      '维修机器人在事故前被盗用九分钟，而Sana仍在泵舱；它区分设备使用与所有者位置，不能单凭归属认定Sana亲自操作。',
      'The robot was hijacked for nine minutes before the death while Sana remained in the pump bay. This separates equipment use from its owner’s location; ownership does not prove her personal operation.'),
    i_08: note(['timeline', 'motive'],
      '保险报告比事故早两小时写好，固定了事前准备的故障说法；提前草案可检验预知与掩饰，仍不能单独证明全部执行步骤。',
      'The insurance report predates the incident by two hours, fixing a prepared failure account. It bears on prior knowledge and concealment without independently establishing every execution step.'),
  },
  Lvl_08: {
    j_01: note(['method', 'timeline'],
      '气样、独立氧记录和AIR-43回执分别证明异常混气、氧浓度下降及实际阀控执行；物理测量不单独识别人类批准人。',
      'The sample, independent oxygen record and AIR-43 receipt establish abnormal mixing, falling oxygen and actual valve execution. Physical measurements alone do not identify a human authorizer.'),
    j_02: note(['timeline', 'opportunity'],
      '核心在死亡前六分钟删除高危预测，来源为议会主任权限；它固定删除时点与权限来源，不自动证明系统自主作案。',
      'The core erased high-risk paths six minutes before the death through council-director access. This fixes deletion time and permission origin without establishing autonomous system action.'),
    j_03: note(['opportunity', 'method', 'timeline'],
      'ENV-42活体签章将Lucan绑定到空气报警关闭及指定混气载荷，并与独立阀控摘要一致；批准、执行、删除仍应分别记录。',
      'ENV-42’s live signature binds Lucan to disabling air alarms and the specified mixing payload, matching independent valve control. Approval, execution and deletion remain distinct events.'),
    j_04: note(['motive'],
      '名单证明两万名低信用居民被纳入情绪试验及Amara准备公开此事，说明听证内容和公众损害；名单不直接证明致死命令。',
      'The registry establishes the trial involving twenty thousand low-credit residents and Amara’s plan to disclose it, explaining the hearing and public harm. A registry does not establish the lethal command.'),
    j_05: note(['motive'],
      '咨询公司付款与试验的稳定指标挂钩，且由Lucan控制，说明具体利益关系；收益关系本身不证明其执行本次致死动作。',
      'Consultancy payments depend on trial stability metrics and the company is controlled by Lucan, establishing a concrete interest. Benefit alone does not establish this lethal action.'),
    j_06: note(['opportunity', 'timeline'],
      '独立节点连续存证Iria在塔外直播，支持她在事故期间的位置；连续影像不代表她知道塔内发生的全部事情。',
      'Independent nodes continuously notarize Iria’s stream outside the tower, supporting her location during the incident. Continuous footage does not mean she knew everything that happened inside.'),
    j_07: note(['opportunity', 'timeline'],
      '复制工牌进机房与Tomas困在电梯持续求救并存，说明卡片身份与本人位置应分开；复制卡不能直接指认真正操作者。',
      'A copied badge enters the plant while Tomas remains trapped and calling from the elevator, separating badge identity from personal location. A copied card does not identify the actual operator.'),
    j_08: note(['motive'],
      '离线晶片保留Amara对预测记录被抹除的警告，说明其担忧与保全意图；警告不是某个具体人已执行删除的独立证明。',
      'The offline chip preserves Amara’s warning about erased predictions, establishing concern and preservation intent. A warning does not independently establish which person performed deletion.'),
  },
};
const HIDDEN_DIMENSIONS = {
  Lvl_01: ['opportunity', 'method', 'timeline'],
  Lvl_02: ['opportunity', 'method', 'motive', 'timeline'],
  Lvl_03: ['opportunity', 'method', 'motive'],
  Lvl_04: ['opportunity', 'method', 'timeline'],
  Lvl_05: ['opportunity', 'motive'],
  Lvl_06: ['opportunity', 'method'],
  Lvl_07: ['opportunity', 'method', 'timeline'],
  Lvl_08: ['opportunity', 'method', 'timeline'],
};

const localize = (value, lang) => value?.[lang === 'en' ? 'en' : 'zh'] || '';
const distinct = values => [...new Set(values)];
function active(run, spec) {
  return run?.investigation_version === 2 && run.investigation?.report_explanation_revision === REPORT_EXPLANATION_REVISION
    && run.investigation.case_design_revision === CASE_DESIGN_REVISION && spec?.case_design_revision === CASE_DESIGN_REVISION
    && Object.hasOwn(NOTES, run.case_id);
}
function obtainedIds(run, spec) {
  const ordinary = spec.targets.map(target => target.clue_id);
  const allowed = new Set([...ordinary, spec.hidden.clue_id]);
  return distinct((run.state?.unlocked_clues || []).filter(id => allowed.has(id)));
}
function scope(run, spec, clueId, lang) {
  const authored = NOTES[run.case_id]?.[clueId];
  if (authored) return { dimensions: authored.dimensions, explanation: localize(authored.text, lang) };
  if (clueId === spec.hidden.clue_id) {
    return { dimensions: HIDDEN_DIMENSIONS[run.case_id], explanation: localize(spec.hidden.result, lang) };
  }
  return { dimensions: [], explanation: '' };
}

export function publicReportEvidenceRoles(run, spec, lang = 'zh') {
  if (!active(run, spec)) return [];
  return obtainedIds(run, spec).map(clueId => {
    const value = scope(run, spec, clueId, lang);
    return { clue_id: clueId, roles: value.dimensions.map(dimension => ({ dimension, explanation: value.explanation })) };
  });
}

/** Explain submitted attachments without judging or exposing a missing route. */
export function explainSubmittedReport(run, spec, groups, lang = 'zh') {
  if (!active(run, spec)) return null;
  const obtained = new Set(obtainedIds(run, spec));
  const en = lang === 'en';
  return { dimensions: DIMENSIONS.map(dimension => {
    const attached = distinct((Array.isArray(groups?.[dimension]) ? groups[dimension] : []).filter(id => obtained.has(id)));
    const routes = [spec.report.support[dimension], ...(run.investigation.raw_materials_revision === INVESTIGATION_RAW_MATERIALS_REVISION
      ? spec.report.support_alternatives?.[dimension] || [] : [])];
    const complete = routes.filter(route => Array.isArray(route) && route.length && route.every(id => attached.includes(id)));
    const used = distinct(complete.flat());
    const context = attached.filter(id => !used.includes(id));
    const prefix = used.length
      ? en ? 'This dimension is jointly supported by these attachments. This describes evidence coverage; the selected conclusion is checked separately.'
        : '本环节由这些附证共同支持。这里只说明证据覆盖范围，所选结论仍由系统另行校验。'
      : en ? 'These attachments describe established facts within the following limits; they do not yet jointly establish this dimension.'
        : '这些附证目前说明下列已知事实及其边界，尚不能共同确立本环节。';
    const explained = used.length ? used : attached.filter(id => scope(run, spec, id, lang).dimensions.includes(dimension));
    const notes = explained.map(id => {
      const explanation = scope(run, spec, id, lang).explanation;
      const source = spec.targets.find(target => target.clue_id === id) || spec.hidden;
      return `${localize(source.label, lang)}: ${explanation}`;
    });
    const backgroundCount = used.length ? context.length : attached.length - explained.length;
    const background = backgroundCount ? en ? `${backgroundCount} attachment(s) are retained as background and can be reviewed separately.`
      : `有${backgroundCount}份附件保留为背景，可另行展开查阅。` : '';
    return { dimension, used_evidence_ids: used, context_evidence_ids: context,
      explanation: attached.length ? [prefix, ...notes, background].filter(Boolean).join(' ')
        : en ? 'No obtained evidence was attached to this dimension. Continue investigating, then attach specific material.'
          : '本环节尚未附上已获材料。可继续调查，再选择具体材料附上。' };
  }) };
}
