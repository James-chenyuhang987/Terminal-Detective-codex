import { agentExpertise, confidenceFromExpertise, getActionFocus } from './commandSystem.js';
import { getCaseNarrativeProfile } from './caseNarrativeLibrary.js';

export const NARRATIVE_ACTIONS = Object.freeze([
  'talk_to_npc', 'search_area', 'examine_clue', 'check_alibi',
  'present_evidence', 'interrogate_suspect', 'access_database',
  'analyze_forensics', 'tail_suspect', 'bribe_informant',
  'hack_terminal', 'check_cctv',
]);

export const NARRATIVE_OUTCOMES = Object.freeze(['clue', 'progress', 'no_yield', 'trap', 'illegal']);

const ACTION_COPY = Object.freeze({
  talk_to_npc: { zh: ['接入证词频道', '核对公开说法', '梳理人物关系'], en: ['opens the testimony channel', 'checks the public account', 'maps the relationship trail'] },
  search_area: { zh: ['扫描现场残留', '重建区域轨迹', '搜索异常边界'], en: ['scans the scene residue', 'reconstructs the zone trail', 'searches the anomalous perimeter'] },
  examine_clue: { zh: ['复核证物细节', '放大微观痕迹', '交叉检查证物'], en: ['rechecks the evidence detail', 'magnifies the microscopic trace', 'cross-checks the exhibit'] },
  check_alibi: { zh: ['校准不在场时间轴', '比对行动记录', '核验时空缺口'], en: ['calibrates the alibi timeline', 'compares movement records', 'tests the time gap'] },
  present_evidence: { zh: ['展示证据链', '用证物施压', '锁定证词矛盾'], en: ['presents the evidence chain', 'applies evidence pressure', 'pins down a contradiction'] },
  interrogate_suspect: { zh: ['建立审讯节奏', '追问关键矛盾', '压缩回避空间'], en: ['sets the interrogation rhythm', 'presses the key contradiction', 'closes the escape routes'] },
  access_database: { zh: ['检索权限日志', '索引封存数据', '核对数据库版本'], en: ['queries access logs', 'indexes sealed data', 'checks database revisions'] },
  analyze_forensics: { zh: ['启动法证矩阵', '比对物质谱线', '重建物理因果'], en: ['starts the forensic matrix', 'compares material spectra', 'rebuilds physical causality'] },
  tail_suspect: { zh: ['追踪目标轨迹', '监控异常接触', '建立尾随路线'], en: ['tracks the target trail', 'watches anomalous contacts', 'builds a covert route'] },
  bribe_informant: { zh: ['接触地下线人', '交换边缘情报', '验证黑市传闻'], en: ['contacts an undercity source', 'trades for fringe intelligence', 'tests a black-market rumor'] },
  hack_terminal: { zh: ['突破终端防线', '镜像受限分区', '追踪异常指令'], en: ['breaches the terminal perimeter', 'mirrors a restricted partition', 'traces an anomalous command'] },
  check_cctv: { zh: ['校验监控帧', '恢复影像残片', '比对时间码'], en: ['validates surveillance frames', 'restores footage fragments', 'compares timecodes'] },
});

