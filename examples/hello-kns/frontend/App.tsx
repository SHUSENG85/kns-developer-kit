import { useEffect,useState } from 'react';
import { createKnsSdk } from '../../../sdk/kns-sdk.ts';
import { Alert,Card,ErrorState,Loading,ModulePage } from '../../../ui/components.tsx';
import '../../../ui/styles.css';

const sdk=createKnsSdk();
export default function App(){
 const [state,setState]=useState<{message:string}|null>(null); const [error,setError]=useState('');
 useEffect(()=>{sdk.apiFetch<{message:string}>('/api/v1/hello').then(setState).catch(e=>setError(e.message));},[]);
 return <ModulePage title="Hello KNS" lead="Public Developer Kit reference module">
  <Card title="Core-authorised greeting">
   {error?<ErrorState>{error}</ErrorState>:state?<Alert tone="success">{state.message}</Alert>:<Loading/>}
  </Card>
 </ModulePage>;
}
