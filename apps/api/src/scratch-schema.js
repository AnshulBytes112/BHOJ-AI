const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => {
  return client.query(`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE column_name IN ('tenant_id', 'outlet_id')
    AND table_schema = 'public'
    ORDER BY table_name, column_name;
  `);
}).then(res => {
  console.log(JSON.stringify(res.rows, null, 2));
  client.end();
}).catch(err => {
  console.error(err);
  client.end();
});