export const NARRATIVE_ACTION_BEATS = Object.freeze({
  talk_to_npc: [
    {
      zh: '{agent}把录音灯调暗，{zone}只剩呼吸与衣料摩擦的细响；一句寻常问候被放在桌面中央，等着沉默先露出破绽。',
      en: '{agent} dims the recorder until {zone} holds only breath and the whisper of cloth; an ordinary greeting is set between them, waiting for silence to betray itself.',
    },
    {
      zh: '{agent}没有追赶答案，只把问题留在{zone}的静默里。对方每一次迟疑，都像湿墨一样在口供边缘慢慢洇开。',
      en: '{agent} does not chase an answer, leaving the question in the hush of {zone}. Each hesitation spreads like wet ink along the edge of the statement.',
    },
    {
      zh: '{zone}的灯光掠过对方的眼睛，{agent}顺着语气里的停顿往回走，寻找那句被刻意绕开的事实。',
      en: 'Light from {zone} crosses the witness\'s eyes as {agent} follows the pauses backward, hunting the fact the testimony carefully stepped around.',
    },
    {
      zh: '窗外的雨把{zone}切成一格格灰影，{agent}忽然重复了对方半小时前说过的一句话；同样的词句第二次出现时，尾音里多了一丝戒备。',
      en: 'Rain divides {zone} into panes of gray as {agent} quietly repeats something the witness said half an hour ago. The same words return, but this time their final syllable carries a trace of alarm.',
    },
    {
      zh: '{agent}把无关紧要的问题散落在谈话之间，直到对方习惯回答。真正的问题来临时，{zone}里那一瞬过分迅速的否认，比任何迟疑都更响亮。',
      en: '{agent} scatters harmless questions through the conversation until answering becomes a habit. When the real question arrives, the denial comes too quickly, and in {zone} its speed is louder than hesitation.',
    },
  ],
  search_area: [
    {
      zh: '{agent}沿着{zone}的边界缓慢推进，鞋底避开浮尘；每一道擦痕都可能是某个人仓促改写现场时留下的标点。',
      en: '{agent} works the perimeter of {zone}, soles clear of the dust; every scrape may be punctuation left by someone rewriting the scene in haste.',
    },
    {
      zh: '{zone}看似沉睡，细节却醒着。{agent}让光束贴着地面游走，门缝、纤维和错位的物件依次浮出黑暗。',
      en: '{zone} appears asleep, but its details are awake. {agent} skims a beam across the floor until seams, fibers, and displaced objects rise from the dark.',
    },
    {
      zh: '{agent}先听，再看，最后才触碰。{zone}把秘密藏在日常秩序里，而被移动过的平凡之物往往比血迹更诚实。',
      en: '{agent} listens first, looks second, and touches last. {zone} hides its secrets inside ordinary order, where a moved commonplace object can be more honest than blood.',
    },
    {
      zh: '冷风穿过{zone}没有关严的门，卷起一小片本该静止的灰尘。{agent}俯身追随它落下的方向，一条被匆忙脚步搅乱的路线逐渐显形。',
      en: 'A cold draft slips through an unlatched door in {zone} and lifts dust that should have remained still. {agent} follows where it settles until a route disturbed by hurried footsteps begins to show.',
    },
    {
      zh: '{agent}关闭主灯，只留下贴地的侧光。{zone}里每件物品都拖出长影，其中一件的影子与底座错开了半寸，像一句没有完全擦掉的更正。',
      en: '{agent} kills the overhead lights and leaves a beam grazing the floor. Every object in {zone} grows a long shadow; one shadow misses its base by half an inch, like a correction someone failed to erase.',
    },
  ],
  examine_clue: [
    {
      zh: '冷白检视灯在{zone}亮起，{agent}戴着手套转动证物；划痕的方向、附着物的层次和时间留下的氧化色逐一接受盘问。',
      en: 'A cold inspection lamp wakes in {zone}. Through gloved hands, {agent} turns the exhibit while scratches, residue, and the color of elapsed time submit to questioning.',
    },
    {
      zh: '{agent}把证物置于斜光下，表面忽然显出第二层叙述。有人讲过一个故事，但材料本身正在给出不同的证词。',
      en: '{agent} tilts the evidence into raking light and a second account appears on its surface. Someone told one story; the material itself is giving another.',
    },
    {
      zh: '在{zone}的放大镜下，微小损伤连成一条不肯说谎的时间线。{agent}逐段核对，直到偶然开始显得过分整齐。',
      en: 'Under magnification in {zone}, minute damage joins into a timeline incapable of lying. {agent} checks it segment by segment until coincidence looks too orderly.',
    },
    {
      zh: '{agent}用棉签从证物边缘取下一层几乎透明的油膜。它在{zone}的紫外光下显出断续指纹，也显出某个人试图擦拭时留下的慌乱方向。',
      en: '{agent} lifts an almost transparent film from the exhibit\'s edge. Under ultraviolet light in {zone}, it reveals a broken print and the frantic direction of the hand that tried to wipe it away.',
    },
    {
      zh: '证物上的尘埃并不均匀。{agent}把沉积厚度绘成等高线，{zone}的屏幕随即勾出一块近期被遮住、又被重新暴露的轮廓。',
      en: 'Dust lies unevenly across the evidence. {agent} charts its depth like contour lines, and the screen in {zone} outlines a shape that was recently covered, then exposed again.',
    },
  ],
  check_alibi: [
    {
      zh: '{agent}把证词中的钟点、车程和目击位置逐一钉在时间线上。{zone}墙上的时钟继续走着，却替一个缺失的分钟作了证。',
      en: '{agent} pins times, travel intervals, and sightings to a single line. The clock in {zone} keeps moving, yet testifies on behalf of one missing minute.',
    },
    {
      zh: '不在场证明被拆成一串可验证的小事：一张票、一次通话、一扇门。{agent}只需找到其中最先承受不住重量的那一环。',
      en: 'The alibi is dismantled into small verifiable things: a receipt, a call, a door. {agent} needs only the first link that cannot bear the weight placed on it.',
    },
    {
      zh: '{agent}让两份时间记录在{zone}并排滚动。它们几乎严丝合缝，正因如此，那处多出来的整齐才像一道新鲜的缝线。',
      en: '{agent} runs two timelines side by side in {zone}. They fit almost perfectly, which makes one patch of excessive neatness resemble a fresh stitch.',
    },
    {
      zh: '{agent}把交通图、门禁日志与天气记录叠在{zone}的光桌上。三条路线都能抵达口供中的终点，却只有一条来得及避开那场暴雨。',
      en: '{agent} layers transit maps, access logs, and weather records across the light table in {zone}. Three routes reach the claimed destination, but only one could have avoided the storm.',
    },
    {
      zh: '{zone}里三只校准时钟同时跳到下一分钟。{agent}重放那通电话的背景声，一记远处钟响却提前出现，让完美的不在场证明慢了整整一拍。',
      en: 'Three calibrated clocks in {zone} enter the next minute together. {agent} replays the call, and a distant chime arrives too early, leaving the perfect alibi one full beat behind.',
    },
  ],
  present_evidence: [
    {
      zh: '{agent}没有提高声音，只把证据卡推过{zone}的桌面。卡片停下的瞬间，对方精心维持的镇定先一步越过了边界。',
      en: '{agent} does not raise a voice, only slides the evidence card across the table in {zone}. When it stops, the composure opposite crosses its boundary first.',
    },
    {
      zh: '证物被放在两份矛盾口供之间，像一枚压住纸页的铅块。{agent}等待事实的重量迫使其中一页卷曲。',
      en: 'The exhibit is placed between two conflicting statements like lead holding down paper. {agent} waits for the weight of fact to make one page curl.',
    },
    {
      zh: '{zone}的空气随着证据编号被念出而收紧。{agent}只陈述可证明的部分，把剩下的空白留给对方亲自填错。',
      en: 'The air in {zone} tightens as the evidence number is read aloud. {agent} states only what can be proved and leaves the remaining blank for the other person to fill incorrectly.',
    },
    {
      zh: '{agent}将照片反扣在{zone}桌面上，先说出拍摄时间，再说地点，最后才翻开画面。对方在看见内容之前就移开了视线。',
      en: '{agent} places a photograph face down on the table in {zone}, naming the time first, then the place, and only then revealing the image. The person opposite looks away before seeing what it contains.',
    },
    {
      zh: '证据没有一次全部亮出。{agent}让每一项事实隔着几秒出现，像走廊里依次点亮的灯；到了最后，{zone}已经没有阴影足够容纳原来的说法。',
      en: 'The evidence is not revealed all at once. {agent} lets each fact appear seconds apart, lights waking down a corridor, until {zone} holds no shadow large enough for the original account.',
    },
  ],
  interrogate_suspect: [
    {
      zh: '{agent}把问题收窄到只容得下一句真话。{zone}里的机器低声运转，对方却在稳定噪音中暴露了不稳定的呼吸。',
      en: '{agent} narrows the question until it can hold only one truthful sentence. Machinery murmurs through {zone}, and an unsteady breath breaks against that steady noise.',
    },
    {
      zh: '长久的沉默不是空白，而是压力。{agent}让它在{zone}缓慢累积，直到一句准备好的回答从内部出现裂纹。',
      en: 'A long silence is not empty; it is pressure. {agent} lets it accumulate through {zone} until a rehearsed answer begins to fracture from within.',
    },
    {
      zh: '{agent}突然回到最不起眼的细节，像在旧伤上轻按了一次。对方的目光抢先转向出口，替尚未说出的答案指明方向。',
      en: '{agent} abruptly returns to the smallest detail, pressing once on an old bruise. The subject\'s eyes reach the exit first and point toward the answer not yet spoken.',
    },
    {
      zh: '{zone}桌上的水一口未动，杯壁却留下新的指印。{agent}把同一个问题换了一个主语，对方的手终于从杯子上撤开，仿佛玻璃突然变得灼热。',
      en: 'The water on the table in {zone} remains untouched, though fresh prints cloud the glass. {agent} asks the same question with a different subject, and the hand withdraws as if the tumbler has turned hot.',
    },
    {
      zh: '{agent}请对方第三次复述那段经过。谎言通常记得骨架，却记不住天气、气味和门开启的方向；这一次，{zone}里少了一场先前存在的风。',
      en: '{agent} asks for the account a third time. A lie remembers its skeleton but forgets weather, scent, and which way a door opened. This time, a wind that existed before is missing from {zone}.',
    },
  ],
  access_database: [
    {
      zh: '{agent}潜入{zone}的档案层，陈旧记录在屏幕上排成幽暗长廊。被删除的索引留下空门牌，反而标出了有人来过。',
      en: '{agent} descends into the archive layer of {zone}, where old records form a dim corridor. Deleted indexes leave empty doorplates, marking exactly where someone has been.',
    },
    {
      zh: '数据库没有记忆，只有残留。{agent}沿版本时间戳逆流而上，寻找那次被伪装成正常维护的改动。',
      en: 'A database has no memory, only residue. {agent} follows version timestamps upstream, searching for the alteration disguised as routine maintenance.',
    },
    {
      zh: '{zone}的终端吐出一列沉默编号。{agent}交叉核验访问、位置与权限，让原本互不相干的记录在同一秒钟相遇。',
      en: 'A terminal in {zone} yields a column of silent identifiers. {agent} cross-checks access, location, and privilege until unrelated records meet in the same second.',
    },
    {
      zh: '{agent}没有搜索名字，而是搜索缺失。{zone}的审计表里，每逢同一个账户出现，下一行总会被整齐清空；规律像黑纸上的白字一样醒目。',
      en: '{agent} searches not for a name, but for absence. In the audit table of {zone}, every appearance of one account is followed by a perfectly blank row, a pattern bright as white ink on black paper.',
    },
    {
      zh: '一份自动备份在{zone}深层存储里醒来，比现行记录早七分钟。{agent}让两个版本逐字重叠，被替换的字段像暗室中显影的字迹缓慢浮出。',
      en: 'An automatic backup wakes in the deep storage of {zone}, seven minutes older than the live record. {agent} overlays the versions until the replaced fields emerge like writing in a darkroom tray.',
    },
  ],
  analyze_forensics: [
    {
      zh: '{zone}被仪器的冷光切成数层。{agent}从纤维、微粒与断裂边缘读取接触顺序，让物质替缺席的证人开口。',
      en: 'Instrument light cuts {zone} into layers. {agent} reads the order of contact from fibers, particles, and fracture edges, letting matter speak for the absent witness.',
    },
    {
      zh: '{agent}重建样本经历过的温度、压力和移动。实验台上的曲线彼此靠近，像几条绕远路后终于相认的街道。',
      en: '{agent} reconstructs the sample\'s heat, pressure, and movement. Curves on the bench converge like streets that took separate routes before recognizing one another.',
    },
    {
      zh: '检材在{zone}的扫描阵列中逐帧展开。噪点被剥离后，一处过于精确的缺口留下来，带着人为修剪的冷峻边缘。',
      en: 'The specimen unfolds frame by frame across the scanner in {zone}. When noise is stripped away, one gap remains, too exact, carrying the hard edge of deliberate trimming.',
    },
    {
      zh: '{agent}向样本滴入试剂，{zone}的光谱先泛蓝，继而在边缘升起一圈微弱金色。两种本不该相遇的物质，留下了短暂接触的化学回声。',
      en: '{agent} introduces a reagent to the sample. The spectrum in {zone} turns blue, then raises a faint gold rim: two materials that should never have met, preserving the chemical echo of brief contact.',
    },
    {
      zh: '断口在{zone}的模型中被放大百倍。{agent}旋转两枚碎片，细小齿痕一一咬合，证明它们曾属于同一件东西，也曾被同一股力量分开。',
      en: 'The fracture is enlarged a hundredfold in the model above {zone}. {agent} rotates two fragments until their tiny teeth interlock, proving they belonged together and were divided by the same force.',
    },
  ],
  tail_suspect: [
    {
      zh: '{agent}把距离维持在两盏路灯之间，跟随目标穿过{zone}。橱窗反光和雨后路面替他观察，脚步则被城市的脉搏吞没。',
      en: '{agent} keeps two streetlamps between hunter and target through {zone}. Shop windows and rain-dark pavement watch on his behalf while footsteps dissolve into the city\'s pulse.',
    },
    {
      zh: '目标在{zone}连续做了两次没有目的的转向。{agent}没有跟进，而是借另一条视线重新接上那道开始警觉的影子。',
      en: 'The target makes two purposeless turns through {zone}. {agent} refuses the bait and reconnects from another sightline with the shadow that has begun to grow wary.',
    },
    {
      zh: '{zone}的霓虹把人群切成明暗交替的碎片。{agent}只追踪重复出现的轮廓，让一次秘密会面自己走进视野。',
      en: 'Neon divides the crowd in {zone} into alternating shards of light and dark. {agent} follows only the shape that returns, allowing a secret meeting to enter the frame on its own.',
    },
    {
      zh: '目标在{zone}的换乘大厅消失了九十秒。{agent}没有奔跑，只观察哪一扇门后的鸽群突然惊起；城市替逃离者指出了方向。',
      en: 'The target vanishes for ninety seconds in the transit hall of {zone}. {agent} does not run, watching instead for the doorway that startles a flock of pigeons. The city points after its fugitive.',
    },
    {
      zh: '{agent}借一辆缓行货车遮住身形，在{zone}下一个路口重新取得视线。目标的步速没有变化，右手却始终贴着口袋，守着一件比被跟踪更重要的东西。',
      en: '{agent} borrows the cover of a slow delivery truck and regains the sightline at the next corner of {zone}. The target\'s pace never changes, but one hand guards a pocket as if its contents matter more than pursuit.',
    },
  ],
  bribe_informant: [
    {
      zh: '{agent}把一枚无标记筹码留在{zone}的桌角，没有碰它第二次。交易的真正价码不在桌面，而在谁先看向门口。',
      en: '{agent} leaves an unmarked token at the corner of a table in {zone} and never touches it again. The real price of a bargain is not on the table, but in who looks toward the door first.',
    },
    {
      zh: '{zone}里没有人说“交换”。{agent}只提到一项旧人情，线人便开始用模糊的代词描述一个本不该存在的人。',
      en: 'No one in {zone} says the word exchange. {agent} mentions an old favor, and the informant begins describing someone who should not exist through carefully blurred pronouns.',
    },
    {
      zh: '{agent}让报酬保持可见，却把承诺说得很轻。对方衡量的不是金额，而是这条消息会在黑暗里惊醒多少人。',
      en: '{agent} keeps the payment visible and the promise quiet. The informant weighs not the sum, but how many people this message might wake in the dark.',
    },
    {
      zh: '线人把信封推回{zone}桌面中央，只抽走其中一半。{agent}明白这不是降价，而是警告：剩下的情报必须等某个人离开这座城。',
      en: 'The informant pushes the envelope back to the center of the table in {zone}, taking only half. {agent} understands it is not a discount, but a warning: the rest of the story must wait until someone leaves the city.',
    },
    {
      zh: '{zone}的霓虹在咖啡上晃成一条红线。{agent}没有追问名字，只报出三个地点；线人在第二个地点前眨了一次眼，交易便有了方向。',
      en: 'Neon trembles across the coffee in {zone} like a red line. {agent} asks for no name, only lists three places. The informant blinks before the second, and the bargain acquires a direction.',
    },
  ],
  hack_terminal: [
    {
      zh: '{agent}让探针贴着{zone}终端的权限边缘前行，像细针试探锁芯。每一次拒绝都暴露了防线更在意保护哪扇门。',
      en: '{agent} guides a probe along the privilege boundary of the terminal in {zone}, a fine pick testing a lock. Every refusal reveals which door the defenses care most about.',
    },
    {
      zh: '光标在{zone}的黑屏上停顿半秒，随后越过一层伪装成系统噪声的屏障。{agent}不追逐数据，只追逐有人急于隐藏的路径。',
      en: 'The cursor pauses on a dark screen in {zone}, then crosses a barrier disguised as system noise. {agent} does not chase data, only the path someone was desperate to hide.',
    },
    {
      zh: '{agent}复制访问节奏而非凭据，让终端误以为昨夜尚未结束。日志门缝开启，里面残留着一次被仓促擦除的来访。',
      en: '{agent} copies an access rhythm rather than a credential, persuading the terminal that last night never ended. The log opens a crack around a visit erased in haste.',
    },
    {
      zh: '{agent}先在沙箱里放出一段诱饵代码。{zone}的防御程序立即扑向它，真正的权限路径因此短暂无人看守，像警犬离开了错误的门。',
      en: '{agent} releases a decoy into a sandbox. The defenses of {zone} lunge after it, leaving the real privilege path briefly unattended, a watchdog abandoning the wrong door.',
    },
    {
      zh: '终端每七秒发出一次校验脉冲，规律得像走廊尽头的脚步。{agent}藏在两次脉冲之间移动，让一段被隔离的记录在警报醒来前完成镜像。',
      en: 'The terminal sends a verification pulse every seven seconds, regular as footsteps at the end of a corridor. {agent} moves between pulses and mirrors an isolated record before the alarm wakes.',
    },
  ],
  check_cctv: [
    {
      zh: '{agent}让{zone}的监控画面逐格倒退。人群向后穿门，雨滴升回天空，只有一段缺帧始终黑着，像被剪走的记忆。',
      en: '{agent} runs the cameras in {zone} backward frame by frame. Crowds retreat through doors and rain climbs toward the sky, while one missing interval remains black, a memory cut away.',
    },
    {
      zh: '十二路画面在{zone}同时亮起，彼此校正时间误差。{agent}寻找的不是出现的人，而是所有镜头都恰好没有拍到的移动。',
      en: 'Twelve feeds wake together in {zone} and correct one another\'s drifting clocks. {agent} searches not for the person shown, but for the movement every camera happened to miss.',
    },
    {
      zh: '{agent}冻结一帧模糊侧影，再从玻璃反射中取回第二个角度。原本无名的经过者，终于在两个不完整的影像之间获得轮廓。',
      en: '{agent} freezes a blurred profile and recovers a second angle from reflected glass. Between two incomplete images, an anonymous passerby finally acquires a shape.',
    },
    {
      zh: '{agent}将{zone}的画面按影子长度重新排序。错误的时间码彼此争辩，日光却始终诚实，替一段被挪动的录像找回了原位。',
      en: '{agent} reorders the footage from {zone} by the length of its shadows. Corrupted timecodes argue with one another, but daylight remains honest and returns a displaced recording to its true hour.',
    },
    {
      zh: '一辆车驶过{zone}镜头时，车窗短暂映出街道另一侧。{agent}把那半秒放大、校正，借一块移动的玻璃看见了固定摄像头背后的盲区。',
      en: 'As a vehicle crosses a camera in {zone}, its window briefly reflects the opposite street. {agent} enlarges and corrects that half-second, using moving glass to see behind the fixed camera\'s blind spot.',
    },
  ],
});

