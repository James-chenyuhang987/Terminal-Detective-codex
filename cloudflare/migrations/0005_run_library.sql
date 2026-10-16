-- Preserve every paid run and its operation ledger. Existing accounts retain
-- their formerly unique current run; an explicit null means no selected save.
UPDATE profiles
SET profile_json = json_set(profile_json, '$.active_run_id', (
  SELECT id FROM player_runs
  WHERE player_runs.user_id = profiles.user_id AND settled = 0
  ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1
))
WHERE CASE WHEN json_valid(profile_json)
  THEN json_type(profile_json, '$.active_run_id') IS NULL ELSE 0 END;

DROP INDEX IF EXISTS idx_player_runs_active;
CREATE INDEX idx_player_runs_library ON player_runs(user_id, settled, updated_at DESC);
