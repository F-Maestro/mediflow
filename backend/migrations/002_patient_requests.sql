CREATE TABLE IF NOT EXISTS medical_history_requests (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(user_id) ON DELETE CASCADE,
  note_encrypted JSONB,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','processing','fulfilled','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS history_requests_patient_date_idx ON medical_history_requests(patient_id, created_at DESC);
