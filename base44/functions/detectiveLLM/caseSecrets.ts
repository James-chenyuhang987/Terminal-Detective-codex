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
