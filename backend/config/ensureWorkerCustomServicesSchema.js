const db = require('./database');

let ready = false;

async function ensureWorkerCustomServicesSchema() {
  if (ready) return;
  await db.query(`
    ALTER TABLE services
      ADD COLUMN IF NOT EXISTS image_url TEXT
  `);
  await db.query(`
    ALTER TABLE services
      ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false
  `);
  await db.query(`
    ALTER TABLE services
      ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS worker_service_images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      position SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_worker_service_images_ws
      ON worker_service_images (worker_id, service_id, position)
  `);
  ready = true;
}

module.exports = { ensureWorkerCustomServicesSchema };
