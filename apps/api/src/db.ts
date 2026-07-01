import { Pool, types } from 'pg';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

types.setTypeParser(1114, (value: string) => {
  const normalizedValue = value.trim().replace(' ', 'T');
  return new Date(`${normalizedValue}+05:30`);
});

const envCandidates = [
  path.resolve(process.cwd(), 'apps/api/.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  const hasLegacyUri = Boolean(process.env.DATABASE_URI);
  const hint = hasLegacyUri
    ? 'Found DATABASE_URI, but this API now requires PostgreSQL DATABASE_URL.'
    : 'Set DATABASE_URL in apps/api/.env.';

  throw new Error(`DATABASE_URL is required to start the API. ${hint}`);
}

export const pool = new Pool({
  connectionString,
  options: '-c timezone=Asia/Kolkata',
});

import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: number;
  outletId: number;
  restaurantId?: number; // legacy
}

export const tenantLocalStorage = new AsyncLocalStorage<TenantContext>();

// Proxy query and connect to automatically inject SET app.current_tenant_id
const originalQuery = pool.query.bind(pool);
pool.query = async function (this: any, text: any, params: any, callback: any) {
  const store = tenantLocalStorage.getStore();
  const tenantId = store && store.tenantId != null ? store.tenantId : '';
  const outletId = store && store.outletId != null ? store.outletId : '';

  if (typeof text === 'string') {
    const client = await pool.connect();
    try {
      await client.query(`SET app.current_tenant_id = '${tenantId}'; SET app.current_outlet_id = '${outletId}';`);
      if (typeof params === 'function') {
        return await client.query(text, params);
      }
      return await client.query(text, params || []);
    } finally {
      client.release();
    }
  }

  return originalQuery(text, params, callback);
} as any;

