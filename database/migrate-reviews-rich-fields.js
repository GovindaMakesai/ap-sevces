// database/migrate-reviews-rich-fields.js
// Adds optional rich-review fields in an idempotent migration.
require('dotenv').config();
const db = require('../backend/config/database');

async function runMigration() {
    console.log('🔄 Running reviews rich-fields migration...');
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS title VARCHAR(255)
        `);

        await client.query(`
            ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT ARRAY[]::TEXT[]
        `);

        await client.query(`
            ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0
        `);

        await client.query(`
            UPDATE reviews
            SET images = ARRAY[]::TEXT[]
            WHERE images IS NULL
        `);

        await client.query(`
            UPDATE reviews
            SET helpful_count = 0
            WHERE helpful_count IS NULL
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_helpful_count ON reviews(helpful_count DESC)
        `);

        await client.query('COMMIT');
        console.log('✅ Reviews rich-fields migration completed');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Reviews migration failed:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await db.pool.end();
    }
}

runMigration();
