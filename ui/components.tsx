import type { ElementType, ReactNode } from 'react';

export type Tone='neutral'|'info'|'success'|'warning'|'danger';

export function ModulePage({title,lead,actions,children}:{title:ReactNode;lead?:ReactNode;actions?:ReactNode;children:ReactNode}) {
 return <main id="main" className="kns-module-page" tabIndex={-1}>
  <header className="kns-page-header"><div><h1>{title}</h1>{lead&&<p className="kns-lead">{lead}</p>}</div>{actions&&<div className="kns-page-actions">{actions}</div>}</header>
  {children}
 </main>;
}
export function Card({title,actions,as:Tag='section',children}:{title?:ReactNode;actions?:ReactNode;as?:ElementType;children:ReactNode}) {
 return <Tag className="card">{(title||actions)&&<div className="kns-card-header">{title&&<h2>{title}</h2>}{actions}</div>}{children}</Tag>;
}
export function Alert({tone='info',title,children}:{tone?:Tone;title?:string;children:ReactNode}) {
 return <div className={`kns-alert ${tone}`} role={tone==='danger'?'alert':'status'}>{title&&<strong>{title}</strong>}<div>{children}</div></div>;
}
export function Badge({tone='neutral',children}:{tone?:Tone;children:ReactNode}) { return <span className={`kns-badge ${tone}`}>{children}</span>; }
export function Loading({children='Loading…'}:{children?:ReactNode}) { return <p role="status" className="kns-loading">{children}</p>; }
export function Empty({title,children}:{title?:string;children?:ReactNode}) { return <div className="kns-empty">{title&&<strong>{title}</strong>}{children}</div>; }
export function ErrorState({children,onRetry}:{children:ReactNode;onRetry?:()=>void}) { return <div role="alert" className="kns-error">{children}{onRetry&&<button type="button" className="secondary" onClick={onRetry}>Try again</button>}</div>; }
export function SectionHeader({title,description,actions}:{title:ReactNode;description?:ReactNode;actions?:ReactNode}) {
 return <div className="kns-section-header"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{actions}</div>;
}
