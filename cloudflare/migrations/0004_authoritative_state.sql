PRAGMA foreign_keys = ON;

-- Additive rollout: existing profile data and operation history remain intact.
ALTER TABLE profiles ADD COLUMN authority_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile_operations ADD COLUMN result_json TEXT;

CREATE TABLE player_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_operation_id TEXT NOT NULL,
  run_json TEXT NOT NULL,
  run_revision INTEGER NOT NULL DEFAULT 0 CHECK (run_revision >= 0),
  settled INTEGER NOT NULL DEFAULT 0 CHECK (settled IN (0, 1)),
  settlement_operation_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, start_operation_id),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, start_operation_id)
    REFERENCES profile_operations(user_id, operation_id)
);
CREATE UNIQUE INDEX idx_player_runs_active ON player_runs(user_id) WHERE settled = 0;

CREATE TABLE run_operations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  result_revision INTEGER NOT NULL CHECK (result_revision = base_revision + 1),
  command_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, operation_id),
  FOREIGN KEY (user_id, run_id) REFERENCES player_runs(user_id, id)
);
