# Exploratory protocol playtest — 2026-10-15

This is an independent synthetic agent playtest through the public protocol CLI against the actual Worker and isolated SQLite fixture. It is not browser testing or human usability testing. I did not read source, tests, private answers, other players' work, or previous reports. All choices below came from public case, target, clue, question, puzzle, and report responses. No resource edits, resets, or answer-combination enumeration were used.

## P02 — Ghost Protocol (Lvl_02, English)

**Outcome:** passed on the first report submission, grade **B**. Started at 20 AP, turn 0, confusion 0, and 50 stamina per default investigator. Finished at **6 AP, turn 14, confusion 11**, with NEXUS-01 56, AURORA-09 46, CIPHER-47 76 stamina. All four report dimensions were covered. No rest was necessary.

### Decisions and recovery

- I read the opening observations as leads, not already earned evidence. The initial clue collection was empty. I deliberately tried the plausible but insufficient chip inventory comparison with NEXUS-01. It cost 1 AP, raised confusion by 3, and produced no clue. Its narration clearly explained that counts and scorch marks do not establish death or destruction of all records, and directed me toward ignition and loading-state checks. Forensics then earned d_01.
- I followed the changing goal through badge audit (d_02), local QPS diagnostics (d_03), camera-controller audit (d_07), server-vault audit (d_04), billing metadata (d_08), offline-copy provenance (d_05), and roof-pressure diagnostics (d_06). Rotating investigators kept stamina affordable. Every successful field verification cost 1 AP and quoted 10 stamina; passive recovery made net executor loss 6 per turn while other investigators gained 4.
- After d_03, I reloaded public state and clues. Revision 8, 16 AP, turn 4, confusion 3, earned clues, and stamina persisted exactly. The stored checks identified methods and executors.
- I read Harlan's free background, then paid for a specific claim, then used d_04 for evidence confrontation. Background cost 0 AP/stamina/turn and stayed `background`; paid claim cost 1 AP, 10 stamina, one turn and +2 confusion, stayed `claim`, and did not advance testimony. Evidence then quoted and charged 0 AP via the 1 AP claim credit, still cost 10 stamina/one turn, advanced the stage, and saved `verified_testimony` with the prior claim and evidence IDs. This distinction was clear and matched the stated prices.
- A HOSTILE TRACE appeared at turn 8. I chose EVADE for 1 AP because the steady outcome was affordable. It cleared the crisis without extra confusion. The costs and alternatives were legible.
- I verified Otto's absence against badge/outage records and Zoe's prototype knowledge against device/roof records. Each direct evidence question cost 1 AP. Neither changed the earned clue collection, but each advanced and saved verified testimony.
- The route workbench exposed geometry and original records separately. I submitted `lab → phase → shaft → roof`, justified by entry at 02:18, the rated partition crossing, internal stair, and roof pulse at 02:34. It passed once for 1 AP.

### Confusion and errors

1. **Relationship semantics / bundled events:** I submitted `d_03 precedes d_06`, reasoning that d_03's local wearer activation at 02:26 precedes d_06's roof passage at 02:34. Rejected at revision 32, +3 confusion, no AP/turn cost. d_03 also contains recovery at 02:41, so a record-level temporal interpretation can explain the rejection, but the selected event inside that record is ambiguous. The generic rejection said different recorded events do not establish strict ordering and advised checking clocks; the public text does not let a player specify which event is intended. I corrected the *reasoning* to route corroboration and `d_03 supports d_06` was accepted as a core link at revision 33. I did not try other combinations.
2. **Reasonable support rejected:** I submitted `d_01 supports d_05`, because d_01 physically establishes emptied chips externally ignited and d_05 explicitly preserves Aria's pre-incident instruction to leave emptied chips as a decoy. Rejected at revision 42, +3 confusion. The generic feedback again discussed clocks, though this was a support relation. This felt arbitrary because the descriptions explicitly corroborate the same plan. I preserved the rejection and did not search for another relation. This is the strongest observed gameplay issue.
3. **Missing-source direction:** Harlan's stage-1 evidence question was unavailable with `requiredClueIds: []` and generic “Compare matching evidence” text. The firm question suggests separating outside contact, unlawful transaction, preservation, and disappearance, but the unavailable evidence card itself gives no source direction. I continued the visible scene leads instead of guessing.
4. **Navigation fixture limitation, corrected during run:** Initial public case/targets responses lacked zone adjacency. Traveling directly from Data Server Room to Staff Lounge produced `ZONE_NOT_ADJACENT` at revision 24. It spent no AP or turn. I inferred the lab hub and continued successfully. The fixture owner then restored public `zone_connections`, which the browser map normally receives; I read that graph and used it thereafter. This omission belongs to the initial CLI fixture, not demonstrated product navigation behavior.
5. One authorized local CLI invocation was delayed by automatic approval review and timed out before execution. The permitted retry succeeded. This is tool infrastructure, not a game command failure.

### Submitted report and evidence reasoning

I selected Aria's staged exit, phase-shift across the rated partition plus burned decoys, evidence preservation/exposure of Harlan, and the 02:17 → 02:18 → 02:34 timeline. Attachments were:

| Dimension | Submitted | Why |
|---|---|---|
| Opportunity | d_02, d_03, d_06, d_07 | Aria entered the lab; live wearer confirmation binds her to local QPS use; the independent roof plate constrains the later outward route; controller provenance establishes the obscured interval without identifying its operator. |
| Method | d_01, d_03, d_05 | The chips were empty before external ignition; Aria's live-verified QPS crossed the permitted 28 cm partition and exhausted its core; the earlier instruction explains the decoy plan. |
| Motive | d_04, d_05, d_08 | Harlan downloaded the archive; the signed offline copy preserves delivery papers and Aria's preservation instruction; the overseas call is supporting context, not proof of its contents. |
| Timeline | d_07, d_02, d_03, d_06 | Camera outage 02:17, badge entry 02:18, QPS use 02:26, outward roof passage 02:34; recovery at 02:41 is a distinct later event. |

