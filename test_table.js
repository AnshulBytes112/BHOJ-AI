const { Client } = require('pg');
require('dotenv').config({path: 'apps/api/.env'});
const c = new Client(process.env.DATABASE_URL);
c.connect().then(() => 
  c.query(`SELECT isp.schedule_id, i.name, isp.price FROM item_schedule_prices isp JOIN items i ON i.id = isp.item_id WHERE isp.schedule_id = '6d265225-1297-4098-8c59-344b56e6d8f1'`)
).then(r => console.log(r.rows)).catch(console.error).finally(() => c.end());
