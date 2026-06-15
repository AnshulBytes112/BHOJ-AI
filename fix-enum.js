require('dotenv').config({path: 'apps/api/.env'});
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function fix() {
  await client.connect();
  try {
    await client.query("ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'cancelled'");
    console.log("Added cancelled to order_status_enum");
  } catch (e) { console.error(e.message); }
  
  try {
    const res = await client.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'order_status_enum'");
    console.log("Values:", res.rows);
  } catch (e) { console.error(e.message); }
  
  process.exit(0);
}
fix();
