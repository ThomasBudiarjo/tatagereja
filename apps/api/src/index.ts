import { loadConfig } from './config';
import { createApp, createDeps } from './app';
import { openDatabase } from './db/client';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const app = createApp(createDeps(database.db, config));

try {
  // `reusePort: false` makes a second instance fail loudly instead of silently
  // sharing the port, which would serve requests from two different databases.
  app.listen({ hostname: config.host, port: config.port, reusePort: false });
} catch (error) {
  const code = (error as { code?: string })?.code;
  if (code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use. Another TataGereja server is probably running; ` +
        'stop it or set PORT to a free port.',
    );
  } else {
    console.error('Failed to start the server:', error);
  }
  database.close();
  process.exit(1);
}

console.log(
  `TataGereja API listening on http://${config.host}:${config.port} ` +
    `(registration: ${config.registrationMode}, turnstile: ${config.turnstile ? 'on' : 'off'}, ` +
    `db: ${config.databasePath})`,
);

const shutdown = () => {
  app.stop();
  database.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