export const NARRATIVE_PLOT_BEATS = Object.freeze({
  opening: [
    {
      zh: '案件还在最初的冷雾里，任何清晰得过早的答案都值得怀疑。',
      en: 'The case still stands in its first cold fog, and any answer that becomes clear too early deserves suspicion.',
    },
    {
      zh: '这是现场开始说话的时刻，零散细节尚未组成故事，却已经拒绝保持沉默。',
      en: 'This is the hour when the scene begins to speak. Its details do not yet form a story, but they have already refused silence.',
    },
    {
      zh: '第一条证据尚未决定方向；它只在黑暗中划出边界，提醒调查者哪些地方不能凭想象跨越。',
      en: 'The first evidence chooses no direction. It only marks a boundary in the dark, warning the investigation where imagination must not cross.',
    },
  ],
  pursuit: [
    {
      zh: '几条原本孤立的记录开始彼此投下影子，案件由此从现场延伸到人的选择。',
      en: 'Records once isolated begin casting shadows across one another, and the case moves from the scene into the choices people made.',
    },
    {
      zh: '调查已经惊动了某种秩序；越接近可验证的事实，周围的沉默便越显得经过安排。',
      en: 'The investigation has disturbed an established order. The closer it comes to verifiable fact, the more arranged the surrounding silence appears.',
    },
    {
      zh: '线索仍未连成直线，却像夜色中的路标一样，逐渐指向同一片更深的阴影。',
      en: 'The clues do not yet form a straight line, but like road signs at night they increasingly point toward the same deeper shadow.',
    },
  ],
  escalation: [
    {
      zh: '案件开始反过来注视调查者，每一次试探都引来更快、更精确的回应。',
      en: 'The case has begun to look back at its investigators, answering every probe with something faster and more precise.',
    },
    {
      zh: '旧证词正在承受新证据的重量，裂缝不再孤立，而是沿着同一条因果边缘扩散。',
      en: 'Old statements are taking the weight of new evidence. Their fractures are no longer isolated, but spreading along the same edge of cause.',
    },
    {
      zh: '有人试图让调查在噪声中迷路；这种不断增加的阻力，反而证明方向正在变得危险而准确。',
      en: 'Someone is trying to lose the investigation in noise. The growing resistance suggests the direction is becoming both dangerous and accurate.',
    },
  ],
  convergence: [
    {
      zh: '散落的时间、地点与动机正在收束，剩下的矛盾已经少到可以逐一听见。',
      en: 'Scattered times, places, and motives are converging. So few contradictions remain that each can now be heard separately.',
    },
    {
      zh: '案件接近必须作出判断的边缘，但最后的距离仍只能由证据跨越。',
      en: 'The case approaches the edge where judgment becomes unavoidable, yet only evidence may cross the final distance.',
    },
    {
      zh: '所有被保全的事实正在形成同一幅轮廓；它还没有名字，却已经无法再被当作巧合。',
      en: 'Every secured fact is forming the same outline. It has no name yet, but it can no longer be dismissed as coincidence.',
    },
  ],
});

