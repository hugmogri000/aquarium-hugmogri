CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_tx_id TEXT,
  payment_from_address TEXT,
  payment_confirmed_at TEXT,
  payment_confirmed_at_ms INTEGER,
  base_amount_usd TEXT NOT NULL,
  payable_amount_usdt TEXT NOT NULL,
  amount_tail_usdt TEXT NOT NULL,
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  receiving_address TEXT NOT NULL,
  bucket_color TEXT NOT NULL,
  stand_color TEXT NOT NULL,
  country TEXT NOT NULL,
  selection_text TEXT NOT NULL,
  country_text TEXT NOT NULL,
  shipping_text TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  lookup_email TEXT NOT NULL,
  lookup_phone TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  street_address TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  logistics_waybill TEXT,
  logistics_provider TEXT DEFAULT 'yanwen',
  logistics_status TEXT,
  logistics_last_sync TEXT,
  tracking_snapshot_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_lookup_email ON orders (lookup_email, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_lookup_phone ON orders (lookup_phone, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payable_amount ON orders (payable_amount_usdt, created_at_ms DESC);
