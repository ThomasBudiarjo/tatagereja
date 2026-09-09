import { loadConfig } from './config';
import { createApp, createDeps } from './app';
import { openDatabase } from './db/client';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const app = createApp(createDeps(database.db, config));

app.listen({ hostname: config.host, port: config.port });

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
