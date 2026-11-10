CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES app_users(id),
  note_encrypted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clinical_notes_visit_date_idx ON clinical_notes(visit_id, created_at DESC);
CREATE TABLE IF NOT EXISTS team_messages (
  id UUID PRIMARY KEY,
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES app_users(id),
  message_encrypted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_messages_visit_date_idx ON team_messages(visit_id, created_at DESC);
