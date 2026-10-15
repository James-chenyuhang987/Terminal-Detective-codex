// Private authored interview material. Only project the current stage and the
// strategy the player actually chose; later statements must never reach src/.
const bilingual = (zh, en) => Object.freeze({ zh, en });
const exchange = (backgroundZh, backgroundEn, claimZh, claimEn, promptZh, promptEn) => Object.freeze({
  background: bilingual(backgroundZh, backgroundEn),
  claim: bilingual(claimZh, claimEn),
  prompt: bilingual(promptZh, promptEn),
});

const INTERVIEWS = {
  Lvl_01: {
    npc_01: [
      exchange(
        '我替 Victor 安排行程，也要处理家里的医院手续。今晚谁都在问我去了哪里，我只想先把这些事分开说。',
        'I arranged Victor’s schedule and also handled hospital paperwork for my family. Everyone is asking where I went tonight; I would like to keep those matters separate.',
        '我在23点前离楼，直到知道 Victor 出事才回来。同一个权限名称，不一定就是我本人。',
        'I left before 23:00 and returned only after learning what happened to Victor. A matching permission name does not necessarily identify me.',
        '先请 Mei 固定离楼和返回的说法，再核对能辨认实际使用者的记录。',
        'Establish Mei’s account of leaving and returning, then check records that can identify the actual user.'),
      exchange(
        '我承认隐瞒了返回。可家属的病历不是供人围观的材料，我不希望姐姐只剩下一个案件里的标签。',
        'I admit I concealed my return. But a family member’s medical file is not a spectacle, and I do not want my older sister reduced to a label in a case.',
        '我是姐姐的医疗联系人；Victor 的技术交易属于他的工作。你若说两者有关，请指出具体是哪份文件。',
        'I am my older sister’s medical contact; Victor’s technology dealings were his work. If you connect the two, identify the document that does so.',
        '询问医院手续对 Mei 意味着什么，并区分一般雇佣关系与具体利益冲突。',
        'Ask what the hospital paperwork means to Mei, distinguishing ordinary employment from a specific conflict of interest.'),
    ],
    npc_02: [
      exchange(
        '地下值班和上楼送报告是两项工作。发现他以后，所有时间都被混成了“保安当时在楼上”。',
        'Underground duty and delivering a report upstairs are different tasks. Since I found him, every time has been flattened into “the guard was upstairs.”',
        '我是23:31上楼送报告时发现 Victor 的；此前在地下停车场值班。发现的时刻不等于出事的时刻。',
        'I found Victor while delivering a report upstairs at 23:31; before that I was on duty in the underground car park. Discovery time is not incident time.',
        '请 Kenji 分开描述值班、交班与发现三个时间点。',
        'Have Kenji separate his duty period, handover, and discovery.'),
      exchange(
        '我的在场记录可以核验。至于停电后做了什么，我愿意按处置顺序讲，不想把位置证明当成全部免责。',
        'My location can be checked. I can also describe my response to the outage in order; a location record should not excuse every part of my work.',
        '摄像头失效以后，我按主入口的停电流程处置。关于内部通道是否仍可用，需要另查设备状态。',
        'After the cameras failed, I followed the outage procedure for the main entrance. Whether internal routes remained usable requires a separate equipment check.',
        '核对保安实际处置了哪些入口，以及哪些通路由独立电源控制。',
        'Check which entrances the guard actually secured and which routes had independent power.'),
    ],
    npc_03: [
      exchange(
        '技术谈判里会有不同版本的正文和附件。我担心你们把商业往来直接当成了现场行为。',
        'Technology negotiations produce different versions of contracts and annexes. I am concerned that a business connection is being treated as an action at the scene.',
        '我与 Victor 讨论的是技术授权；我不会仅凭一个文件夹封面确认保密附件里的交易关系。',
        'My discussions with Victor concerned a technology license; I will not confirm the parties to a confidential annex from a folder cover alone.',
        '请 Voss 区分合同正文、保密附件和现场袭击三件事。',
        'Ask Voss to distinguish the main contract, its confidential annex, and the attack at the scene.'),
      exchange(
        '既然购买方已经确认，下一步应当看技术风险究竟写在哪里。合同责任和使用设备的人仍需分别查证。',
        'Now that the buyer is established, the next question is where the technical risks were recorded. Contractual responsibility and the device operator still require separate proof.',
        '我没有操作今晚的致伤设备。至于试验风险是否与这次接口损伤相同，不能只凭“神经接口”几个字判断。',
        'I did not operate the device that caused tonight’s injury. Whether trial risks match this port damage cannot be decided from the words “neural interface” alone.',
        '询问 Voss 对旧式接口风险的知情范围，并用医疗与损伤材料核对。',
        'Ask what Voss knew about risks to older ports and compare the medical and injury records.'),
    ],
  },
  Lvl_02: {
    npc_01: [
      exchange(
        '研究所现在最急的是找到 Aria，同时保住资料。我不希望一份不完整的账单替整个机构下结论。',
        'The institute needs to find Aria and preserve its research. I do not want an incomplete account to stand as a verdict on the whole institution.',
        '机构密钥的使用属于内部管理。若要认定某次下载由我发起，应当给出那次会话的原始记录。',
        'Use of institutional keys is an internal management matter. To attribute a download to me, identify the original session record.',
        '把 Harlan 对机构管理的辩解，与具体下载会话的操作责任分开。',
        'Separate Harlan’s defense of institutional management from responsibility for a particular download session.'),
      exchange(
        '我已说明下载由谁发起。现在你们把 Aria 的去向、资料的归属和外部联络放在一起，我希望逐件核实。',
        'I have identified who initiated the download. You are now combining Aria’s whereabouts, ownership of the data, and outside contacts; I want each checked separately.',
        '我没有授权 Aria 把资料带走。她自己的留言和我的外部通话，必须分别核对内容，不能只看发生在同一晚。',
        'I did not authorize Aria to take the data. Her message and my outside call must be checked for their contents, not merely for happening on the same night.',
        '询问外部联络涉及什么，并区分违法交易、资料保全和失踪原因。',
        'Ask what the outside contact concerned, separating an unlawful transaction, preservation of data, and the disappearance.'),
    ],
    npc_02: [
      exchange(
        'Aria 问过逃生通道，我当时以为是安全演练的问题。研究设备怎么用，和我是否替她做过什么，是两回事。',
        'Aria asked about escape routes; I thought she meant a safety drill. How a research device works and whether I operated it for her are separate questions.',
        '我没有替 Aria 操作 QPS，也没有亲眼看见她离开。请先核实设备能做什么，再判断屋顶记录里的身影。',
        'I did not operate the QPS for Aria or see her leave. Check what the device can do before identifying the figure in the rooftop record.',
        '请 Zoe 说明自己听到与看到的边界，再用设备限制和屋顶记录核对路线。',
        'Establish the limits of what Zoe heard and saw, then compare the device constraints with the rooftop record.'),
      exchange(
        '那次通道询问现在看来需要重新理解。但她留下的短话，我也只能按当时听懂的意思转述。',
        'I now need to reconsider her question about the route. But I can only describe what I understood her brief message to mean at the time.',
        'Aria 说过“别丢饮料罐”。我当时没有把这句话当成资料保全指令，也不知道她现在在哪里。',
        'Aria said, “Do not throw away the drink can.” I did not understand it as a data-preservation instruction then, and I do not know where she is now.',
        '核对留言与饮料罐、芯片痕迹之间的关系，不把 Zoe 的猜测当成目击。',
        'Compare the message with the can and chip traces without treating Zoe’s interpretation as eyewitness evidence.'),
    ],
    npc_03: [
      exchange(
        '夜班有一阵子我不在岗。被问得越急，我越怕把记不准的分钟说成精确时间；你可以先让我按顺序讲。',
        'I was away from my post for part of the night. The more urgently I am questioned, the more I worry about presenting uncertain minutes as exact times; let me give the sequence first.',
        '我只是离岗去上厕所，大约十几分钟，也可能更久。我的离岗不等于我让摄像头断电。',
        'I only left for the toilet, for perhaps ten minutes or somewhat longer. My absence does not mean I cut power to the cameras.',
        '先固定 Otto 对离岗原因和时段的说法，再查考勤与断电窗口。',
        'Fix Otto’s account of why and when he left, then check attendance against the outage window.'),
      exchange(
        '离岗的事情我已经纠正了。我回岗后处理过警报和设备，能证明这些步骤，不代表我亲眼看见了逃离的人。',
        'I have corrected my account of the absence. I handled an alarm and equipment after returning; that can establish those steps, but not that I saw someone escape.',
        '我没有看见 Aria 从屋顶经过。设备被收回时的状态和回收时间，应该以封存记录为准。',
        'I did not see Aria cross the roof. The device’s condition and retrieval time should be checked against the sealed recovery record.',
        '请 Otto 区分亲眼所见、接到的警报和设备回收记录。',
        'Have Otto distinguish his own observations, the alarm he received, and the equipment recovery record.'),
    ],
  },
  Lvl_03: {
    npc_01: [
      exchange(
        '吧台一忙起来，客人只记得酒，设备出了什么事也会来问我。我的工作不能替每个机器故障作解释。',
        'When the bar gets busy, guests remember the drinks, and they ask me about equipment trouble too. My job cannot explain every machine failure.',
        '我整晚都在吧台。Riku 的事是设备问题，不是酒出了问题。',
        'I was at the bar all night. What happened to Riku was an equipment problem, not a problem with his drink.',
        '固定 Sable 的在场范围，区分吧台服务和后台设备操作。',
        'Establish the limits of Sable’s location claim, separating bar service from backstage equipment access.'),
      exchange(
        '我去过后台，这一点不再争辩。可客人账单和私下的信息不是同一回事，我不想让每笔钱都变成传闻。',
        'I will no longer dispute going backstage. But guest bills and private messages are different matters; I do not want every payment turned into a rumor.',
        '我去后台是查看故障。一个“S”的缩写或一笔付款，都不能单独说明我和 Riku 有什么私人冲突。',
        'I went backstage to check a fault. An initial “S” or a payment alone cannot establish a private conflict between Riku and me.',
        '核对付款与信息的对象和内容，再询问是否存在持续的私人压力。',
        'Check the parties and contents of the payments and messages, then ask whether there was ongoing personal pressure.'),
    ],
    npc_02: [
      exchange(
        '寄存处能看到人来回，却看不到后台里面。我怕说了谁离开吧台，就被当成我看见了整个过程。',
        'From the cloakroom I can see people passing, not the inside of backstage. I worry that naming someone who left the bar will be mistaken for witnessing the whole event.',
        '我看见有人往后门方向绕，但没有看见谁操作 Riku 的设备。方向和操作行为不能混在一起。',
        'I saw someone head toward the rear door, but did not see anyone operate Riku’s equipment. A direction of travel is not an observed action.',
        '让 Lena 只描述可见的离岗时段和方向，不替视线以外的行为作证。',
        'Ask Lena only about the visible departure period and direction, without asking her to vouch for actions outside her sight.'),
      exchange(
        '我能补充的是客人当时的反应和我叫人帮忙的经过。那时现场很乱，我起初也没有判断出事情有多严重。',
        'I can add what the guest looked like and how I called for help. The scene was confused, and I did not initially understand how serious it was.',
        'Riku 反应迟钝时，我起初以为他喝醉了。我没有检查那杯酒，也没有亲眼看见脚本被改动。',
        'When Riku became slow to respond, I initially thought he was drunk. I did not test his drink or see a script being changed.',
        '核对迟钝、求助和停机反应的先后，不把 Lena 的初步判断当成化验结果。',
        'Check the order of sluggishness, calls for help, and the stop response without treating Lena’s first impression as a laboratory result.'),
    ],
    npc_03: [
      exchange(
        '客人付钱是来过夜生活，不是替店里作证的。我愿意配合，但老板的身份不能自动变成每个区域的在场记录。',
        'Guests pay for a night out, not to testify for the club. I will cooperate, but being the owner does not place me in every part of it.',
        '案发时我在 VIP 包厢。员工的后台账号，不代表我从包厢操作了设备。',
        'I was in the VIP suite when it happened. An employee’s backstage account does not mean I operated equipment from the suite.',
        '核实 Ren 的包厢说法，并区分账号权限与实际操作者。',
        'Verify Ren’s account of being in the suite and distinguish account permissions from the actual operator.'),
      exchange(
        '我的位置已经可以核查。你们问到货物，那是另一项责任；我不打算让这一点模糊对 Riku 致死过程的调查。',
        'My location can now be checked. The cargo raises a separate responsibility; I do not want it to blur the investigation into how Riku died.',
        '我没有编写那段安全锁脚本。就算账目把我和货物联系起来，也还要核实谁把改动用于营业中的设备。',
        'I did not write that safety-lock script. Even if accounts connect me to the cargo, you still need to establish who applied a change to operating equipment.',
        '分别追问货物收益、脚本编写和现场执行，避免用一种违规代替另一种责任。',
        'Ask separately about cargo proceeds, script authorship, and execution at the scene, without substituting one violation for another.'),
    ],
  },
  Lvl_04: {
    npc_01: [
      exchange(
        '风雪里每一项维护安排都可能影响全站。我得先保证站还在运转，再逐条说明当晚的指令。',
        'In a storm, every maintenance decision can affect the entire station. I must keep it running while accounting for that night’s instructions.',
        '当晚是风雪引发的连锁故障，我的安排属于应急维护。若说某台无人机另有任务，请指出原始指令。',
        'A chain of storm-related failures occurred that night, and my arrangements were emergency maintenance. If a drone had another task, identify the original instruction.',
        '将 Elias 的应急解释与无人机唤醒、日志来源分别核对。',
        'Compare Elias’s emergency explanation separately with the drone wake-up command and the source of its logs.'),
      exchange(
        '设备指令的问题我已经回应。Noor 要审计什么，需要看她准备提交的材料，不能只凭我们工作上有争执。',
        'I have answered about the equipment command. What Noor intended to audit should be established from her prepared materials, not merely from a workplace disagreement.',
        '我对模型项目有主管职责。审批文件是否涉及外传交易，以及 Noor 是否准备揭露它，是两个需要证据的具体问题。',
        'I had supervisory responsibility for the model project. Whether an approval concerned an outside sale, and whether Noor intended to expose it, are two specific questions requiring evidence.',
        '询问审批利益与审计计划的关系，不把主管身份本身当成动机。',
        'Ask how the approval’s benefits relate to the audit plan, without treating the supervisory role itself as a motive.'),
    ],
    npc_02: [
      exchange(
        '我和 Noor 确实吵过工作上的事。修不完的设备让人脾气变坏，但争执不能把我从机库搬到别处。',
        'Noor and I did argue about work. An endless repair backlog makes tempers short, but an argument does not move me from the hangar to another location.',
        '案发窗口我在机库修风机，摄像头没有停。请核对连续画面，不要只截取争吵的一段。',
        'During the incident window I was repairing a fan in the hangar, and its camera stayed on. Check the continuous footage, not just a clip of the argument.',
        '请 Mira 固定维修位置与连续在场时段，再核对独立画面。',
        'Establish Mira’s repair location and continuous attendance period, then verify the independent footage.'),
      exchange(
        '如果人没有进冷库，就得问设备能不能到那个位置。工程师可以解释运动方式，但知道机械结构不等于下过指令。',
        'If no person entered the cold room, ask whether equipment could reach that position. An engineer can explain movement without having issued the command.',
        '无人机路线要同时满足履带运动和通道空间。仅凭一处磨痕，我不会确认整条路线，更不能据此认定操作者。',
        'A drone route must fit both track movement and available space. One abrasion alone cannot establish the whole route or identify its operator.',
        '让 Mira 用机械约束解释痕迹，再把路线与操作令牌分开验证。',
        'Have Mira explain the traces through mechanical constraints, then verify the route separately from the operating token.'),
    ],
    npc_03: [
      exchange(
        '审计不是设备巡检。Noor 找我是想保全一份可以带出站外核验的记录，不是请我替机器签维修单。',
        'An audit is not an equipment inspection. Noor approached me about preserving a record for verification outside the station, not signing off a machine repair.',
        '我和 Noor 有审计联络；具体预约时间、提交对象和材料主题，请以她留下的原件为准。',
        'Noor and I were in contact about an audit; use her originals to establish the appointment time, intended recipient, and subject.',
        '核对 Sol 与 Noor 的预约性质、原件来源及站外保全情况。',
        'Verify the nature of Sol’s appointment with Noor, the source of the originals, and their preservation outside the station.'),
      exchange(
        '保全下来的材料能说明钱和权限怎样流动。至于冷库发生了什么，仍需要工程和现场记录补上。',
        'The preserved materials can show the movement of money and permissions. Engineering and scene records must still establish what happened in the cold room.',
        '草案中的批准与设备记录中的授权可以比对；即使账户一致，也不能跳过实际执行机制。',
        'The draft approval can be compared with equipment authorization; even a matching account does not establish the actual execution mechanism.',
        '询问交易批准和远程令牌如何对应，同时保留现场执行这一独立环节。',
        'Ask how the transaction approval corresponds to the remote token while retaining scene execution as a separate link.'),
    ],
  },
  Lvl_05: {
    npc_01: [
      exchange(
        '轨道电梯还载着人，先保运行不是一句推卸责任的话。雷暴期间的选择，不能只看某个警报后来没响。',
        'The orbital elevator still carries people; keeping it running is not an empty excuse. A storm response cannot be judged solely by an alarm that later stayed silent.',
        '船长有违规操作，我的处置是避险。要说主控改变了报警与诊断状态，请把授权和执行记录一起核对。',
        'The captain operated improperly, and my response was protective. To say main control changed alarm and diagnostic states, compare both authorization and execution records.',
        '固定 Rook 的避险解释，再核验主控实际执行了什么。',
        'Establish Rook’s protective-response explanation, then verify what main control actually executed.'),
      exchange(
        '我已经说明诊断操作。现在谈航线利益，也应先分清公共运行安排和私人合同究竟各指哪一份。',
        'I have explained the diagnostic operation. If we now discuss route interests, first identify which documents concern public operations and which concern private contracts.',
        '我负责维持航线。货运公司的收益是否归我，以及 Jonah 的异议是否会影响合同，都需要具体文件。',
        'I was responsible for maintaining the route. Whether cargo-company proceeds benefited me, and whether Jonah’s objections threatened a contract, require specific documents.',
        '追问航单归属与船长异议，区分公共职责和私人利益。',
        'Ask about ownership behind the manifest and the captain’s objection, distinguishing public duty from private benefit.'),
    ],
    npc_02: [
      exchange(
        '校准不是按一下按钮就能离开。六路传感器要持续照看，值班台上的记录比别人记得我有没有出现更可靠。',
        'Calibration is not a button you press before walking away. Six sensor channels need attention; the console record is more reliable than someone’s recollection of seeing me.',
        '案发窗口我在校准台，没有离开。六路传感器都留下了连续的操作记录。',
        'I remained at the calibration console during the incident window. All six sensor channels recorded continuous operation.',
        '核对 Yara 的连续操作是否覆盖案发窗口，而不是只看一条登录记录。',
        'Check whether Yara’s continuous operations cover the incident window, rather than relying on a single login.'),
      exchange(
        '我的位置核对完后，还需要核对你们正在看的时间。屏幕上能播放的画面，不一定保留了事件原有的顺序。',
        'Once my location is checked, check the time you are watching. A feed that plays on a screen need not preserve the original order of events.',
        '应当比较星体视差和签章时序，不能把画面显示时间直接当成授权时间；我还需要看到原始片段。',
        'Compare stellar parallax and signature timing; do not equate a displayed feed time with an authorization time. I still need the original segment.',
        '请 Yara 说明可重复测量的画面异常，并用独立时钟重排事件。',
        'Ask Yara to identify measurable feed anomalies and use independent clocks to reorder events.'),
    ],
    npc_03: [
      exchange(
        '我接触的是密封柜和搬运单，不是电梯主控。承运人可以解释交接过程，但不该替没看到的内件作保证。',
        'I handled sealed containers and transport slips, not the elevator’s main controls. A carrier can explain handover without certifying unseen contents.',
        '我只负责运送密封柜，没有主控诊断权限，也不能签发放行。货物是什么，应先查申报和样本。',
        'I transported sealed containers, had no main-control diagnostic access, and could not issue clearance. Check declarations and samples to establish their contents.',
        '固定 Ivo 的运输职责和权限边界，再核对货物申报。',
        'Establish Ivo’s transport duties and permission limits, then verify the cargo declaration.'),
      exchange(
        '货物申报的事我已经解释。搬箱前后的指令和船长的态度，我可以按自己收到、看到的范围说。',
        'I have explained the cargo declaration. I can describe the instructions around the move and the captain’s attitude within the limits of what I received and saw.',
        '搬运是在收到签令以后进行的。签令何时生成、何时送达我这里，应该分开核对，不能只看搬运时刻。',
        'I moved the cargo after receiving the signed order. Check when the order was generated separately from when it reached me, rather than using only the move time.',
        '核对收到指令、船长异议与搬运的顺序，并区分 Ivo 的目击和推测。',
        'Check the order of receiving the instruction, the captain’s objection, and the move, distinguishing Ivo’s observations from inference.'),
    ],
  },
  Lvl_06: {
    npc_01: [
      exchange(
        '修复工作很多变化肉眼看不见。展品要保持状态，维护也不能因为拍卖临近就停下来。',
        'Much of conservation work is invisible to the eye. Exhibits need stable conditions; maintenance cannot stop simply because an auction is near.',
        '那次操作是例行湿度校准，展柜门没有打开。不能因为展品后来有异常，就把每项维护都称为调包。',
        'That operation was routine humidity calibration, and the display door did not open. A later exhibit anomaly does not make every maintenance action a swap.',
        '请 Tessa 明确“没有开门”能够证明什么，再检查维护接口和执行记录。',
        'Ask Tessa to define what “the door stayed closed” establishes, then inspect the maintenance interface and execution record.'),
      exchange(
        '底座操作已经在讨论了。修复材料登记、基金往来和拍卖安排，也应当各按原件核实，而非凭岗位推断。',
        'We are already discussing the base operation. Material registrations, fund transfers, and auction arrangements should likewise be checked against originals, not inferred from my job.',
        '部门会使用修复树脂；某一批材料由谁登记、资金由谁控制，不能只凭“修复部”三个字归到我身上。',
        'The department uses conservation resins; a batch’s registrant and the controller of a fund cannot be attributed to me from the words “conservation department” alone.',
        '核对树脂批次与资金控制，并追问 Mara 的揭露会影响什么。',
        'Check the resin batch and control of the funds, then ask what Mara’s disclosure would affect.'),
    ],
    npc_02: [
      exchange(
        '巡逻眼镜保存的是我走过的外环，不是每个展柜内部。安保的记录能证明位置，也有它看不到的地方。',
        'My patrol glasses record the outer ring I walked, not the inside of every case. Security records can establish location while still having blind spots.',
        '案发窗口我在外环巡逻，原始帧可供检查；展柜底座不归我的安保台控制。',
        'I was patrolling the outer ring during the incident window, and the original frames are available; my security console does not control the display base.',
        '核对 Juno 的连续原始帧与安保台控制范围。',
        'Verify Juno’s continuous original frames and the scope of the security console’s controls.'),
      exchange(
        '位置查清以后，我想说明安保收到请求和实际能阻止什么并不是一回事。不同部门的维护权限需要一同保全。',
        'With my location established, I want to distinguish receiving a request from being able to enforce it. Maintenance permissions across departments must be preserved together.',
        '有保全请求需要和维护权限逐条比对。安保台留下请求，并不自动代表所有部门的操作都已经被阻断。',
        'The preservation request must be compared with maintenance permissions line by line. A request logged at security does not automatically block every department’s operations.',
        '询问 Mara 的保全请求怎样流转，以及谁能越过安保审批。',
        'Ask how Mara’s preservation request was handled and who could bypass security approval.'),
    ],
    npc_03: [
      exchange(
        '运输从交接开始，馆内什么时候装封不是我亲眼看见的。我可以提供接货的边界，不会假装知道之前每一步。',
        'My transport role begins at handover; I did not see the museum pack every item. I can establish when I received custody without pretending to know every earlier step.',
        '我拿到的是馆内装封、已经放行的密封箱。我没有打开手套展台，申报情况应核对交接文件。',
        'I received a sealed box packed and cleared inside the museum. I did not open the glove display; check the handover papers for the declaration.',
        '先划清 Pavel 接货前后的保管责任，再查放行来源和申报。',
        'First establish the custody boundary around Pavel’s receipt, then check the clearance source and declaration.'),
      exchange(
        '运输手续有问题，我会说明。但一笔运输费买的是搬运，不会自动给我展柜里的生物授权。',
        'I will account for the transport paperwork. But a transport fee pays for a move; it does not automatically grant biometric authorization inside the display.',
        '我收的是运输费用，没有执行底座操作。付款方和生物签名的权限，应当分别核查。',
        'I was paid for transport and did not operate the base. Verify the payer separately from the authority represented by the biometric signature.',
        '核对基金付款用途和底座生物签名，区分运输违规与致死操作。',
        'Compare the fund payment’s purpose with the base’s biometric signature, separating transport violations from the fatal operation.'),
    ],
  },
  Lvl_07: {
    npc_01: [
      exchange(
        '深海站出事不能先让所有人失去秩序。我让人稳定全站，也准备了事故说明，随后可以逐项核对。',
        'A deep-sea station cannot lose order during an emergency. I directed stabilization and prepared an incident account; we can check each part afterward.',
        '我认为极端水压击穿了设施。采样授权不等于增压命令，不能用同一个密钥名称代替执行证据。',
        'I believe extreme water pressure breached the facility. Sampling authorization is not a pressurization command; a matching key name cannot replace execution evidence.',
        '固定 Neris 的事故解释，区分采样批准与真正的压力执行会话。',
        'Establish Neris’s accident explanation, distinguishing sampling approval from the actual pressure-control session.'),
      exchange(
        '采样批准已经有记录。Oren 的材料和事故说明何时写成，可以查原件；站长有预案，也不表示预案一定适用于这次事件。',
        'The sampling approval is recorded. Originals can establish when Oren’s materials and the incident account were written; a station director’s contingency plan does not establish that it fits this event.',
        '事故报告属于应急文件。若说它针对 Oren 的上传计划提前准备，请核对模板时间和上传内容。',
        'The incident report is an emergency document. If you say it was prepared in advance for Oren’s upload plan, compare the template time and the upload’s contents.',
        '追问报告模板与 Oren 上传计划的时间关系，以及合同受什么影响。',
        'Ask how the report template’s timing relates to Oren’s upload plan and what the contract stood to lose.'),
    ],
    npc_02: [
      exchange(
        '潜水员的医疗隐私不该成为围观材料。我能配合核对值班，但希望只调取与案发时段有关的部分。',
        'The divers’ medical privacy should not become a spectacle. I can help verify my shift, but only the portions relevant to the incident window should be retrieved.',
        '案发时我在照顾减压潜水员。医疗舱的连续记录可以核对，不能只用我的样本研究兴趣推定我离开过。',
        'I was attending divers undergoing decompression during the incident. The medical chamber’s continuous records can be checked; my interest in the samples does not establish that I left.',
        '核对 Lio 的连续医疗值守，在保护患者信息的同时确认位置。',
        'Verify Lio’s continuous medical attendance and location while protecting patient information.'),
      exchange(
        'Oren 关心的不是一管样本的价格。研究可能有价值，也仍需要说清样本来自哪里、取得过程是否正当。',
        'Oren’s concern was not the price of one vial. Research can have value while still requiring an account of its source and whether it was obtained properly.',
        'Oren 提到样本来自不该采的地方。药物研究价值不能证明采集合法，也不能直接证明谁制造了事故。',
        'Oren said the samples came from a prohibited area. Their value to drug research proves neither lawful collection nor who caused the incident.',
        '询问 Oren 保护的对象与拟公开材料，区分研究价值、非法采样和死亡责任。',
        'Ask what Oren wanted to protect and disclose, separating research value, unlawful sampling, and responsibility for the death.'),
    ],
    npc_03: [
      exchange(
        '机器人挂着我的维修权限，不代表我能同时在两个地方。我在泵舱做的工作也应当留下工具记录。',
        'A robot carrying my maintenance permissions does not put me in two places at once. My work in the pump room should have tool records too.',
        '那段机器人操作不是我在本地台发出的；我当时在泵舱。请区分权限名称、登录来源和实际使用者。',
        'I did not issue that robot operation from the local console; I was in the pump room. Distinguish the permission name, login source, and actual user.',
        '同时核对 Sana 的本地工作与机器人登录来源，避免只看账号归属。',
        'Check Sana’s local work alongside the robot login source, rather than relying on account ownership.'),
      exchange(
        '维修记录之外，我也熟悉站里的演练素材。但声音听着像现场，不等于已经核实了录制时间。',
        'Alongside maintenance records, I know the station’s drill material. A voice that sounds live does not establish when it was recorded.',
        '求救音频和阀门动作应当用各自原件定时。单凭播音时刻，不能确定真正开始增压的时间。',
        'Time the distress audio and valve action from their respective originals. Playback time alone cannot establish when pressurization actually began.',
        '请 Sana 说明如何辨别录音重复，并与阀门回执独立对时。',
        'Ask Sana how to detect repeated audio and compare it independently with valve receipts.'),
    ],
  },
  Lvl_08: {
    npc_01: [
      exchange(
        '白塔每天执行许多共同授权的政策。我需要知道你在问哪一条指令，而不是把议程管理都归为一个人的意志。',
        'The White Tower executes many jointly authorized policies. I need to know which instruction you mean, rather than treating all agenda management as one person’s will.',
        '系统执行共同授权的政策。若说我让它静默或删除风险记录，请给出具体签名和指令链。',
        'The system executes jointly authorized policy. If you say I silenced it or removed risk records, identify the specific signature and instruction chain.',
        '固定 Lucan 的共同授权说法，再核对个人签名与系统执行的边界。',
        'Establish Lucan’s joint-authorization account, then check the boundary between an individual signature and system execution.'),
      exchange(
        '签名责任可以继续查，但政策目标和私人收益也要分开。一个指数被使用，不代表你已经查清谁从收费中获利。',
        'You can continue examining the signatures, but policy goals and private gain are separate. Use of an index does not establish who benefited from its fees.',
        '稳定指数是议程的一部分。我的公司是否收费，以及 Amara 的名单会不会影响合同，都应查交易与名单原件。',
        'The stability index forms part of the agenda. Whether my company received fees, and whether Amara’s list threatened contracts, should be checked against the transaction and original list.',
        '追问指数收费、公司利益与名单公开的联系，不让抽象政策掩盖具体收益。',
        'Ask how index fees, company interests, and publication of the list connect, without letting abstract policy obscure specific benefits.'),
    ],
    npc_02: [
      exchange(
        '记者接近消息来源，不等于能进入每间设备舱。我宁可把直播原件交出来，也不想用职业身份替位置作证。',
        'A reporter’s access to sources does not open every equipment chamber. I would rather provide the original stream than ask my profession to establish my location.',
        '我当时在塔外直播，留下了独立存证。我没有舱室权限，也没有离开直播位置去操作白塔。',
        'I was streaming outside the tower with an independent archive. I had no chamber permission and did not leave the streaming position to operate the tower.',
        '核对 Iria 的连续直播原件与舱室权限，区分采访接触和现场操作。',
        'Check Iria’s continuous original stream and chamber permissions, separating contact with a source from operating at the scene.'),
      exchange(
        'Amara 想让名单被看见。我得保护材料来源，但保护来源不能省掉原件校验，更不能替她补写没有说过的话。',
        'Amara wanted the list seen. I need to protect the source, but that does not remove the need to verify originals or let me supply words she never said.',
        '我理解她的意图是公开名单，不是申请系统处理。离线材料的来源与她留下的意思，仍应逐项核对。',
        'I understood her intent as publishing the list, not requesting system processing. The offline material’s source and her expressed intent still need individual checks.',
        '询问离线材料为何需要保留，并核对公开意图与系统记录中的申请是否一致。',
        'Ask why offline material needed preservation and compare her intent to publish with the request recorded by the system.'),
    ],
    npc_03: [
      exchange(
        '维护卡写着我的名字，可人不一定跟着卡走。我被困时一直求救，不能因为卡进了机房就抹掉那段经过。',
        'My name is on the maintenance card, but a person need not travel with the card. I kept calling for help while trapped; a reader event cannot erase that experience.',
        '读卡器显示我的卡进入机房时，我本人被困在电梯里。请同时查求救原件和卡片硬件签章。',
        'When the reader showed my card entering the machine room, I was trapped in the elevator. Check both the original distress record and the card’s hardware signature.',
        '把 Tomas 本人的位置、权限归属与卡片硬件身份分别核验。',
        'Verify Tomas’s physical location, the permission owner, and the card’s hardware identity separately.'),
      exchange(
        '我的位置说清后，我可以解释维护系统怎样运作。不过会修设备和有权批准危险指令，是不同的事。',
        'With my location established, I can explain the maintenance system. Knowing how to service equipment and being authorized to approve a dangerous command are different things.',
        '混气、低氧报警和静默模式应分别检查；一条“没有毒气报警”的记录，不能保证舱内空气适合呼吸。',
        'Inspect gas mixing, low-oxygen alarms, and silent mode separately; a record of “no toxic-gas alarm” does not guarantee breathable air in the chamber.',
        '请 Tomas 解释气样与报警回路的区别，再核对谁批准了静默指令。',
        'Ask Tomas to distinguish gas samples from alarm circuits, then check who approved the silent instruction.'),
    ],
  },
};

for (const npcs of Object.values(INTERVIEWS)) {
  for (const stages of Object.values(npcs)) Object.freeze(stages);
  Object.freeze(npcs);
}
Object.freeze(INTERVIEWS);

export function getInterviewStrategyContent(caseId, npcId, stageIndex) {
  if (typeof caseId !== 'string' || typeof npcId !== 'string'
    || (stageIndex !== 0 && stageIndex !== 1)
    || !Object.hasOwn(INTERVIEWS, caseId)
    || !Object.hasOwn(INTERVIEWS[caseId], npcId)) return null;
  return INTERVIEWS[caseId][npcId][stageIndex];
}
