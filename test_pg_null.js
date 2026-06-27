const { Client } = require('pg');
require('dotenv').config({path: 'apps/api/.env'});
const c = new Client(process.env.DATABASE_URL);
c.connect().then(() => 
  c.query(`SELECT $1::uuid IS NOT NULL as res`, [null])
).then(r => console.log(r.rows)).catch(console.error).finally(() => c.end());
