CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  data TEXT NOT NULL
);
