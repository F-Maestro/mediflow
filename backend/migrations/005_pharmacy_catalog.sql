ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0);
ALTER TABLE visit_orders ADD COLUMN IF NOT EXISTS directions_encrypted JSONB;
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY,
  catalog_code TEXT NOT NULL REFERENCES service_catalog(code),
  visit_id UUID REFERENCES visits(id),
  actor_id UUID NOT NULL REFERENCES app_users(id),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reason_encrypted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_catalog_date_idx ON inventory_movements(catalog_code, created_at DESC);
