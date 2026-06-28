const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({path: 'apps/api/.env'});

async function run() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating tenants and outlets tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        plan VARCHAR DEFAULT 'FREE',
        status VARCHAR DEFAULT 'ACTIVE',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS outlets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        phone VARCHAR,
        location VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('Inserting default tenant and migrating restaurants to outlets...');
    const res = await client.query(`
      INSERT INTO tenants (id, name, plan) 
      VALUES (1, 'Default Brand', 'ENTERPRISE')
      ON CONFLICT DO NOTHING RETURNING id;
    `);

    // Migrate restaurants to outlets
    await client.query(`
      INSERT INTO outlets (id, tenant_id, name, phone)
      SELECT id, 1, name, phone FROM restaurants
      ON CONFLICT DO NOTHING;
    `);

    // Ensure outlet 1 exists
    await client.query(`
      INSERT INTO outlets (id, tenant_id, name)
      VALUES (1, 1, 'Main Outlet')
      ON CONFLICT DO NOTHING;
    `);

    console.log('Getting all business tables...');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('tenants', 'outlets', 'restaurants', 'idempotency_keys', 'schema_migrations')
    `);

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      console.log(`Processing table: ${tableName}`);
      
      // Add tenant_id
      await client.query(`
        ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
      `);
      
      // Add outlet_id
      await client.query(`
        ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS outlet_id INTEGER;
      `);

      // Add created_by if it doesn't exist and the table isn't users/audit_log
      if (!['users', 'audit_log', 'session_events', 'table_sessions'].includes(tableName)) {
         await client.query(`
          ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS created_by INTEGER;
        `);
      }

      // Update existing rows
      let outletUpdate = '1';
      // If table has restaurant_id, map it to outlet_id
      const colsRes = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'restaurant_id'
      `, [tableName]);
      
      if (colsRes.rows.length > 0) {
        outletUpdate = 'COALESCE(restaurant_id, 1)';
      }

      await client.query(`
        UPDATE ${tableName} 
        SET tenant_id = 1, outlet_id = ${outletUpdate}
        WHERE tenant_id IS NULL;
      `);

      // Make tenant_id NOT NULL
      await client.query(`
        ALTER TABLE ${tableName} ALTER COLUMN tenant_id SET NOT NULL;
      `);

      // Add constraints
      // Using IF NOT EXISTS via DO block to avoid errors if constraint already exists
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${tableName}_tenant_id_fkey'
          ) THEN
            ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
          END IF;
          
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${tableName}_outlet_id_fkey'
          ) THEN
            ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `);
    }

    console.log('Committing transaction...');
    await client.query('COMMIT');
    console.log('Database Phase 1 Migration Complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
