import { loadConfig } from './config';
import { createApp, createDeps } from './app';
import { OPTIMIZE_INTERVAL_MS, openDatabase } from './db/client';

const config = loadConfig();
const database = openDatabase(config.databasePath);
let deps: ReturnType<typeof createDeps>;
try {
  deps = createDeps(database.db, config);
} catch (error) {
  console.error(`Cannot start: ${(error as Error).message}`);
  database.close();
  process.exit(1);
}
const app = createApp(deps);
const { security } = deps;
if (security.keyring.source === 'file') {
  console.warn(
    'ENCRYPTION_KEY is not set: confidential fields are encrypted with the key file next to the ' +
      'database. Keep that file with your backups, or set ENCRYPTION_KEY (see .env.example).',
  );
}
for (const [column, count] of Object.entries(security.encrypted)) {
  console.log(`Encrypted ${count} stored value${count === 1 ? '' : 's'} of ${column}`);
}
if (security.hashedInvitations > 0) {
  console.log(`Hashed the tokens of ${security.hashedInvitations} invitation links`);
}

try {
  // `reusePort: false` makes a second instance fail loudly instead of silently
  // sharing the port, which would serve requests from two different databases.
  app.listen({
    hostname: config.host,
    port: config.port,
    reusePort: false,
    maxRequestBodySize: config.maxBodyBytes,
  });
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

const optimizer = setInterval(() => database.optimize(), OPTIMIZE_INTERVAL_MS);
optimizer.unref();

const shutdown = () => {
  clearInterval(optimizer);
  app.stop();
  database.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
