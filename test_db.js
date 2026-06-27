const { Client } = require('pg');
require('dotenv').config({path: 'apps/api/.env'});
const c = new Client(process.env.DATABASE_URL);
c.connect().then(() => 
  c.query(`SELECT i.id, i.name, COALESCE(CASE WHEN $1::uuid IS NOT NULL THEN izp.price ELSE NULL END, CASE WHEN $2::uuid IS NOT NULL THEN isp.price ELSE NULL END, i.selling_price) as effective_price FROM items i LEFT JOIN item_zone_prices izp ON izp.item_id = i.id AND izp.zone_id = $1::uuid LEFT JOIN item_schedule_prices isp ON isp.item_id = i.id AND isp.schedule_id = $2::uuid ORDER BY i.id ASC LIMIT 5`, ['ea6e2443-da1d-4aab-b7bc-bb6a1bbd358c', null])
).then(r => console.log(r.rows)).catch(console.error).finally(() => c.end());
