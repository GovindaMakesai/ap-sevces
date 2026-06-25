-- Role applications: Host (creator) and Coin Seller onboarding

CREATE TABLE IF NOT EXISTS role_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type VARCHAR(32) NOT NULL CHECK (role_type IN ('creator', 'coin_seller')),
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT,
  contact_phone VARCHAR(20),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_applications_user ON role_applications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_applications_pending ON role_applications(status, created_at ASC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_applications_user_pending
  ON role_applications(user_id, role_type)
  WHERE status = 'pending';
