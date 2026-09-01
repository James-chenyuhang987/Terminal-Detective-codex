// Public, spoiler-safe story language for each case. This module is bundled
// into the browser, so it must never contain culprit identities, actual option
// alignment, hidden clue text, report answers, or server-only branch outcomes.

const GENERIC_PROFILE = Object.freeze({
  prologue: 'The scene is sealed, the witnesses are waiting, and the first reliable account has yet to be written.',
  question: 'Which detail will survive when every statement is placed on the same timeline?',
  stages: {
    opening: 'The first reading of the scene offers atmosphere, not proof.',
    pursuit: 'Fragments are beginning to form a pattern, but the missing links still matter more than any guess.',
    convergence: 'The evidence is drawing closer together; one careful verification could separate truth from a persuasive lie.',
  },
  objectives: {
    opening: 'Preserve the scene, establish the public timeline, and secure one independently verifiable lead.',
    pursuit: 'Test the newest evidence against a separate record, witness, or physical trace.',
    convergence: 'Close the remaining gap without mistaking a coherent story for a proven one.',
  },
  zones: {},
  motifs: ['the sealed scene', 'the unfinished timeline', 'the waiting testimony', 'the evidence still in shadow'],
});

export const CASE_NARRATIVE_LIBRARY = Object.freeze({
  Lvl_01: {
    zh: {
      prologue: '夜雨把整座城市的霓虹揉碎在玻璃幕墙上。四十七层之上，Victor Zhao 的数据帝国仍在运转，唯独它的主人永远沉默了。',
      question: '在一间记录了所有访问、却没能记录死亡真相的房间里，谁的时间线最先出现裂缝？',
      stages: {
        opening: '死者颈侧的电磁灼痕、散落的芯片与三份来访记录彼此靠得很近，却还没有组成同一个故事。',
        pursuit: '权限、伤痕与口供开始互相摩擦；每一条看似清楚的记录背后，都可能藏着被复制、删改或刻意错开的几分钟。',
        convergence: '雨夜中的碎片正在收束成一条更窄的路径，但最后的指控必须同时经得起物理痕迹、门禁记录与人物动机的检验。',
      },
      objectives: {
        opening: '先固定 EMP 痕迹与房间访问顺序，再分别记录三名来访者的公开说法。',
        pursuit: '把最新证物与门禁、监控或人物时间线交叉验证，找出无法同时成立的两种说法。',
        convergence: '重建案发前后一小时，确认手段、进入方式与离开路线能否由同一组证据解释。',
      },
      zones: {
        zone_datacenter: '服务器的冷光仍照着未完成的工作，电磁灼痕却让房间像被雷声从内部劈开。',
        zone_lobby: '大堂的监控墙一遍遍播放安静走廊，越是整齐的画面，越显得缺失的时间刺眼。',
        zone_lab: '私人实验室里每台设备都要求权限，空气中却残留着不属于日常实验的紧张。',
        zone_balcony: '天台的雨水冲淡了脚步，却冲不走高处唯一可能留下的方向感。',
      },
      motifs: ['玻璃外永不停息的霓虹雨', '死者颈侧沉默的电磁灼痕', '案发前一小时重叠的访问记录', '仍在自行运转的数据帝国'],
    },
    en: {
      prologue: 'Rain breaks the city neon into shards across the penthouse glass. Forty-seven floors above the street, Victor Zhao’s data empire keeps running; only its owner has gone silent.',
      question: 'In a room that recorded every visitor but failed to record the truth of a death, whose timeline will fracture first?',
      stages: {
        opening: 'The burns at Victor’s neural port, the scattered chips, and three visitor records stand close together without yet becoming one story.',
        pursuit: 'Access, injury, and testimony begin to grind against one another; behind every clean record may sit a copied credential, an edit, or a few deliberately displaced minutes.',
        convergence: 'The rain-soaked fragments are narrowing into a path, but any accusation must survive physical traces, access history, and human motive at once.',
      },
      objectives: {
        opening: 'Secure the EMP traces and room-access order, then record each visitor’s public account separately.',
        pursuit: 'Cross-check the newest exhibit against access, surveillance, or a personal timeline and find the claims that cannot coexist.',
        convergence: 'Rebuild the hour around the death and test whether method, entry, and escape can be explained by the same evidence chain.',
      },
      zones: {
        zone_datacenter: 'Server light washes over unfinished work while the electromagnetic scars make the room feel split by thunder from within.',
        zone_lobby: 'The surveillance wall repeats quiet corridors; the cleaner the footage looks, the louder its missing minutes become.',
        zone_lab: 'Every device in the private laboratory demands authorization, yet the air carries a tension no routine experiment explains.',
        zone_balcony: 'Rain has thinned the footprints on the roof, but it cannot erase the sense of direction left by the height.',
      },
      motifs: ['the sleepless neon rain beyond the glass', 'the silent burn at the victim’s neural port', 'the overlapping visitor records before the death', 'the data empire still running without its owner'],
    },
  },
  Lvl_02: {
    zh: {
      prologue: '量子研究所的走廊亮得没有一丝阴影，封闭实验室却像从现实中被挖走了一块。Aria Chen 的工牌仍在门边摇晃，人却没有留下。',
      question: '当门从内部反锁、摄像头同时失明，一个人究竟是被带走、遭遇事故，还是主动走进了记录之外？',
      stages: {
        opening: '烧毁的芯片、空荡的实验台与同时中断的监控构成了一个过分整齐的谜面。',
        pursuit: '被删除的记录开始与研究所的公开秩序发生冲突；失踪者留下的空白，正迫使每个人解释自己没有说出的部分。',
        convergence: '封闭房间的悖论正在松动。真正重要的已不只是 Aria 如何消失，而是谁希望调查只盯着那扇锁死的门。',
      },
      objectives: {
        opening: '确认实验室是否真的不存在第二条通路，并保存芯片、工牌和监控中断的原始时间。',
        pursuit: '将研究权限、删除记录与人员动线对齐，区分真实事故与刻意布置的表象。',
        convergence: '解释密室、失踪路径和数据删除之间的因果，同时保留非谋杀结论的可能性。',
      },
      zones: {
        zone_lab_core: '量子核心仍发出低沉嗡鸣，空着的工作位比任何警报都更像一个问题。',
        zone_server: '服务器间的蓝色指示灯整齐闪烁，只有被删掉的日志拒绝服从这种秩序。',
        zone_lounge: '休息区留下杯沿、便签和未说完的日常，仿佛有人曾在这里为离开做准备。',
        zone_roof_exit: '紧急通道尽头只有风和城市天际线，任何经过这里的人都必须在传感器上留下重量。',
      },
      motifs: ['那扇从内部锁死的防火门', '门边仍轻轻晃动的工牌', '同一秒陷入黑暗的外部摄像头', '被烧毁却没有完全消失的数据'],
    },
    en: {
      prologue: 'The institute corridors are lit so evenly that they cast no shadow, yet the sealed laboratory feels as if a piece of reality has been removed. Aria Chen’s badge still moves beside the door; Aria does not.',
      question: 'With the door locked from inside and every camera blinded at once, was she taken, lost to an accident, or did she step deliberately beyond the record?',
      stages: {
        opening: 'Burned chips, an empty workstation, and synchronized camera failure form a mystery that looks almost too orderly.',
        pursuit: 'Deleted records begin to conflict with the institute’s public order; Aria’s absence forces every witness to explain what they chose not to say.',
        convergence: 'The locked-room paradox is loosening. The question is no longer only how Aria vanished, but who benefits if the investigation never looks beyond the sealed door.',
      },
      objectives: {
        opening: 'Test whether the laboratory truly has no second route and preserve the original timing of the chips, badge, and camera failure.',
        pursuit: 'Align research access, deleted records, and movement history to separate an accident from a constructed appearance.',
        convergence: 'Explain the sealed room, the path of disappearance, and the data deletion while keeping non-homicide conclusions in play.',
      },
      zones: {
        zone_lab_core: 'The quantum core keeps its low hum; the empty workstation feels more accusatory than any alarm.',
        zone_server: 'Blue indicators blink in perfect order while one deleted log refuses to belong to that order.',
        zone_lounge: 'A cup rim, a note, and an unfinished routine remain, as though someone once prepared to leave from here.',
        zone_roof_exit: 'Only wind and skyline wait beyond the emergency shaft, but anyone passing through must still leave weight behind.',
      },
      motifs: ['the fire door locked from within', 'the badge still moving beside the entrance', 'the cameras that went dark in the same second', 'the burned data that did not vanish completely'],
    },
  },
  Lvl_03: {
    zh: {
      prologue: '地下九区的音乐从不真正停止，只会在警灯亮起时换成更低的频率。Riku Tanaka 仍坐在三号沉浸舱里，像一个来不及醒来的梦。',
      question: '一套本应保护玩家的安全锁为何失效，而俱乐部里谁最清楚如何让一次谋杀看起来像自愿过载？',
      stages: {
        opening: '酒精、机油与神经接口的余热混在一起；每个人都说这只是事故，却没有人愿意解释安全锁。',
        pursuit: '后台权限、吧台流言与死者最后的联络逐渐靠拢，俱乐部光鲜的娱乐表面开始露出交易留下的刮痕。',
        convergence: '蝶巢仍在门外轰鸣，但调查已经安静下来：只剩谁能接近设备、谁有理由篡改它，以及谁在时间线上撒了谎。',
      },
      objectives: {
        opening: '保存三号舱的过载参数，确认安全锁被绕过的方式，并分开记录三名相关人员的时间线。',
        pursuit: '把后台访问、死者通信与俱乐部货物流向进行交叉核验，寻找共同控制点。',
        convergence: '证明过载不是普通故障，并用设备权限、行动机会和证词矛盾闭合证据链。',
      },
      zones: {
        zone_booth3: '三号舱的舱盖映着红蝶灯牌，脑波曲线停在一个不该由安全系统允许的峰值。',
        zone_bar: '吧台擦得过分干净，杯中余味与众人的说法却远没有那么整齐。',
        zone_backroom: '后台控制室藏在音乐墙后，所有欢乐都曾在这里被权限、脚本和价格重新编排。',
        zone_alley: '后巷的收货门吞吐着俱乐部不愿登记的东西，潮湿地面保存着短暂而诚实的痕迹。',
      },
      motifs: ['三号舱内凝固的脑波峰值', '红蝶灯牌下永不停止的低音', '被绕过的神经安全锁', '吧台与后台之间不愿登记的往来'],
    },
    en: {
      prologue: 'Music in Underground Nine never truly stops; when police lights rise, it merely drops to a lower frequency. Riku Tanaka remains seated in Pod 3 like a dream that failed to wake.',
      question: 'Why did a safety lock designed to protect its user fail, and who inside the club knew how to make murder resemble a voluntary overload?',
      stages: {
        opening: 'Alcohol, machine oil, and heat from the neural port share the air. Everyone calls it an accident; no one wants to explain the safety lock.',
        pursuit: 'Backroom access, barroom rumor, and the victim’s last contacts draw closer as the club’s polished entertainment surface reveals the scratches of hidden commerce.',
        convergence: 'The Nest still pounds beyond the cordon, but the case has grown quiet: access to the device, reason to alter it, and a lie in the timeline.',
      },
      objectives: {
        opening: 'Preserve Pod 3’s overload parameters, establish how the safety lock was bypassed, and record each person’s timeline separately.',
        pursuit: 'Cross-check backroom access, the victim’s communications, and the club’s supply trail for a shared point of control.',
        convergence: 'Prove the overload was not an ordinary failure and close the chain with access, opportunity, and testimony conflict.',
      },
      zones: {
        zone_booth3: 'The Red Butterfly sign reflects on Pod 3 while its brainwave trace rests at a peak the safety system should never allow.',
        zone_bar: 'The bar has been wiped too clean; the residue in its glasses and the accounts around it are far less orderly.',
        zone_backroom: 'Behind the wall of music, permissions, scripts, and prices rearranged every pleasure sold by the club.',
        zone_alley: 'The receiving door swallowed what the club refused to register, while the wet pavement kept brief, honest traces.',
      },
      motifs: ['the frozen brainwave peak inside Pod 3', 'the bass that never stops beneath the butterfly sign', 'the neural safety lock someone bypassed', 'the unregistered traffic between bar and backroom'],
    },
  },
  Lvl_04: {
    zh: {
      prologue: '暴风雪把极地档案站从世界地图上暂时抹去。零下六十度的冷库里，Dr. Noor 的睫毛结着霜，而系统仍平静地报告：整夜正常。',
      question: '在没有人强行开门的密室里，谁偷走了十一分钟，又让寒冷替自己作证？',
      stages: {
        opening: '不自然的霜裂纹与完美温控记录正面冲突，像两名证人在同一间冷库里说着不同的天气。',
        pursuit: '维护路径、管理员权限与清晨审计之间出现了隐约联系；风雪封锁出口，也让每个人的行动范围更容易被证明。',
        convergence: '冷库的沉默不再空白。缺失日志、机械痕迹与人员位置正在逼近同一个可重建的十一分钟。',
      },
      objectives: {
        opening: '检验霜裂纹的形成方式，保存温控原始缓存，并确认冷库顶部是否存在远程作用路径。',
        pursuit: '将管理员令牌、维护设备和人员位置放进同一时间轴，排除被风雪夸大的假设。',
        convergence: '完整重建缺失的十一分钟，证明致死方式、远程路径与日志覆盖之间的因果。',
      },
      zones: {
        zone_cryo_chamber: '冷库像一口结冰的钟，所有声音都停在 Noor 防寒服上不自然的裂纹里。',
        zone_control_room: '环境控制室暖得令人不安，屏幕上的平稳曲线像有人刻意练习过的谎言。',
        zone_maintenance: '维护隧道狭窄而结霜，机械经过留下的每一道磨痕都比口供更耐寒。',
        zone_archive_lab: '气候档案实验室保存着几十年的风暴，却可能解释不了昨夜短短十一分钟。',
      },
      motifs: ['封死整座站点的白色风暴', '防寒服上不自然的霜裂纹', '温控系统缺失的十一分钟', '声称整夜正常的平滑曲线'],
    },
    en: {
      prologue: 'The blizzard has temporarily erased the polar archive from the world map. In a vault at sixty below, frost clings to Dr. Noor’s lashes while the system calmly reports a normal night.',
      question: 'Inside a room no one forced open, who stole eleven minutes and taught the cold to testify in their place?',
      stages: {
        opening: 'The unnatural fractures and the perfect climate log contradict one another like two witnesses describing different weather inside the same vault.',
        pursuit: 'Maintenance paths, administrator access, and a dawn audit begin to touch; the storm seals every exit and makes each person’s location easier to prove.',
        convergence: 'The vault’s silence is no longer empty. Missing logs, tool traces, and human positions are closing on eleven minutes that can be rebuilt.',
      },
      objectives: {
        opening: 'Determine how the frost fractures formed, preserve the original climate cache, and test for a remote path through the ceiling service system.',
        pursuit: 'Place administrator credentials, maintenance machinery, and personnel locations on one timeline without letting the storm magnify weak assumptions.',
        convergence: 'Reconstruct the missing eleven minutes and prove the causal link between method, remote route, and overwritten climate data.',
      },
      zones: {
        zone_cryo_chamber: 'The vault feels like a frozen bell, every sound caught in the unnatural fractures across Noor’s thermal suit.',
        zone_control_room: 'Environmental Control is disturbingly warm; its smooth graphs look like a lie practiced in advance.',
        zone_maintenance: 'The service tunnel is narrow and rimed with frost, and every machine mark survives the cold better than testimony.',
        zone_archive_lab: 'The climate archive remembers decades of storms but may fail to explain eleven minutes from last night.',
      },
      motifs: ['the white storm sealing the station', 'the unnatural fractures across the thermal suit', 'the eleven minutes missing from climate control', 'the smooth graph insisting the night was normal'],
    },
  },
  Lvl_05: {
    zh: {
      prologue: '天穹一号穿过雷暴层，城市灯火在脚下缩成一片遥远星海。Captain Jonah Vale 死在一只从外部锁住的救生舱里，同一分钟，一只没有名字的货柜从轨道上消失。',
      question: '一条被抹除的货运航线与一具真空中的尸体，究竟共享哪一道权限？',
      stages: {
        opening: '泄压、外锁与消失货柜同时发生，让这起死亡从一开始就带着精确调度过的痕迹。',
        pursuit: '港务命令、缆索控制与零重力货仓的记录逐渐重叠；在轨道上，哪怕十八秒的影像循环也会让星星露出破绽。',
        convergence: '救生舱与货运链已不再是两起事件。剩下的问题是，谁能同时让报警沉默、命令生效并改变货物的去向。',
      },
      objectives: {
        opening: '固定救生舱阀门与舱门状态，确认货柜消失的精确时间，并保存原始港务指令。',
        pursuit: '比对主控权限、航单和观测影像，找出死亡与货柜转移的共同时间窗口。',
        convergence: '用诊断访问、货运路径和人员不在场证明闭合两起事件，避免把执行者与控制者混为一谈。',
      },
      zones: {
        zone_docking_hub: '救生舱外壳覆着薄霜，舷窗后只剩真空与一场来不及发出的警报。',
        zone_tether_control: '缆索控制中心把数千公里的张力压缩成几条曲线，一道越权命令足以改变整座天穹。',
        zone_cargo_vault: '零重力货仓里，系缆轻轻漂浮，空出的泊位像被人从账本上连同质量一起剪走。',
        zone_observation_ring: '观测环外星野缓慢移动，只有伪造影像会忘记宇宙从不重复同一帧。',
      },
      motifs: ['雷暴层上方无声运行的轨道电梯', '从外部锁死的真空救生舱', '与死亡同时消失的无名货柜', '不会重复同一帧的星野视差'],
    },
    en: {
      prologue: 'Skyhook One climbs above the storm layer until the city becomes a distant field of stars. Captain Jonah Vale is dead in a lifeboat locked from outside; in the same minute, an unnamed container vanishes from orbit.',
      question: 'What single authority could connect an erased cargo route to a body left in vacuum?',
      stages: {
        opening: 'Depressurization, an external lock, and the missing container occur together with the precision of a scheduled operation.',
        pursuit: 'Port orders, tether control, and zero-gravity cargo records begin to overlap; in orbit, even an eighteen-second loop makes the stars expose a lie.',
        convergence: 'The lifeboat and the cargo chain are no longer separate events. What remains is who could silence alarms, authorize commands, and redirect mass at once.',
      },
      objectives: {
        opening: 'Preserve the valve and hatch state, fix the exact minute of the container’s disappearance, and secure the original port order.',
        pursuit: 'Compare master access, manifests, and observation footage to isolate the window shared by the death and cargo transfer.',
        convergence: 'Close both events with diagnostic access, cargo path, and alibis without confusing an operator with the person in control.',
      },
      zones: {
        zone_docking_hub: 'Frost films the lifeboat hull; beyond its window remain only vacuum and an alarm that never arrived.',
        zone_tether_control: 'Tether Control compresses thousands of kilometers of strain into a few curves, where one privileged order can move the whole skyhook.',
        zone_cargo_vault: 'Tethers drift in zero gravity, and the empty berth looks cut from the ledger together with its mass.',
        zone_observation_ring: 'The starfield moves beyond the ring; only forged footage forgets that the universe never repeats a frame.',
      },
      motifs: ['the orbital elevator moving silently above the storm', 'the vacuum lifeboat locked from outside', 'the nameless container lost in the same minute', 'the stellar parallax no loop can imitate'],
    },
  },
  Lvl_06: {
    zh: {
      prologue: '午夜过后，棱镜博物馆像一艘关闭航道的发光方舟悬在旧城上空。Mara Ilyan 倒在密封展柜旁，真正的「雨中记忆」已经离开了它被所有系统注视的位置。',
      question: '如果展柜从未开启，真品如何消失；如果拍卖始终匿名，又是谁提前知道它会属于谁？',
      stages: {
        opening: '银色纳米纤维、死去的鉴定师与一件完美赝品，把谋杀和盗窃缝进了同一件展品。',
        pursuit: '修复记录、匿名竞价与空运物流开始交叉，艺术品的真伪不再只是审美问题，而是一条可以杀人的供应链。',
        convergence: '博物馆的灯仍把赝品照得无懈可击，证据却正把真品的去向、展柜的机关与死者最后的发现拉到一起。',
      },
      objectives: {
        opening: '检验展柜、手套与纳米纤维，确认调包和死亡是否发生在同一维护窗口。',
        pursuit: '把修复权限、竞价身份与运输路径交叉核验，追踪真品离开展厅后的每一次转手。',
        convergence: '证明赝品如何替换真品，并让机械手段、物流记录和涉案人员机会形成完整闭环。',
      },
      zones: {
        zone_auction_floor: '午夜展厅的玻璃折射出无数个赝品轮廓，死者倒下的位置却只有一个。',
        zone_restoration_lab: '修复室闻起来像溶剂与旧木料，任何足够高明的复制都必须在这里留下工序。',
        zone_auction_mesh: '匿名竞价网络只显示数字和代号，但欲望总会在付款、权限与时间里留下姓名。',
        zone_loading_spire: '装卸塔悬在城市风里，每一件离馆藏品都必须经过重量、航线与签名三道门。',
      },
      motifs: ['悬在旧城上空的棱镜博物馆', '坚持从未开启的密封展柜', '手套内侧闪烁的银色纳米纤维', '在灯光下近乎完美的赝品'],
    },
    en: {
      prologue: 'After midnight, the Prism Museum hangs above the old city like a luminous ark with its flight lanes sealed. Mara Ilyan lies beside a locked display, while the real Memory in Rain has left the one place watched by every system.',
      question: 'If the case never opened, how did the original vanish; if the auction stayed anonymous, who knew where it would go?',
      stages: {
        opening: 'Silver nanofibers, a dead appraiser, and a perfect forgery stitch theft and murder into the same exhibit.',
        pursuit: 'Restoration records, anonymous bids, and aerial logistics begin to cross; authenticity is no longer an aesthetic question but a supply chain capable of killing.',
        convergence: 'Museum light still makes the forgery look flawless, while evidence draws the original’s route, the display mechanism, and Mara’s last discovery together.',
      },
      objectives: {
        opening: 'Examine the display, gloves, and nanofibers and determine whether the swap and death share one maintenance window.',
        pursuit: 'Cross-check restoration access, bidding identities, and transport paths to follow every handoff after the original left the gallery.',
        convergence: 'Prove how the forgery replaced the original and close the chain among mechanism, logistics, and opportunity.',
      },
      zones: {
        zone_auction_floor: 'Gallery glass reflects a hundred versions of the forgery; there is only one place where the appraiser fell.',
        zone_restoration_lab: 'The lab smells of solvent and old wood, and even a masterful copy must leave a process behind.',
        zone_auction_mesh: 'The auction mesh displays only numbers and aliases, but desire leaves names in payment, privilege, and time.',
        zone_loading_spire: 'The loading spire hangs in city wind; every departing artifact must pass weight, route, and signature.',
      },
      motifs: ['the Prism Museum suspended above the old city', 'the sealed display insisting it never opened', 'the silver nanofibers inside the gloves', 'the almost perfect forgery beneath museum light'],
    },
  },
  Lvl_07: {
    zh: {
      prologue: '海面之下十一公里，研究站的金属骨架被洋流压得低声呻吟。Oren Pike 死在锁闭潜水钟里，他的求救声却仍从黑暗海沟中一遍遍传回。',
      question: '当死者的声音成为掩护，谁在声呐盲区里移动，又是谁从岸上改变了潜水钟的压力？',
      stages: {
        opening: '密闭舱、远程增压与重复求救声组成了一场不可能事故，海沟外联记录则留下另一道正在远去的尾迹。',
        pursuit: '声呐、采样记录与潜水医学数据开始互相校准；深海的黑暗可以藏住船，却藏不住压力和时间。',
        convergence: '求救声的循环正在失去迷惑力。剩下的证据必须说明谁控制压力、谁掩护离站，以及 Oren 为何来不及公开他的发现。',
      },
      objectives: {
        opening: '确认潜水钟的远程增压路径，保存原始求救声，并锁定未登记采样艇的离站时间。',
        pursuit: '比对声呐循环、站内权限与人员位置，分开验证事故掩护和离站行动。',
        convergence: '让压力指令、外联记录与公开证词在同一时间线上闭合，确认谁拥有完整控制链。',
      },
      zones: {
        zone_moon_pool: '月池水面像一块颤动的黑玻璃，潜水钟悬在其下，舱壁保存着压力留下的证词。',
        zone_sonar_array: '声呐阵列把黑暗变成回波，而重复得过于完美的求救声反而暴露了剪辑。',
        zone_bio_lab: '生物实验室的培养光柔和明亮，与窗外足以压碎钢铁的海水形成残酷对照。',
        zone_trench_link: '海沟外联闸通向没有路标的深渊，任何离站艇都只能靠信标和账目证明自己来过。',
      },
      motifs: ['压得研究站低声呻吟的深海洋流', '锁闭潜水钟内残留的异常压力', '在黑暗中循环播放的死者求救声', '声呐盲区里逐渐远去的采样艇'],
    },
    en: {
      prologue: 'Eleven kilometers below the surface, currents make the station’s metal skeleton groan. Oren Pike is dead inside a locked diving bell, yet his distress call keeps returning from the dark trench.',
      question: 'When a dead man’s voice becomes cover, who moved through the sonar blind spot, and who changed the bell pressure from inside the station?',
      stages: {
        opening: 'A sealed chamber, remote overpressure, and a repeating distress call form an impossible accident while the uplink log preserves another wake moving away.',
        pursuit: 'Sonar, sampling records, and dive medicine begin to calibrate one another; darkness can hide a vessel, but not pressure and time.',
        convergence: 'The looped distress call is losing its power to mislead. The remaining evidence must explain pressure control, departure cover, and what Oren could not disclose.',
      },
      objectives: {
        opening: 'Trace the remote pressure path, preserve the original distress signal, and fix the departure time of the unregistered sampler.',
        pursuit: 'Compare sonar loops, station access, and personnel locations, testing the accident cover separately from the departure.',
        convergence: 'Close pressure commands, uplink records, and public accounts on one timeline and identify the complete control chain.',
      },
      zones: {
        zone_moon_pool: 'The moon pool trembles like black glass; beneath it, the bell walls preserve the testimony of pressure.',
        zone_sonar_array: 'Sonar turns darkness into echoes, and a distress call repeating too perfectly reveals the edit.',
        zone_bio_lab: 'Soft culture light fills the biology lab, a cruel contrast to the ocean capable of crushing steel beyond the window.',
        zone_trench_link: 'The trench lock opens onto an abyss without road signs, where a departing vessel can be proved only by beacon and ledger.',
      },
      motifs: ['the deep current making the station groan', 'the abnormal pressure trapped inside the locked bell', 'the dead engineer’s distress call looping in darkness', 'the sampler fading through the sonar blind spot'],
    },
  },
  Lvl_08: {
    zh: {
      prologue: '白塔俯视着一座相信算法胜过证词的城市。Amara Saye 死在透明听证舱里，而城市预测核心给出的第一句话不是哀悼，而是：这场死亡不可能发生。',
      question: '如果系统删除了受害者所有可能遇险的未来，是因为它没有看见谋杀，还是有人先教会它遗忘？',
      stages: {
        opening: '正常的空气记录、被删除的风险路径与三分钟后自动获批的秘密试验，构成了一份比尸检更冷漠的时间表。',
        pursuit: '预测权限、环境系统与公民记忆逐渐交叉；每一条被算法判定为低风险的人命，都在要求调查重新定义“正常”。',
        convergence: '白塔的模型仍在计算无事发生的城市，证据却开始恢复被删除的因果。最后的报告必须证明的不只是死亡方式，还有系统为何拒绝看见它。',
      },
      objectives: {
        opening: '检验听证舱空气与独立报警，保存风险路径删除时间，并确认秘密试验的自动批准链。',
        pursuit: '交叉核对议会权限、环境指令和记忆档案，找出谁能同时改变现实记录与系统预测。',
        convergence: '恢复死亡前后的完整因果链，让物理证据、权限签名和被删除的风险路径相互证明。',
      },
      zones: {
        zone_summit_court: '透明听证舱让整座城市都能看见里面，却没有让任何人看见空气发生了什么。',
        zone_oracle_core: '预测核心把千万种未来投在墙上，唯独没有一条承认 Amara 会死。',
        zone_transit_nexus: '交通中枢记录每一枚徽章与每一部电梯，复制的身份也必须留下两次经过。',
        zone_memory_vault: '公民记忆库保存被城市遗忘的人，离线晶片在这里比官方模型更接近证词。',
      },
      motifs: ['俯视自治城的纯白高塔', '透明听证舱中无法触发的空气警报', '被预测核心删除的所有危险未来', '三分钟后自动获批的秘密试验'],
    },
    en: {
      prologue: 'The White Tower watches a city that trusts algorithms more than testimony. Amara Saye is dead in a transparent hearing chamber, and the prediction core’s first response is not grief but denial: this death could not occur.',
      question: 'If the system deleted every future in which the victim was at risk, did it fail to see murder, or did someone first teach it to forget?',
      stages: {
        opening: 'Normal air records, deleted risk paths, and a secret trial approved three minutes later form a timetable colder than any autopsy.',
        pursuit: 'Prediction access, environmental control, and civic memory begin to cross; every life classified as low risk forces the case to redefine “normal.”',
        convergence: 'The Tower model keeps calculating a city where nothing happened while evidence restores deleted causality. The final report must prove not only how Amara died, but why the system refused to see it.',
      },
      objectives: {
        opening: 'Test chamber air and independent alarms, preserve the risk-deletion time, and map the approval chain for the secret trial.',
        pursuit: 'Cross-check council privilege, environment orders, and memory records to find who could alter both reality’s record and the system’s prediction.',
        convergence: 'Restore the full causal chain around the death so physical evidence, authorization signatures, and deleted risk paths prove one another.',
      },
      zones: {
        zone_summit_court: 'The transparent chamber lets the whole city see inside without letting anyone see what happened to its air.',
        zone_oracle_core: 'Millions of futures cover the walls of the prediction core, except the single future in which Amara dies.',
        zone_transit_nexus: 'The transit nexus records every badge and elevator; even a copied identity must pass twice.',
        zone_memory_vault: 'The archive preserves people the city forgets, and an offline shard may stand closer to testimony than the official model.',
      },
      motifs: ['the white tower watching the autonomous city', 'the transparent chamber whose air alarm stayed silent', 'every dangerous future deleted from the prediction core', 'the secret trial approved three minutes later'],
    },
  },
});