const OUTCOME_FRAMES = Object.freeze({
  clue: {
    tone: 'success',
    zh: [
      '{agent}{verb}，噪声中浮现出「{clue}」的稳定特征，这条新证据已写入证物库。',
      '全息读数在{zone}收敛；{agent}{verb}后确认「{clue}」不是环境误差。',
      '{zone}的异常终于对齐，{agent}{verb}并保全了「{clue}」，调查方向随之清晰。',
      '扫描光带掠过{zone}，{agent}{verb}时捕获「{clue}」留下的可验证痕迹。',
      '{agent}排除了两组干扰项，{verb}后将「{clue}」标记为本轮有效发现。',
      '数据回波在最后一刻稳定，{agent}{verb}并锁定「{clue}」这条公开证据。',
      '{zone}的沉默被一处细节打破：{agent}{verb}，随后封存「{clue}」。',
      '{agent}沿着公开线索完成{verb}，新的证据节点「{clue}」被安全点亮。',
    ],
    en: [
      '{agent} {verb}; a stable signature for “{clue}” rises through the noise and enters the evidence locker.',
      'The holographic readout converges in {zone}; after {verb}, {agent} confirms “{clue}” is not environmental noise.',
      'The anomaly in {zone} finally aligns as {agent} {verb} and secures “{clue}”.',
      'A scan band crosses {zone}; while {verb}, {agent} captures a verifiable trace of “{clue}”.',
      '{agent} rejects two false signals and marks “{clue}” as this turn’s valid discovery.',
      'The data echo stabilizes at the last moment; {agent} {verb} and locks down “{clue}”.',
      'One detail breaks the silence in {zone}: {agent} {verb}, then archives “{clue}”.',
      '{agent} follows the public trail, completes the check, and safely lights the “{clue}” evidence node.',
    ],
  },
  progress: {
    tone: 'info',
    zh: [
      '{agent}{verb}，虽然没有新证物，但排除了一条错误路线。',
      '{zone}的公开记录被重新排序，{agent}{verb}后得到一段可用于下一轮的进展。',
      '本轮没有直接突破；{agent}{verb}并缩小了仍需验证的范围。',
      '{agent}完成{verb}，现场轮廓比上一回合更清晰，但仍需证据闭环。',
      '系统校验通过，{agent}{verb}后确认当前方向仍值得继续。',
      '{zone}传回有限响应；{agent}{verb}并留下了一条稳定的后续路径。',
      '{agent}没有强行下结论，而是通过{verb}清除了一个干扰假设。',
      '调查向前推进了一步：{agent}{verb}，下一次验证将拥有更窄的搜索面。',
    ],
    en: [
      '{agent} {verb}; no new exhibit appears, but one false route is eliminated.',
      'Public records in {zone} are reordered, giving {agent} a stable lead for the next turn.',
      'There is no direct breakthrough; {agent} {verb} and narrows the remaining search.',
      '{agent} completes the check. The scene is clearer, though the evidence chain is not closed.',
      'The rule validation passes; after {verb}, {agent} confirms this direction remains viable.',
      '{zone} returns a limited response, leaving {agent} with one reliable follow-up route.',
      '{agent} avoids a premature conclusion and clears one interfering hypothesis.',
      'The case moves one step forward as {agent} {verb}, reducing the next search space.',
    ],
  },
  no_yield: {
    tone: 'warning',
    zh: [
      '{agent}{verb}，但当前区域没有返回可验证的新信息。',
      '{zone}只留下重复噪声；{agent}结束{verb}并建议更换调查角度。',
      '这条路线暂时无收获，{agent}{verb}后没有把猜测当作证据。',
      '{agent}完成{verb}，读数始终低于证据阈值，本轮不生成虚假线索。',
      '公开数据互相抵消；{agent}{verb}后将本次结果标为待观察。',
      '{zone}没有响应这次验证，{agent}保留资源并停止继续放大噪声。',
      '{agent}{verb}却只找到旧痕迹，系统拒绝把它计入新发现。',
      '调查触及空白区；{agent}完成{verb}，下一轮需要改变执行策略。',
    ],
    en: [
      '{agent} {verb}, but the current zone returns no verifiable new information.',
      '{zone} yields only repeated noise; {agent} ends the check and recommends a new angle.',
      'This route produces no result, and {agent} refuses to promote a guess into evidence.',
      '{agent} completes the check, but the reading stays below the evidence threshold.',
      'The public signals cancel one another; {agent} marks this outcome for observation only.',
      '{zone} does not answer this validation, so {agent} stops amplifying the noise.',
      '{agent} finds only old traces, and the system refuses to log them as a new discovery.',
      'The investigation reaches a blank sector; the next turn needs a different tactic.',
    ],
  },
  trap: {
    tone: 'danger',
    zh: [
      '{agent}{verb}时触发反制，{zone}的警报层瞬间转为红色。',
      '伪造信号在{zone}闭合成陷阱；{agent}{verb}后被迫切断连接。',
      '{agent}识别得太晚，{verb}激活了对手预埋的混乱脉冲。',
      '{zone}的读数突然反相，{agent}{verb}时遭到敌对规则回击。',
      '这不是普通噪声；{agent}{verb}后确认调查路径已被刻意污染。',
      '{agent}继续{verb}的一瞬间，防御脚本开始回灌错误数据。',
      '{zone}弹出一组诱饵记录，{agent}{verb}后及时封锁了更大损失。',
      '敌对响应抢先一步，{agent}{verb}触发陷阱但保住了调查主状态。',
    ],
    en: [
      'A countermeasure fires while {agent} {verb}, turning {zone}’s alert layer red.',
      'A forged signal closes into a trap in {zone}; {agent} is forced to sever the link.',
      '{agent} identifies the pattern too late and the action triggers a confusion pulse.',
      'The readings in {zone} invert as an adversarial rule strikes back.',
      'This is not ordinary noise; {agent} confirms the route was deliberately contaminated.',
      'The moment {agent} continues, a defense script begins feeding poisoned data backward.',
      '{zone} exposes a decoy record; {agent} contains the damage before it spreads.',
      'The hostile response moves first. The trap fires, but the core investigation state survives.',
    ],
  },
  illegal: {
    tone: 'danger',
    zh: [
      '指令未通过合法行动白名单，{agent}拒绝在{zone}执行。',
      '{agent}检测到无效行动格式，本轮只记录错误而不伪造结果。',
      '规则层拦截了这条指令；{verb}不适用于当前调查状态。',
      '{zone}没有对应的合法接口，{agent}终止执行并保留现场完整性。',
      '行动标签校验失败，{agent}拒绝让未知指令改变案件进度。',
      '{agent}将该请求标记为非法路径，系统未生成任何虚假证据。',
      '安全边界阻止了本次{verb}，调查状态保持可恢复。',
      '这条指令无法映射到十二种合法行动，{agent}已安全中止。',
    ],
    en: [
      'The order fails the legal-action allowlist, so {agent} refuses to execute it in {zone}.',
      '{agent} detects an invalid action format and records an error instead of inventing a result.',
      'The rule layer blocks the order; this action is not valid for the current investigation state.',
      '{zone} has no legal interface for the order, so {agent} preserves scene integrity.',
      'Action-tag validation fails, preventing an unknown order from changing case progress.',
      '{agent} marks the request as an illegal route; no false evidence is generated.',
      'The safety boundary stops the action and keeps the investigation recoverable.',
      'The order cannot map to any of the twelve legal actions, so {agent} aborts safely.',
    ],
  },
});

const THOUGHT_FRAMES = Object.freeze({
  zh: [
    '现有证据共有 {count} 条，我会先从{zone}的公开记录排除重复路线，再让{agent}选择与其专长最匹配的验证方式。',
    '{agent}正在把{zone}的证词、权限和时间轴拆开核验；当前最重要的是让下一步行动产生可复查的结果。',
    '本轮战术分析不预设答案：{agent}会依据已经公开的 {count} 条证据，比较三条合法行动的收益与风险。',
    '{zone}仍有信息缺口，{agent}建议先检查能形成证据闭环的路径，并避免重复近期低价值行动。',
    '当前混乱为 {confusion}%，{agent}会优先保持判断稳定，再根据事实贴近度选择下一项调查。',
    '{agent}正在将人物说法与现场读数交叉排列；下一步需要验证，而不是猜测尚未公开的真相。',
  ],
  en: [
    'With {count} secured clues, {agent} will clear duplicate routes in {zone} before choosing a validation method that matches the team’s expertise.',
    '{agent} is separating testimony, permissions, and the timeline in {zone}; the next action must produce a reviewable result.',
    'This tactical analysis assumes no answer: {agent} will compare three legal routes using only the {count} public clues.',
    '{zone} still contains an information gap, so {agent} favors a route that can close an evidence chain without repeating a weak action.',
    'Confusion is at {confusion}%. {agent} will protect judgment stability, then select the next action by estimated alignment.',
    '{agent} is cross-arranging statements and scene readings; the next step must verify facts rather than guess hidden truth.',
  ],
});

