import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path: string) => JSON.parse(await read(path));

test('public timetable feature release uses governing v4.3 authority', async () => {
  assert.equal((await json('package.json')).version, '1.3.0');
  const guide = await read('docs/module-guide.md');
  const pack = await read('KNS-MODULE-DEVELOPER-PACK.md');
  assert.ok(
    /1\. KNS Master Blueprint v4\.3;/.test(guide),
    'module guide must identify governing v4.3',
  );
  assert.ok(
    /Governing blueprint:\*\* KNS Master Architecture Blueprint v4\.3/.test(pack),
    'Developer Pack must identify governing v4.3',
  );
});

test('public-only discovery validates timetable callable shape, states and bounds', async () => {
  const catalog = await json('capabilities/catalog.json');
  const entry = catalog.capabilities.find((item: { id: string }) => item.id === 'master.timetable');
  assert.ok(entry);
  const contract = await json('capabilities/master.timetable.v1.json');
  const schema = await json('contracts/capability-callable.schema.json');
  const ajv = new Ajv2020({ strict: true });
  addFormats(ajv);
  assert.ok(ajv.validate(schema, contract), ajv.errorsText());
  assert.deepEqual(contract.capability, { id: entry.id, version: entry.version });
  assert.equal(contract.ownerDomain, entry.ownerDomain);
  assert.equal(contract.sensitivity, entry.sensitivity);
  assert.equal(contract.permission, entry.permissions[0]);
  assert.equal(contract.contractReference, entry.contractReference);
  assert.deepEqual(contract.relatedEvents, entry.relatedEvents);
  assert.deepEqual(contract.dataStates, ['PROVEN', 'NO_SCHEDULE', 'UNPROVEN', 'CONFLICT']);
  assert.deepEqual(contract.bounds, {
    dateRangeInclusiveDays: 31,
    validIsoDatesRequired: true,
    periodIndexMinimum: 0,
    periodIndexMaximum: 14,
    availabilityMaximumItems: 500,
    availabilityOverflow: 'ERROR_NOT_TRUNCATION',
  });
  assert.deepEqual(
    contract.operations.map((operation: { method: string; path: string }) => [
      operation.method,
      operation.path,
    ]),
    [
      ['GET', '/api/v1/master/academic/timetable/staff/{staffId}/slots'],
      ['GET', '/api/v1/master/academic/timetable/classes/{classId}/slots'],
      ['GET', '/api/v1/master/academic/timetable/availability'],
    ],
  );
  const publication = {
    id: '00000000-0000-4000-8000-000000000001',
    academicYearId: '00000000-0000-4000-8000-000000000002',
    sourceVersionLabel: 'synthetic',
    effectiveFrom: '2026-01-05',
  };
  for (const operation of contract.operations) {
    assert.equal(operation.permission, 'academic.timetable.read');
    for (const state of contract.dataStates) {
      const data =
        operation.operationId === 'readMasterTimetableAvailability'
          ? { state, publication: state === 'PROVEN' ? publication : null, items: [] }
          : {
              state,
              publications: state === 'PROVEN' ? [publication] : [],
              dates: [
                { date: '2026-01-05', state, publication: state === 'PROVEN' ? publication : null },
              ],
              items: [],
            };
      assert.ok(
        ajv.validate(operation.responses['200'].content['application/json'].schema, { data }),
        ajv.errorsText(),
      );
    }
    for (const parameter of operation.parameters) {
      if (parameter.in === 'path') {
        assert.ok(ajv.validate(parameter.schema, publication.id));
        assert.equal(ajv.validate(parameter.schema, 'a workbook name'), false);
      }
      if (parameter.name === 'periodIndex') {
        assert.ok(ajv.validate(parameter.schema, '0'));
        assert.ok(ajv.validate(parameter.schema, '14'));
        assert.equal(ajv.validate(parameter.schema, '15'), false);
      }
    }
  }
  assert.doesNotMatch(JSON.stringify(contract), /\$ref|\/intake\/|source_token|source_snapshot_id/);
});

test('third-party required timetable capability validates without granting runtime permission', async () => {
  const example = await json('examples/hello-kns/module.json');
  const manifest = {
    ...example.module,
    requiredCapabilities: [{ id: 'master.timetable', versionRange: '^1.0.0' }],
  };
  const ajv = new Ajv2020({ strict: true });
  assert.ok(
    ajv.validate(await json('contracts/module-v2.schema.json'), manifest),
    ajv.errorsText(),
  );
  assert.equal(manifest.permissions.includes('academic.timetable.read'), false);
  const contract = await json('capabilities/master.timetable.v1.json');
  assert.equal(contract.authorization.permission, 'academic.timetable.read');
  assert.equal(contract.authorization.capabilityAvailabilityGrantsPermission, false);
  assert.equal(contract.authorization.installationGrantsPermission, false);
  assert.equal(contract.semantics.positiveAvailabilityOnly, true);
  assert.equal(contract.semantics.historicalCurrentFallback, false);
  assert.deepEqual(contract.semantics.emptyItemsForStates, ['NO_SCHEDULE', 'UNPROVEN', 'CONFLICT']);
  assert.match(contract.authorization.productionReadiness, /does not prove production deployment/);
});

test('existing Staff Directory callable contract retains its accepted bytes', async () => {
  const value = (await read('capabilities/master.staff-directory.v1.json')).replaceAll(
    '\r\n',
    '\n',
  );
  assert.equal(
    createHash('sha256').update(value).digest('hex'),
    '6b03dda0ffe6d414cc0444113996a655798435dc1d515dd559cc45b22c664838',
  );
});
