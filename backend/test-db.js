// backend/test-db.js
// Run this file to test database connection: node backend/test-db.js
require('dotenv').config();
const db = require('./config/database');

async function testDatabase() {
    console.log('🔄 Testing database connection...');
    
    try {
        // Test connection
        const connected = await db.testConnection();
        
        if (connected) {
            // Run a simple query
            const result = await db.query('SELECT version() as postgres_version');
            console.log('📦 PostgreSQL version:', result.rows[0].postgres_version);
            
            // List all tables (if any)
            const tables = await db.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            
            if (tables.rows.length > 0) {
                console.log('📋 Existing tables:', tables.rows.map(t => t.table_name).join(', '));
            } else {
                console.log('📋 No tables found yet - ready for schema creation');
            }
            
            console.log('\n✅ Database test successful!');
        }
    } catch (error) {
        console.error('❌ Database test failed:', error);
    } finally {
        process.exit();
    }
}

testDatabase();
