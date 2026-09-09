import { API_VERSION, APP_NAME } from '@tatagereja/shared';
import { Elysia } from 'elysia';
import type { Deps } from '../deps';

export const APP_VERSION = '0.1.0';

export const metaModule = (deps: Deps) =>
  new Elysia().get('/meta', () => ({
    app: APP_NAME,
    name: deps.config.serverName,
    version: APP_VERSION,
    apiVersion: API_VERSION,
    registrationMode: deps.config.registrationMode,
    turnstileSiteKey: deps.config.turnstile?.siteKey ?? null,
  }));
