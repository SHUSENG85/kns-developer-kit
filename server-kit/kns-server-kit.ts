/**
 * KNS External Server Kit v1 — safe primitives for a third-party Type B module API.
 *
 * Authentication/authorization remains Core-owned. Module APIs introspect the current browser
 * session through Core using a server-managed module credential. Never expose that credential
 * to the browser or package it in .knsmod source/config.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export type KnsActor = {
  userId: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  sessionVersion: number;
};

export class KnsHttpError extends Error {
  constructor(public statusCode:number, public code:string, message:string) { super(message); }
}

export const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export function equalSecret(a:string,b:string) {
  return Boolean(a && b) && timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
}
export function requirePermission(actor:Pick<KnsActor,'permissions'>,permission:string) {
  if(!actor.permissions.includes(permission)) throw new KnsHttpError(403,'FORBIDDEN','Permission denied');
}
export function readSession(cookie='') {
  const found=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('kns_session='));
  const value=found?.slice('kns_session='.length) ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
export function requiredEnv(name:string, env:NodeJS.ProcessEnv=process.env) {
  const value=env[name]; if(!value) throw new Error(`${name} is required`); return value;
}
export function publicOrigin(env:NodeJS.ProcessEnv=process.env) {
  const value=requiredEnv('PUBLIC_ORIGIN',env); const url=new URL(value);
  if(url.origin!==value || !['https:','http:'].includes(url.protocol)) throw new Error('PUBLIC_ORIGIN must be an origin without a trailing slash');
  if(env.NODE_ENV==='production' && url.protocol!=='https:') throw new Error('Production requires HTTPS');
  return value;
}

export async function serviceFetch<T>(url:string,init:RequestInit):Promise<T> {
  let response:Response;
  try { response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(5000)}); }
  catch { throw new KnsHttpError(503,'DEPENDENCY_UNAVAILABLE','Required service unavailable'); }
  let body:any;
  try { body=await response.json(); }
  catch { throw new KnsHttpError(503,'DEPENDENCY_UNAVAILABLE','Invalid service response'); }
  if(!response.ok) throw new KnsHttpError(
    [400,401,403,404,409,413,429,503].includes(response.status)?response.status:503,
    body.error?.code ?? 'DEPENDENCY_UNAVAILABLE',
    body.error?.message ?? 'Required service unavailable'
  );
  return body.data as T;
}

export function createIdentityClient(identityUrl:string,credential:string) {
  return async (request:{cookie?:string;csrfToken?:string;origin?:string;requestId:string},permission:string,mutation=false):Promise<KnsActor> => {
    const sessionToken=readSession(request.cookie);
    if(!sessionToken) throw new KnsHttpError(401,'UNAUTHENTICATED','Sign in required');
    return serviceFetch<KnsActor>(`${identityUrl}/internal/v1/identity/introspect`,{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${credential}`,'x-correlation-id':request.requestId},
      body:JSON.stringify({sessionToken,permission,mutation,csrfToken:request.csrfToken,origin:request.origin})
    });
  };
}

export type CapabilityRequirement={id:string;versionRange:string};
export type CapabilityProvider={id:string;version:string;state:'AVAILABLE'|'DEGRADED'|'UNAVAILABLE'|'DISABLED'};
export function resolveCapability(requirement:CapabilityRequirement,provider:CapabilityProvider|null,required:boolean,phase:'install'|'startup'|'runtime'='runtime') {
  const minimum=requirement.versionRange.match(/^\^([1-9][0-9]*)\.([0-9]+)\.([0-9]+)$/);
  const parts=provider?.version.split('.').map(Number) ?? [];
  const compatible=minimum!==null && provider!==null && provider.id===requirement.id && parts[0]===Number(minimum[1]) &&
    (parts[1]>Number(minimum[2]) || (parts[1]===Number(minimum[2]) && parts[2]>=Number(minimum[3])));
  const state=compatible && provider ? provider.state : 'UNAVAILABLE';
  if(required && (!compatible || (phase!=='install' && state!=='AVAILABLE' && state!=='DEGRADED')))
    throw new Error(`Required capability ${requirement.id} ${requirement.versionRange} unavailable`);
  return {id:requirement.id,state,version:compatible&&provider?provider.version:null};
}
