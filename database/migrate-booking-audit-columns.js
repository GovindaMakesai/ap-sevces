// database/migrate-booking-audit-columns.js
// Adds booking audit/timestamp columns in an idempotent way.
require('dotenv').config();
const db = require('../backend/config/database');

async function runMigration() {
    console.log('🔄 Running booking audit columns migration...');
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE bookings
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP
        `);

        await client.query(`
            ALTER TABLE bookings
            ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP
        `);

        await client.query(`
            ALTER TABLE bookings
            ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_completed_at ON bookings(completed_at)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_at ON bookings(cancelled_at)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_by ON bookings(cancelled_by)
        `);

        await client.query('COMMIT');
        console.log('✅ Booking audit columns migration completed');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Booking audit migration failed:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await db.pool.end();
    }
}

runMigration();