export const CASE_NARRATIVE_IDS = Object.freeze(Object.keys(CASE_NARRATIVE_LIBRARY));

export function getCaseNarrativeProfile(caseId, lang = 'zh') {
  const language = lang === 'en' ? 'en' : 'zh';
  const profile = CASE_NARRATIVE_LIBRARY[caseId]?.[language];
  if (profile) return profile;
  if (language === 'en') return GENERIC_PROFILE;
  return {
    prologue: '现场已经封锁，证人正在等待，而第一份可靠的叙述尚未写下。',
    question: '当所有说法被放进同一条时间线，哪一个细节最终能够留下？',
    stages: {
      opening: '第一次现场判断只能提供气氛，不能代替证据。',
      pursuit: '碎片正在形成轮廓，但缺失的连接仍比任何猜测重要。',
      convergence: '证据逐渐靠拢；下一次谨慎验证将决定真相与动听谎言之间的距离。',
    },
    objectives: {
      opening: '保护现场、建立公开时间线，并取得一条可以独立验证的线索。',
      pursuit: '用第二份记录、证词或物理痕迹复核最新证据。',
      convergence: '补上最后缺口，不要把自洽的故事误当成已经证明的事实。',
    },
    zones: {},
    motifs: ['封锁的现场', '尚未完成的时间线', '等待核验的证词', '仍藏在阴影里的证据'],
  };
}
