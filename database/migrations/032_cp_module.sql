-- CP (Couple) module: support points, invitations, relationships, ring inventory

CREATE TABLE IF NOT EXISTS user_cp_support (
  user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_user_cp_support_points ON user_cp_support (points DESC);

CREATE TABLE IF NOT EXISTS cp_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ring_id VARCHAR(48) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_cp_relationships_user_a ON cp_relationships (user_a) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_cp_relationships_user_b ON cp_relationships (user_b) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS cp_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ring_id VARCHAR(48) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cp_invitations_to_pending
  ON cp_invitations (to_user_id, status) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS cp_user_rings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ring_id VARCHAR(48) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, ring_id)
);

CREATE TABLE IF NOT EXISTS cp_invite_cooldowns (
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  until_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (from_user_id, to_user_id)
);
