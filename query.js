const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://meal_engine_db_final_25wm_user:6WqlohUpgwjSKPJujXgpMmwHN80bOcWX@dpg-d3g7hgffte5s73bst2dg-a.oregon-postgres.render.com/meal_engine_db_final_25wm',
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT id, username, email FROM users;', (err, res) => {
  if (err) {
    console.error(err);
  } else {
    console.table(res.rows);
  }
  process.exit();
});