The accepted review used d_02+d_06 for opportunity, d_01+d_03 for method, d_04+d_05 for motive, and d_06+d_07 for timeline, retaining the other attachments as context. It explicitly said all four conclusions were supported. I did not infer a destination beyond the building or treat the roof plate alone as personal identification.

### Affordability

The 20 AP default run accommodated eight correct inspections, one wrong inspection, one paid claim, three evidence confrontations (one credited), a 1 AP crisis escape, and the 1 AP route puzzle, ending with 6 AP. Travel, relationship attempts, report submission, and background/review reads used no AP. Two reasonable relationship rejections added 6 confusion, so the final confusion of 11 came from the deliberate wrong inspection (+3), paid claim (+2), and those rejections (+6). The run remained recoverable without rest or reset.

## P04 — White Tower Paradox (Lvl_08, English)

**Outcome:** passed on the first report submission, grade **B**. Started at 20 AP, turn 0, confusion 0, and 50 stamina per default investigator. Finished at **8 AP, turn 11, confusion 0**, with NEXUS-01 54, AURORA-09 54, CIPHER-47 64 stamina. All four report dimensions were covered. No rest, reset, report correction, or failed command was necessary in this case. This second run did not repeat the deliberate wrong inspection or claim-credit experiment already performed in P02.

### Decisions and evidence boundaries

- I sampled the sealed air tube using forensics (j_01), rather than treating “no toxin alarm” as normal oxygen. The earned result established independent oxygen falling from 20.9% to 11.2%, abnormal argon-xenon mixing, and the AIR-43 mixing-valve receipt.
- I verified the offline testimony crystal (j_08), which unlocked the archive. Its warning explained Amara's concern and preservation intent without identifying the deleter. I then audited the trial registry (j_04) and verified contract metadata (j_05), establishing the twenty thousand low-credit residents, planned disclosure, and Lucan's concrete payment benefit.
- The goal led to the prediction core. Risk-deletion audit (j_02) established deletion through council-director access six minutes before death. Signed environment metadata (j_03) explicitly bound Lucan's local live signature to the actual ENV-42 alarm-disable and mixing payload, with a digest matching independent AIR-43 physical execution. This was a useful boundary: a policy label, human authorization, physical execution, and deletion were separate facts.
- I confronted Lucan directly with j_03+j_02 for 1 AP and saved verified testimony. He acknowledged signing the silent presentation and attributed deletion to agenda authority rather than system emotion.
- I followed the public adjacency graph via the summit chamber to the transit nexus. Auditing the original broadcast (j_06) established Iria's continuous independently notarized location outside the tower. Diagnostics on the elevator/badge station (j_07) separated Tomas's distress and physical location from cloned access hardware.
- A HOSTILE TRACE appeared at turn 8. As in P02, I chose the affordable 1 AP EVADE, preserving zero confusion.
- I recorded `j_03 supports j_01`: ENV-42's signed payload matched AIR-43's independent physical mixing/oxygen evidence. It was accepted as a core link on the first attempt.
- The causal workbench exposed receipt references and distinct badge hardware: ACC-41 used HW-C77 under Tomas's permission name while registered HW-T12 was sending elevator distress; ENV-42 referenced ACC-41 and bore Lucan's human authorization; AIR-43 referenced ENV-42; AUD-44 referenced AIR-43. I submitted `clone → human → execute → erase`, which passed once for 1 AP. No numerical ID guessing or combination enumeration was needed.
- I confronted Tomas with j_07 for 1 AP. His verified testimony confirmed the matching permission name with a different hardware signature. I did not need to finish every NPC stage to assemble a supported report.

### Submitted report

I selected Lucan's signed oxygen-depletion and risk-deletion commands for system execution, inert-gas oxygen depletion with alarms disabled, preventing trial disclosure/preserving consultancy payments, and the clone-entry → human signature → oxygen depletion → deletion sequence.

| Dimension | Submitted | Reason and accepted review |
|---|---|---|
| Opportunity | j_02, j_03, j_06, j_07 | Human live authorization establishes equipment control; cloned badge and elevator distress separate Tomas's location from credentials. Review used j_03+j_07, retaining j_02+j_06 as context. |
| Method | j_01, j_03 | Independent sample and valve execution connect physical low oxygen to the actual signed mixing/alarm payload. Both were used. |
| Motive | j_04, j_05, j_08 | Registry and planned disclosure establish the conflict; Lucan's controlled consultancy has a concrete payment interest; offline warning establishes concern/preservation intent. All three were used. |
| Timeline | j_01, j_02, j_03, j_07 | Original receipt cross-references establish clone entry, signed environment action, physical execution, then deletion, with badge identity distinguished from Tomas's location. Review used j_02+j_03 and retained j_01+j_07 as context. |

The report accepted all four dimensions. I did not interpret lack of a toxin alarm as lack of harm, attribute personal location from a permission name, or infer that a prediction system independently chose murder.

### Affordability and remaining limits

Eight field checks, two direct evidence confrontations, one steady crisis escape, and one causal puzzle used 12 AP in total, leaving 8. Rotating investigators maintained adequate stamina throughout. The public graph avoided navigation errors in this second run. No additional product defect was demonstrated. The completion critique said all four conclusions were supported but did not explain why the grade was B; the grade's other contributors cannot be inferred from that response alone.

The two successful runs support public-protocol recoverability and evidence clarity for these paths. They do not verify browser interactions, visual layout, keyboard behavior, every NPC stage, failure endings, other teams, or all crisis outcomes.
