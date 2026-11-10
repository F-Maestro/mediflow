CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  phone_lookup_hash CHAR(64) UNIQUE NOT NULL,
  phone_encrypted JSONB NOT NULL,
  name_encrypted JSONB NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient','nurse','doctor','lab','pharmacist','cashier','admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS patients (
  user_id UUID PRIMARY KEY REFERENCES app_users(id), hospital_number TEXT UNIQUE NOT NULL,
  profile_encrypted JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY, phone_lookup_hash CHAR(64) NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login','registration')), code_hash CHAR(64) NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS otp_phone_created_idx ON otp_challenges(phone_lookup_hash, created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, expires_at DESC);
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY, patient_id UUID NOT NULL REFERENCES patients(user_id), clinic TEXT NOT NULL,
  doctor TEXT NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cancelled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS appointments_patient_date_idx ON appointments(patient_id, scheduled_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS appointment_slot_unique_idx ON appointments(doctor,scheduled_at) WHERE status='booked';
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY, patient_id UUID NOT NULL REFERENCES patients(user_id), appointment_id UUID REFERENCES appointments(id),
  route_id TEXT NOT NULL CHECK (route_id IN ('walk-in','appointment','follow-up','results','refill','pay')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')), stage TEXT NOT NULL,
  complaint_encrypted JSONB, diagnosis_encrypted JSONB,
  queue_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(), called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS visits_stage_queue_idx ON visits(stage, status, queue_entered_at) WHERE status='active';
CREATE INDEX IF NOT EXISTS visits_patient_created_idx ON visits(patient_id, created_at DESC);
CREATE TABLE IF NOT EXISTS visit_stage_events (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  stage TEXT NOT NULL, entered_at TIMESTAMPTZ NOT NULL DEFAULT now(), exited_at TIMESTAMPTZ,
  actor_id UUID REFERENCES app_users(id)
);
CREATE INDEX IF NOT EXISTS stage_events_duration_idx ON visit_stage_events(stage, entered_at DESC) WHERE exited_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS triage_vitals (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL REFERENCES visits(id), measured_by UUID NOT NULL REFERENCES app_users(id),
  values_encrypted JSONB NOT NULL, measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vitals_visit_date_idx ON triage_vitals(visit_id, measured_at DESC);
CREATE TABLE IF NOT EXISTS service_catalog (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('service','lab','medicine')),
  price_kes INTEGER NOT NULL CHECK(price_kes >= 0), active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS visit_orders (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  catalog_code TEXT NOT NULL REFERENCES service_catalog(code), quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  status TEXT NOT NULL CHECK(status IN ('proposed','approved','completed','declined','cancelled')),
  result_encrypted JSONB, prescribed_by UUID REFERENCES app_users(id), approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_orders_visit_idx ON visit_orders(visit_id, created_at);
CREATE TABLE IF NOT EXISTS charge_lines (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL REFERENCES visits(id), source_order_id UUID REFERENCES visit_orders(id),
  code TEXT NOT NULL, description TEXT NOT NULL, amount_kes INTEGER NOT NULL CHECK(amount_kes >= 0),
  adjustment_kes INTEGER NOT NULL DEFAULT 0 CHECK(adjustment_kes >= 0),
  status TEXT NOT NULL DEFAULT 'due' CHECK(status IN ('due','waived','paid','void')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS waiver_events (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL REFERENCES visits(id), authorized_by UUID NOT NULL REFERENCES app_users(id),
  percent SMALLINT NOT NULL CHECK(percent BETWEEN 1 AND 100), reason_encrypted JSONB NOT NULL,
  amount_kes INTEGER NOT NULL CHECK(amount_kes >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY, visit_id UUID NOT NULL REFERENCES visits(id), patient_id UUID NOT NULL REFERENCES patients(user_id),
  provider TEXT NOT NULL CHECK(provider IN ('mock','daraja','cash')), amount_kes INTEGER NOT NULL CHECK(amount_kes > 0),
  currency CHAR(3) NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed','cancelled','reversed')),
  idempotency_key TEXT UNIQUE NOT NULL, merchant_request_id TEXT, checkout_request_id TEXT UNIQUE,
  mpesa_receipt TEXT UNIQUE, failure_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payment_visit_idx ON payments(visit_id, created_at DESC);
CREATE TABLE IF NOT EXISTS support_threads (
  id UUID PRIMARY KEY, patient_id UUID NOT NULL REFERENCES patients(user_id),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY, thread_id UUID NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES app_users(id), direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  channel TEXT NOT NULL CHECK(channel IN ('app','whatsapp')), body_encrypted JSONB NOT NULL,
  provider_message_id TEXT UNIQUE, external_consent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_message_thread_idx ON support_messages(thread_id, created_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY, actor_id UUID REFERENCES app_users(id), action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id UUID, request_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_date_idx ON audit_events(created_at DESC);

INSERT INTO service_catalog(code,name,kind,price_kes) VALUES
  ('registration','Registration','service',0),('triage','Triage','service',250),
  ('consult-general','General consultation','service',1200),('consult-specialist','Specialist consultation','service',2500),
  ('consult-review','Results review','service',400),('consult-followup','Follow-up consultation','service',1200),
  ('fbc','Full blood count','lab',700),('mrdt','Malaria rapid test','lab',300),('urine','Urinalysis','lab',250),
  ('para','Paracetamol 500 mg','medicine',120),('ors','Oral rehydration salts','medicine',300),('amox','Amoxicillin 500 mg','medicine',450)
ON CONFLICT(code) DO NOTHING;
