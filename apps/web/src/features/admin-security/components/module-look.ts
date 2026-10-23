import type { ModuleId } from '@tatagereja/shared';
import { moduleManifest } from '@/features/registry';

/** The module icon and tone of a permission group, from the module registry. */
export function useModuleLook(module: ModuleId) {
  const manifest = moduleManifest(module);
  return { icon: manifest?.icon, tone: manifest?.accent ?? 'slate' } as const;
}
