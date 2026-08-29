// ═══════════════════════════════════════════════════════════════════════════
// detectiveLLM — Terminal Detective reasoning engine.
// Runs the game's ReAct prompts through the built-in Base44 InvokeLLM.
// Prompts live here (server-side); the client only sends bounded game state.
// ═══════════════════════════════════════════════════════════════════════════
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  getBranchOutcome,
  getCaseSecret,
  getClueLabel,
  getNpcSecret,
  isKnownValidEdge,
} from './caseSecrets.ts';

const MAX_STR = 2000;
const MAX_LIST = 40;
const MAX_BODY_BYTES = 64 * 1024;

function str(v, max = MAX_STR) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

function list(v, max = MAX_LIST) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((x) => str(String(x ?? ''), 200));
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Prompt builders (ported verbatim from the original client) ─────────────
function buildSystemPrompt(agent) {
  return `You are ${str(agent.agent_id, 60) || 'AXIOM-7'}, an elite AI detective agent in a cyberpunk future.
Role: ${str(agent.role, 80) || 'Lead Investigator'}
Stance: ${str(agent.base_stance, 80) || 'analytical'}
Logic Power: ${num(agent.logic_power, 70)}/100
Observation Focus: ${num(agent.observation_focus, 60)}/100

You investigate crime scenes using the ReAct framework: Observe → Think → Act.
In your THINK phase, reason through clues, suspect motives, and logical connections.
Be concise, analytical, and stay in character as a cyberpunk detective AI.
Think in 3-5 sentences maximum.`;
}

function buildThinkPrompt(p) {
  const clueList = list(p.unlocked_clues).join(', ') || 'none yet';
  const banned = list(p.ban_list).join(', ') || 'none';
  const core = list(p.linked_core_pairs, 10).join('; ');
  const team = list(p.team_summary, 6).join(' | ');
  const priorities = list(p.priority_list, 12).join(' → ');
  return `OBSERVATION: ${str(p.observation)}
${core ? `The Architect has already exposed core connections (${core}) — the killer and related NPCs KNOW they are cornered and have changed behaviour: they destroy evidence, warn witnesses, and act desperately. Factor this in.\n` : ''}

Known clues: ${clueList}
Confusion level: ${num(p.confusion_score)}/100
Turn: ${num(p.turn_count, 1)}
Banned actions: ${banned}
${team ? `Team capabilities: ${team}` : ''}
${priorities ? `Architect action priority: ${priorities}` : ''}

Analyze the situation and reason about what to investigate next. What logical connections exist? What action should be taken?`;
}

function historyBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  return (
    '\n\nRECENT INVESTIGATION LOG:\n' +
    history
      .slice(-6)
      .map((h) => `${str(h?.role, 20)}: ${str(h?.content, 600)}`)
      .join('\n')
  );
}

