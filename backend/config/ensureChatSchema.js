const db = require('./database');

/**
 * On first deploy / empty DB: create chat tables once.
 * After `conversations` exists, does nothing (fast metadata check on every restart).
 * Set SKIP_DB_SCHEMA_ENSURE=true on Render to disable entirely.
 */
async function ensureChatSchema() {
    if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') {
        console.log('⏭️  SKIP_DB_SCHEMA_ENSURE set — skipping chat schema check');
        return;
    }

    try {
        const usersOk = await db.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'users'
            LIMIT 1
        `);
        if (usersOk.rows.length === 0) {
            console.warn('⚠️  No public.users table — run full schema first (npm run db:schema). Skipping chat auto-migrate.');
            return;
        }

        const exists = await db.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'conversations'
            LIMIT 1
        `);
        if (exists.rows.length > 0) {
            return;
        }

        console.log('📎 Chat tables missing — creating now (one-time on this database)...');

        await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        await db.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_low UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                user_high UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                last_message_text TEXT DEFAULT '',
                last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_low, user_high)
            )
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_user_low ON conversations(user_low)
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_user_high ON conversations(user_high)
        `);
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC)
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at)
        `);

        console.log('✅ Chat tables created');
    } catch (error) {
        console.error('❌ ensureChatSchema failed:', error.message);
    }
}

module.exports = { ensureChatSchema };
