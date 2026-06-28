const { Client } = require('pg');
require('dotenv').config({path: 'apps/api/.env'});

async function run() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    console.log('Fetching business tables...');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('tenants', 'schema_migrations', 'idempotency_keys', 'permissions', 'role_permissions', 'outlets')
    `);

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      console.log(`Enabling RLS on ${tableName}...`);

      try {
        await client.query(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
        await client.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON ${tableName};`);

        // Check if outlet_id exists
        const colsRes = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = 'outlet_id'
        `, [tableName]);

        let policyCondition = `tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant_id', true), ''), '1')::integer`;
        
        if (colsRes.rows.length > 0) {
          policyCondition += ` AND (outlet_id IS NULL OR outlet_id = COALESCE(NULLIF(current_setting('app.current_outlet_id', true), ''), '1')::integer)`;
        }

        await client.query(`
          CREATE POLICY tenant_isolation_policy ON ${tableName}
          FOR ALL
          USING (${policyCondition});
        `);

        await client.query(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;`);
        console.log(`Success for ${tableName}`);
      } catch (e) {
        console.error(`Error enabling RLS for ${tableName}:`, e.message);
      }
    }

    console.log('Database Phase 4 & 5 RLS Migration Complete.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
