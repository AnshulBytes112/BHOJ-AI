import { initializeDatabase } from './db';

initializeDatabase()
  .then(() => {
    console.log('SUCCESS: Database initialized and migrated successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('ERROR during db initialization:', err);
    process.exit(1);
  });
