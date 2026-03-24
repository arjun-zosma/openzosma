-- user_sandboxes: maps each user to their persistent OpenShell sandbox.
-- One sandbox per user. The sandbox is their isolated environment where
-- pi-coding-agent runs as their digital twin.
CREATE TABLE user_sandboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  sandbox_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'creating',
  policy_template TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Each user has exactly one sandbox
CREATE UNIQUE INDEX idx_user_sandboxes_user_id ON user_sandboxes(user_id);
CREATE INDEX idx_user_sandboxes_status ON user_sandboxes(status);
CREATE INDEX idx_user_sandboxes_sandbox_name ON user_sandboxes(sandbox_name);
