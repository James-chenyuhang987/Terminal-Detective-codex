// Private authored outcomes. Only publish a method's finding after it has been
// performed; method labels, scopes and inquiry prompts are safe before a check.
export const INSPECTION_REVISION = 1;

const text = (zh, en) => ({ zh, en });
const method = (id, label, scope, finding) => ({ id, label, scope, ...(finding ? { finding } : {}) });
const finding = (result, limitation) => ({ result, limitation });

const BUTTERFLY_INSPECTIONS = {
  e_01: {
    inquiry: text('保险开关完好，是否就能排除舱内过载？', 'Does an intact safety switch rule out a pod overload?'),
    observation: text('保险开关外观完好，峰值指示却超出刻度。触点可以测量，诊断口也保留本次运行记录。',
      'The safety switch looks intact, but the peak indicator exceeds its scale. Its contacts can be measured, and the diagnostic port retains this session’s records.'),
    methods: [
      method('diagnostics', text('对照功率原始记录与安全锁执行回执', 'Compare original power records with safety-lock execution receipts'),
        text('核对本次输出幅度和保护指令是否实际执行。', 'Check this session’s output and whether protection instructions executed.')),
      method('exterior', text('测量保险触点并检查熔断与烧蚀痕迹', 'Measure safety contacts and inspect fuse and burn traces'),
        text('检查机械保护部件的当前状态。', 'Examine the current condition of the mechanical protection.')),
      method('inventory', text('按设备检验标签判断案发时是否正常', 'Assess incident operation from the equipment inspection label'),
        text('查阅设备登记的检验状态。', 'Read the equipment’s recorded inspection status.')),
    ],
    preliminary: finding(text('保险触点能够导通，开关和熔断部件未见对应的物理损坏。',
      'The safety contacts conduct, and the switch and fuse components show no corresponding physical damage.'),
    text('这只说明机械部件的状态，不能确定案发输出功率，也不能证明保护指令当时执行过。',
      'This establishes only the mechanical condition. It does not determine incident power or prove that protection instructions executed.')),
    failure_explanation: text('检验标签记录的是此前的检查，不是本次运行。它不能解决完好开关与超刻度指示之间的矛盾。',
      'The inspection label describes an earlier check, not this session. It cannot resolve the discrepancy between an intact switch and the off-scale indicator.'),
  },
  e_02: {
    inquiry: text('这些提醒能说明怎样的付款关系，能否确定收件人？', 'What payment relationship do these reminders establish, and can they identify the recipient?'),
    observation: text('缓存中有重复付款提醒，收件人只写了一个字母。可见摘要与加密原件分别保存。',
      'Repeated payment reminders address the recipient by one letter. Visible previews are stored separately from the encrypted originals.'),
    methods: [
      method('metadata', text('恢复消息原件并核对签章、金额与上下文', 'Recover original messages and verify signatures, amounts and context'),
        text('核验付款要求的内容和来源，不将缩写直接当作人名。', 'Verify the demands and their source without treating an initial as a person’s identity.')),
      method('surface', text('整理可见提醒的日期、收件标记与重复措辞', 'Arrange visible reminders by date, recipient marker and repeated wording'),
        text('检查摘要是否描述同一组持续付款要求。', 'Check whether the previews concern the same continuing payment demands.')),
      method('summarize', text('用收件人首字母直接认定付款对象', 'Identify the payer directly from the recipient’s initial'),
        text('按可见的收件标记尝试归属消息。', 'Attempt to attribute the messages using the visible recipient marker.')),
    ],
    preliminary: finding(text('可见提醒反复使用同一个收件标记，并要求继续付款；它们不是互不相干的通知。',
      'The visible reminders repeatedly use the same recipient marker and request continued payment; they are not unrelated notices.'),
    text('摘要没有给出完整条件，不能判断款项的法律性质，也不能仅凭字母确定收件人的身份。',
      'The previews omit the full terms. They do not establish the nature of the payment or identify its recipient from an initial alone.')),
    failure_explanation: text('同一首字母可能对应不同的人或代号。它可以作为追查方向，不能替代消息原件和独立身份材料。',
      'An initial can refer to different people or aliases. It can guide an inquiry but cannot replace original messages and independent identity evidence.'),
  },
  e_03: {
    inquiry: text('值班名册与后台记录重叠，能否证明实际在场？', 'Can overlapping duty and backroom records establish actual presence?'),
    observation: text('吧台值班名册与后台进入记录有重叠时段。终端可查看摘要，也能调取独立门侧影像和读卡原件。',
      'The bar duty roster overlaps a backroom entry. The terminal provides summaries as well as independent doorway footage and original reader records.'),
    methods: [
      method('audit', text('校准读卡时钟并交叉核对独立门侧影像', 'Calibrate the reader clock and cross-check independent doorway footage'),
        text('把权限记录与可辨认的实际进出分开核对。', 'Cross-check access permissions against identifiable entries and exits.')),
      method('replay', text('并列查看值班名册与门禁摘要的时段', 'Compare the duty roster and access-summary intervals'),
        text('寻找两份记录之间需要进一步核实的冲突。', 'Identify conflicts between the two records that need further checking.')),
      method('hardware', text('凭读卡器接触痕迹判断后台停留时间', 'Determine the backroom stay from contact traces on the reader'),
        text('检查读卡器表面是否有使用痕迹。', 'Inspect the reader surface for signs of use.')),
    ],
    preliminary: finding(text('名册所列的吧台值班时段与一段后台权限使用记录重叠，两份摘要不能同时作为完整动线。',
      'The roster’s bar-duty interval overlaps a backroom permission-use record. The two summaries cannot both serve as a complete account of the route.'),
    text('排班不等于实际在岗，权限使用也不等于本人到场；还不能据此确认操作者或停留窗口。',
      'Scheduled duty is not actual presence, and permission use does not identify its holder. The operator and stay remain unconfirmed.')),
    failure_explanation: text('读卡器会被多次接触，表面痕迹没有可靠的起止时钟，不能据此重建一次后台停留。',
      'The reader is touched repeatedly. Surface traces have no reliable start and end clock and cannot reconstruct a particular backroom stay.'),
  },
  e_04: {
    inquiry: text('平板里留下的控制代码，是否真正发送并执行过？', 'Was the control code left on the tablet actually sent and executed?'),
    observation: text('平板显示恢复出厂设置，未分配存储块仍可读取；部署回执索引与代码片段分开保存。',
      'The tablet shows a factory reset, but unallocated blocks remain readable. Deployment-receipt indexes are stored separately from code fragments.'),
    methods: [
      method('metadata', text('恢复部署回执，核对批准签章与独立舱控摘要', 'Recover deployment receipts and compare approval signatures with independent pod digests'),
        text('区分文件存在、批准发送和设备实际执行。', 'Distinguish a file’s existence, approval to send it and actual device execution.')),
      method('surface', text('恢复未分配块中的控制脚本并保留校验值', 'Recover control scripts from unallocated blocks and retain their checksums'),
        text('检查残留代码针对的设备和参数。', 'Examine the device and parameters addressed by residual code.')),
      method('summarize', text('按恢复出厂提示认定平板从未执行过操作', 'Infer no prior operation from the factory-reset screen'),
        text('查看平板目前显示的重置状态。', 'Read the reset status currently displayed on the tablet.')),
    ],
    preliminary: finding(text('恢复块中存在指向3号舱的控制片段，涉及安全锁和功率参数；原始块及副本校验值已保留。',
      'Recovered blocks contain control fragments targeting Pod 3’s safety and power parameters. Checksums for the original blocks and recovery copy are preserved.'),
    text('有代码不等于运行过。片段本身不能证明谁批准部署、何时发送，也不能证明舱控制器收到并执行。',
      'Code does not prove execution. Fragments alone do not establish who approved deployment, when it was sent or whether the pod received and executed it.')),
    failure_explanation: text('恢复出厂描述的是当前界面状态，不能证明此前没有操作。重置也不保证未分配存储块和独立回执同时消失。',
      'A factory-reset screen describes the current interface, not the absence of earlier operations. Resetting does not establish that unallocated blocks and independent receipts were erased.'),
  },
  e_05: {
    inquiry: text('这段停顿的目击叙述，究竟说到了什么？', 'What does the interrupted witness account actually describe?'),
    observation: text('一份目击录音在描述后门时停顿。可直接回听，也可核对原始录音的来源和完整段落。',
      'A witness recording pauses while describing the rear door. It can be replayed or checked against the original source and complete passage.'),
    methods: [
      method('audit', text('核验原始录音来源并保存完整目击段落', 'Verify the original recording’s source and preserve the full witness passage'),
        text('保全人物说法、所述时刻与来源；目击仍需独立印证。', 'Preserve the account, stated time and source; the observation still needs independent corroboration.')),
      method('replay', text('回听停顿前后的方向描述与措辞', 'Replay the direction description and wording around the pause'),
        text('分清录音里的实际陈述与听者自行补出的意思。', 'Separate what the recording says from what a listener infers.')),
      method('hardware', text('按录音终端位置推断证人当时的视野', 'Infer the witness’s incident view from the recorder’s location'),
        text('查看设备摆放方向与周围遮挡。', 'Inspect the device’s orientation and nearby obstructions.')),
    ],
    preliminary: finding(text('停顿前的叙述指向从吧台绕往后门的方向；停顿后的话没有撤回这一方向描述。',
      'The passage before the pause describes a route past the bar toward the rear door. The words after it do not retract that direction.'),
    text('回听只澄清这段话的意思，尚未核实来源或完整时间描述；停顿和语气也不能证明某人撒谎。',
      'Replay clarifies the wording, not its source or full timing account. A pause or tone does not establish that someone is lying.')),
    failure_explanation: text('录音可以在目击之后、在别处录制。终端所在位置不能代替证人当时的位置和视线材料。',
      'An account can be recorded later and elsewhere. The recorder’s location cannot establish where the witness stood or what they could see during the event.'),
  },
  e_06: {
    inquiry: text('重贴标签和额外焊点，分别能说明什么？', 'What can replacement labels and extra solder points each establish?'),
    observation: text('收货箱内型号标签被重贴，芯片外壳有额外焊点。箱中编号可清点，供货单与标准样本可供对照。',
      'Model labels in the delivery crate have been replaced, and the chip casings have extra solder points. Serial numbers, invoices and reference samples can be compared.'),
    methods: [
      method('forensics', text('检验芯片功能并对照标准型号与供货单', 'Test chip functions against reference models and supplier invoices'),
        text('核对实物功能、申报型号与供货记录是否相符。', 'Compare actual functions, declared models and supplier records.')),
      method('visual', text('清点芯片并记录编号、重贴标签与焊点', 'Count the chips and record serials, replacement labels and solder points'),
        text('保存实物数量和外部改动，建立后续检验清单。', 'Preserve the count and exterior alterations for subsequent testing.')),
      method('inventory', text('仅按箱内数量判断货物是否为合法型号', 'Determine model legality from the number of chips alone'),
        text('将箱内数量与交货数量并列查看。', 'Compare the number in the crate with the delivery count.')),
    ],
    preliminary: finding(text('箱内共有12枚芯片，型号标签有重贴痕迹，外壳保留额外焊点；编号与外观已逐件记录。',
      'The crate contains 12 chips with replaced model labels and extra casing solder points. Their serials and exterior condition are recorded individually.'),
    text('数量和外观不能说明内部功能，也不足以判断型号申报是否真实或谁负责这批货物。',
      'Count and appearance do not establish internal function, truthful model declarations or responsibility for the shipment.')),
    failure_explanation: text('数量一致与型号合法是不同问题。清点不能代替功能检验和供货单对照，也不能仅凭数量排除改装。',
      'A matching count and a lawful model are different questions. Counting cannot replace function testing and invoice comparison or rule out modification.'),
  },
  e_07: {
    inquiry: text('杯中成分与配液动作，怎样分别取得证据？', 'How can the drink’s contents and the dosing action be established separately?'),
    observation: text('杯底残留物与同批酒样的颜色不同。杯号封签可与吧台配液回执索引比对。',
      'Residue differs in color from the same batch of liquor. The sealed cup number can be compared with the bar’s dosing-receipt index.'),
    methods: [
      method('forensics', text('化验杯中残留，并比对杯号与独立配液回执', 'Analyze the residue and compare the cup number with independent dosing receipts'),
        text('分别核对化学成分、杯号和记录中的配液动作。', 'Check the chemistry, cup number and recorded dosing action separately.')),
      method('visual', text('将残留物与同批酒样做对照化验', 'Compare the residue chemically with liquor from the same batch'),
        text('识别杯中成分与正常酒样的差异。', 'Identify chemical differences between the cup residue and the normal liquor.')),
      method('inventory', text('用酒杯所处位置确定是谁添加了成分', 'Identify who added the substance from the glass’s location'),
        text('记录杯子所在位置及周围接触机会。', 'Record the glass’s location and nearby opportunities for access.')),
    ],
    preliminary: finding(text('对照化验在杯中残留检出同批正常酒样没有的神经抑制剂，具有降低神经防御反应的作用。',
      'Comparison detects a neural suppressant in the residue that is absent from the normal liquor batch. It reduces neural defensive responses.'),
    text('化学成分不能识别投放者，也不能单独确定致死过程；仍须把杯号、配液记录与伤害材料分别核对。',
      'Chemistry cannot identify the person who added it or establish the fatal mechanism alone. Cup identity, dosing records and injury evidence need separate checks.')),
    failure_explanation: text('酒杯可能被端送或移动，放在吧台不等于由某一人添加成分。位置记录需要与化验和可核验的配液来源配合。',
      'A glass can be served or moved. Its presence at the bar does not identify who added a substance; compare the chemistry and verifiable dosing sources.'),
  },
  e_08: {
    inquiry: text('一条包厢消费记录，能否覆盖整段可疑窗口？', 'Can a single VIP-room purchase record cover an entire disputed interval?'),
    observation: text('包厢终端提供单笔消费摘要、连续计费与五名客人的独立记录，三者所能覆盖的时间并不相同。',
      'The VIP terminal provides individual purchase summaries, continuous billing and five guests’ independent records. They do not necessarily cover the same interval.'),
    methods: [
      method('audit', text('将连续计费与五名客人的独立终端时钟对齐', 'Align continuous billing with five guests’ independent terminal clocks'),
        text('检查多份记录能共同覆盖的连续在场区间。', 'Check the continuous presence interval jointly supported by independent records.')),
      method('replay', text('查看单笔消费摘要并标记其记录时点', 'Read an individual purchase summary and mark its recorded time'),
        text('核对一条消费记录的时间，区分单点与连续区间。', 'Check one purchase timestamp and distinguish a point from an interval.')),
      method('hardware', text('凭包厢终端正在开机认定整晚有人在场', 'Infer all-night presence from a powered-on VIP terminal'),
        text('检查终端目前的供电状态。', 'Inspect the terminal’s current power state.')),
    ],
    preliminary: finding(text('单笔消费摘要只能定位到一次记账时点，没有记录此前及此后的连续活动。',
      'The individual purchase summary identifies one billing time. It does not record continuous activity before or after that point.'),
    text('一笔消费不能覆盖整段案发窗口，也不能把付款账户等同于持续在场的人；需与独立记录交叉核对。',
      'One purchase does not cover the whole incident window or equate a paying account with a continuously present person; compare independent records.')),
    failure_explanation: text('终端可以在无人操作时继续开机。供电状态没有提供人员身份和连续在场时钟，不能作为整晚不在场证明。',
      'A terminal can remain powered on without an operator. Power state supplies neither personal identity nor a continuous presence clock and cannot establish an all-night alibi.'),
  },
};

export function usesScopedInspection(run) {
  return run?.investigation_version === 2 && run.case_id === 'Lvl_03'
    && run.investigation?.case_design_revision === 1
    && run.investigation?.inspection_revision === INSPECTION_REVISION;
}

export function applyInspectionContent(run, spec) {
  if (!usesScopedInspection(run) || spec?.case_id !== run.case_id) return spec;
  return { ...spec, targets: spec.targets.map(target => {
    const override = BUTTERFLY_INSPECTIONS[target.clue_id];
    if (!override) return target;
    const { preliminary, ...publicContent } = JSON.parse(JSON.stringify(override));
    publicContent.methods[1].finding = preliminary;
    return { ...target, ...publicContent };
  }) };
}
