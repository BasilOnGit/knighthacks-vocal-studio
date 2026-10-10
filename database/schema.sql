-- Proposed Neon/PostgreSQL schema. Run manually once saving presets is implemented.
CREATE TABLE IF NOT EXISTS presets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  settings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Add ownership/authentication before enabling shared or public storage.
