// PostgreSQL-grammar migration policy for external packages (design §20). Defense in depth only:
// the restricted migrator login remains the enforcement boundary. Fail closed: anything not
// positively recognised as additive DDL/DML inside the module's owned schemas is a problem.

let ready: Promise<void> | null = null;
let parseSync: ((sql: string) => unknown) | null = null;

/**
 * Load the WASM parser once, on demand. It is imported lazily so that processes which never
 * validate packages (Core) never load or initialise it; validation fails closed until loaded.
 */
export function loadSqlParser() {
  ready ??= import('libpg-query').then(async (parser) => {
    await parser.loadModule();
    parseSync = parser.parseSync;
  });
  return ready;
}

const STATEMENTS = new Set([
  'CreateStmt',
  'IndexStmt',
  'CreateSeqStmt',
  'CreateEnumStmt',
  'AlterTableStmt',
  'InsertStmt',
  'CommentStmt',
]);
// Functions allowed anywhere in expressions (defaults, checks, values, index predicates).
const FUNCTIONS = new Set([
  'now',
  'gen_random_uuid',
  'lower',
  'upper',
  'length',
  'char_length',
  'btrim',
  'abs',
]);
const CONSTRAINTS = new Set([
  'CONSTR_NULL',
  'CONSTR_NOTNULL',
  'CONSTR_DEFAULT',
  'CONSTR_CHECK',
  'CONSTR_PRIMARY',
  'CONSTR_UNIQUE',
  'CONSTR_FOREIGN',
  'CONSTR_IDENTITY',
  'CONSTR_ATTR_DEFERRABLE',
  'CONSTR_ATTR_NOT_DEFERRABLE',
  'CONSTR_ATTR_DEFERRED',
  'CONSTR_ATTR_IMMEDIATE',
]);
const ALTER_COMMANDS = new Set(['AT_AddColumn', 'AT_AddConstraint']);
const COMMENT_OBJECTS = new Set([
  'OBJECT_TABLE',
  'OBJECT_COLUMN',
  'OBJECT_INDEX',
  'OBJECT_SEQUENCE',
  'OBJECT_TYPE',
]);
// Nodes that are never acceptable inside an external package migration.
const FORBIDDEN_NODES = new Set([
  'SubLink',
  'SelectStmt',
  'WithClause',
  'CommonTableExpr',
  'TableLikeClause',
  'PartitionSpec',
  'PartitionBoundSpec',
  'RangeFunction',
  'ParamRef',
]);

type Node = Record<string, unknown>;
const sval = (n: unknown) => (n as { String?: { sval?: string } })?.String?.sval;
const names = (list: unknown) =>
  Array.isArray(list) ? list.map((n) => sval(n) ?? '\u0000') : ['\u0000'];

/**
 * Parse with the PostgreSQL 18 grammar and allow only additive statements whose every relation,
 * type and constraint target lies inside `owned`. Returns problems; empty means acceptable.
 */
