const { Pool } = require('pg');
const connectionString = 'postgresql://neondb_owner:npg_WV4cUHvqyt0D@ep-weathered-wind-amhn6akr-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString,
});

async function main() {
  console.log('Connecting to database to check all connections...');
  try {
    const res = await pool.query(`
      SELECT pid, usename, query, state, age(clock_timestamp(), query_start) 
      FROM pg_stat_activity 
      WHERE pid != pg_backend_pid();
    `);
    console.log('All connections:', res.rows);

    const termRes = await pool.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE usename = 'neondb_owner' AND pid <> pg_backend_pid();
    `);
    console.log('Terminated backends:', termRes.rows);
  } catch (err) {
    console.error('Error running kill query:', err);
  } finally {
    await pool.end();
  }
}
main();
