// Server-only case answers. Never import this module from src/ — everything in
// the browser bundle is inspectable by players.

const CASE_SECRETS = {
  Lvl_01: {
    truth: `Victor Zhao was murdered by his trusted assistant, Mei Lin. Mei discovered Victor was selling experimental neural-interface technology to NovaCorp, whose tests left her sister in a vegetative state. She used a stolen EMP-X7 to overload Victor's neural implants at 23:17, wiped the cameras, and escaped through the maintenance shaft at 23:19. The key chain is the capacitor receipt, EMP burns, cloned access card, NovaCorp deal, sister's medical file, and maintenance-shaft log.`,
    clues: {
      c_01: 'Bloody capacitor receipt', c_02: 'EMP burn marks', c_03: 'Cloned access card',
      c_04: 'NovaCorp encrypted contract', c_05: 'Maintenance shaft log', c_06: "Mei's sister medical file",
      c_07: 'Wiped surveillance', c_08: "Kenji's verified alibi", c_secret_99: 'Anonymous hacker intel',
    },
    npcs: {
      npc_01: { name: 'Mei Lin', role: "Victor's personal assistant", publicPersona: 'Loyal and efficient; appears devastated by Victor’s death.', personality: 'Outwardly composed but internally terrified; cracks when confronted with concrete evidence.', motive: 'She killed Victor with an EMP device to stop the NovaCorp technology sale and avenge her sister.' },
      npc_02: { name: 'Kenji Mori', role: 'Building security guard', publicPersona: 'Diligent guard and first person to discover the body.', personality: 'Nervous, sweating, and prone to stumbling over his words.', motive: 'He did not kill Victor, but fears scrutiny because of his grey-market dealings.' },
      npc_03: { name: 'Dr. Voss', role: 'NovaCorp researcher', publicPersona: 'A visiting business partner.', personality: 'Arrogant and calculating; deflects with legal language.', motive: 'He knew about the illegal NovaCorp deal and stayed silent; he was complicit but did not commit the murder.' },
    },
    validEdges: [['c_01','c_02'],['c_02','c_03'],['c_03','c_05'],['c_04','c_06'],['c_05','c_07'],['c_06','c_01'],['c_secret_99','c_05'],['c_secret_99','c_06']],
    branches: {
      b_wrong_kenji: {
        trigger: 'The report primarily accuses security guard Kenji without sufficient evidence.',
        apLoss: 50,
        zh: '你的探员鲁莽地指控了无辜的保安 Kenji！警方以妨碍公务为由拘押了探员，案件调查陷入死胡同。霓虹灯在雨中继续闪烁，而真凶悄然消失在城市的阴影中……',
        en: "Your agent rashly accused the innocent guard Kenji. Police detained the agent for obstruction, the investigation collapsed, and the real killer disappeared into the city's shadows.",
      },
      b_wrong_voss: {
        trigger: 'The report only accuses Dr. Voss and ignores the direct evidence against Mei Lin.',
        apLoss: 30,
        zh: '探员将矛头指向了 Dr. Voss。虽然他是共谋，但缺乏直接谋杀证据。律师团队迅速介入，真凶 Mei Lin 趁机逃离了城市。',
        en: "The agent targeted Dr. Voss. Although complicit, he was not the killer; his lawyers intervened while Mei Lin escaped the city.",
      },
    },
  },
  Lvl_02: {
    truth: `Dr. Aria Chen was not murdered. She discovered that institute director Dr. Harlan was selling quantum encryption keys to a foreign syndicate, staged her disappearance with a QPS-alpha phase-shift prototype, planted burned chips as decoys, and escaped through the emergency roof shaft at 02:34. The decisive evidence is her lounge backup drive, Harlan's unauthorized server access, the depleted phase-shift device, and the roof weight-sensor log.`,
    clues: {
      d_01: 'Deliberately burned quantum chips', d_02: "Aria's badge record", d_03: 'Depleted phase-shift prototype',
      d_04: "Harlan's server log", d_05: 'Hidden lounge backup drive', d_06: 'Roof weight sensor',
      d_07: 'Synchronized camera outage', d_08: "Harlan's encrypted call log", d_secret_99: "Aria's hidden message",
    },
    npcs: {
      npc_01: { name: 'Dr. Harlan', role: 'Institute director', publicPersona: 'A concerned leader who claims to be doing everything possible to find Aria.', personality: 'Authoritative and skilled at bureaucratic deflection; cites due process when pressed.', motive: "He is secretly selling quantum keys and fears Aria's evidence will destroy him." },
      npc_02: { name: 'Zoe Park', role: 'Lab assistant', publicPersona: 'Shocked and grieving; she was close to Aria.', personality: 'Emotional and likely to reveal details under pressure before backtracking.', motive: 'She knows Aria had a secret escape plan but stayed silent because she fears being implicated.' },
      npc_03: { name: 'Otto', role: 'Night security guard', publicPersona: 'An ordinary, dutiful guard who was on shift that night.', personality: 'Simple and mildly guilty; contradictions surface when questioned.', motive: "Harlan bribed him to leave his post from 02:15 to 02:40, but he does not know Harlan's full scheme." },
    },
    validEdges: [['d_01','d_03'],['d_02','d_03'],['d_03','d_06'],['d_04','d_08'],['d_05','d_04'],['d_07','d_02'],['d_secret_99','d_05']],
    branches: {
      b_blame_zoe: {
        trigger: 'The final report primarily accuses lab assistant Zoe Park.',
        apLoss: 35,
        zh: '探员将怀疑矛头指向了 Zoe Park——这个选择彻底错误。真正的罪行者 Harlan 趁机销毁了所有证据，量子密钥已完成交割。',
        en: 'The agent accused Zoe Park—a catastrophic error. Harlan used the diversion to destroy the evidence and complete the quantum-key exchange.',
      },
      b_blame_otto: {
        trigger: 'The final report accuses guard Otto while ignoring the evidence against Harlan.',
        apLoss: 40,
        zh: '探员锁定了保安 Otto。虽然他确实收受贿赂，但这只是枝节。Harlan 在审讯期间完成了密钥出售，案件彻底失控。',
        en: 'The agent zeroed in on Otto. His bribe was peripheral; Harlan completed the key sale while the investigation spiraled out of control.',
      },
    },
  },
  Lvl_03: {
    truth: `Riku Tanaka was killed by head bartender Sable. Riku had been blackmailing her over an illegal modified-neural-chip smuggling operation. Sable entered the backroom at 01:20, bypassed Booth 3's safety lock with a custom overload script, and killed him while making the death look accidental. The core chain is Riku's messages, Sable's access log, the wiped tablet, Lena's testimony, and the smuggling ledger.`,
    clues: {
      e_01: 'Overloaded neural pod', e_02: "Riku's blackmail messages", e_03: "Sable's access log",
      e_04: 'Wiped tablet with overload script', e_05: "Lena's testimony", e_06: 'Modified neural chips',
      e_07: 'Bar chemical analysis', e_08: "Ren's verified alibi", e_secret_99: "Sable's smuggling ledger",
    },
    npcs: {
      npc_01: { name: 'Sable', role: 'Head bartender', publicPersona: 'Calm and professional; claims she worked at the bar all evening.', personality: 'Ice-cold with almost no visible emotion, except brief pauses around the exact timeline.', motive: 'She bypassed the safety lock and killed Riku to eliminate the only person who knew about her smuggling operation.' },
      npc_02: { name: 'Lena', role: 'Coat-check attendant', publicPersona: 'A timid, kind witness who appears willing to cooperate.', personality: 'Her voice trembles; reassurance opens her up, but pressure is needed for the complete story.', motive: 'She is an innocent witness who tells partial truths because she fears retaliation from Sable.' },
      npc_03: { name: 'Ren', role: 'Club owner', publicPersona: 'A sharp businessman eager to distance the club from the incident.', personality: 'Highly defensive; threatens with money and lawyers, then sacrifices Sable when cornered.', motive: 'He knew about the smuggling and took a cut, but did not know Sable would kill Riku.' },
    },
    validEdges: [['e_01','e_04'],['e_02','e_03'],['e_03','e_05'],['e_04','e_06'],['e_06','e_02'],['e_07','e_01'],['e_secret_99','e_02'],['e_secret_99','e_06']],
    branches: {
      b_blame_ren: {
        trigger: 'The final report primarily accuses club owner Ren instead of Sable.',
        apLoss: 30,
        zh: '探员将矛头指向了俱乐部老板 Ren。虽然他参与走私，但他没有杀人。在律师团队的掩护下，真凶 Sable 悄然离开了这座城市。',
        en: 'The agent targeted club owner Ren. Although involved in smuggling, he was not the killer; Sable quietly escaped the city.',
      },
    },
  },
  Lvl_04: {
    truth: `Dr. Noor was murdered by archive supervisor Elias Venn. Noor discovered that Elias was selling the station's polar prediction model abroad and scheduled a dawn audit. Elias used his administrator token to wake the D-4 maintenance drone, route it through the tunnel, open the nitrogen bypass, and fire a liquid-nitrogen jet through the vault service hatch. He looped eleven minutes of climate data to stage an accident. The decisive chain is the frost direction, drone residue, overwritten climate log, Elias's token, valve tool marks, model-sale draft, and drone route cache.`,
    clues: {
      f_01: 'Abnormal frost fractures', f_02: 'Eleven-minute climate-log gap', f_03: 'D-4 maintenance drone residue',
      f_04: "Elias's administrator token", f_05: 'Foreign climate-model deal', f_06: "Mira's continuous repair footage",
      f_07: 'Nitrogen valve tool marks', f_08: "Noor's audit appointment", f_secret_99: 'D-4 override route cache',
    },
    npcs: {
      npc_01: { name: 'Elias Venn', role: 'Archive station supervisor', publicPersona: 'Calm and dependable; blames the death on equipment failure during the blizzard.', personality: 'Controls conversations and redirects scrutiny toward procedure when his token is mentioned.', motive: 'He killed Noor to prevent her dawn audit from exposing his sale of the polar prediction model.' },
      npc_02: { name: 'Mira Sol', role: 'Cryogenic systems engineer', publicPersona: 'Skilled but hot-tempered; publicly argued with Noor.', personality: 'Blunt and angry when accused, but exact about equipment and timing.', motive: 'She is innocent; her argument creates suspicion, but continuous hangar footage proves her location.' },
      npc_03: { name: 'Sol Adebayo', role: 'Climate Authority auditor', publicPersona: 'Cautious and neutral; arrived before dawn for Noor’s audit.', personality: 'Relies on documentary evidence and avoids premature accusations.', motive: 'He is an innocent auditor who can confirm Noor was investigating a management-level export.' },
    },
    validEdges: [['f_01','f_03'],['f_02','f_04'],['f_03','f_07'],['f_04','f_05'],['f_05','f_08'],['f_06','f_04'],['f_secret_99','f_03'],['f_secret_99','f_04']],
    branches: {
      b_blame_mira: {
        trigger: 'The final report primarily accuses engineer Mira Sol because of her argument with Noor.',
        apLoss: 35,
        zh: '探员因公开争执而指控 Mira，但连续机库影像证明她不在现场。Elias 借机清除交易记录，暴风雪掩盖了最后的数据传输。',
        en: 'The team accused Mira because of her public argument, but continuous hangar footage clears her. Elias used the diversion to erase the sale records.',
      },
      b_accident: {
        trigger: 'The report concludes the death was only a climate-control accident.',
        apLoss: 30,
        zh: '案件被草率归档为设备事故。D-4 无人机的路线和管理员令牌没有得到解释，真正的模型交易继续进行。',
        en: 'The death was hastily filed as an equipment accident. The drone route and administrator token remained unexplained while the model sale continued.',
      },
    },
  },
  Lvl_05: {
    truth: `Captain Jonah Vale was murdered by orbital elevator director Cassian Rook. Jonah discovered that Rook and courier Ivo Marek were moving weapons-grade cargo under forged medical manifests. Rook copied Jonah's neural authorization, used his master account to open the lifeboat diagnostic valve, disabled alarm forwarding, and forged a container release while looped camera footage hid the transfer. Ivo handled the cargo and knew of the smuggling but did not operate the lifeboat. The decisive chain is the directed depressurization, forged captain order, weapons isotope, Rook access log, Ivo manifest, camera parallax ghost, beacon warning, and offline ledger.`,
    clues: {
      g_01: 'Directed lifeboat depressurization', g_02: 'Forged captain release order', g_03: 'Weapons-grade isotope residue',
      g_04: "Rook's master-control access", g_05: "Yara's independent calibration record", g_06: "Ivo's shadow manifest",
      g_07: 'Looped camera parallax ghost', g_08: "Jonah's emergency beacon", g_secret_99: 'Offline military-container ledger',
    },
    npcs: {
      npc_01: { name: 'Cassian Rook', role: 'Orbital elevator director', publicPersona: 'Calm and imposing; claims he coordinated storm safety during the death.', personality: 'Uses safety regulations to suppress questions and reacts sharply to his private company and master account.', motive: 'He killed Jonah to protect a profitable weapons-smuggling route and forged the captain’s release authorization.' },
      npc_02: { name: 'Yara Sen', role: 'Tether systems engineer', publicPersona: 'Quiet and precise; responsible for dangerous tether calibration.', personality: 'Trusts sensor data and resists political pressure.', motive: 'She is innocent; six independent calibration sensors prove she was away from the dock.' },
      npc_03: { name: 'Ivo Marek', role: 'Independent orbital courier', publicPersona: 'Smooth and talkative; claims he carried legal coolant.', personality: 'Evades cargo origins and bargains when confronted with documentary evidence.', motive: 'He knowingly transported Rook’s illegal weapons cargo but did not execute the lifeboat murder.' },
    },
    validEdges: [['g_01','g_04'],['g_02','g_04'],['g_03','g_06'],['g_04','g_07'],['g_05','g_04'],['g_06','g_secret_99'],['g_08','g_02'],['g_secret_99','g_04']],
    branches: {
      b_blame_ivo: {
        trigger: 'The final report accuses courier Ivo of personally killing Jonah while ignoring Rook’s diagnostic access.',
        apLoss: 40,
        zh: 'Ivo 因走私被捕，但救生舱谋杀缺乏对他的直接证据。Rook 以主管权限封存主控记录，并将剩余货柜送入轨道暗港。',
        en: 'Ivo was arrested for smuggling, but no evidence tied him directly to the lifeboat murder. Rook sealed the master logs and moved the remaining cargo.',
      },
      b_blame_yara: {
        trigger: 'The final report blames engineer Yara despite her independent calibration record.',
        apLoss: 45,
        zh: '对 Yara 的错误指控让缆索系统失去唯一愿意作证的工程师。Rook 利用安全紧急状态中止调查，真相坠入云层。',
        en: 'The false accusation against Yara silenced the only engineer willing to testify. Rook invoked a safety emergency and terminated the investigation.',
      },
    },
  },
};

