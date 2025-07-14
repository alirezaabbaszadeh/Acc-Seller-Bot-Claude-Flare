CREATE TABLE IF NOT EXISTS pending_edit (
  user_id INTEGER PRIMARY KEY,
  product_id TEXT NOT NULL,
  field TEXT NOT NULL
);
