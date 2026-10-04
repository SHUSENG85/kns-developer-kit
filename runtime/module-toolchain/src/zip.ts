import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

// Strict ZIP subset for .knsmod: what the KNS packer writes and nothing more. Anything outside the
// subset is refused before any member is inflated or written anywhere.

export type ZipLimits = {
  maxPackageBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxRatio: number;
  ratioFloorBytes: number;
};
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxPackageBytes: 768 * 1024 * 1024,
  maxEntries: 2000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxRatio: 200,
  ratioFloorBytes: 1024 * 1024,
};

export class ArchiveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new ArchiveError(code, message);
};

const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Package member path policy shared by the reader, the packer and nested-archive checks. */
export function pathProblem(name: string): string | null {
  if (!name) return 'empty path';
  if (name.length > 512) return 'path too long';
  if (name !== name.normalize('NFC')) return 'path is not NFC-normalized';
  if (/[\x00-\x1f\x7f]/.test(name)) return 'control character in path';
  if (name.includes('\\')) return 'backslash in path';
  if (name.startsWith('/')) return 'absolute path';
  if (/^[a-zA-Z]:/.test(name)) return 'drive-letter path';
  if (name.endsWith('/')) return 'directory entry';
  for (const segment of name.split('/')) {
    if (!segment) return 'empty path segment';
    if (segment === '.' || segment === '..') return 'dot path segment (traversal)';
    if (RESERVED_WINDOWS.test(segment)) return 'reserved device name';
    if (/[<>:"|?*]/.test(segment)) return 'unsafe character in path';
    if (segment.endsWith(' ') || segment.endsWith('.')) return 'trailing space or dot in segment';
  }
  return null;
}

export type ZipMember = { name: string; data: Buffer };

const u16 = (b: Buffer, o: number) => b.readUInt16LE(o);
const u32 = (b: Buffer, o: number) => b.readUInt32LE(o);

/** Parse and fully verify a .knsmod archive in memory. Returns members in archive order. */
export function readZip(bytes: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipMember[] {
  if (bytes.length > limits.maxPackageBytes)
    fail('PACKAGE_TOO_LARGE', 'package exceeds size limit');
  if (bytes.length < 22) fail('NOT_A_ZIP', 'archive too small');
  const eocd = bytes.length - 22;
  // No archive comment and no trailing data: the end record must close the file exactly.
  if (u32(bytes, eocd) !== 0x06054b50) {
    for (let i = eocd - 1; i >= Math.max(0, bytes.length - 65557); i--)
      if (u32(bytes, i) === 0x06054b50) {
        if (u16(bytes, i + 20) > 0 && i + 22 + u16(bytes, i + 20) === bytes.length)
          fail('ARCHIVE_COMMENT', 'archive comments are not allowed');
        fail('TRAILING_DATA', 'data after the end of the archive');
      }
    fail('NOT_A_ZIP', 'end-of-central-directory record not found');
  }
  if (u16(bytes, eocd + 20) !== 0) fail('ARCHIVE_COMMENT', 'archive comments are not allowed');
  if (u16(bytes, eocd + 4) !== 0 || u16(bytes, eocd + 6) !== 0)
    fail('MULTI_DISK', 'multi-disk archives are not allowed');
  const count = u16(bytes, eocd + 10);
  if (u16(bytes, eocd + 8) !== count) fail('MULTI_DISK', 'inconsistent entry counts');
  const cdSize = u32(bytes, eocd + 12);
  const cdOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    fail('ZIP64', 'ZIP64 archives are not supported');
  if (count === 0) fail('EMPTY_ARCHIVE', 'archive has no members');
  if (count > limits.maxEntries) fail('TOO_MANY_ENTRIES', 'too many archive members');
  if (cdOffset + cdSize !== eocd)
    fail('MALFORMED', 'central directory does not end at the end record');

  type Central = {
    name: string;
    method: number;
    crc: number;
    csize: number;
    usize: number;
    offset: number;
  };
  const central: Central[] = [];
  const seen = new Set<string>();
  const folded = new Set<string>();
  let total = 0;
  let p = cdOffset;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || u32(bytes, p) !== 0x02014b50)
      fail('MALFORMED', 'bad central directory record');
    const madeBy = u16(bytes, p + 4);
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    const csize = u32(bytes, p + 20);
    const usize = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const disk = u16(bytes, p + 34);
    const external = u32(bytes, p + 38);
    const offset = u32(bytes, p + 42);
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > eocd) fail('MALFORMED', 'central directory record overruns');
    if (flags & 0x0001) fail('ENCRYPTED_MEMBER', 'encrypted members are not allowed');
    if (flags & ~0x0800) fail('UNSUPPORTED_FLAGS', 'unsupported general-purpose flags');
    if (method !== 0 && method !== 8)
      fail('UNSUPPORTED_METHOD', 'only STORE and DEFLATE are allowed');
    if (disk !== 0) fail('MULTI_DISK', 'member on another disk');
    if (commentLen) fail('MEMBER_COMMENT', 'member comments are not allowed');
    if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff)
      fail('ZIP64', 'ZIP64 members are not supported');
    const rawName = bytes.subarray(p + 46, p + 46 + nameLen);
    let name: string;
    try {
      name = flags & 0x0800 ? decoder.decode(rawName) : rawName.toString('latin1');
    } catch {
      return fail('BAD_NAME_ENCODING', 'member name is not valid UTF-8');
    }
    if (!(flags & 0x0800) && /[^\x20-\x7e]/.test(name))
      fail('BAD_NAME_ENCODING', 'non-ASCII member name without UTF-8 flag');
    const problem = pathProblem(name);
    if (problem) fail('UNSAFE_PATH', `${problem}: ${JSON.stringify(name.slice(0, 120))}`);
    const host = madeBy >> 8;
    if (host === 3) {
      const type = (external >>> 16) & 0o170000;
      if (type === 0o120000) fail('SYMLINK', `symlink member: ${name}`);
      if (type !== 0 && type !== 0o100000) fail('SPECIAL_FILE', `non-regular member: ${name}`);
    } else if (host === 0) {
      if (external & 0x10) fail('DIRECTORY', `directory member: ${name}`);
    } else fail('UNSUPPORTED_HOST', 'unsupported archive host system');
    if (seen.has(name)) fail('DUPLICATE_PATH', `duplicate member: ${name}`);
    seen.add(name);
    const fold = name.toLowerCase();
    if (folded.has(fold)) fail('CASE_COLLISION', `case-colliding member: ${name}`);
    folded.add(fold);
    if (usize > limits.maxEntryBytes) fail('ENTRY_TOO_LARGE', `member exceeds size limit: ${name}`);
    total += usize;
    if (total > limits.maxTotalBytes)
      fail('TOTAL_TOO_LARGE', 'total uncompressed size exceeds limit');
    if (method === 0 && csize !== usize) fail('MALFORMED', `stored size mismatch: ${name}`);
    if (usize >= limits.ratioFloorBytes && usize / Math.max(csize, 1) > limits.maxRatio)
      fail('COMPRESSION_RATIO', `suspicious compression ratio: ${name}`);
    central.push({ name, method, crc, csize, usize, offset });
    p = end;
  }
  if (p !== eocd) fail('MALFORMED', 'trailing bytes in central directory');

  // Local records must tile the file from offset 0 up to the central directory: no prepended,
  // hidden, gap or overlapping data (overlapping members are a classic ZIP-bomb technique).
  const ordered = [...central].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  const members = new Map<string, Buffer>();
  for (const entry of ordered) {
    if (entry.offset !== cursor) fail('MALFORMED', 'members are not contiguous');
    const o = entry.offset;
    if (o + 30 > cdOffset || u32(bytes, o) !== 0x04034b50) fail('MALFORMED', 'bad local header');
    const nameLen = u16(bytes, o + 26);
    const extraLen = u16(bytes, o + 28);
    const localName = bytes.subarray(o + 30, o + 30 + nameLen).toString('utf8');
    if (
      localName !== entry.name ||
      u16(bytes, o + 6) !== (u16(bytes, o + 6) & 0x0800) ||
      u16(bytes, o + 8) !== entry.method ||
      u32(bytes, o + 14) !== entry.crc ||
      u32(bytes, o + 18) !== entry.csize ||
      u32(bytes, o + 22) !== entry.usize
    )
      fail('HEADER_MISMATCH', `local header disagrees with central directory: ${entry.name}`);
    const start = o + 30 + nameLen + extraLen;
    const stop = start + entry.csize;
    if (stop > cdOffset) fail('MALFORMED', `member data overruns: ${entry.name}`);
    const raw = bytes.subarray(start, stop);
    let data: Buffer;
    if (entry.method === 0) data = raw;
    else {
      try {
        data = inflateRawSync(raw, { maxOutputLength: Math.max(entry.usize, 1) });
      } catch {
        return fail(
          'INFLATE_FAILED',
          `member does not inflate within its declared size: ${entry.name}`,
        );
      }
    }
    if (data.length !== entry.usize) fail('SIZE_MISMATCH', `declared size mismatch: ${entry.name}`);
    if (crc32(data) >>> 0 !== entry.crc >>> 0) fail('CRC_MISMATCH', `CRC mismatch: ${entry.name}`);
    members.set(entry.name, data);
    cursor = stop;
  }
  if (cursor !== cdOffset) fail('MALFORMED', 'hidden data before central directory');
  return central.map((entry) => ({ name: entry.name, data: members.get(entry.name)! }));
}

/**
 * Deterministic writer: members sorted by path, fixed 1980-01-01 timestamp, fixed permissions,
 * UTF-8 names, no extra fields or comments. Identical input bytes give identical archive bytes for
 * the same zlib implementation (members that do not shrink are STOREd).
 */
export function writeZip(members: ReadonlyArray<ZipMember>): Buffer {
  const sorted = [...members].sort((a, b) =>
    Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)),
  );
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const member of sorted) {
    const problem = pathProblem(member.name);
    if (problem) throw new ArchiveError('UNSAFE_PATH', `${problem}: ${member.name}`);
    if (seen.has(member.name.toLowerCase()))
      throw new ArchiveError('CASE_COLLISION', `duplicate member: ${member.name}`);
    seen.add(member.name.toLowerCase());
    const name = Buffer.from(member.name, 'utf8');
    const deflated = deflateRawSync(member.data, { level: 9 });
    const method = deflated.length < member.data.length ? 8 : 0;
    const body = method === 8 ? deflated : member.data;
    const crc = crc32(member.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // 00:00:00
    local.writeUInt16LE(0x0021, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(member.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // made by Unix, spec 3.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(member.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