// These short codas bind a generic action result back to the public dramatic
// premise of the active case. They never reveal which interpretation is true.
const CASE_OUTCOME_ECHOES = Object.freeze({
  clue: {
    zh: [
      '证物封存的一刻，{motif}第一次有了可以复查的重量。',
      '一道新的因果线穿过现场，朝着{motif}延伸。',
      '这项发现没有回答谜题，却让{motif}不再只是背景。',
      '新的证据迫使调查重新审视{motif}，也让一份旧说法显得不再完整。',
    ],
    en: [
      'As the exhibit is sealed, {motif} gains verifiable weight for the first time.',
      'A new line of cause crosses the scene and reaches toward {motif}.',
      'The discovery does not answer the mystery, but {motif} is no longer mere atmosphere.',
      'The new evidence forces a second look at {motif}, leaving one earlier account incomplete.',
    ],
  },
  progress: {
    zh: [
      '调查没有得到答案，但{motif}已经比上一轮更接近可验证的事实。',
      '这一步像在黑暗中校准焦距，{motif}与其他记录之间的距离正在变得清楚。',
      '一个错误方向被排除后，{motif}留下的问题反而更难回避。',
      '现场仍保持沉默，但{motif}对应的时间线已经比上一回合完整。',
    ],
    en: [
      'The action yields no answer, but the shadow around {motif} grows smaller.',
      'Like focusing a lens in darkness, it clarifies the distance between {motif} and the other records.',
      'With one false direction removed, the question surrounding {motif} becomes harder to avoid.',
      'The scene remains silent, but the timeline around {motif} is more complete than it was one turn ago.',
    ],
  },
  no_yield: {
    zh: [
      '空白本身也是边界：至少这一轮没有让{motif}被新的猜测污染。',
      '这条路没有靠近{motif}，却替下一次调查保住了一个更诚实的起点。',
      '现场拒绝回应，{motif}仍悬在证据链之外，等待另一种验证方式。',
      '没有收获并不等于没有意义；这次失败让{motif}对应的搜索范围更窄。',
    ],
    en: [
      'A blank result still marks a boundary: this turn has not contaminated {motif} with another guess.',
      'The route does not approach {motif}, but it preserves a more honest starting point for the next search.',
      'The scene refuses to answer; {motif} remains outside the chain, waiting for another form of verification.',
      'No yield is not no meaning; the failed route narrows the search around {motif}.',
    ],
  },
  trap: {
    zh: [
      '反制出现得如此准确，说明有人曾预料调查会沿着{motif}靠近。',
      '陷阱试图把视线从{motif}上移开，这种急切本身值得记录。',
      '红色警报短暂淹没现场，但{motif}依然是反制无法抹去的问题。',
      '有人给{motif}周围布置了错误答案；越是精密，越说明这里并非无关紧要。',
    ],
    en: [
      'The countermeasure arrives with such precision that someone expected the investigation to approach {motif}.',
      'The trap tries to pull attention away from {motif}; that urgency is worth recording.',
      'Red alerts briefly drown the scene, but {motif} remains the question the defense cannot erase.',
      'Someone planted a false answer around {motif}; its precision makes the area harder to dismiss.',
    ],
  },
});

const OBSERVATION_ACTION_GROUPS = Object.freeze({
  talk_to_npc: 'testimony',
  present_evidence: 'testimony',
  interrogate_suspect: 'testimony',
  search_area: 'scene',
  examine_clue: 'scene',
  check_alibi: 'timeline',
  tail_suspect: 'timeline',
  check_cctv: 'timeline',
  access_database: 'digital',
  hack_terminal: 'digital',
  analyze_forensics: 'forensics',
  bribe_informant: 'network',
});

const OBSERVATION_ACTION_LABELS = Object.freeze({
  talk_to_npc: { zh: '接触相关人员', en: 'witness contact' },
  search_area: { zh: '搜索现场', en: 'scene search' },
  examine_clue: { zh: '复核证物', en: 'evidence examination' },
  check_alibi: { zh: '核验不在场证明', en: 'alibi verification' },
  present_evidence: { zh: '出示证据', en: 'evidence presentation' },
  interrogate_suspect: { zh: '审讯相关人员', en: 'focused interrogation' },
  access_database: { zh: '访问数据库', en: 'database access' },
  analyze_forensics: { zh: '法证分析', en: 'forensic analysis' },
  tail_suspect: { zh: '秘密跟踪', en: 'covert surveillance' },
  bribe_informant: { zh: '接触线人', en: 'informant contact' },
  hack_terminal: { zh: '入侵终端', en: 'terminal intrusion' },
  check_cctv: { zh: '复查监控', en: 'camera review' },
});

export const OBSERVATION_AFTERMATH_BEATS = Object.freeze({
  testimony: [
    {
      zh: '{team}结束「{action}」后，证词频道没有立刻安静下来；几处停顿与改口仍在记录中彼此碰撞。',
      en: 'After {team} completes {action}, the testimony channel does not immediately go quiet; pauses and revisions continue colliding in the record.',
    },
    {
      zh: '上一轮的「{action}」改变了谈话重心。{team}把公开说法重新排进时间轴，先前自然的一句话如今显得需要复核。',
      en: 'The last turn of {action} shifts the center of the conversation. {team} returns the public accounts to the timeline, where one formerly natural sentence now demands review.',
    },
    {
      zh: '{team}从「{action}」带回的不是口供结论，而是一组语气、顺序与回避方式；它们正在迫使人物关系重新排列。',
      en: '{team} returns from {action} not with a verdict, but with patterns of tone, sequence, and evasion that force the relationships into a new order.',
    },
    {
      zh: '讯问灯熄灭后，「{action}」留下的矛盾仍悬在{zone}上方。{team}开始区分哪些沉默来自恐惧，哪些来自刻意选择。',
      en: 'When the interview light goes dark, contradictions left by {action} remain over {zone}. {team} begins separating fearful silence from deliberate omission.',
    },
  ],
  scene: [
    {
      zh: '{team}完成「{action}」后，{zone}的物理细节被重新编号；位置、磨损与残留物开始形成一条可复查的现场路径。',
      en: 'After {team} completes {action}, the physical details in {zone} are renumbered; position, wear, and residue begin forming a reviewable path through the scene.',
    },
    {
      zh: '上一轮的「{action}」让现场尺度发生变化。{team}把被忽略的边缘放大，原本孤立的痕迹开始与房间结构互相解释。',
      en: 'The last turn of {action} changes the scale of the scene. {team} enlarges the neglected edges until isolated traces begin explaining the room around them.',
    },
    {
      zh: '{zone}在「{action}」之后呈现出另一层秩序：某些物件被移动过，另一些细节则因过于整齐而显得可疑。',
      en: 'After {action}, another order emerges in {zone}: some objects have moved, while other details look suspicious precisely because they are too neat.',
    },
    {
      zh: '{team}退出扫描范围时，现场仍保留着「{action}」划出的边界。下一轮必须决定哪些痕迹值得交给独立证据验证。',
      en: 'As {team} leaves the scan perimeter, {zone} retains the boundaries drawn by {action}. The next turn must decide which traces deserve independent verification.',
    },
  ],
  timeline: [
    {
      zh: '{team}完成「{action}」后，上一轮的时间点被拆成到达、停留与离开三段；其中的空隙开始比记录本身更醒目。',
      en: 'After {team} completes {action}, the prior timeline splits into arrival, presence, and departure; the gaps between them become more visible than the record itself.',
    },
    {
      zh: '「{action}」留下了一条不完整但可复查的移动轨迹。{team}正在把它与{zone}的门禁、视线和公开证词逐项对齐。',
      en: '{action} leaves an incomplete but reviewable movement trail. {team} is aligning it with access events, sightlines, and public testimony from {zone}.',
    },
    {
      zh: '上一轮的「{action}」没有让时间变得简单，却让两个不能同时成立的顺序更加清楚。{team}暂时保留这处裂缝。',
      en: 'The last turn of {action} does not simplify time, but it clarifies two sequences that cannot both be true. {team} preserves the fracture for now.',
    },
    {
      zh: '{team}从「{action}」返回时带回一串带有间隔的时间戳；{zone}接下来要回答的，是谁有机会穿过这些间隔。',
      en: '{team} returns from {action} with a broken chain of timestamps. The next question for {zone} is who had the opportunity to pass through those intervals.',
    },
  ],
  digital: [
    {
      zh: '{team}结束「{action}」后，{zone}的日志被分成真实访问、自动任务与伪装噪声；三者仍在争夺同一段时间。',
      en: 'After {team} completes {action}, the logs from {zone} divide into real access, automated tasks, and disguised noise, all competing for the same interval.',
    },
    {
      zh: '上一轮的「{action}」打开了一层数字表皮。{team}没有信任系统给出的顺序，而是开始检查谁有能力改写它。',
      en: 'The last turn of {action} opens a layer beneath the digital surface. {team} distrusts the order supplied by the system and asks who had the means to rewrite it.',
    },
    {
      zh: '{zone}在「{action}」后留下多组数据回声。{team}正在区分正常同步、延迟写入与人为制造的时间错位。',
      en: 'After {action}, {zone} holds several data echoes. {team} is separating normal synchronization, delayed writes, and deliberately manufactured time drift.',
    },
    {
      zh: '{team}切断「{action}」通道时，一份看似完整的记录仍有校验缺口；下一轮将从缺口两端同时追查。',
      en: 'When {team} closes the {action} channel, a seemingly complete record still contains a verification gap. The next turn will approach it from both ends.',
    },
  ],
  forensics: [
    {
      zh: '{team}完成「{action}」后，显微读数、材料反应与现场时间开始互相约束；任何解释都必须同时通过三层检验。',
      en: 'After {team} completes {action}, microscopic readings, material response, and scene timing begin constraining one another; any explanation must survive all three layers.',
    },
    {
      zh: '上一轮的「{action}」把一个肉眼细节变成可测量数据。{team}正在确认它属于事件本身，还是事后留下的干扰。',
      en: 'The last turn of {action} converts a visible detail into measurable data. {team} is determining whether it belongs to the event or to interference left afterward.',
    },
    {
      zh: '{zone}的样本在「{action}」后出现稳定对照。{team}仍拒绝命名原因，只先固定可以被另一台仪器复现的部分。',
      en: 'Samples from {zone} produce a stable comparison after {action}. {team} still refuses to name a cause, preserving only what another instrument can reproduce.',
    },
    {
      zh: '{team}关闭分析仪时，「{action}」留下的谱线仍在缓慢重叠；它们尚未指向答案，却已经排除了最方便的解释。',
      en: 'As {team} powers down the analyzer, spectra left by {action} continue overlapping. They do not point to an answer, but they have ruled out the easiest explanation.',
    },
  ],
  network: [
    {
      zh: '{team}结束「{action}」后，一条非正式消息进入案件记录；它的价值不在于可信，而在于能否被公开事实独立印证。',
      en: 'After {team} completes {action}, an unofficial message enters the case record. Its value lies not in trust, but in whether public facts can verify it independently.',
    },
    {
      zh: '上一轮的「{action}」让城市边缘传回一段带条件的说法。{team}正在剥离其中的交易动机，只保留可核对的细节。',
      en: 'The last turn of {action} brings back a conditional account from the city fringe. {team} strips away the transactional motive and keeps only testable details.',
    },
    {
      zh: '{team}从「{action}」获得的路线穿过数个利益节点；每个人都可能说真话，也都可能只说对自己有利的部分。',
      en: 'The route {team} obtains through {action} crosses several interests. Each source may be truthful, and each may be telling only the useful part.',
    },
    {
      zh: '「{action}」结束后，{zone}之外的人际网络短暂亮起。{team}标记了消息传播的方向，而不是把传闻当成证据。',
      en: 'After {action}, the human network beyond {zone} briefly lights up. {team} marks the direction of transmission without mistaking rumor for evidence.',
    },
  ],
});

