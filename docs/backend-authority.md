# Backend authority (version 1)

## Trust and rollout

Firebase verifies the account owner; D1 is the sole source of resources, reward markers, progression and paid investigation state. The browser supplies intent, not resulting state. All economy changes and reward-affecting investigation actions require online confirmation. The legacy profile patch API rejects every patch, including cosmetic ones; cosmetics use the identity command. There is no profile import, reset, grant, arbitrary activity increment, client XP or completed-summary endpoint. File imports in the coordinating client release restore settings only.

The additive `cloudflare/migrations/0004_authoritative_state.sql` is required. It preserves existing D1 data and adds initialization versioning, operation result storage, owned runs and run operations. Readiness fails without its schema and migration record. Review/backup/approval for applying this migration is separate from code publication. **Do not rerun historical migration `0002`, clear tables or migration history, or automatically migrate production.** No production migration is performed by this change.

An existing D1 snapshot is the migration baseline, normalized server-side once without advancing its revision. Previously forged data cannot be distinguished retroactively from legitimate progress. Empty profiles receive starting resources once; subsequent reads or claims cannot reset them. Old snapshot WAL records must be quarantined by the client, never converted to commands or replayed as patches. A server profile read or device claim returns `authority_version: 1`; clients must not submit migration writes.

## Profile API

`POST /api/apps/:appId/functions/playerProfile`, with a verified Firebase bearer token:

```json
{
  "action": "command",
  "session_id": "web-device-1234567890",
  "operation_id": "unique-operation-123456",
  "expected_revision": 0,
  "command": { "type": "purchase_item", "item_id": "energy_cell", "quantity": 1 }
}
```

Other actions are `status` and `claim_session`, with `session_id`. Success returns `{profile, account, backend: "cloudflare", authority_version: 1, active_run, result, operation_id, replayed}`; noncommand reads omit command result fields. `GET /api/apps/:appId/entities/User/me` also returns the normalized profile and capability flag. The active run is the one paid, not-yet-settled run, including terminal runs awaiting reward settlement.

Allowed command fields (in addition to `type`):

| Command | Arguments |
| --- | --- |
| `identity` | `patch` containing only detective_name, avatar, signature, identity_badge, detective_tags; canonical one-rename restriction applies |
| `checkin`, `consume_energy_cell`, `buy_use_energy_cell`, `claim_weekly`, `visit_lobby` | None |
| `purchase_item` | `item_id`, optional `quantity` (1–10) |
| `equip_item` | `item_id` |
| `unlock_tech` | `tech_id` |
| `claim_achievement` | `achievement_id` |
| `claim_task` | `kind` (`tutorial` or `seven`), `task_id` |
| `claim_level` | `level` |
| `purchase_agent`, `activate_support` | `agent_id` |
| `save_team` | `team_config` |
| `skill_loadout` | `skill_loadout` (three slot arrays, or identified rows with agent_id and skill_ids) |
| `mail_read` | `mail_id` |
| `mail_reply` | `mail_id`, `choice_id` |
| `start_case` | `case_id`, optional raw `team_config` |
| `settle_case` | `run_id` only |

Unknown fields are rejected, including client timestamps, costs, derived combat attributes, difficulty overrides, summaries and balances. Prices, dates, claims, ownership, skill unlocks, case data and team effects come from canonical server code/state. Raw team configuration is `{specs, priorities?, primary_agent_index?, command_plan?, core_agent_ids?}`; three specialty allocations must use the slot's allowed fields and budget. Do not submit computed deployment objects.

Mail availability is server-derived: `welcome`, solved-case `case1`…`case8`, unlocked `tech`, and completed seven-day `week`. Replies are only `caseN:0` or `caseN:1`, once per available case mail; no reply awards resources.

## Paid run lifecycle

`start_case` atomically spends canonical energy/consumables and creates a run whose owner and paid start operation are persisted. Its result contains `{effects, cost, run}`. A second unsettled run returns `result.error: "active_run_exists"` and the existing run without another charge. Status/claim responses support resuming it after refresh or a lost start response.

`POST /api/apps/:appId/functions/playerRun` accepts the same command envelope plus `run_id`; its `expected_revision` is the run revision, independent of profile revision. `action: "status"` requires only session/run IDs. Responses are `{run, result, backend: "cloudflare", authority_version: 1, operation_id, replayed}`. Commands advance the persisted canonical reducer, never a client gameState. Public projections omit hidden case dictionaries. Stateless `detectiveRules` remains informational and cannot authorize settlement.

Run commands (all optionally accept `lang: "en" | "zh"`):

| Command | Arguments / result |
| --- | --- |
| `decision_options` | No arguments; returns `{packs}` with server-issued card `optionId`s |
| `round` | `option_id`, optional `assist_agent_id`, optional distinct `command_ids` (`joint_action`, `tactical_preview`); returns `settlement` plus flat narration, action/executor IDs and post-state `confusion_delta` |
| `rest` | No arguments; canonical recovery/evidence turn |
| `interrogation_options` | `npc_id`; returns `{packs}` |
| `question` | `npc_id`, `question_id`, optional `executor_agent_id`; returns resolution and refreshed `{packs}` |
| `link` | Two distinct `clue_ids` already held by the run |
| `report_options` | No arguments; returns report options directly |
| `report` | `conclusion_id`, `method_id`, `motive_id`, `timeline_id`, unique `evidence_ids` (1–4); returns canonical verdict directly |
| `command` | `command_id: "emergency_stabilize"` |
| `recover` | No arguments; only a crashed run |
| `crisis` | `option_id` from the current mandatory crisis |
| `priority` | `priority_list`: a complete unique permutation of canonical `PRIORITY_ACTIONS` action tags, not zone IDs |
| `abandon` | No arguments; terminates without claiming a successful verdict |