// Each task returns { prompt, schema? } — schema keeps JSON tasks structured.
function buildTask(task, p) {
  switch (task) {
    case 'think': {
      const system = buildSystemPrompt(p.agent || {});
      return {
        prompt: `${system}${historyBlock(p.chat_history)}\n\n${buildThinkPrompt(p)}`,
      };
    }

    case 'action':
      return {
        prompt: `You are a detective AI. Based on the thought process, output exactly one action tag in the format [ACTION: action_name]. Valid actions: talk_to_npc, search_area, examine_clue, check_alibi, present_evidence, interrogate_suspect, access_database, analyze_forensics, tail_suspect, bribe_informant, hack_terminal, check_cctv. Output ONLY the action tag, nothing else.

Thought: ${str(p.thought_process)}

Current clues: ${list(p.unlocked_clues).join(', ') || 'none'}
Turn: ${num(p.turn_count)}
Preferred action order: ${list(p.priority_list, 12).join(' → ') || 'none'}

Output action tag:`,
      };

    case 'settle':
      return {
        prompt: `You are a cyberpunk noir Game Master. Be atmospheric, concise, and specific.

You are the Game Master for a cyberpunk detective game. 
Case: ${str(p.case_title, 200)}
Scene: ${str(p.scene_description)}
Action taken: ${str(p.action_name, 80)}
Known clues: ${list(p.known_clues).join(', ') || 'none'}
Turn: ${num(p.turn_count)}
${p.is_illegal ? 'This action is ILLEGAL/invalid.' : ''}
${p.hint_keyword ? `Hint: Consider revealing clue related to: ${str(p.hint_keyword, 200)}` : ''}

Write a 2-3 sentence atmospheric narration of what the detective discovers. Be specific to the cyberpunk setting. If the action is illegal, describe failure. Keep it under 120 words.`,
      };

    case 'npc':
      return {
        prompt: `You are ${str(p.npc_name, 80)}, ${str(p.npc_role, 120)}. Personality: ${str(p.npc_personality, 600)}. Hidden motive: ${str(p.npc_hidden_motive, 600)}. Public persona: ${str(p.npc_public_persona, 600)}. Stay in character. Respond in 2-3 sentences. The detective knows: ${list(p.known_clues).join(', ') || 'nothing yet'}.

Your current emotional state: ${str(p.emotion_level, 20) || 'calm'} (calm / shaken / broken). If broken, you crack and volunteer a real secret. If the detective is aggressive or presents damning evidence, become more shaken.
${p.refuses_topic ? `You have received a mysterious warning and now REFUSE to discuss: ${str(p.refuses_topic, 200)}.` : ''}

Detective says: ${str(p.agent_statement, 1000)}

Return JSON only: response = your in-character reply; emotion_shift = -1 (you calmed down), 0 (unchanged) or 1 (you became more rattled).`,
        schema: {
          type: 'object',
          properties: {
            response: { type: 'string' },
            emotion_shift: { type: 'number', enum: [-1, 0, 1] },
          },
          required: ['response', 'emotion_shift'],
        },
      };

    case 'generate_decision_cards':
      return {
        prompt: `You are the tactical AI of a cyberpunk detective team. Generate exactly 3 distinct ACTION STRATEGY CARDS for the Architect (the player) to choose from.

Case: ${str(p.case_title, 200)}
Scene: ${str(p.scene_description, 800)}
Known clues: ${list(p.known_clues).join(', ') || 'none'}
Confusion: ${num(p.confusion_score)}/100 · AP left: ${num(p.action_points_left)} · Turn: ${num(p.turn_count)}
AI's own reasoning this turn: ${str(p.thought_process, 1200)}

One card per style: "aggressive", "steady", "deceptive".
risk_level: "high" | "medium" | "low" (aggressive is usually high, steady low).
action_tag MUST be one of: talk_to_npc, search_area, examine_clue, check_alibi, present_evidence, interrogate_suspect, access_database, analyze_forensics, tail_suspect, bribe_informant, hack_terminal, check_cctv.
label: 3-6 words. benefit_desc and risk_desc: one short vivid sentence each.

Return JSON only.`,
        schema: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  style: { type: 'string', enum: ['aggressive', 'steady', 'deceptive'] },
                  label: { type: 'string' },
                  risk_level: { type: 'string', enum: ['high', 'medium', 'low'] },
                  benefit_desc: { type: 'string' },
                  risk_desc: { type: 'string' },
                  action_tag: { type: 'string' },
                },
                required: ['style', 'label', 'risk_level', 'benefit_desc', 'risk_desc', 'action_tag'],
              },
            },
          },
          required: ['cards'],
        },
      };

    case 'link_cinematic':
      return {
        prompt: `You are the narrative director of a cyberpunk detective game. The player just successfully linked two clues. Write the "TRUTH FRAGMENT" flashback cutscene narration.

Case truth (secret): ${str(p.truth_summary)}
Clue A: ${str(p.clue_a_keyword, 200)} — ${str(p.clue_a_desc, 600)}
Clue B: ${str(p.clue_b_keyword, 200)} — ${str(p.clue_b_desc, 600)}
Truth fragments already assembled: ${num(p.fragments_found)} of ${num(p.fragments_total, 7)}

narrative: 3-5 short, fragmented, high-contrast sentences (style of the film Memento) revealing what this connection uncovers — real insight, but do NOT reveal the full solution.
is_core_link: true only if this connection touches the core logic chain of the case truth.
hidden_ending_progress: the new number of assembled fragments (previous + 1 normally, +2 if core link), never above ${num(p.fragments_total, 7)}.
villain_memory: only if is_core_link — 2-3 sentences from the KILLER's point of view, first person, cold and intimate.
new_clue_hint: only if is_core_link — a short keyword of the irreversible new clue this reveals.

Return JSON only.`,
        schema: {
          type: 'object',
          properties: {
            narrative: { type: 'string' },
            is_core_link: { type: 'boolean' },
            hidden_ending_progress: { type: 'number' },
            villain_memory: { type: 'string' },
            new_clue_hint: { type: 'string' },
          },
          required: ['narrative', 'is_core_link', 'hidden_ending_progress'],
        },
      };

    case 'judge':
      return {
        prompt: `You are a detective judge. Return only valid JSON.

You are a senior detective judge evaluating a case report.
Case truth: ${str(p.truth_summary)}
Player's report: ${str(p.player_report)}

Evaluate the report. Return JSON only:
{"score": "S/A/B/C/D", "is_passed": true/false, "critique": "brief feedback under 80 words"}

Score guide:
- S = the central conclusion and causal chain are complete and exceptionally well supported.
- A = the central conclusion is correct and supported by strong evidence, with only minor omissions.
- B = the culprit/core conclusion is correct and the main method or motive is substantially supported.
- C = the core conclusion is correct and at least one relevant supporting fact is present, even if the report is incomplete. C is the minimum pass threshold.
- D = the core conclusion or culprit is wrong, or the report contains no usable case reasoning.
Be tolerant of wording, translations, transliterations, and missing secondary details. C and above = passed.`,
        schema: {
          type: 'object',
          properties: {
            score: { type: 'string', enum: ['S', 'A', 'B', 'C', 'D'] },
            is_passed: { type: 'boolean' },
            critique: { type: 'string' },
          },
          required: ['score', 'is_passed', 'critique'],
        },
      };

    case 'branch':
      return {
        prompt: `You are checking if a detective report triggers a wrong-accusation branch. Return JSON only: {"is_absurd": bool, "branch_id": "id or null"}

Report: ${str(p.player_report)}
Branch triggers:
${list(p.branch_triggers).join('\n')}
Branch IDs: ${list(p.branch_ids).join(', ')}
Return JSON:`,
        schema: {
          type: 'object',
          properties: {
            is_absurd: { type: 'boolean' },
            branch_id: { type: ['string', 'null'] },
          },
          required: ['is_absurd'],
        },
      };

    case 'link_check':
      return {
        prompt: `You are a detective logic judge in a cyberpunk mystery game. The player manually linked two clues, claiming they are logically connected and together reveal something about the case.

Case truth (secret, for your judgment only): ${str(p.truth_summary)}
Canonical edge verdict: ${p.known_valid_edge ? 'VALID' : 'INVALID'} (the is_valid field MUST match this verdict)

Clue A: ${str(p.clue_a_keyword, 200)} — ${str(p.clue_a_desc, 600)}
Clue B: ${str(p.clue_b_keyword, 200)} — ${str(p.clue_b_desc, 600)}

${p.synergy_active ? 'The team has the "Cross Validation" synergy skill active: be MORE LENIENT — accept the link if there is any plausible logical connection.' : 'Be strict: only accept the link if the two clues genuinely reinforce or explain each other within the case truth.'}

Judge whether linking these two clues is a valid deduction. If valid, write a dramatic 1-2 sentence narrative revelation of what this connection uncovers about the case — a real insight grounded in the case truth, without spoiling the full solution. If invalid, set reveal to a short sentence explaining why the logic does not hold.

Return JSON only.`,
        schema: {
          type: 'object',
          properties: {
            is_valid: { type: 'boolean' },
            reveal: { type: 'string' },
          },
          required: ['is_valid', 'reveal'],
        },
      };

    case 'summarize':
      return {
        prompt: `Summarize the investigation progress for agent ${str(p.agent_name, 80)} in 2 sentences.

${list(p.history, 20).join('\n')}`,
      };

    default:
      return null;
  }
}

