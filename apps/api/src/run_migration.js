const { Client } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set!");
  process.exit(1);
}

console.log("Connecting to Database...");
const client = new Client({ connectionString });

async function run() {
  await client.connect();
  console.log("Connected. Creating item_addons table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS item_addons (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  
  console.log("Adding columns to order_items, kot_items, and section_kot_items...");
  await client.query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS extras TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
  `);

  await client.query(`
    ALTER TABLE kot_items
      ADD COLUMN IF NOT EXISTS extras TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
  `);

  await client.query(`
    ALTER TABLE section_kot_items
      ADD COLUMN IF NOT EXISTS extras TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
  `);

  console.log("Migration finished successfully!");
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
