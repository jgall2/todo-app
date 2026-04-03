CREATE TABLE IF NOT EXISTS todos (
  id          TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL,
  title       TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_email);
