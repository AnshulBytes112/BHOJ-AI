const { Client } = require('pg');
require('dotenv').config({path: 'apps/api/.env'});

async function run() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    console.log('Creating support_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMP
      );
    `);
    
    // Create an index for quick active session lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_active_support_sessions ON support_sessions(admin_id) WHERE is_active = true;
    `);

    console.log('Database Phase 6 Migration Complete.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