export function parsedMigrationProblems(owned: readonly string[], sql: string): string[] {
  if (!parseSync) return ['SQL parser not loaded; migration cannot be verified'];
  let stmts: Array<{ stmt?: Node }>;
  try {
    stmts = (parseSync(sql) as { stmts?: Array<{ stmt?: Node }> }).stmts ?? [];
  } catch (error) {
    return [`SQL does not parse: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (!stmts.length) return ['migration contains no statements'];
  const ownedSet = new Set(owned);
  const problems: string[] = [];
  const schemaOk = (schema: string | undefined, what: string) => {
    if (!schema) problems.push(`${what} must be schema-qualified`);
    else if (!ownedSet.has(schema)) problems.push(`${what} is in non-owned schema "${schema}"`);
  };
  const typeOk = (typeName: Node | undefined, what: string) => {
    const parts = names(typeName?.names);
    if (parts.length === 2 && parts[0] !== 'pg_catalog') schemaOk(parts[0], what);
    else if (parts.length > 2) problems.push(`${what} has an unsupported qualified type`);
  };
  const constraintOk = (c: Node, where: string) => {
    if (!CONSTRAINTS.has(String(c.contype))) {
      problems.push(`${where}: constraint ${String(c.contype)} is not allowed`);
      return;
    }
    if (c.contype === 'CONSTR_FOREIGN')
      schemaOk(
        (c.pktable as Node | undefined)?.schemaname as string | undefined,
        `${where} foreign key`,
      );
    if (c.indexspace) problems.push(`${where}: tablespaces are not allowed`);
  };

  // Generic walk: every relation, function and type anywhere in the tree.
  const walk = (node: unknown, statement: string, insideInsertValues = false) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, statement, insideInsertValues);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Node)) {
      if (FORBIDDEN_NODES.has(key) && !(key === 'SelectStmt' && insideInsertValues))
        problems.push(`${statement}: ${key} is not allowed`);
      if (key === 'RangeVar' || key === 'relation' || key === 'sequence' || key === 'pktable') {
        const rel = (key === 'RangeVar' ? value : value) as Node;
        if (rel && typeof rel === 'object' && 'relname' in rel) {
          schemaOk(
            rel.schemaname as string | undefined,
            `${statement} relation ${String(rel.relname)}`,
          );
          if (rel.relpersistence && rel.relpersistence !== 'p')
            problems.push(`${statement}: temporary or unlogged relations are not allowed`);
        }
      }
      if (key === 'FuncCall') {
        const fn = names((value as Node).funcname);
        const name =
          fn.length === 2 && fn[0] === 'pg_catalog' ? fn[1] : fn.length === 1 ? fn[0] : null;
        if (!name || !FUNCTIONS.has(name))
          problems.push(`${statement}: function ${fn.join('.')} is not allowed`);
      }
      if (key === 'TypeCast' || key === 'ColumnDef')
        typeOk((value as Node).typeName as Node, `${statement} type`);
      if (key === 'Constraint') constraintOk(value as Node, statement);
      if (key === 'tableSpace' || key === 'tablespacename')
        problems.push(`${statement}: tablespaces are not allowed`);
      walk(value, statement, insideInsertValues);
    }
  };

  for (const { stmt } of stmts) {
    const [kind, body] = Object.entries(stmt ?? {})[0] ?? ['(empty)', {}];
    const s = body as Node;
    if (!STATEMENTS.has(kind)) {
      problems.push(`${kind} is not allowed (additive owned-schema DDL/DML only)`);
      continue;
    }
    if (kind === 'CreateStmt') {
      if (s.inhRelations || s.partbound || s.partspec || s.ofTypename || s.accessMethod)
        problems.push(
          'CreateStmt: inheritance, partitions, typed tables and access methods are not allowed',
        );
      if (s.oncommit && s.oncommit !== 'ONCOMMIT_NOOP')
        problems.push('CreateStmt: ON COMMIT is not allowed');
      walk(s, kind);
    } else if (kind === 'IndexStmt') {
      if (s.concurrent) problems.push('IndexStmt: CONCURRENTLY is not allowed');
      walk(s, kind);
    } else if (kind === 'CreateSeqStmt') {
      for (const option of (s.options as Node[] | undefined) ?? []) {
        const def = option.DefElem as Node;
        if (def?.defname === 'owned_by') {
          const owner = names((def.arg as { List?: { items?: unknown[] } })?.List?.items);
          if (!(owner.length === 1 && owner[0] === 'none'))
            schemaOk(owner.length === 3 ? owner[0] : undefined, 'sequence OWNED BY');
        }
      }
      walk(s, kind);
    } else if (kind === 'CreateEnumStmt') {
      const parts = names(s.typeName);
      if (parts.length !== 2) problems.push('CreateEnumStmt: type must be schema-qualified');
      else schemaOk(parts[0], `type ${parts[1]}`);
      walk(s.vals, kind);
    } else if (kind === 'AlterTableStmt') {
      if (s.objtype !== 'OBJECT_TABLE') problems.push('AlterTableStmt: only tables may be altered');
      for (const cmd of (s.cmds as Node[] | undefined) ?? []) {
        const subtype = String((cmd.AlterTableCmd as Node)?.subtype);
        if (!ALTER_COMMANDS.has(subtype))
          problems.push(`AlterTableStmt: ${subtype} is not additive`);
      }
      walk(s, kind);
    } else if (kind === 'InsertStmt') {
      const select = (s.selectStmt as Node | undefined)?.SelectStmt as Node | undefined;
      const valuesOnly =
        select &&
        Array.isArray(select.valuesLists) &&
        !select.targetList &&
        !select.fromClause &&
        !select.whereClause &&
        !select.withClause;
      if (!valuesOnly) problems.push('InsertStmt: only INSERT ... VALUES is allowed');
      if (s.withClause) problems.push('InsertStmt: WITH is not allowed');
      if (s.returningList) problems.push('InsertStmt: RETURNING is not allowed');
      const conflict = s.onConflictClause as Node | undefined;
      if (conflict && conflict.action !== 'ONCONFLICT_NOTHING')
        problems.push('InsertStmt: only ON CONFLICT DO NOTHING is allowed');
      walk({ relation: s.relation, cols: s.cols }, kind);
      walk(select?.valuesLists, kind, true);
      walk(conflict, kind);
    } else if (kind === 'CommentStmt') {
      if (!COMMENT_OBJECTS.has(String(s.objtype)))
        problems.push(`CommentStmt: ${String(s.objtype)} comments are not allowed`);
      else {
        const items = names(
          (s.object as { List?: { items?: unknown[] } })?.List?.items ?? s.object,
        );
        schemaOk(items.length >= 2 ? items[0] : undefined, 'comment target');
      }
    }
  }
  return [...new Set(problems)];
}
