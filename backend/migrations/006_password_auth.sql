ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE otp_challenges DROP CONSTRAINT IF EXISTS otp_challenges_purpose_check;
ALTER TABLE otp_challenges ADD CONSTRAINT otp_challenges_purpose_check
  CHECK (purpose IN ('login','registration','phone-change','password-reset','staff-login'));

CREATE INDEX IF NOT EXISTS otp_purpose_created_idx ON otp_challenges(purpose, created_at DESC);
