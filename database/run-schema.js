// database/run-schema.js
// Run this file to create tables: node database/run-schema.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../backend/config/database');

async function runSchema() {
    console.log('🔄 Running database schema...');
    
    try {
        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Split into individual statements
        const statements = schema
            .split(';')
            .filter(statement => statement.trim().length > 0);
        
        console.log(`📋 Found ${statements.length} SQL statements`);
        
        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            if (statement.length > 0) {
                try {
                    await db.query(statement);
                    console.log(`✅ Executed statement ${i + 1}/${statements.length}`);
                } catch (error) {
                    // Ignore "already exists" errors
                    if (!error.message.includes('already exists')) {
                        console.error(`❌ Error in statement ${i + 1}:`, error.message);
                        console.log('Statement:', statement.substring(0, 100) + '...');
                    } else {
                        console.log(`⏩ Statement ${i + 1}: Table already exists`);
                    }
                }
            }
        }
        
        console.log('\n✅ Database schema completed!');
        
        // Show created tables
        const tables = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        console.log('\n📊 Tables in database:');
        tables.rows.forEach(table => {
            console.log(`   - ${table.table_name}`);
        });
        
    } catch (error) {
        console.error('❌ Schema execution failed:', error);
    } finally {
        process.exit();
    }
}

runSchema();
