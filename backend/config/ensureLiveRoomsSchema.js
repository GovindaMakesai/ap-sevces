const db = require('./database');

let ready = false;

async function ensureLiveRoomsSchema() {
  if (ready) return;
  await db.query(`
    ALTER TABLE live_rooms
      ADD COLUMN IF NOT EXISTS stream_cover_url TEXT
  `);
  ready = true;
}

module.exports = { ensureLiveRoomsSchema };
