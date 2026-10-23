// Runs before the app's modules (a classic script, so the Content Security Policy allows it).
// The policy forbids `eval`, so zod must neither probe for it nor compile validators with
// `new Function`: the probe alone is reported as a policy violation.
globalThis.__zod_globalConfig = Object.assign(globalThis.__zod_globalConfig || {}, {
  jitless: true,
});
