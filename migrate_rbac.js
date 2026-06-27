const { Client } = require('pg');
require('dotenv').config({path: 'apps/api/.env'});

async function run() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating permissions and role_permissions tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role VARCHAR NOT NULL,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        UNIQUE(role, permission_id)
      );
    `);

    console.log('Inserting seed permissions...');
    const permissions = [
      'MENU_VIEW', 'MENU_CREATE', 'MENU_UPDATE', 'MENU_DELETE',
      'ORDER_CREATE', 'ORDER_VIEW', 'ORDER_UPDATE', 'ORDER_CANCEL',
      'BILL_GENERATE', 'PAYMENT_CREATE', 'PAYMENT_VIEW',
      'TABLE_VIEW', 'TABLE_MANAGE',
      'REPORT_VIEW', 'REPORT_EXPORT',
      'STAFF_VIEW', 'STAFF_CREATE', 'STAFF_UPDATE', 'STAFF_DELETE',
      'SETTINGS_VIEW', 'SETTINGS_UPDATE',
      'OUTLET_VIEW', 'OUTLET_MANAGE'
    ];

    for (const perm of permissions) {
      await client.query(`
        INSERT INTO permissions (name) VALUES ($1)
        ON CONFLICT (name) DO NOTHING;
      `, [perm]);
    }

    console.log('Assigning permissions to roles...');
    // STAFF (Waiters, Cashiers)
    const staffPerms = ['ORDER_CREATE', 'ORDER_VIEW', 'TABLE_VIEW', 'MENU_VIEW'];
    // MANAGER
    const managerPerms = [...staffPerms, 'MENU_CREATE', 'MENU_UPDATE', 'ORDER_UPDATE', 'ORDER_CANCEL', 'BILL_GENERATE', 'PAYMENT_CREATE', 'PAYMENT_VIEW', 'TABLE_MANAGE', 'REPORT_VIEW', 'STAFF_VIEW', 'OUTLET_VIEW'];
    // ADMIN (Hotel Admin)
    const adminPerms = [...managerPerms, 'MENU_DELETE', 'REPORT_EXPORT', 'STAFF_CREATE', 'STAFF_UPDATE', 'STAFF_DELETE', 'SETTINGS_VIEW', 'SETTINGS_UPDATE', 'OUTLET_MANAGE'];

    const roleMap = {
      'STAFF': staffPerms,
      'MANAGER': managerPerms,
      'ADMIN': adminPerms,
      'SUPERADMIN': adminPerms // SuperAdmins get everything Admin gets plus they are checked separately
    };

    for (const [role, perms] of Object.entries(roleMap)) {
      for (const perm of perms) {
        await client.query(`
          INSERT INTO role_permissions (role, permission_id)
          SELECT $1, id FROM permissions WHERE name = $2
          ON CONFLICT (role, permission_id) DO NOTHING;
        `, [role, perm]);
      }
    }

    console.log('Committing transaction...');
    await client.query('COMMIT');
    console.log('Database Phase 2 Migration Complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
