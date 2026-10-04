import { Type, type Static } from '@sinclair/typebox';

export const CONTRACT_VERSION = '2';
export const SUPPORTED_PLATFORM_CONTRACTS = ['1', '2'] as const;
export const Text = (maxLength = 200) => Type.String({ minLength: 1, maxLength });

const moduleFields = {
  id: Type.String({ pattern: '^[a-z][a-z0-9-]{1,39}$' }),
  name: Text(),
  version: Type.String({ pattern: '^\\d+\\.\\d+\\.\\d+(?:-[a-zA-Z0-9.-]+)?$' }),
  owner: Text(),
  frontendBasePath: Type.String({ pattern: '^/[a-z][a-z0-9-]*/$' }),
  apiBasePath: Type.String({ pattern: '^/api/v1/[a-z][a-z0-9-]*$' }),
  permissions: Type.Array(Text(100), { minItems: 1, uniqueItems: true }),
  ownedSchemas: Type.Array(Type.String({ pattern: '^[a-z][a-z0-9_]*$' }), { minItems: 1 }),
  eventsProduced: Type.Array(Type.String({ pattern: '^[a-z]+(?:\\.[a-z]+)+\\.v[1-9][0-9]*$' })),
  eventsConsumed: Type.Array(Type.String({ pattern: '^[a-z]+(?:\\.[a-z]+)+\\.v[1-9][0-9]*$' })),
  healthPath: Type.String({ pattern: '^/api/v1/[a-z][a-z0-9-]*/health$' }),
  rollback: Type.Literal('previous-release'),
};
export const ModuleV1Schema = Type.Object(
  { ...moduleFields, requiredPlatformContract: Type.Literal('1') },
  { additionalProperties: false },
);
export const CapabilitySchema = Type.Object(
  {
    id: Type.String({ pattern: '^[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)+$' }),
    version: Type.String({ pattern: '^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$' }),
    ownerDomain: Text(80),
    description: Text(500),
    sensitivity: Type.Union(['PUBLIC','INTERNAL','SENSITIVE','HIGHLY_SENSITIVE'].map((value)=>Type.Literal(value))),
    contractReference: Type.String({ pattern: '^/api/v1/[a-z][a-z0-9-]*/' }),
    permissions: Type.Array(Text(100), { minItems: 1, uniqueItems: true }),
    relatedEvents: Type.Array(Type.String({ pattern: '^[a-z]+(?:\\.[a-z]+)+\\.v[1-9][0-9]*$' }), { uniqueItems: true }),
  },
  { additionalProperties: false },
);
export const CapabilityRequirementSchema = Type.Object(
  { id: CapabilitySchema.properties.id, versionRange: Type.String({ pattern: '^\\^[1-9][0-9]*\\.[0-9]+\\.[0-9]+$' }) },
  { additionalProperties: false },
);
export const ModuleV2Schema = Type.Object(
  {
    ...moduleFields,
    requiredPlatformContract: Type.Literal('2'),
    providesCapabilities: Type.Array(CapabilitySchema),
    requiredCapabilities: Type.Array(CapabilityRequirementSchema),
    optionalCapabilities: Type.Array(CapabilityRequirementSchema),
  },
  { additionalProperties: false },
);
export const ModuleSchema = Type.Union([ModuleV1Schema, ModuleV2Schema]);
export type ModuleManifest = Static<typeof ModuleSchema>;
