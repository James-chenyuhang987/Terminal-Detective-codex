-- Intentional one-time reset for the Firebase UID rollout.
-- Do not apply this migration until Firebase Auth and the dedicated GitHub
-- provider have been configured and the production reset is explicitly approved.
PRAGMA foreign_keys = ON;

DELETE FROM sessions;
DELETE FROM oauth_accounts;
DELETE FROM profiles;
DELETE FROM users;
