CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  price TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  secret TEXT NOT NULL,
  name TEXT,
  buyers TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS pending (
  user_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS languages (
  user_id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL
);