const OBSERVATION_OUTCOME_BEATS = Object.freeze({
  clue: [
    {
      zh: '这次行动保全了「{clue}」。它没有直接回答核心谜题，却为{motif}增加了一处能够独立复查的支点。',
      en: 'The action secures “{clue}”. It does not answer the central mystery, but gives {motif} a point that can be checked independently.',
    },
    {
      zh: '新证据「{clue}」已进入证物链；它迫使旧记录围绕{motif}重新排序，下一步需要寻找第二来源。',
      en: 'New evidence, “{clue}”, enters the chain and forces the older record around {motif} into a new order. A second source is now required.',
    },
    {
      zh: '「{clue}」从噪声中留下了可重复的特征。有关{motif}的两种解释因此拉开距离，但都还不能被当作结论。',
      en: '“{clue}” leaves a repeatable signature in the noise. Two readings of {motif} now move apart, though neither is yet a conclusion.',
    },
    {
      zh: '随着「{clue}」被封存，{motif}第一次与一项具体事实相连；调查获得方向，也同时获得了新的验证责任。',
      en: 'As “{clue}” is sealed, {motif} connects to a concrete fact for the first time. The case gains direction and a new burden of verification.',
    },
  ],
  progress: [
    {
      zh: '行动没有取得新证物，但一条错误路线已经被排除；围绕{motif}的搜索面比上一轮更窄。',
      en: 'The action secures no new exhibit, but eliminates one false route. The search around {motif} is narrower than it was last turn.',
    },
    {
      zh: '本轮只形成了程序性进展：记录更完整、假设更少，{motif}仍需要一次独立验证才能进入证据链。',
      en: 'This turn yields procedural progress only: a fuller record, fewer hypotheses, and {motif} still awaiting independent verification.',
    },
    {
      zh: '没有突破并不意味着原地踏步。调查已把{motif}附近的一段模糊区压缩成下一轮可以回答的具体问题。',
      en: 'No breakthrough does not mean no movement. The case compresses one blurred area around {motif} into a concrete question for the next turn.',
    },
    {
      zh: '系统没有登记新线索，却确认当前方法仍可复查；{motif}与现有事实之间还差最后一段可靠连接。',
      en: 'The system logs no new clue, but confirms that the method remains reviewable. One reliable connection is still missing between {motif} and the known facts.',
    },
  ],
  no_yield: [
    {
      zh: '这条路线没有返回可验证信息。{motif}仍停留在证据链之外，下一轮需要改变调查角度。',
      en: 'The route returns no verifiable information. {motif} remains outside the evidence chain, and the next turn needs a different angle.',
    },
    {
      zh: '扫描只重复了旧噪声，系统没有把猜测写成事实；关于{motif}的空白被保留下来，而不是被虚假答案填满。',
      en: 'The scan repeats old noise, and the system refuses to write speculation as fact. The blank around {motif} remains unfilled by a false answer.',
    },
    {
      zh: '本轮投入没有产生可复查结果。调查因此标记了一条低价值路径，并将资源转向{motif}的其他入口。',
      en: 'This turn produces no reviewable result. The investigation marks a low-value route and redirects resources toward another entry to {motif}.',
    },
    {
      zh: '现场对这次尝试保持沉默；唯一确定的是，同样的方法不足以穿透{motif}周围的干扰。',
      en: 'The scene remains silent after the attempt. The only certainty is that the same method cannot penetrate the interference around {motif}.',
    },
  ],
  trap: [
    {
      zh: '行动触发了预设反制，混乱上升 {confusion} 点。有人似乎预料调查会接近{motif}，这份准确本身已被记录。',
      en: 'The action triggers a prepared countermeasure and raises confusion by {confusion}. Someone appears to have expected an approach toward {motif}, and that precision is now on record.',
    },
    {
      zh: '敌对规则在路径中闭合，试图用噪声覆盖{motif}。调查主状态仍然完整，但下一轮必须先确认哪些读数遭到污染。',
      en: 'A hostile rule closes around the route and tries to bury {motif} in noise. The core case state survives, but the next turn must identify the contaminated readings.',
    },
    {
      zh: '红色警报短暂接管终端；这不是普通失败，而是一场针对调查方向的反应。{motif}因此变得更危险，也更值得复核。',
      en: 'A red alert briefly takes the terminal. This is not an ordinary failure but a response to the direction of inquiry, making {motif} both more dangerous and more deserving of review.',
    },
    {
      zh: '陷阱没有给出答案，只暴露了保护答案的手段。{team}保住现场记录，并把{motif}周围的异常防御列为下一轮风险。',
      en: 'The trap reveals no answer, only the means used to protect one. {team} preserves the scene record and marks the abnormal defense around {motif} as a risk for the next turn.',
    },
  ],
  illegal: [
    {
      zh: '上一条指令没有通过行动规则，案件状态未依据它生成结论；下一轮将从合法、可复查的路径重新开始。',
      en: 'The previous order failed the action rules, so the case state drew no conclusion from it. The next turn resumes from a legal, reviewable route.',
    },
    {
      zh: '系统隔离了无法识别的调查路径，没有让它污染{motif}周围的公开记录。',
      en: 'The system isolates an unrecognized investigative route before it can contaminate the public record around {motif}.',
    },
    {
      zh: '无效指令已被终止；现场事实保持原样，下一次选择必须映射到允许的调查方法。',
      en: 'The invalid order has been terminated. Scene facts remain unchanged, and the next choice must map to an allowed investigative method.',
    },
    {
      zh: '规则层拒绝为未知行动伪造结果。关于{motif}的判断被安全推迟，而不是建立在错误输入上。',
      en: 'The rule layer refuses to invent a result for an unknown action. Judgment around {motif} is safely delayed rather than built on invalid input.',
    },
  ],
});

const OBSERVATION_MOVEMENT_BEATS = Object.freeze([
  {
    zh: '调查重心已从{fromZone}转移到{zone}；旧区域留下的问题将随同证物链进入新的现场。',
    en: 'The investigation shifts from {fromZone} to {zone}; unresolved questions from the old area travel with the evidence chain.',
  },
  {
    zh: '行动路径抵达{zone}，与{fromZone}之间建立了新的空间关系；下一轮将检验这次移动是否补上因果缺口。',
    en: 'The action path reaches {zone}, establishing a new spatial relationship with {fromZone}. The next turn will test whether the move closes a causal gap.',
  },
  {
    zh: '{team}已将现场边界推进至{zone}。从{fromZone}带来的记录将在这里接受另一组环境事实校验。',
    en: '{team} advances the scene boundary to {zone}. Records carried from {fromZone} will now be tested against a different environment.',
  },
]);

const SAFE_TEXT = /[^\p{L}\p{N}\p{P}\p{Zs}_-]/gu;

const INTERNAL_ZONE_ID = /^(?:zone|area)_[a-z0-9_:-]+$/i;
const INTERNAL_CLUE_ID = /^(?:[a-z]+_)?(?:c|d|e|f|g|h|i|j|clue)(?:_secret)?_[a-z0-9_:-]+$/i;