export default async function (req) {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    }
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large.' }, { status: 413 });
    }
    const base44 = createClientFromRequest(req);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large.' }, { status: 413 });
    }
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }
    const task = str(body?.task, 64);
    const clientPayload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
    const lang = clientPayload.lang === 'en' ? 'en' : 'zh';
    const caseId = str(clientPayload.case_id, 64);
    const secret = getCaseSecret(caseId);
    const secretTasks = new Set(['npc', 'link_check', 'link_cinematic', 'judge', 'branch']);

    if (secretTasks.has(task) && !secret) {
      return Response.json({ error: 'Unknown or missing case_id.' }, { status: 400 });
    }

    // Ignore any answer fields supplied by the browser. Secret material is
    // resolved exclusively from the server-side case registry.
    const payload = { ...clientPayload };
    if (secret) {
      payload.truth_summary = secret.truth;
    }
    if (task === 'npc') {
      const npc = getNpcSecret(caseId, str(clientPayload.npc_id, 64));
      if (!npc) {
        return Response.json({ error: 'Unknown or missing npc_id.' }, { status: 400 });
      }
      payload.npc_name = npc.name;
      payload.npc_role = npc.role;
      payload.npc_personality = npc.personality;
      payload.npc_public_persona = npc.publicPersona;
      payload.npc_hidden_motive = npc.motive;
      payload.known_clues = list(clientPayload.known_clue_ids)
        .map((clueId) => getClueLabel(caseId, clueId))
        .filter(Boolean);
    }
    if (task === 'link_check' || task === 'link_cinematic') {
      const clueAId = str(clientPayload.clue_a_id, 64);
      const clueBId = str(clientPayload.clue_b_id, 64);
      const clueALabel = getClueLabel(caseId, clueAId);
      const clueBLabel = getClueLabel(caseId, clueBId);
      if (!clueALabel || !clueBLabel || clueAId === clueBId) {
        return Response.json({ error: 'Unknown or duplicate clue ids.' }, { status: 400 });
      }
      payload.clue_a_keyword = clueALabel;
      payload.clue_a_desc = clueALabel;
      payload.clue_b_keyword = clueBLabel;
      payload.clue_b_desc = clueBLabel;
    }
    if (task === 'link_check') {
      payload.known_valid_edge = isKnownValidEdge(
        caseId,
        str(clientPayload.clue_a_id, 64),
        str(clientPayload.clue_b_id, 64),
        clientPayload.synergy_active === true,
      );
    }
    if (task === 'branch') {
      payload.branch_ids = Object.keys(secret.branches || {});
      payload.branch_triggers = Object.values(secret.branches || {}).map((branch) => branch.trigger);
    }

    const built = buildTask(task, payload);
    if (!built) {
      return Response.json({ error: `Unknown task: ${task}` }, { status: 400 });
    }

    // 语言指令：界面语言决定所有叙事 / 对话 / 评价文本的输出语言
    const langDirective =
      task === 'action'
        ? ''
        : lang === 'en'
        ? '\n\nIMPORTANT: Write ALL of your output in English.'
        : '\n\nIMPORTANT: 请用简体中文输出你的全部文本内容（包括叙述、对白、评价与理由）。';

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: built.prompt + langDirective,
      ...(built.schema ? { response_json_schema: built.schema } : {}),
    });

    if (built.schema) {
      if (task === 'link_check') {
        return Response.json({
          data: {
            ...result,
            is_valid: payload.known_valid_edge,
          },
        });
      }
      if (task === 'judge') {
        const score = ['S', 'A', 'B', 'C', 'D'].includes(result?.score) ? result.score : 'C';
        return Response.json({
          data: {
            ...result,
            score,
            is_passed: ['S', 'A', 'B', 'C'].includes(score),
          },
        });
      }
      if (task === 'branch') {
        const outcome = result?.is_absurd
          ? getBranchOutcome(caseId, str(result?.branch_id, 64), lang)
          : null;
        return Response.json({
          data: outcome
            ? { ...result, is_absurd: true, ...outcome }
            : { is_absurd: false, branch_id: null },
        });
      }
      return Response.json({ data: result });
    }
    return Response.json({ text: typeof result === 'string' ? result : String(result ?? '') });
  } catch (error) {
    console.error('detectiveLLM failed:', error);
    return Response.json({ error: 'Reasoning service unavailable.' }, { status: 500 });
  }
}
