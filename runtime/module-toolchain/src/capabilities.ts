import type { ModuleManifest } from '@kns/contracts/module-contract';

export type CapabilityState = 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE' | 'DISABLED';
export type ProviderHealth = Exclude<CapabilityState, 'DISABLED'>;
export type ModuleState = 'ENABLED' | 'MAINTENANCE' | 'DISABLED';
export type Requirement = { id: string; versionRange: string };
export type Provider = { id: string; version: string; state: CapabilityState };

export function capabilityState(module: ModuleState, health: ProviderHealth): CapabilityState {
  if (module === 'DISABLED') return 'DISABLED';
  if (module === 'MAINTENANCE') return 'UNAVAILABLE';
  return health;
}

export function resolveDependency(
  requirement: Requirement,
  provider: Provider | null,
  required: boolean,
  phase: 'install' | 'startup' | 'runtime' = 'runtime',
) {
  const minimum = requirement.versionRange.match(/^\^([1-9][0-9]*)\.([0-9]+)\.([0-9]+)$/);
  const parts = provider?.version.split('.').map(Number) ?? [];
  const compatible =
    minimum !== null &&
    provider !== null &&
    provider.id === requirement.id &&
    parts[0] === Number(minimum[1]) &&
    (parts[1] > Number(minimum[2]) ||
      (parts[1] === Number(minimum[2]) && parts[2] >= Number(minimum[3])));
  const state: CapabilityState = compatible && provider ? provider.state : 'UNAVAILABLE';
  if (
    required &&
    (!compatible || (phase !== 'install' && state !== 'AVAILABLE' && state !== 'DEGRADED'))
  )
    throw new Error(
      `Required capability ${requirement.id} ${requirement.versionRange} unavailable`,
    );
  return { id: requirement.id, state, version: compatible && provider ? provider.version : null };
}

export function validateCapabilityDeclarations(manifest: ModuleManifest) {
  if (manifest.requiredPlatformContract !== '2') return;
  const ids = new Set<string>();
  for (const capability of manifest.providesCapabilities) {
    if (ids.has(capability.id)) throw new Error(`Duplicate capability ${capability.id}`);
    ids.add(capability.id);
    if (!manifest.ownedSchemas.includes(capability.ownerDomain))
      throw new Error(`Capability ${capability.id} declares an unowned domain`);
    if (!capability.contractReference.startsWith(`${manifest.apiBasePath}/`))
      throw new Error(`Capability ${capability.id} has an external contract reference`);
    if (capability.permissions.some((p) => !manifest.permissions.includes(p)))
      throw new Error(`Capability ${capability.id} declares an unknown permission`);
    if (capability.relatedEvents.some((e) => !manifest.eventsProduced.includes(e)))
      throw new Error(`Capability ${capability.id} declares an unknown event`);
  }
  const dependencies = [...manifest.requiredCapabilities, ...manifest.optionalCapabilities];
  const used = new Set<string>();
  for (const dependency of dependencies) {
    if (used.has(dependency.id) || ids.has(dependency.id))
      throw new Error(`Duplicate or self-provided dependency ${dependency.id}`);
    used.add(dependency.id);
  }
}