Omit absent assistants rather than submitting `null`; the round executor is derived from the issued card, never asserted by the caller. Public runs include `agent_strategy` and `team_config` (the canonical composed team, stats and effects), `pending_crisis`, `npc_emotions`, `truth_fragments`, and state crash/checkpoint-count fields. Only acquired clue descriptions are projected in `state.revealed_clues`, with default Chinese text and an `en` text object; hidden dictionaries/checkpoint contents remain private. Opening auto-unlock applies once during paid creation, not on reload. Statuses are `active`, `completed`, `failed`, `abandoned`, and `settled`.

Syntactically valid rule/business rejections are HTTP 200 with immutable `result.error`, preserve gameplay state and advance run revision once. HTTP 400 syntax errors are not accepted commands. Run CAS conflicts use `STALE_RUN`; ledger replay precedes `RUN_SETTLED`, so an accepted final action remains replayable after reward settlement.

Settlement accepts only an owned paid run that the server reducer has completed or abandoned. It computes rank, XP, failure, clue/pass totals and profile achievements from that stored run, commits the reward and settlement marker together, and releases the active-run slot. The result includes canonical `summary` and `xp_breakdown`. Leaving an unfinished case requires an acknowledged run `abandon` command followed by `settle_case`; neither client exit nor a locally fabricated summary releases/awards the run. Persist pending intents across network failure so this sequence can be retried.

## Durability and conflicts

- Operation IDs are owner-scoped; a canonical sorted-key command SHA-256 binds the ID to its content and base revision. Each ledger stores the exact non-profile result JSON and result revision.
- Every accepted command, including a business rejection (`result.error`), advances its relevant revision once. Malformed commands return HTTP 400; missing owned runs return 404; stale revisions, operation reuse, takeover and terminal-state conflicts return 409. Rejected syntax does not mutate economic state.
- Retrying an identical committed operation returns the identical stored `result` and current authoritative profile/run. Current profile reads may show regenerated energy; the replay result does not change. A lost start result can contain the original run revision while `active_run` supplies the latest state.
- Run commands advance only run revision; profile revision changes on profile commands, including start and settlement. For concurrent profile status responses at equal profile revision, clients must merge the same active run ID by maximum run revision rather than replace it with an older projection.
- CAS gates and all dependent ledger/resource/run writes execute in one D1 batch transaction. Concurrent distinct operations at the same revision cannot both commit. Same-ID duplicates replay once; settlement checks the stored run revision as well as profile revision.
- The verified UID owns every lookup. `session_id` must match the current device claim before both command execution and replay. A takeover rejects the old device without deleting durable history.
- Browser run receipts are keyed by authenticated UID and run ID, not the disposable device claim. Reload/reclaim substitutes only the current `session_id` on the wire; the original operation ID, base revision and command remain immutable. Secure-context Web Locks serialize same-owner/run journal access across tabs, and write/delete readback failures stop gameplay with explicit recovery feedback. Use a modern browser with Web Locks over HTTPS (or localhost). Unreleased unowned v1 development receipts are not automatically migrated.
- Requests are bounded to 32 KiB; serialized profile, run and result records to 512 KiB. Oversized histories fail closed rather than silently dropping reward/idempotency markers. This is a compatibility limit for exceptionally long-lived runs/accounts, not a reset mechanism.

## Local verification

Backend authority regressions use Node's built-in SQLite against in-memory databases initialized from checked-in migrations, not production D1 or Firebase accounts:

```bash
node --test tests/cloudflare*.test.js tests/authoritative*.test.js
```

The suite covers forged patches/summaries, once-only initialization, canonical purchases/check-in, ownership/takeover, profile/run CAS and duplicate replay, paid-run proof, immutable business rejection and atomic settlement. A deterministic paid playthrough uses only public options and intent commands through real SQLite handlers to reach a successful report and replayable reward; its UUID is fixed only by the local test, never supplied through the API. Separate stored-state fixtures exercise edge cases. No production migration, deployment, production write or remote exploitation is part of verification.

An integrated local Chrome check also exercised the real ProfileProvider, terminal/theater UI and Worker profile/run handlers against migrated in-memory SQLite. It verified a paid start, a question committed before its response was lost, reload with a new device claim, same-operation replay with one stamina charge and the restored answer, a server-resolved round, Home suspension/resume without a second charge, and abandonment/settlement. A lost settlement response recovered with the same operation and awarded XP once; settled rows remained stored and the active slot was released. The fixture replaced only authentication with a fixed verified local identity and blocked unrelated API routes; this does not validate live Firebase, production D1, or real multi-device networking.
