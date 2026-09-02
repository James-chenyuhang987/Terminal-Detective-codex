PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profile_operations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  result_revision INTEGER NOT NULL CHECK (result_revision > base_revision),
  patch_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_operations_created_at
  ON profile_operations(created_at);