export function stableNarrativeHash(value) {
  let hash = 2166136261;
  const input = String(value ?? '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function safeText(value, fallback, max = 120) {
  const text = String(value ?? '').replace(SAFE_TEXT, '').trim().slice(0, max);
  return text || fallback;
}

function publicLabel(value, fallback, kind = 'generic', max = 120) {
  const text = safeText(value, '', max);
  if (!text) return fallback;
  if (kind === 'zone' && INTERNAL_ZONE_ID.test(text)) return fallback;
  if (kind === 'clue' && INTERNAL_CLUE_ID.test(text)) return fallback;
  return text;
}

function localizedCase(caseData, lang) {
  if (lang === 'en' && caseData?.en) return { ...caseData, ...caseData.en };
  return caseData || {};
}

function joinSentence(...parts) {
  return parts.map(part => String(part || '').trim()).filter(Boolean).join(' ');
}

function narrativeStage({ turn, clueCount, clueTotal }) {
  if (turn <= 1 || clueCount <= 0) return 'opening';
  const progress = clueTotal > 0 ? clueCount / clueTotal : 0;
  return progress >= 0.55 ? 'convergence' : 'pursuit';
}

function chapterLabel(stage, lang) {
  const labels = lang === 'en'
    ? { opening: 'ACT I · THE SEALED SCENE', pursuit: 'ACT II · FRACTURED ACCOUNTS', convergence: 'ACT III · CAUSAL CONVERGENCE' }
    : { opening: '第一幕 · 封锁现场', pursuit: '第二幕 · 证词裂缝', convergence: '第三幕 · 因果收束' };
  return labels[stage] || labels.opening;
}

export function resolvePublicZoneName(caseData, zoneId, lang = 'zh') {
  const language = lang === 'en' ? 'en' : 'zh';
  const source = localizedCase(caseData, language);
  const sceneZone = source.scene?.zones?.[zoneId];
  const mapZone = source.zone_layout?.[zoneId];
  const mapLabel = mapZone?.label && mapZone?.sublabel
    ? `${mapZone.label} · ${mapZone.sublabel}`
    : mapZone?.label;
  return publicLabel(
    sceneZone?.label || mapLabel,
    language === 'zh' ? '当前案发区域' : 'the active scene',
    'zone',
    90,
  );
}

/**
 * @param {{ gameState?: Record<string, any>, caseData?: Record<string, any>, lang?: string }} options
 */
export function renderObservationAftermath({ gameState = {}, caseData = {}, lang = 'zh' } = {}) {
  const context = gameState.last_action_context;
  if (!context || typeof context !== 'object' || Number(context.version) !== 1) return null;

  const language = lang === 'en' ? 'en' : 'zh';
  const actionTag = NARRATIVE_ACTIONS.includes(context.action_tag) ? context.action_tag : 'search_area';
  const group = OBSERVATION_ACTION_GROUPS[actionTag] || 'scene';
  const actionBeats = OBSERVATION_AFTERMATH_BEATS[group];
  const source = localizedCase(caseData, language);
  const hiddenIds = new Set((source.hidden_clues || []).map(clue => clue?.clue_id).filter(Boolean));
  const clueDictionary = (source.clue_dictionary || [])
    .filter(clue => clue?.clue_id && !hiddenIds.has(clue.clue_id));
  const clueNames = (Array.isArray(context.public_clue_ids) ? context.public_clue_ids : [])
    .map(id => clueDictionary.find(clue => clue.clue_id === id))
    .filter(Boolean)
    .map(clue => publicLabel(clue.keyword, language === 'zh' ? '新证据' : 'new evidence', 'clue', 80));
  let outcome = NARRATIVE_OUTCOMES.includes(context.outcome) ? context.outcome : 'progress';
  if (outcome === 'clue' && clueNames.length === 0) outcome = 'progress';
  if (outcome === 'trap' && context.trap_triggered !== true) outcome = 'progress';
  const outcomeBeats = OBSERVATION_OUTCOME_BEATS[outcome] || OBSERVATION_OUTCOME_BEATS.progress;
  const profile = getCaseNarrativeProfile(source.case_id || gameState.case_id, language);
  const seed = [
    gameState.run_id,
    source.case_id || gameState.case_id,
    context.turn,
    actionTag,
    outcome,
    context.executor_agent_id,
    context.assist_agent_id,
    context.from_zone,
    context.to_zone,
    (Array.isArray(context.public_clue_ids) ? context.public_clue_ids : []).join(':'),
  ].join(':');
  const actionIndex = stableNarrativeHash(`${seed}:observation-action`) % actionBeats.length;
  const outcomeIndex = stableNarrativeHash(`${seed}:observation-outcome`) % outcomeBeats.length;
  const movementIndex = stableNarrativeHash(`${seed}:observation-movement`) % OBSERVATION_MOVEMENT_BEATS.length;
  const motifs = Array.isArray(profile.motifs) ? profile.motifs.filter(Boolean) : [];
  const motif = motifs.length
    ? motifs[stableNarrativeHash(`${seed}:observation-motif`) % motifs.length]
    : (language === 'zh' ? '案件核心疑点' : 'the central uncertainty');
  const executor = safeText(
    context.executor_agent_id,
    language === 'zh' ? '执行探员' : 'the executing agent',
    48,
  );
  const assistant = safeText(context.assist_agent_id, '', 48);
  const team = assistant
    ? (language === 'zh' ? `${executor}与${assistant}` : `${executor} and ${assistant}`)
    : executor;
  const zone = resolvePublicZoneName(source, context.to_zone || gameState.current_zone, language);
  const fromZone = resolvePublicZoneName(source, context.from_zone, language);
  const variables = {
    team,
    action: OBSERVATION_ACTION_LABELS[actionTag]?.[language] || OBSERVATION_ACTION_LABELS.search_area[language],
    zone,
    fromZone,
    clue: clueNames.join(language === 'zh' ? '」「' : '”, “') || (language === 'zh' ? '新证据' : 'new evidence'),
    motif,
    confusion: Math.max(0, Number(context.confusion_delta) || 0),
  };
  const paragraphs = [
    fill(actionBeats[actionIndex][language], variables),
    fill(outcomeBeats[outcomeIndex][language], variables),
  ];
  if (context.moved === true && context.from_zone && context.to_zone && context.from_zone !== context.to_zone) {
    paragraphs.push(fill(OBSERVATION_MOVEMENT_BEATS[movementIndex][language], variables));
  }

  return {
    actionTag,
    outcome,
    templateId: `${group}:${actionIndex}:${outcome}:${outcomeIndex}:${context.moved ? movementIndex : 'stationary'}`,
    text: paragraphs.join('\n\n'),
  };
}

/**
 * @param {{ gameState?: Record<string, any>, caseData?: Record<string, any>, lang?: string }} options
 */
export function buildPublicCaseContext({ gameState = {}, caseData = {}, lang = 'zh' } = {}) {
  const language = lang === 'en' ? 'en' : 'zh';
  const zh = language === 'zh';
  const source = localizedCase(caseData, language);
  const turn = Math.max(1, (Number(gameState.turn_count) || 0) + 1);
  const clueIds = Array.isArray(gameState.unlocked_clues) ? gameState.unlocked_clues : [];
  const hiddenClueIds = new Set((source.hidden_clues || []).map(clue => clue?.clue_id).filter(Boolean));
  const publicClueDictionary = (source.clue_dictionary || [])
    .filter(clue => clue?.clue_id && !hiddenClueIds.has(clue.clue_id));
  const clues = clueIds
    .map(id => publicClueDictionary.find(item => item.clue_id === id))
    .filter(Boolean);
  const recentClues = clues.slice(-3).map(clue => publicLabel(
    clue.keyword,
    zh ? '已保全证据' : 'secured evidence',
    'clue',
    60,
  ));
  const npcs = (source.npcs || []).slice(0, 4).map(npc => ({
    name: publicLabel(npc.name, zh ? '相关人员' : 'person of interest', 'generic', 48),
    role: publicLabel(npc.role, zh ? '身份待核' : 'role unverified', 'generic', 72),
    avatar: String(npc.avatar || '◈').slice(0, 4),
  }));
  const caseTitle = publicLabel(source.title || gameState.case_title, zh ? '未命名案件' : 'Untitled Case', 'generic', 80);
  const zoneName = resolvePublicZoneName(source, gameState.current_zone, language);
  const totalClues = Math.max(clues.length, publicClueDictionary.length);
  const castNames = npcs.map(npc => npc.name).join(zh ? '、' : ', ');
  const profile = getCaseNarrativeProfile(source.case_id || gameState.case_id, language);
  const stage = narrativeStage({ turn, clueCount: clues.length, clueTotal: totalClues });
  const zoneAtmosphere = safeText(profile.zones?.[gameState.current_zone], '', 260);
  const aftermath = turn > 1 ? renderObservationAftermath({ gameState, caseData: source, lang: language }) : null;

  const sceneReport = publicLabel(
    source.scene?.description,
    zh ? '第一批现场资料刚刚送达指挥席。' : 'The first scene report has just reached the command desk.',
    'generic',
    520,
  );
  const openingNarrative = [
    profile.prologue,
    zh ? `现场初勘：${sceneReport}` : `INITIAL SCENE REPORT: ${sceneReport}`,
    zh ? `核心谜题：${profile.question}` : `CENTRAL MYSTERY: ${profile.question}`,
  ].join('\n\n');
  const evidenceProgress = recentClues.length
    ? (zh
      ? `目前已保全 ${clues.length}/${totalClues} 条证据，最近取得「${recentClues.join('」「')}」；它们仍需通过时间、权限或物理因果互相印证。`
      : `${clues.length}/${totalClues} clues are secured, most recently “${recentClues.join('”, “')}”; they still need a shared timeline, access path, or physical cause.`)
    : (zh
      ? '目前没有证据足以支撑结论，第一份可复查的记录仍在等待调查。'
      : 'No evidence yet supports a conclusion; the first reviewable record is still waiting to be secured.');
  const progressNarrative = [
    aftermath?.text,
    profile.stages?.[stage],
    zoneAtmosphere ? `${zoneName}：${zoneAtmosphere}` : '',
    evidenceProgress,
  ].filter(Boolean).join('\n\n');
  const objective = gameState.confusion_score >= 60
    ? (zh
      ? `当前判断稳定度偏低；先复核已有证据，再继续执行本案目标：${profile.objectives?.[stage]}`
      : `Judgment stability is low. Recheck secured evidence before continuing the case objective: ${profile.objectives?.[stage]}`)
    : joinSentence(
      profile.objectives?.[stage],
      clues.length > 0
        ? (zh
          ? `以「${recentClues.at(-1) || '现有证据'}」为锚点，寻找第二个独立验证来源。`
          : `Use “${recentClues.at(-1) || 'the current evidence'}” as an anchor and find a second independent source.`)
        : '',
    );

  return {
    isOpening: turn === 1,
    turn,
    caseTitle,
    caseSubtitle: publicLabel(source.subtitle, '', 'generic', 80),
    setting: publicLabel(source.setting, '', 'generic', 220),
    sceneDescription: publicLabel(source.scene?.description, '', 'generic', 520),
    zoneId: gameState.current_zone,
    zoneName,
    npcs,
    castNames,
    clueCount: clues.length,
    clueTotal: totalClues,
    recentClues,
    stage,
    chapterLabel: chapterLabel(stage, language),
    question: profile.question,
    zoneAtmosphere,
    aftermath,
    narrative: turn === 1 ? openingNarrative : progressNarrative,
    objective,
  };
}

function selectIndex(seed, length, recentTemplateIds = []) {
  if (length <= 1) return 0;
  let index = stableNarrativeHash(seed) % length;
  const blocked = new Set((recentTemplateIds || []).slice(0, 2).map(id => String(id).split(':').at(-1)));
  let guard = 0;
  while (blocked.has(String(index)) && guard < length) {
    index = (index + 1) % length;
    guard += 1;
  }
  return index;
}

function actionPlotStage(turn) {
  const safeTurn = Math.max(1, Number(turn) || 1);
  if (safeTurn <= 2) return 'opening';
  if (safeTurn <= 5) return 'pursuit';
  if (safeTurn <= 8) return 'escalation';
  return 'convergence';
}

function fill(template, variables) {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? '');
}