const originalConnect = pool.connect.bind(pool);
pool.connect = async function (this: any) {
  const client = await originalConnect();
  const store = tenantLocalStorage.getStore();
  const tenantId = store && store.tenantId != null ? store.tenantId : '';
  const outletId = store && store.outletId != null ? store.outletId : '';
  try {
    await client.query(`SET app.current_tenant_id = '${tenantId}'; SET app.current_outlet_id = '${outletId}';`);
  } catch (e) {
    console.error('Failed to set context on client connect:', e);
  }
  return client;
} as any;

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR NOT NULL UNIQUE,
      display_name VARCHAR NOT NULL,
      role VARCHAR NOT NULL DEFAULT 'ADMIN',
      pin VARCHAR(10) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pin VARCHAR(10) NULL;
  `);

  // Use a PL/pgSQL DO block to check for tenant_id/outlet_id columns at the DB level.
  // This avoids the race condition where the TypeScript-level check returns the wrong
  // answer (e.g. due to RLS on information_schema or a stale compiled snapshot) and
  // an INSERT without tenant_id hits a NOT NULL constraint that already exists in prod.
  await pool.query(`
    DO $$
    DECLARE
      has_tenant  BOOLEAN;
      has_outlet  BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('users') AND attname = 'tenant_id' AND NOT attisdropped
      ) INTO has_tenant;

      SELECT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('users') AND attname = 'outlet_id' AND NOT attisdropped
      ) INTO has_outlet;

      IF has_tenant AND has_outlet THEN
        INSERT INTO users (username, display_name, role, pin, tenant_id, outlet_id)
        VALUES ('system_admin', 'System Admin', 'ADMIN', '0000', 1, 1)
        ON CONFLICT (username) DO UPDATE SET pin = '0000', role = 'ADMIN', tenant_id = 1, outlet_id = 1;

        INSERT INTO users (username, display_name, role, pin, tenant_id, outlet_id)
        VALUES ('waiter1', 'John Waiter', 'STAFF', '1234', 1, 1)
        ON CONFLICT (username) DO UPDATE SET pin = '1234', role = 'STAFF', tenant_id = 1, outlet_id = 1;
      ELSIF has_tenant THEN
        INSERT INTO users (username, display_name, role, pin, tenant_id)
        VALUES ('system_admin', 'System Admin', 'ADMIN', '0000', 1)
        ON CONFLICT (username) DO UPDATE SET pin = '0000', role = 'ADMIN', tenant_id = 1;

        INSERT INTO users (username, display_name, role, pin, tenant_id)
        VALUES ('waiter1', 'John Waiter', 'STAFF', '1234', 1)
        ON CONFLICT (username) DO UPDATE SET pin = '1234', role = 'STAFF', tenant_id = 1;
      ELSE
        INSERT INTO users (username, display_name, role, pin)
        VALUES ('system_admin', 'System Admin', 'ADMIN', '0000')
        ON CONFLICT (username) DO UPDATE SET pin = '0000', role = 'ADMIN';

        INSERT INTO users (username, display_name, role, pin)
        VALUES ('waiter1', 'John Waiter', 'STAFF', '1234')
        ON CONFLICT (username) DO UPDATE SET pin = '1234', role = 'STAFF';
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_type') THEN
        CREATE TYPE stock_type AS ENUM ('limited', 'unlimited');
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      serial_number UUID NOT NULL UNIQUE,
      name VARCHAR NOT NULL,
      selling_price NUMERIC(10,2) NOT NULL,
      category VARCHAR NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      stock_type stock_type NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
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

  await pool.query(`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE items
    ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gst_config (
      id SERIAL PRIMARY KEY,
      label VARCHAR NOT NULL,
      category VARCHAR NOT NULL,
      gst_percentage NUMERIC(5,2) NOT NULL CHECK (gst_percentage >= 0),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE gst_config ADD COLUMN IF NOT EXISTS label VARCHAR;
  `);

  await pool.query(`
    UPDATE gst_config SET label = category WHERE label IS NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gst_config' AND column_name='gst_rate') THEN
        ALTER TABLE gst_config RENAME COLUMN gst_rate TO gst_percentage;
      END IF;
    END
    $$;
  `);

  // Ensure unique constraint on gst_config to prevent duplicates from repeated server restarts
  await pool.query(`
    ALTER TABLE gst_config
      ADD COLUMN IF NOT EXISTS restaurant_id INTEGER;
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_gst_category_restaurant' AND conrelid = 'gst_config'::regclass
      ) THEN
        -- Delete duplicates first, keeping lowest id per (category, restaurant_id)
        DELETE FROM gst_config a
        USING gst_config b
        WHERE a.id > b.id
          AND a.category = b.category
          AND COALESCE(a.restaurant_id, 1) = COALESCE(b.restaurant_id, 1);

        ALTER TABLE gst_config
          ADD CONSTRAINT unique_gst_category_restaurant UNIQUE (category, restaurant_id);
      END IF;
    END
    $$;
  `);

  // Seed gst_config per-restaurant from categories, respecting the unique constraint
  const gstColumnsRes = await pool.query(`
    SELECT attname AS column_name 
    FROM pg_attribute 
    WHERE attrelid = to_regclass('gst_config') AND attname = 'tenant_id' AND NOT attisdropped
  `);
  const gstHasTenantId = gstColumnsRes.rows.length > 0;

  if (gstHasTenantId) {
    await pool.query(`
      INSERT INTO gst_config (label, category, gst_percentage, restaurant_id, tenant_id, outlet_id)
      SELECT c.name, c.name, 5.00, c.restaurant_id, COALESCE(c.tenant_id, 1), COALESCE(c.outlet_id, 1)
      FROM categories c
      ON CONFLICT (category, restaurant_id) DO NOTHING;
    `);
  } else {
    await pool.query(`
      INSERT INTO gst_config (label, category, gst_percentage, restaurant_id)
      SELECT c.name, c.name, 5.00, c.restaurant_id
      FROM categories c
      ON CONFLICT (category, restaurant_id) DO NOTHING;
    `);
  }

  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS bill_serial_number_seq START 1001;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id SERIAL PRIMARY KEY,
      bill_serial_number INTEGER NOT NULL UNIQUE DEFAULT nextval('bill_serial_number_seq'),
      cashier_id INTEGER NOT NULL REFERENCES users(id),
      subtotal NUMERIC(10,2) NOT NULL,
      gst_total NUMERIC(10,2) NOT NULL,
      grand_total NUMERIC(10,2) NOT NULL,
      status VARCHAR NOT NULL CHECK (status IN ('draft', 'completed', 'printed')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_items (
      id SERIAL PRIMARY KEY,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      item_name VARCHAR NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(10,2) NOT NULL,
      gst_rate NUMERIC(5,2) NOT NULL,
      gst_amount NUMERIC(10,2) NOT NULL,
      line_total NUMERIC(10,2) NOT NULL
    );
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS set_items_updated_at ON items;
    CREATE TRIGGER set_items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS set_categories_updated_at ON categories;
    CREATE TRIGGER set_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS set_gst_config_updated_at ON gst_config;
    CREATE TRIGGER set_gst_config_updated_at
    BEFORE UPDATE ON gst_config
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_items_is_active ON items(is_active);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_gst_config_category ON gst_config(category);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at);');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipt_layout (
      id SERIAL PRIMARY KEY,
      logo_url TEXT,
      header_text TEXT,
      footer_text TEXT,
      show_gst_breakdown BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const receiptColumnsRes = await pool.query(`
    SELECT attname AS column_name 
    FROM pg_attribute 
    WHERE attrelid = to_regclass('receipt_layout') AND attname = 'tenant_id' AND NOT attisdropped
  `);
  const receiptHasTenantId = receiptColumnsRes.rows.length > 0;

  if (receiptHasTenantId) {
    await pool.query(`
      INSERT INTO receipt_layout (header_text, footer_text, tenant_id, outlet_id)
      SELECT 'RestroManager Hotel', 'Thank you for visiting! Come again.', 1, 1
      WHERE NOT EXISTS (SELECT 1 FROM receipt_layout);
    `);
  } else {
    await pool.query(`
      INSERT INTO receipt_layout (header_text, footer_text)
      SELECT 'RestroManager Hotel', 'Thank you for visiting! Come again.'
      WHERE NOT EXISTS (SELECT 1 FROM receipt_layout);
    `);
  }

  await pool.query('CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);');

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'table_status_enum') THEN
        CREATE TYPE table_status_enum AS ENUM ('free', 'occupied', 'billed');
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tables (
      table_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_number VARCHAR NOT NULL UNIQUE,
      status table_status_enum NOT NULL DEFAULT 'free',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction block in PostgreSQL.
  // It must be run as a standalone statement outside DO $$ ... $$.
  try {
    await pool.query(`ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'completed'`);
    console.log('order_status_enum: completed value ensured');
  } catch (e: any) {
    console.warn('order_status_enum ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'preparing'`);
    console.log('order_status_enum: preparing value ensured');
  } catch (e: any) {
    console.warn('order_status_enum preparing ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'ready'`);
    console.log('order_status_enum: ready value ensured');
  } catch (e: any) {
    console.warn('order_status_enum ready ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'cancelled'`);
    console.log('order_status_enum: cancelled value ensured');
  } catch (e: any) {
    console.warn('order_status_enum cancelled ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'sent_to_kitchen'`);
    console.log('order_status_enum: sent_to_kitchen value ensured');
  } catch (e: any) {
    console.warn('order_status_enum sent_to_kitchen ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE kot_status ADD VALUE IF NOT EXISTS 'completed'`);
    console.log('kot_status: completed value ensured');
  } catch (e: any) {
    console.warn('kot_status ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE kot_status ADD VALUE IF NOT EXISTS 'ready'`);
    console.log('kot_status: ready value ensured');
  } catch (e: any) {
    console.warn('kot_status ready ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE kot_status ADD VALUE IF NOT EXISTS 'served'`);
    console.log('kot_status: served value ensured');
  } catch (e: any) {
    console.warn('kot_status served ALTER skipped:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE kot_status ADD VALUE IF NOT EXISTS 'cancelled'`);
    console.log('kot_status: cancelled value ensured');
  } catch (e: any) {
    console.warn('kot_status cancelled ALTER skipped:', e.message);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id UUID NOT NULL REFERENCES tables(table_id) ON DELETE RESTRICT,
      order_phase INTEGER NOT NULL,
      status order_status_enum NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(table_id, order_phase)
    );
  `);

  await pool.query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS order_serial_number_seq START 1;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      price_at_billing DECIMAL(10,2) NOT NULL,
      gst_percent_at_billing DECIMAL(5,2) NOT NULL DEFAULT 0,
      billing_status VARCHAR NOT NULL DEFAULT 'UNBILLED'
        CHECK (billing_status IN ('UNBILLED','BILLED')),
      serial_number SERIAL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kot_status') THEN
        CREATE TYPE kot_status AS ENUM ('pending', 'acknowledged', 'completed', 'ready', 'served', 'cancelled');
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS kots (
      kot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID REFERENCES orders(order_id) ON DELETE CASCADE,
      table_id UUID REFERENCES tables(table_id) ON DELETE CASCADE,
      table_number VARCHAR(50) NOT NULL,
      order_phase INTEGER NOT NULL,
      kot_number VARCHAR(50) NOT NULL UNIQUE,
      status kot_status DEFAULT 'pending',
      generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS kot_items (
      kot_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kot_id UUID REFERENCES kots(kot_id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      item_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      serial_number UUID
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sections (
      section_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS item_section_mapping (
      mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      section_id UUID REFERENCES sections(section_id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_id, section_id)
    );

    CREATE TABLE IF NOT EXISTS section_kots (
      section_kot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_kot_id UUID REFERENCES kots(kot_id) ON DELETE CASCADE,
      section_id UUID REFERENCES sections(section_id) ON DELETE SET NULL,
      section_name VARCHAR(255),
      section_kot_number VARCHAR(100) UNIQUE NOT NULL,
      status kot_status DEFAULT 'pending',
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS section_kot_items (
      section_kot_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      section_kot_id UUID REFERENCES section_kots(section_kot_id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      item_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL,
      serial_number UUID
    );
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS set_tables_updated_at ON tables;
    CREATE TRIGGER set_tables_updated_at
    BEFORE UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);

  // ── Seed default kitchen sections ──
  const sectionsColumnsRes = await pool.query(`
    SELECT attname AS column_name 
    FROM pg_attribute 
    WHERE attrelid = to_regclass('sections') AND attname = 'tenant_id' AND NOT attisdropped
  `);
  const sectionsHasTenantId = sectionsColumnsRes.rows.length > 0;

  if (sectionsHasTenantId) {
    await pool.query(`
      INSERT INTO sections (section_name, description, is_active, tenant_id, outlet_id) VALUES
        ('Kitchen', 'Main kitchen section for food items', true, 1, 1),
        ('Bar', 'Bar section for alcoholic and mixed drinks', true, 1, 1),
        ('Ice Cream', 'Ice cream and dessert counter', true, 1, 1),
        ('Beverage', 'Non-alcoholic beverages, coffee, and juices', true, 1, 1)
      ON CONFLICT (section_name) DO NOTHING;
    `);
  } else {
    await pool.query(`
      INSERT INTO sections (section_name, description, is_active) VALUES
        ('Kitchen', 'Main kitchen section for food items', true),
        ('Bar', 'Bar section for alcoholic and mixed drinks', true),
        ('Ice Cream', 'Ice cream and dessert counter', true),
        ('Beverage', 'Non-alcoholic beverages, coffee, and juices', true)
      ON CONFLICT (section_name) DO NOTHING;
    `);
  }

  // ── Seed default POS categories (used by KOT dashboard) ──
  try {
    const categoriesColumnsRes = await pool.query(`
      SELECT attname AS column_name 
      FROM pg_attribute 
      WHERE attrelid = to_regclass('categories') AND attname = 'tenant_id' AND NOT attisdropped
    `);
    const categoriesHasTenantId = categoriesColumnsRes.rows.length > 0;

    let seedResult;
    if (categoriesHasTenantId) {
      seedResult = await pool.query(`
        INSERT INTO categories (name, is_active, tenant_id, outlet_id) VALUES
          ('Main Course', true, 1, 1),
          ('Starters', true, 1, 1),
          ('Beverages', true, 1, 1),
          ('Sweets', true, 1, 1)
        ON CONFLICT (name) DO NOTHING;
      `);
    } else {
      seedResult = await pool.query(`
        INSERT INTO categories (name, is_active) VALUES
          ('Main Course', true),
          ('Starters', true),
          ('Beverages', true),
          ('Sweets', true)
        ON CONFLICT (name) DO NOTHING;
      `);
    }
    console.log('Categories seed completed, rows affected:', seedResult.rowCount);
    
    // Verify categories exist
    const catCheck = await pool.query('SELECT name FROM categories WHERE is_active = true');
    console.log('Active categories:', catCheck.rows.map((r: any) => r.name));
  } catch (catErr) {
    console.error('Failed to seed categories:', catErr);
  }

  // ── Seed item section mappings ──
  await pool.query(`
    INSERT INTO item_section_mapping (item_id, section_id)
    SELECT i.id, s.section_id
    FROM items i
    CROSS JOIN (SELECT section_id FROM sections WHERE section_name = 'Kitchen' LIMIT 1) s
    WHERE NOT EXISTS (
      SELECT 1 FROM item_section_mapping m WHERE m.item_id = i.id
    );
  `);

  // Migrate kot_items/section_kot_items serial_number to UUID
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'kot_items'
          AND column_name = 'serial_number'
          AND data_type = 'integer'
      ) THEN
        ALTER TABLE kot_items ALTER COLUMN serial_number TYPE UUID USING NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'section_kot_items'
          AND column_name = 'serial_number'
          AND data_type = 'integer'
      ) THEN
        ALTER TABLE section_kot_items ALTER COLUMN serial_number TYPE UUID USING NULL;
      END IF;
    END $$;
  `);



  // ─────────────────────────────────────────────────────────────────────────
  // TABLE MANAGEMENT WORKFLOW — Schema Migrations
  // ─────────────────────────────────────────────────────────────────────────

  // 1. Expand table_status_enum with new lifecycle states.
  //    ALTER TYPE ADD VALUE must run OUTSIDE a DO $$ block.
  const newTableStatuses = [
    'billing_done',
    'waiting_for_service_completion',
    'ready_to_free',
  ];
  for (const val of newTableStatuses) {
    try {
      await pool.query(`ALTER TYPE table_status_enum ADD VALUE IF NOT EXISTS '${val}'`);
      console.log(`table_status_enum: '${val}' ensured`);
    } catch (e: any) {
      console.warn(`table_status_enum '${val}' ALTER skipped:`, e.message);
    }
  }

  // 2. Add extra tracking columns to the tables table.
  await pool.query(`
    ALTER TABLE tables
      ADD COLUMN IF NOT EXISTS occupied_since     TIMESTAMP,
      ADD COLUMN IF NOT EXISTS active_item_count  INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_bill_paid       BOOLEAN NOT NULL DEFAULT false;
  `);

  // 3. Add a payment_status column to the bills table so we can track PAID/UNPAID
  //    independently from the print status (draft/completed/printed).
  await pool.query(`
    ALTER TABLE bills
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'paid')),
      ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(table_id) ON DELETE SET NULL;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bills_table_id ON bills(table_id);`);

  // 3b. Add billing status to order_items for incremental billing.
  await pool.query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS billing_status VARCHAR NOT NULL DEFAULT 'UNBILLED'
        CHECK (billing_status IN ('UNBILLED','BILLED'));
  `);

  // 4. Add per-item status tracking to kot_items (main KOT items table).
  //    Using VARCHAR so we never hit enum-migration headaches.
  await pool.query(`
    ALTER TABLE kot_items
      ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','preparing','ready','served','cancelled','packed','delivered','recook_requested'));
  `);

  // 5. Add per-item status tracking to section_kot_items (section-level items).
  await pool.query(`
    ALTER TABLE section_kot_items
      ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','preparing','ready','served','cancelled','packed','delivered','recook_requested'));
  `);

  // Ensure correct check constraint on kot_items status
  try {
    // Add 'preparing' to kot_status ENUM if it doesn't exist
    await pool.query(`ALTER TYPE kot_status ADD VALUE IF NOT EXISTS 'preparing'`);

    // Migrate any existing 'acknowledged' statuses to 'preparing' to avoid constraint violations
    await pool.query(`UPDATE kot_items SET status = 'preparing' WHERE status = 'acknowledged'`);
    await pool.query(`UPDATE section_kot_items SET status = 'preparing' WHERE status = 'acknowledged'`);
    await pool.query(`UPDATE kots SET status = 'preparing' WHERE status = 'acknowledged'`);
    await pool.query(`UPDATE section_kots SET status = 'preparing' WHERE status = 'acknowledged'`);

    await pool.query(`ALTER TABLE kot_items DROP CONSTRAINT IF EXISTS kot_items_status_check;`);
    await pool.query(`
      ALTER TABLE kot_items
        ADD CONSTRAINT kot_items_status_check
        CHECK (status IN ('pending','preparing','ready','served','cancelled','packed','delivered','recook_requested'));
    `);
  } catch (e: any) {
    console.warn('Failed to rebuild kot_items_status_check constraint:', e.message);
  }

  // Ensure correct check constraint on section_kot_items status
  try {
    await pool.query(`ALTER TABLE section_kot_items DROP CONSTRAINT IF EXISTS section_kot_items_status_check;`);
    await pool.query(`
      ALTER TABLE section_kot_items
        ADD CONSTRAINT section_kot_items_status_check
        CHECK (status IN ('pending','preparing','ready','served','cancelled','packed','delivered','recook_requested'));
    `);
    } catch (e: any) {
      if (!e.message.includes('already exists')) {
        console.warn('Failed to rebuild section_kot_items_status_check constraint:', e.message);
      }
    }

  // 5b. Add extras and spice_level to order_items, kot_items, and section_kot_items.
  await pool.query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS extras TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
  `);

  await pool.query(`
    ALTER TABLE kot_items
      ADD COLUMN IF NOT EXISTS extras TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
  `);

  await pool.query(`
    ALTER TABLE section_kot_items
      ADD COLUMN IF NOT EXISTS extras TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS spice_level VARCHAR(50);
  `);

  // 6. Audit log table — tracks all critical lifecycle events.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      audit_id   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      action     VARCHAR NOT NULL,
      entity_type VARCHAR,
      entity_id  VARCHAR,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      table_id   UUID    REFERENCES tables(table_id) ON DELETE SET NULL,
      reason     TEXT,
      metadata   JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_table_id   ON audit_log(table_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_action      ON audit_log(action);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at  ON audit_log(created_at DESC);`);

  // 6b. ITEM-CENTRIC KOT REFACTOR: Add timestamp columns and versioning to section_kot_items.
  //     These track the lifecycle of individual items independently.
  await pool.query(`
    ALTER TABLE section_kot_items
      ADD COLUMN IF NOT EXISTS acknowledged_at    TIMESTAMP,
      ADD COLUMN IF NOT EXISTS preparing_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS ready_at           TIMESTAMP,
      ADD COLUMN IF NOT EXISTS served_at          TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivered_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS recook_requested_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS version           INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS updated_by        INTEGER,
      ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  // 6c. Same enhancements for kot_items table (main KOT items, not section-specific)
  await pool.query(`
    ALTER TABLE kot_items
      ADD COLUMN IF NOT EXISTS acknowledged_at    TIMESTAMP,
      ADD COLUMN IF NOT EXISTS preparing_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS ready_at           TIMESTAMP,
      ADD COLUMN IF NOT EXISTS served_at          TIMESTAMP,
      ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivered_at       TIMESTAMP,
      ADD COLUMN IF NOT EXISTS recook_requested_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS version           INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS updated_by        INTEGER,
      ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  `);

  // 6d. Ensure updated_at and updated_by columns exist on section_kots
  await pool.query(`
    ALTER TABLE section_kots
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_by INTEGER;
  `);

  // 7. Index to speed up canFreeTable checks.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_section_kot_items_status ON section_kot_items(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_kot_items_status         ON kot_items(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_kots_table_id            ON kots(table_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bills_payment_status     ON bills(payment_status);`);

  // ─────────────────────────────────────────────────────────────────────────
  // 8. DATA MIGRATION: Normalize table status values to match enum definition
  //    Fix capitalized legacy values that don't match the enum
  // ─────────────────────────────────────────────────────────────────────────
  try {
    const updateAvailable = await pool.query(`UPDATE tables SET status = 'free' WHERE status::text = 'Available' RETURNING table_id;`);
    if (updateAvailable.rowCount > 0) {
      console.log(`✓ Migrated ${updateAvailable.rowCount} tables from 'Available' to 'free'`);
    }
  } catch (e: any) {
    console.warn('Migration: Available→free skipped:', e.message);
  }

  try {
    const updateOccupied = await pool.query(`UPDATE tables SET status = 'occupied' WHERE status::text = 'Occupied' RETURNING table_id;`);
    if (updateOccupied.rowCount > 0) {
      console.log(`✓ Migrated ${updateOccupied.rowCount} tables from 'Occupied' to 'occupied'`);
    }
  } catch (e: any) {
    console.warn('Migration: Occupied→occupied skipped:', e.message);
  }

  try {
    const updateBilling = await pool.query(`UPDATE tables SET status = 'billing_done' WHERE status::text = 'Billing' RETURNING table_id;`);
    if (updateBilling.rowCount > 0) {
      console.log(`✓ Migrated ${updateBilling.rowCount} tables from 'Billing' to 'billing_done'`);
    }
  } catch (e: any) {
    console.warn('Migration: Billing→billing_done skipped:', e.message);
  }

  // ─── TABLE SESSIONS SYSTEM SCHEMA ──────────────────────────────────────────
  console.log('Running Table Session System migrations...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id UUID NOT NULL REFERENCES tables(table_id) ON DELETE RESTRICT,
      session_code VARCHAR NOT NULL UNIQUE,
      status VARCHAR NOT NULL CHECK (status IN ('active', 'billed', 'payment_pending', 'payment_done', 'waiting_service_completion', 'ready_to_close', 'completed', 'force_closed', 'abandoned')) DEFAULT 'active',
      guest_count INTEGER NOT NULL DEFAULT 1,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      close_reason TEXT,
      active_order_id UUID,
      payment_status VARCHAR NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partially_paid')),
      is_payment_locked BOOLEAN NOT NULL DEFAULT false,
      is_force_closed BOOLEAN NOT NULL DEFAULT false,
      source_type VARCHAR NOT NULL DEFAULT 'POS' CHECK (source_type IN ('POS', 'WAITER_QR', 'CUSTOMER_QR', 'DELIVERY', 'API')),
      snapshot JSONB,
      assigned_waiter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
      heartbeat_timeout INTEGER NOT NULL DEFAULT 3600,
      notes TEXT,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_tables (
      session_id UUID NOT NULL REFERENCES table_sessions(session_id) ON DELETE CASCADE,
      table_id UUID NOT NULL REFERENCES tables(table_id) ON DELETE CASCADE,
      PRIMARY KEY (session_id, table_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_events (
      event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES table_sessions(session_id) ON DELETE CASCADE,
      event_type VARCHAR NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      metadata JSONB,
      performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source_device VARCHAR,
      source_channel VARCHAR
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key_hash VARCHAR PRIMARY KEY,
      response_status INTEGER NOT NULL,
      response_body JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // ── QR Table Identity ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS table_qr (
      qr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id UUID NOT NULL REFERENCES tables(table_id) ON DELETE CASCADE,
      qr_token VARCHAR NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_table_qr_table_id ON table_qr(table_id);`);

  await pool.query(`
    ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_sessions(session_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS source_type VARCHAR NOT NULL DEFAULT 'POS' CHECK (source_type IN ('POS', 'WAITER_QR', 'CUSTOMER_QR', 'DELIVERY', 'API'));
  `);

  await pool.query(`
    ALTER TABLE kots 
      ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_sessions(session_id) ON DELETE SET NULL;
  `);

  await pool.query(`
    ALTER TABLE bills 
      ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_sessions(session_id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_table_sessions_table_id ON table_sessions(table_id);
    CREATE INDEX IF NOT EXISTS idx_table_sessions_status   ON table_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_orders_session_id        ON orders(session_id);
    CREATE INDEX IF NOT EXISTS idx_kots_session_id          ON kots(session_id);
    CREATE INDEX IF NOT EXISTS idx_bills_session_id         ON bills(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_tables_table_id  ON session_tables(table_id);
  `);

  await pool.query(`
    ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'Dine In',
      ADD COLUMN IF NOT EXISTS payment_option VARCHAR(50) DEFAULT 'Pay at Restaurant',
      ADD COLUMN IF NOT EXISTS notes TEXT;
  `);

  await pool.query(`
    ALTER TABLE kots 
      ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'Dine In',
      ADD COLUMN IF NOT EXISTS payment_option VARCHAR(50) DEFAULT 'Pay at Restaurant',
      ADD COLUMN IF NOT EXISTS notes TEXT;
  `);

  await pool.query(`
    ALTER TABLE kots
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_by INTEGER;
  `);

  // ── CUSTOM OPTIONS AND EXTRA CHARGES MIGRATIONS ──
  await pool.query(`
    ALTER TABLE items 
      ADD COLUMN IF NOT EXISTS customizable_options JSONB DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS extra_charges (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL,
      charge_type VARCHAR NOT NULL CHECK (charge_type IN ('percentage', 'fixed')),
      value NUMERIC(10,2) NOT NULL CHECK (value >= 0),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE bills 
      ADD COLUMN IF NOT EXISTS extra_charges JSONB DEFAULT '[]'::jsonb;
  `);

  // ── VEG / NON-VEG MIGRATIONS ──
  await pool.query(`
    ALTER TABLE items 
      ADD COLUMN IF NOT EXISTS is_veg BOOLEAN NOT NULL DEFAULT true;
  `);

  // Categorize existing items based on their names
  await pool.query(`
    UPDATE items 
    SET is_veg = false 
    WHERE LOWER(name) LIKE '%chicken%'
       OR LOWER(name) LIKE '%mutton%'
       OR LOWER(name) LIKE '%egg%'
       OR LOWER(name) LIKE '%fish%'
       OR LOWER(name) LIKE '%wing%'
       OR LOWER(name) LIKE '%pork%'
       OR LOWER(name) LIKE '%beef%'
       OR LOWER(name) LIKE '%meat%'
       OR LOWER(name) LIKE '%prawn%'
       OR LOWER(name) LIKE '%crab%'
       OR LOWER(name) LIKE '%tikka masala%'  -- Chicken tikka masala
       OR LOWER(name) LIKE '%kebab%';
  `);

  console.log('Table management schema migrations complete.');

  // ── TENANT MULTI-TENANCY MIGRATIONS ──
  console.log('Running multi-tenancy migrations...');
  
  // 1. Create restaurants table
  console.log('MT Step 1: Creating restaurants table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL,
      phone VARCHAR,
      owner_name VARCHAR,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  console.log('MT Step 1: Done.');

  // 2. Insert default restaurant BhojAI (id = 1)
  console.log('MT Step 2: Seeding default restaurant...');
  await pool.query(`
    INSERT INTO restaurants (id, name)
    VALUES (1, 'BhojAI')
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('MT Step 2: Done.');

  // 3. Create customer_reviews table
  console.log('MT Step 3: Creating customer_reviews table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_reviews (
      id SERIAL PRIMARY KEY,
      session_id UUID REFERENCES table_sessions(session_id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      food_rating INTEGER CHECK (food_rating >= 1 AND food_rating <= 5),
      service_rating INTEGER CHECK (service_rating >= 1 AND service_rating <= 5),
      ambience_rating INTEGER CHECK (ambience_rating >= 1 AND ambience_rating <= 5),
      quick_tags JSONB DEFAULT '[]'::jsonb,
      feedback TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Fallback for existing tables
  await pool.query(`
    ALTER TABLE customer_reviews 
    ADD COLUMN IF NOT EXISTS food_rating INTEGER CHECK (food_rating >= 1 AND food_rating <= 5),
    ADD COLUMN IF NOT EXISTS service_rating INTEGER CHECK (service_rating >= 1 AND service_rating <= 5),
    ADD COLUMN IF NOT EXISTS ambience_rating INTEGER CHECK (ambience_rating >= 1 AND ambience_rating <= 5),
    ADD COLUMN IF NOT EXISTS quick_tags JSONB DEFAULT '[]'::jsonb;
  `);
  console.log('MT Step 3: Done.');

  // 4. Update schema for all tenant tables
  const tenantTables = [
    'users',
    'categories',
    'items',
    'gst_config',
    'receipt_layout',
    'tables',
    'bills',
    'orders',
    'kots',
    'sections',
    'customer_reviews'
  ];

  console.log('MT Step 3: Starting tenant tables loop...');
  for (const table of tenantTables) {
    console.log(`MT Loop: Processing table "${table}"...`);
    // Add restaurant_id column if not exists
    console.log(`MT Loop: "${table}" - adding column...`);
    await pool.query(`
      ALTER TABLE ${table} 
        ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE;
    `);
    
    // Default existing records to restaurant 1
    console.log(`MT Loop: "${table}" - setting default value...`);
    await pool.query(`
      UPDATE ${table} SET restaurant_id = 1 WHERE restaurant_id IS NULL;
    `);

    // Enable RLS and Force RLS
    console.log(`MT Loop: "${table}" - enabling RLS...`);
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    console.log(`MT Loop: "${table}" - forcing RLS...`);
    await pool.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);

    // Create RLS Policy
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON ${table};`);
    try {
      await pool.query(`
        CREATE POLICY tenant_isolation_policy ON ${table}
        FOR ALL
        USING (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer)
        WITH CHECK (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer);
      `);
    } catch (e: any) {
      if (!e.message.includes('already exists')) {
        throw e;
      }
    }

    // Set default value on the column so new inserts automatically inherit active tenant context
    await pool.query(`
      ALTER TABLE ${table} 
        ALTER COLUMN restaurant_id 
        SET DEFAULT coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer;
    `);

    // Add a small delay to prevent overwhelming Neon proxy with DDL statements (prevents ECONNRESET)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 3. Add security definer helper to resolve restaurant_id from table_id AFTER columns exist
  await pool.query(`
    CREATE OR REPLACE FUNCTION get_table_restaurant_id(t_id UUID)
    RETURNS INTEGER AS $$
      SELECT restaurant_id FROM tables WHERE table_id = t_id;
    $$ LANGUAGE SQL SECURITY DEFINER;
  `);

  // 3b. Add security definer helper to resolve restaurant_id from user_id AFTER columns exist
  await pool.query(`
    CREATE OR REPLACE FUNCTION get_user_restaurant_id(u_id INTEGER)
    RETURNS INTEGER AS $$
      SELECT restaurant_id FROM users WHERE id = u_id;
    $$ LANGUAGE SQL SECURITY DEFINER;
  `);

  // 5. Seed default tables for BhojAI (restaurant 1) if empty
  const tablesCount = await pool.query("SELECT COUNT(*) FROM tables WHERE restaurant_id = 1");
  if (parseInt(tablesCount.rows[0].count, 10) === 0) {
    const tablesColRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='tables' AND column_name='tenant_id'`);
    const tablesSeedHasTenant = tablesColRes.rows.length > 0;
    console.log('Seeding default tables for BhojAI...');
    if (tablesSeedHasTenant) {
      await pool.query(`
        INSERT INTO tables (table_number, status, restaurant_id, tenant_id, outlet_id)
        VALUES 
          ('1', 'free', 1, 1, 1),
          ('2', 'free', 1, 1, 1),
          ('3', 'free', 1, 1, 1),
          ('4', 'free', 1, 1, 1),
          ('5', 'free', 1, 1, 1),
          ('6', 'free', 1, 1, 1),
          ('7', 'free', 1, 1, 1),
          ('8', 'free', 1, 1, 1)
        ON CONFLICT DO NOTHING;
      `);
    } else {
      await pool.query(`
        INSERT INTO tables (table_number, status, restaurant_id)
        VALUES 
          ('1', 'free', 1),
          ('2', 'free', 1),
          ('3', 'free', 1),
          ('4', 'free', 1),
          ('5', 'free', 1),
          ('6', 'free', 1),
          ('7', 'free', 1),
          ('8', 'free', 1)
        ON CONFLICT DO NOTHING;
      `);
    }
  }

  // 6. Seed default categories for BhojAI (restaurant 1) if empty
  const catsCount = await pool.query("SELECT COUNT(*) FROM categories WHERE restaurant_id = 1");
  if (parseInt(catsCount.rows[0].count, 10) === 0) {
    const catsColRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='categories' AND column_name='tenant_id'`);
    const catsSeedHasTenant = catsColRes.rows.length > 0;
    console.log('Seeding default categories for BhojAI...');
    if (catsSeedHasTenant) {
      await pool.query(`
        INSERT INTO categories (name, is_active, restaurant_id, tenant_id, outlet_id)
        VALUES 
          ('Starters', true, 1, 1, 1),
          ('Main Course', true, 1, 1, 1),
          ('Beverages', true, 1, 1, 1),
          ('Sweets', true, 1, 1, 1)
        ON CONFLICT DO NOTHING;
      `);
    } else {
      await pool.query(`
        INSERT INTO categories (name, is_active, restaurant_id)
        VALUES 
          ('Starters', true, 1),
          ('Main Course', true, 1),
          ('Beverages', true, 1),
          ('Sweets', true, 1)
        ON CONFLICT DO NOTHING;
      `);
    }
  }

  // 7. Seed default items for BhojAI (restaurant 1) if empty
  const itemsCount = await pool.query("SELECT COUNT(*) FROM items WHERE restaurant_id = 1");
  if (parseInt(itemsCount.rows[0].count, 10) === 0) {
    const itemsColRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='items' AND column_name='tenant_id'`);
    const itemsSeedHasTenant = itemsColRes.rows.length > 0;
    console.log('Seeding default items for BhojAI...');
    if (itemsSeedHasTenant) {
      await pool.query(`
        INSERT INTO items (id, serial_number, name, selling_price, category, stock_quantity, is_active, stock_type, is_veg, restaurant_id, tenant_id, outlet_id)
        VALUES 
          (1, gen_random_uuid(), 'Paneer Tikka', 249.00, 'Starters', 100, true, 'unlimited'::stock_type, true, 1, 1, 1),
          (2, gen_random_uuid(), 'Chicken Tikka', 299.00, 'Starters', 100, true, 'unlimited'::stock_type, false, 1, 1, 1),
          (3, gen_random_uuid(), 'Butter Paneer Masala', 349.00, 'Main Course', 100, true, 'unlimited'::stock_type, true, 1, 1, 1),
          (4, gen_random_uuid(), 'Chicken Biryani', 399.00, 'Main Course', 100, true, 'unlimited'::stock_type, false, 1, 1, 1),
          (5, gen_random_uuid(), 'Masala Chai', 49.00, 'Beverages', 100, true, 'unlimited'::stock_type, true, 1, 1, 1),
          (6, gen_random_uuid(), 'Gulab Jamun', 99.00, 'Sweets', 100, true, 'unlimited'::stock_type, true, 1, 1, 1)
        ON CONFLICT DO NOTHING;
      `);
    } else {
      await pool.query(`
        INSERT INTO items (id, serial_number, name, selling_price, category, stock_quantity, is_active, stock_type, is_veg, restaurant_id)
        VALUES 
          (1, gen_random_uuid(), 'Paneer Tikka', 249.00, 'Starters', 100, true, 'unlimited'::stock_type, true, 1),
          (2, gen_random_uuid(), 'Chicken Tikka', 299.00, 'Starters', 100, true, 'unlimited'::stock_type, false, 1),
          (3, gen_random_uuid(), 'Butter Paneer Masala', 349.00, 'Main Course', 100, true, 'unlimited'::stock_type, true, 1),
          (4, gen_random_uuid(), 'Chicken Biryani', 399.00, 'Main Course', 100, true, 'unlimited'::stock_type, false, 1),
          (5, gen_random_uuid(), 'Masala Chai', 49.00, 'Beverages', 100, true, 'unlimited'::stock_type, true, 1),
          (6, gen_random_uuid(), 'Gulab Jamun', 99.00, 'Sweets', 100, true, 'unlimited'::stock_type, true, 1)
        ON CONFLICT DO NOTHING;
      `);
    }
  }
  
  // 8. Reset sequences to avoid duplicate key errors from manual seeds
  console.log('Resetting database sequence values...');
  const tablesWithSeq = ['restaurants', 'users', 'categories', 'items', 'gst_config'];
  for (const table of tablesWithSeq) {
    try {
      await pool.query(`
        SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 1));
      `);
    } catch (seqErr) {
      console.warn(`Could not reset sequence for table ${table}:`, seqErr);
    }
  }

  console.log('Multi-tenancy migrations complete.');

  // ─────────────────────────────────────────────────────────────────────────
  // DYNAMIC PRICING SYSTEM — Schema Migrations
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Running dynamic pricing migrations...');

  // 1. Dining zones (AC Hall, Banquet, Rooftop, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dining_zones (
      zone_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(100) NOT NULL,
      description   TEXT,
      is_active     BOOLEAN NOT NULL DEFAULT true,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Per-zone item price overrides
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_zone_prices (
      id            SERIAL PRIMARY KEY,
      item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      zone_id       UUID NOT NULL REFERENCES dining_zones(zone_id) ON DELETE CASCADE,
      price         NUMERIC(10,2) NOT NULL,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(item_id, zone_id)
    );
  `);

  // 3. Time-of-day menu schedule windows (Breakfast, Lunch, Happy Hour, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_schedules (
      schedule_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(100) NOT NULL,
      start_time    TIME NOT NULL,
      end_time      TIME NOT NULL,
      days_of_week  INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // 4. Per-schedule item price overrides
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_schedule_prices (
      id            SERIAL PRIMARY KEY,
      item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      schedule_id   UUID NOT NULL REFERENCES menu_schedules(schedule_id) ON DELETE CASCADE,
      price         NUMERIC(10,2) NOT NULL,
      restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(item_id, schedule_id)
    );
  `);

  // 5. Zone assignment on tables (single source of truth — no zone in QR URLs)
  await pool.query(`
    ALTER TABLE tables
      ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES dining_zones(zone_id) ON DELETE SET NULL;
  `);

  // 6. Indexes for pricing tables
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_dining_zones_restaurant  ON dining_zones(restaurant_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_zone_prices_item    ON item_zone_prices(item_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_zone_prices_zone    ON item_zone_prices(zone_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_menu_schedules_rest      ON menu_schedules(restaurant_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_item_schedule_prices_item ON item_schedule_prices(item_id);`);

  // 7. RLS on dining_zones + menu_schedules (restaurant-scoped, same pattern as other tables)
  for (const tbl of ['dining_zones', 'menu_schedules']) {
    await pool.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`);
    await pool.query(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY;`);
    await pool.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON ${tbl};`);
    try {
      await pool.query(`
        CREATE POLICY tenant_isolation_policy ON ${tbl}
        FOR ALL
        USING (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer)
        WITH CHECK (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer);
      `);
    } catch (e: any) {
      if (!e.message.includes('already exists')) throw e;
    }
    await pool.query(`
      ALTER TABLE ${tbl}
        ALTER COLUMN restaurant_id
        SET DEFAULT coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer;
    `);
  }

  console.log('Dynamic pricing migrations complete.');

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURABLE TAXES & CHARGES — Schema Migrations
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Running configurable taxes migrations...');

  // apply_on: which order types trigger this charge automatically
  await pool.query(`
    ALTER TABLE extra_charges
      ADD COLUMN IF NOT EXISTS apply_on VARCHAR(50) NOT NULL DEFAULT 'always'
        CHECK (apply_on IN ('always', 'dine_in', 'parcel', 'delivery', 'takeaway', 'never'));
  `);

  // is_taxable: if true, charge is added to subtotal BEFORE GST is calculated (e.g. parcel fee)
  //             if false, charge is added AFTER GST (e.g. service charge, admin fee)
  await pool.query(`
    ALTER TABLE extra_charges
      ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT false;
  `);

  console.log('Configurable taxes migrations complete.');

  // ─────────────────────────────────────────────────────────────────────────
  // KDS-READINESS — Schema Migrations
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Running KDS-readiness migrations...');

  // restaurant_id on section_kots for RLS multi-tenant isolation
  await pool.query(`
    ALTER TABLE section_kots
      ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE;
  `);
  await pool.query(`UPDATE section_kots SET restaurant_id = 1 WHERE restaurant_id IS NULL;`);

  // restaurant_id on section_kot_items for RLS multi-tenant isolation
  await pool.query(`
    ALTER TABLE section_kot_items
      ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE CASCADE;
  `);
  await pool.query(`UPDATE section_kot_items SET restaurant_id = 1 WHERE restaurant_id IS NULL;`);

  // display_type on sections: controls whether a section shows on KDS, prints KOT, or both
  await pool.query(`
    ALTER TABLE sections
      ADD COLUMN IF NOT EXISTS display_type VARCHAR(20) NOT NULL DEFAULT 'kds'
        CHECK (display_type IN ('kds', 'print', 'both'));
  `);

  // print_triggered_at on kots: audit trail for when a KOT was physically printed
  await pool.query(`
    ALTER TABLE kots
      ADD COLUMN IF NOT EXISTS print_triggered_at TIMESTAMP;
  `);

  // RLS on section_kots
  await pool.query(`ALTER TABLE section_kots ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`ALTER TABLE section_kots FORCE ROW LEVEL SECURITY;`);
  await pool.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON section_kots;`);
  try {
    await pool.query(`
      CREATE POLICY tenant_isolation_policy ON section_kots
      FOR ALL
      USING (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer)
      WITH CHECK (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer);
    `);
  } catch (e: any) {
    if (!e.message.includes('already exists')) throw e;
  }
  await pool.query(`
    ALTER TABLE section_kots
      ALTER COLUMN restaurant_id
      SET DEFAULT coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer;
  `);

  // RLS on section_kot_items
  await pool.query(`ALTER TABLE section_kot_items ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`ALTER TABLE section_kot_items FORCE ROW LEVEL SECURITY;`);
  await pool.query(`DROP POLICY IF EXISTS tenant_isolation_policy ON section_kot_items;`);
  try {
    await pool.query(`
      CREATE POLICY tenant_isolation_policy ON section_kot_items
      FOR ALL
      USING (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer)
      WITH CHECK (restaurant_id = coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer);
    `);
  } catch (e: any) {
    if (!e.message.includes('already exists')) throw e;
  }
  await pool.query(`
    ALTER TABLE section_kot_items
      ALTER COLUMN restaurant_id
      SET DEFAULT coalesce(nullif(current_setting('app.current_restaurant_id', true), ''), '1')::integer;
  `);

  console.log('KDS-readiness migrations complete.');

  // ─────────────────────────────────────────────────────────────────────────
  // MULTI-TENANT TRIGGER SAFETY NET
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Running multi-tenant safety net migrations...');

  await pool.query(`
    CREATE OR REPLACE FUNCTION auto_set_tenant_context()
    RETURNS TRIGGER AS $$
    DECLARE
      ctx_tenant_id INTEGER;
    BEGIN
      IF NEW.tenant_id IS NULL THEN
        BEGIN
          ctx_tenant_id := current_setting('app.current_tenant_id', true)::integer;
        EXCEPTION WHEN OTHERS THEN
          ctx_tenant_id := NULL;
        END;
        IF ctx_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context not set. The application must explicitly pass tenant_id, or valid session context must exist.';
        END IF;
        NEW.tenant_id := ctx_tenant_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION auto_set_tenant_and_outlet_context()
    RETURNS TRIGGER AS $$
    DECLARE
      ctx_tenant_id INTEGER;
      ctx_outlet_id INTEGER;
    BEGIN
      IF NEW.tenant_id IS NULL THEN
        BEGIN
          ctx_tenant_id := current_setting('app.current_tenant_id', true)::integer;
        EXCEPTION WHEN OTHERS THEN
          ctx_tenant_id := NULL;
        END;
        IF ctx_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant context not set. The application must explicitly pass tenant_id, or valid session context must exist.';
        END IF;
        NEW.tenant_id := ctx_tenant_id;
      END IF;

      IF NEW.outlet_id IS NULL THEN
        BEGIN
          ctx_outlet_id := current_setting('app.current_outlet_id', true)::integer;
        EXCEPTION WHEN OTHERS THEN
          ctx_outlet_id := NULL;
        END;
        IF ctx_outlet_id IS NULL THEN
          RAISE EXCEPTION 'Outlet context not set. The application must explicitly pass outlet_id, or valid session context must exist.';
        END IF;
        NEW.outlet_id := ctx_outlet_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  const tenantOnlyTables = [
    'outlets', 'roles', 'permissions', 'role_permissions', 'subscriptions', 'support_sessions'
  ];

  const tenantAndOutletTables = [
    'items', 'categories', 'orders', 'order_items', 'bills', 'bill_items', 'kots', 'kot_items', 
    'tables', 'table_sessions', 'session_events', 'session_tables', 'customer_reviews', 
    'gst_config', 'extra_charges', 'dining_zones', 'item_zone_prices', 'menu_schedules', 
    'item_schedule_prices', 'receipt_layout', 'sections', 'item_section_mapping',
    'section_kots', 'section_kot_items', 'item_addons'
  ];

  for (const tableName of tenantOnlyTables) {
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}') THEN
            DROP TRIGGER IF EXISTS trg_auto_set_tenant ON ${tableName};
            CREATE TRIGGER trg_auto_set_tenant
            BEFORE INSERT ON ${tableName}
            FOR EACH ROW
            EXECUTE FUNCTION auto_set_tenant_context();
          END IF;
        END $$;
      `);
    } catch (e: any) {
      console.warn('Failed to attach tenant trigger to table', tableName, e.message);
    }
  }

  for (const tableName of tenantAndOutletTables) {
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}') THEN
            DROP TRIGGER IF EXISTS trg_auto_set_tenant_outlet ON ${tableName};
            CREATE TRIGGER trg_auto_set_tenant_outlet
            BEFORE INSERT ON ${tableName}
            FOR EACH ROW
            EXECUTE FUNCTION auto_set_tenant_and_outlet_context();
          END IF;
        END $$;
      `);
    } catch (e: any) {
      console.warn('Failed to attach tenant+outlet trigger to table', tableName, e.message);
    }
  }

  console.log('Multi-tenant safety net migrations complete.');
}

