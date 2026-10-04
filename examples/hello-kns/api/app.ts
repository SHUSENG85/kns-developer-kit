import { createIdentityClient, KnsHttpError } from '../../../server-kit/kns-server-kit.ts';

const identity=createIdentityClient(process.env.IDENTITY_URL!,process.env.SERVICE_TOKEN!);
export async function handle(req:{url:string;headers:Record<string,string|undefined>;requestId:string}) {
 if(req.url==='/api/v1/hello/health') return {status:200,body:{data:{status:'ok',version:'0.1.0'}}};
 if(req.url==='/api/v1/hello/version') return {status:200,body:{data:{version:'0.1.0'}}};
 if(req.url==='/api/v1/hello') {
  const actor=await identity({cookie:req.headers.cookie,origin:req.headers.origin,requestId:req.requestId},'hello.read');
  return {status:200,body:{data:{message:`Hello, ${actor.displayName}.`}}};
 }
 throw new KnsHttpError(404,'NOT_FOUND','Route not found');
}
