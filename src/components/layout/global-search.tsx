"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Layers, Loader2, Mic, Search, X } from "lucide-react";
import { CHAPTERS } from "@/data/syllabus/neet-chapters";
import { SITE_ASSISTANT_OPEN_EVENT } from "@/lib/site-assistant";
import { searchWorkspaceRoutes, WORKSPACE_ROUTES } from "@/lib/workspace-routes";
import styles from "./studio-search.module.css";
type Result={id:string;type:string;title:string;subtitle:string;href:string};
export default function GlobalSearch(){
 const router=useRouter();
 const dialog=useRef<HTMLDialogElement>(null);
 const input=useRef<HTMLInputElement>(null);
 const opener=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState("");
 const [remote,setRemote]=useState<Result[]>([]);
 const [loading,setLoading]=useState(false);
 const [selected,setSelected]=useState(0);
 const needle=query.trim().toLowerCase();
 const local=useMemo<Result[]>(()=>!needle?[]:[
  ...searchWorkspaceRoutes(needle).map(r=>({id:r.href,type:"PAGE",title:r.label,subtitle:r.group,href:r.href})),
  ...CHAPTERS.filter(c=>`${c.chapter} ${c.subject} ${c.aliases.join(" ")}`.toLowerCase().includes(needle)).slice(0,12).map(c=>({id:`chapter:${c.slug}:${c.classLevel}:${c.chapter}`,type:"CHAPTER",title:c.chapter,subtitle:`Class ${c.classLevel} · ${c.subject}`,href:`/subjects/${c.slug}?chapter=${encodeURIComponent(c.chapter)}`}))
 ],[needle]);
 const results=useMemo(()=>[...local,...remote].filter((item,i,all)=>all.findIndex(other=>other.href===item.href)===i).slice(0,24),[local,remote]);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setOpen(true);}};
  window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
 },[]);
 useEffect(()=>{
  if(!open)return;
  const modal=dialog.current;const trigger=opener.current;
  modal?.showModal();input.current?.focus();
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";
  return()=>{modal?.close();document.body.style.overflow=previous;trigger?.focus();};
 },[open]);
 useEffect(()=>{
  if(needle.length<2)return;
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   setLoading(true);
   try{const response=await fetch(`/api/search?q=${encodeURIComponent(needle)}`,{signal:controller.signal});const data=await response.json();if(response.ok&&!controller.signal.aborted)setRemote(data.results??[]);}
   catch{}finally{if(!controller.signal.aborted)setLoading(false);}
  },180);
  return()=>{controller.abort();clearTimeout(timer);};
 },[needle]);
 const change=(value:string)=>{setQuery(value);setRemote([]);setSelected(0);setLoading(false);};
 const close=()=>{dialog.current?.close();setOpen(false);change("");};
 const voice=()=>{close();window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_OPEN_EVENT));};
 return <>
  <div data-studio-chrome className={styles.dock}><button ref={opener} className={styles.trigger} onClick={()=>setOpen(true)} aria-label="Search all pages, subjects and chapters"><Search size={18}/><span>Find your next step…</span></button><button className={styles.mic} onClick={voice} title="Ask Bubu" aria-label="Open voice assistant"><Mic size={20} strokeWidth={1.6}/></button></div>
  <dialog ref={dialog} className={styles.dialog} onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close();}} aria-label="Search your workspace">
   <div className={styles.field}><Search size={22}/><input ref={input} value={query} placeholder="A page, chapter, or topic…" aria-label="Search your workspace" role="combobox" aria-expanded={!!needle} aria-controls="studio-search-options" aria-activedescendant={results.length?`studio-result-${selected}`:undefined} onChange={e=>change(e.target.value)} onKeyDown={e=>{
    if(e.key==="ArrowDown"){e.preventDefault();setSelected(v=>(v+1)%Math.max(1,results.length));}
    if(e.key==="ArrowUp"){e.preventDefault();setSelected(v=>(v-1+results.length)%Math.max(1,results.length));}
    if(e.key==="Enter"&&results[selected]){e.preventDefault();const href=results[selected].href;close();router.push(href);}
   }}/>{loading?<Loader2 size={18} className="spin"/>:<button onClick={close} aria-label="Close search"><X size={20}/></button>}</div>
   <div className={styles.results} id="studio-search-options" role="listbox" aria-label="Search results">
    {needle?results.length?results.map((item,index)=><Link id={`studio-result-${index}`} key={item.id} href={item.href} role="option" aria-selected={selected===index} onMouseEnter={()=>setSelected(index)} onClick={close}><span className={styles.icon}>{item.type==="PAGE"?<Layers size={18}/>:<BookOpen size={18}/>}</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><ArrowUpRight size={16}/></Link>):<p className={styles.empty}>{loading?"Searching…":"No match yet. Try the subject or chapter name."}</p>:<><p className={styles.caption}>PICK UP WHERE YOU WANT</p>{WORKSPACE_ROUTES.filter(r=>["/daily-goals","/practice","/reader","/todo"].includes(r.href)).map(r=><Link key={r.href} href={r.href} onClick={close}><span className={styles.icon}><ArrowUpRight size={18}/></span><span><strong>{r.label}</strong><small>{r.group}</small></span></Link>)}</>}
   </div>
   <footer className={styles.footer}><span>Pages · subjects · chapters · topics</span><button onClick={voice}><Mic size={16}/> Ask Bubu</button></footer>
  </dialog>
 </>;
}
