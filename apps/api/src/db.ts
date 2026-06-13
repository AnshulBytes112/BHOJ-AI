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

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR NOT NULL UNIQUE,
      display_name VARCHAR NOT NULL,
      role VARCHAR NOT NULL DEFAULT 'ADMIN',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO users (username, display_name, role)
    VALUES ('system_admin', 'System Admin', 'ADMIN')
    ON CONFLICT (username) DO NOTHING;
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

  await pool.query(`
    INSERT INTO gst_config (label, category, gst_percentage)
    SELECT c.name, c.name, 5.00
    FROM categories c
    ON CONFLICT DO NOTHING;
  `);

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

  await pool.query(`
    INSERT INTO receipt_layout (header_text, footer_text)
    SELECT 'RestroManager Hotel', 'Thank you for visiting! Come again.'
    WHERE NOT EXISTS (SELECT 1 FROM receipt_layout);
  `);

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
        CREATE TYPE kot_status AS ENUM ('pending', 'acknowledged', 'completed', 'ready', 'served');
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
  await pool.query(`
    INSERT INTO sections (section_name, description, is_active) VALUES
      ('Kitchen', 'Main kitchen section for food items', true),
      ('Bar', 'Bar section for alcoholic and mixed drinks', true),
      ('Ice Cream', 'Ice cream and dessert counter', true),
      ('Beverage', 'Non-alcoholic beverages, coffee, and juices', true)
    ON CONFLICT (section_name) DO NOTHING;
  `);

  // ── Seed default POS categories (used by KOT dashboard) ──
  try {
    const seedResult = await pool.query(`
      INSERT INTO categories (name, is_active) VALUES
        ('Main Course', true),
        ('Starters', true),
        ('Beverages', true),
        ('Sweets', true)
      ON CONFLICT (name) DO NOTHING;
    `);
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
        CHECK (status IN ('pending','acknowledged','preparing','ready','served','cancelled','packed','delivered','recook_requested'));
  `);

  // 5. Add per-item status tracking to section_kot_items (section-level items).
  await pool.query(`
    ALTER TABLE section_kot_items
      ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','acknowledged','preparing','ready','served','cancelled','packed','delivered','recook_requested'));
  `);

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
    const updateAvailable = await pool.query(`UPDATE tables SET status = 'free' WHERE status = 'Available' RETURNING table_id;`);
    if (updateAvailable.rowCount > 0) {
      console.log(`✓ Migrated ${updateAvailable.rowCount} tables from 'Available' to 'free'`);
    }
  } catch (e: any) {
    console.warn('Migration: Available→free skipped:', e.message);
  }

  try {
    const updateOccupied = await pool.query(`UPDATE tables SET status = 'occupied' WHERE status = 'Occupied' RETURNING table_id;`);
    if (updateOccupied.rowCount > 0) {
      console.log(`✓ Migrated ${updateOccupied.rowCount} tables from 'Occupied' to 'occupied'`);
    }
  } catch (e: any) {
    console.warn('Migration: Occupied→occupied skipped:', e.message);
  }

  try {
    const updateBilling = await pool.query(`UPDATE tables SET status = 'billing_done' WHERE status = 'Billing' RETURNING table_id;`);
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

  console.log('Table management schema migrations complete.');
}

