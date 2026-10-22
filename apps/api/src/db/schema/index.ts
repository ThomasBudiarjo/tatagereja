// One file per module. Each module adds its tables to its own file only; this index and the
// migration journal are the only shared pieces (see docs/ARCHITECTURE-MODULES.md).
export * from './core';
export * from './access';
export * from './audit';
export * from './notifications';
export * from './admin-security';
export * from './people';
export * from './comms';
export * from './insights';
export * from './worship';
export * from './care';
export * from './records';
export * from './finance';
export * from './facilities';
export * from './checkin';