export function getCaseSecret(caseId) {
  return CASE_SECRETS[caseId] || null;
}

export function getNpcHiddenMotive(caseId, npcId) {
  return getNpcSecret(caseId, npcId)?.motive || '';
}

export function getNpcSecret(caseId, npcId) {
  return getCaseSecret(caseId)?.npcs?.[npcId] || null;
}

export function getClueLabel(caseId, clueId) {
  return getCaseSecret(caseId)?.clues?.[clueId] || '';
}

export function isKnownValidEdge(caseId, clueAId, clueBId, allowTwoHop = false) {
  const edges = getCaseSecret(caseId)?.validEdges || [];
  const isDirect = edges.some(([a, b]) =>
    (a === clueAId && b === clueBId) || (a === clueBId && b === clueAId)
  );
  if (isDirect || !allowTwoHop) return isDirect;

  const neighbors = (clueId) => edges.flatMap(([a, b]) =>
    a === clueId ? [b] : b === clueId ? [a] : []
  );
  const fromA = new Set(neighbors(clueAId));
  return neighbors(clueBId).some(clueId => fromA.has(clueId));
}

export function getBranchOutcome(caseId, branchId, lang) {
  const branch = getCaseSecret(caseId)?.branches?.[branchId];
  if (!branch) return null;
  return {
    branch_id: branchId,
    narrative: lang === 'en' ? branch.en : branch.zh,
    impact: { ap_loss: branch.apLoss },
  };
}
