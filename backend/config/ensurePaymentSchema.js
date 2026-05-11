const db = require('./database');

/**
 * Adds manual QR payment review columns to existing deployments.
 * Full fresh databases still get the same shape from database/schema.sql.
 */
async function ensurePaymentSchema() {
    if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') {
        console.log('⏭️  SKIP_DB_SCHEMA_ENSURE set — skipping payment schema check');
        return;
    }

    try {
        const bookingsOk = await db.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'bookings'
            LIMIT 1
        `);
        if (bookingsOk.rows.length === 0) {
            console.warn('⚠️  No public.bookings table — run full schema first. Skipping payment auto-migrate.');
            return;
        }

        await db.query(`
            ALTER TABLE bookings
            ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
            ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120),
            ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS payment_reviewed_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS payment_reviewed_by UUID REFERENCES users(id),
            ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT
        `);

        await db.query(`
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_status_check
        `);
        await db.query(`
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_status_check
            CHECK (status IN ('payment_review', 'pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'))
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status)
        `);

        console.log('✅ Payment review schema ready');
    } catch (error) {
        console.error('❌ ensurePaymentSchema failed:', error.message);
    }
}

module.exports = { ensurePaymentSchema };