export function renderNarrative(event = {}, recentTemplateIds = []) {
  const lang = event.lang === 'en' ? 'en' : 'zh';
  const actionTag = NARRATIVE_ACTIONS.includes(event.actionTag) ? event.actionTag : 'search_area';
  const outcome = NARRATIVE_OUTCOMES.includes(event.outcome) ? event.outcome : 'progress';
  const frames = OUTCOME_FRAMES[outcome]?.[lang] || OUTCOME_FRAMES.progress[lang];
  const seed = event.seed || [event.runId, event.caseId, event.turn, actionTag, outcome, event.agentId].join(':');
  const actionBeatIndex = stableNarrativeHash(`${seed}:scene`) % NARRATIVE_ACTION_BEATS[actionTag].length;
  const frameIndex = selectIndex(seed, frames.length, recentTemplateIds);
  const plotStage = actionPlotStage(event.turn);
  const plotBeats = NARRATIVE_PLOT_BEATS[plotStage];
  const plotBeatIndex = stableNarrativeHash(`${seed}:plot`) % plotBeats.length;
  const verbs = ACTION_COPY[actionTag]?.[lang] || ACTION_COPY.search_area[lang];
  const verb = verbs[stableNarrativeHash(`${seed}:verb`) % verbs.length];
  const variables = {
    agent: safeText(event.agentName || event.agentId, lang === 'zh' ? '执行探员' : 'the executing agent', 48),
    zone: publicLabel(event.zoneName || event.zoneId, lang === 'zh' ? '当前区域' : 'the current zone', 'zone', 80),
    clue: publicLabel(event.clueName || event.clueIds?.[0], lang === 'zh' ? '新证据' : 'new evidence', 'clue', 80),
    verb,
  };
  const actionBeat = outcome === 'illegal'
    ? ''
    : fill(NARRATIVE_ACTION_BEATS[actionTag][actionBeatIndex][lang], variables);
  const plotBeat = outcome === 'illegal' ? '' : fill(plotBeats[plotBeatIndex][lang], variables);
  const baseText = fill(frames[frameIndex], variables);
  let caseEcho = '';
  if (event.caseId && outcome !== 'illegal') {
    const profile = getCaseNarrativeProfile(event.caseId, lang);
    const motifs = Array.isArray(profile.motifs) ? profile.motifs.filter(Boolean) : [];
    const echoes = CASE_OUTCOME_ECHOES[outcome]?.[lang] || [];
    if (motifs.length && echoes.length) {
      const motif = motifs[stableNarrativeHash(`${seed}:motif`) % motifs.length];
      const echo = echoes[stableNarrativeHash(`${seed}:echo`) % echoes.length];
      caseEcho = fill(echo, { motif, question: profile.question });
    }
  }
  return {
    messageKey: `${event.caseId || 'generic'}.${actionTag}.${outcome}.${actionBeatIndex}.${plotStage}.${plotBeatIndex}.${frameIndex}`,
    templateId: `${actionTag}:${outcome}:${actionBeatIndex}:${plotStage}:${plotBeatIndex}:${frameIndex}`,
    tone: OUTCOME_FRAMES[outcome]?.tone || 'info',
    text: joinSentence(actionBeat, plotBeat, baseText, caseEcho),
  };
}

export function buildLocalThought({ gameState, caseData, agentStrategy, observation, lang = 'zh' }) {
  const language = lang === 'en' ? 'en' : 'zh';
  const context = buildPublicCaseContext({ gameState, caseData, lang: language });
  const agent = (agentStrategy?.team || []).find(item => item.agent_id === agentStrategy?.primary_agent_id)
    || agentStrategy?.team?.[0]
    || agentStrategy
    || {};
  const agentName = safeText(agent.agent_id, language === 'zh' ? '主探员' : 'the primary agent', 48);
  const profile = getCaseNarrativeProfile(caseData?.case_id, language);
  if (context.isOpening) {
    return language === 'zh'
      ? `${context.caseTitle}的第一条判断必须从现场而不是猜测开始。真正的问题是：${profile.question}${agentName}将先复核${context.zoneName}的异常痕迹，再把${context.castNames || '相关人员'}的公开说法放入同一条时间轴；本轮只争取一条能够被独立证据再次验证的调查起点。`
      : `The first judgment in ${context.caseTitle} must begin with the scene, not a guess. The real question is this: ${profile.question} ${agentName} will verify the anomalies in ${context.zoneName}, place the public accounts of ${context.castNames || 'the people of interest'} on one timeline, and secure one lead that independent evidence can test.`;
  }
  const seed = [gameState?.run_id, caseData?.case_id, gameState?.turn_count, agent.agent_id, language, observation].join(':');
  const frames = THOUGHT_FRAMES[language];
  const frame = frames[stableNarrativeHash(seed) % frames.length];
  const thought = fill(frame, {
    agent: agentName,
    zone: context.zoneName,
    count: Math.max(0, gameState?.unlocked_clues?.length || 0),
    confusion: Math.max(0, Number(gameState?.confusion_score) || 0),
  });
  const motifs = Array.isArray(profile.motifs) ? profile.motifs.filter(Boolean) : [];
  const motif = motifs.length ? motifs[stableNarrativeHash(`${seed}:motif`) % motifs.length] : '';
  const reflection = motif
    ? (language === 'zh'
      ? `本案的叙事仍围绕${motif}展开；它可能是因果的一部分，也可能只是精心安排的视线诱饵。`
      : `The case still turns around ${motif}; it may belong to the cause, or it may be a carefully placed distraction.`)
    : '';
  return joinSentence(thought, reflection);
}

const FALLBACK_ACTIONS = Object.freeze(['search_area', 'examine_clue', 'check_cctv']);

export function buildOfflineDecisionPacks({ team = [], turn = 0, caseId = '', lang = 'zh' }) {
  const language = lang === 'en' ? 'en' : 'zh';
  const styles = ['steady', 'aggressive', 'deceptive'];
  const risks = ['low', 'medium', 'medium'];
  const packs = {};
  (team || []).slice(0, 3).forEach((agent, agentIndex) => {
    const cards = FALLBACK_ACTIONS.map((baseAction, index) => {
      const actionTag = FALLBACK_ACTIONS[(index + agentIndex) % FALLBACK_ACTIONS.length];
      const focus = getActionFocus(actionTag)[0];
      return {
        optionId: `offline:${caseId}:${turn}:${agent.agent_id}:${actionTag}`,
        action_tag: actionTag,
        style: styles[index],
        risk_level: risks[index],
        label: language === 'zh' ? ['区域复查', '证物检验', '监控校验'][index] : ['RECHECK ZONE', 'EXAMINE EVIDENCE', 'VERIFY CCTV'][index],
        benefit_desc: language === 'zh' ? '离线安全行动，可继续普通调查。' : 'Safe offline action; ordinary investigation can continue.',
        risk_desc: language === 'zh' ? '战术数据离线，无法显示事实贴近度。' : 'Tactical data is offline; alignment is unavailable.',
        estimatedAlignment: null,
        confidence: 'offline',
        focusAttribute: focus,
        source: 'offline',
      };
    });
    const expertise = agentExpertise(agent, cards[0].action_tag);
    packs[agent.agent_id] = { expertise, confidence: confidenceFromExpertise(expertise), cards, source: 'offline' };
  });
  return { packs, source: 'offline' };
}

export function buildLocalSummary({ unlockedClues = [], lang = 'zh' }) {
  const language = lang === 'en' ? 'en' : 'zh';
  const names = unlockedClues.slice(-3).map(item => safeText(item?.keyword || item, '', 48)).filter(Boolean);
  if (!names.length) return language === 'zh' ? '尚无已公开证据，先完成一次现场观察。' : 'No public evidence yet; complete a scene observation first.';
  return language === 'zh'
    ? `现有证据包括「${names.join('」「')}」，下一步应验证它们是否共享时间、权限或物理因果。`
    : `Current evidence includes “${names.join('”, “')}”; next verify whether they share time, access, or physical causality.`;
}
