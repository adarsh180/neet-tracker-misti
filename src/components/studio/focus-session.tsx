"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import Link from "next/link";

const KEY="neet:focus-session-v1";
const EMPTY='{"remaining":1500,"deadline":null}';
function read(){try{return localStorage.getItem(KEY)||EMPTY;}catch{return EMPTY;}}
function subscribe(callback:()=>void){window.addEventListener("storage",callback);window.addEventListener(KEY,callback);return()=>{window.removeEventListener("storage",callback);window.removeEventListener(KEY,callback);};}
function persist(remaining:number,deadline:number|null){try{localStorage.setItem(KEY,JSON.stringify({remaining,deadline}));window.dispatchEvent(new Event(KEY));}catch{}}
export default function FocusSession(){
 const snapshot=useSyncExternalStore(subscribe,read,()=>EMPTY);
 const timer=useMemo(()=>{try{const v=JSON.parse(snapshot);return {remaining:Number.isFinite(v.remaining)?Math.max(0,Math.min(7200,v.remaining)):1500,deadline:Number.isFinite(v.deadline)?v.deadline as number:null};}catch{return {remaining:1500,deadline:null};}},[snapshot]);
 const [now,setNow]=useState(0);
 useEffect(()=>{if(!timer.deadline)return;const update=()=>setNow(Date.now());const id=window.setInterval(update,250);return()=>clearInterval(id);},[timer.deadline]);
 const remaining=timer.deadline&&now?Math.max(0,Math.ceil((timer.deadline-now)/1000)):timer.remaining;
 const running=Boolean(timer.deadline&&remaining>0);
 return <section className="studio-panel focus-session" id="focus-timer" aria-label="Focus session">
  <div><span className="studio-eyebrow"><Timer size={14}/> A LITTLE ROOM TO FOCUS</span><h2>{remaining===0?"A moment well spent.":"One thing at a time."}</h2><p>Keep this space open while you study. Add the session to your daily log when you’re done.</p></div>
  <div className="focus-controls"><output aria-label="Time remaining">{String(Math.floor(remaining/60)).padStart(2,"0")}<span>:</span>{String(remaining%60).padStart(2,"0")}</output><button className="studio-action primary" onClick={()=>{const value=timer.deadline?Math.max(0,Math.ceil((timer.deadline-Date.now())/1000)) || 1500:remaining||1500;setNow(Date.now());persist(value,running?null:Date.now()+value*1000);}}>{running?<Pause size={16}/>:<Play size={16}/>} {running?"Pause":"Focus"}</button><button className="studio-action" aria-label="Reset focus timer to 25 minutes" onClick={()=>persist(1500,null)}><RotateCcw size={16}/></button>{remaining===0&&<Link href="/daily-goals" className="studio-action">Log session</Link>}</div>
  <style jsx>{`.focus-session{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:24px;scroll-margin-top:100px}.focus-session h2{margin:10px 0}.focus-session p{font-size:14px;line-height:1.6;color:var(--text-secondary);max-width:440px;margin:0}.studio-eyebrow{display:flex;align-items:center;gap:8px}.focus-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.focus-controls output{font-size:44px;letter-spacing:-.04em;font-variant-numeric:tabular-nums;margin-right:10px}.focus-controls output span{color:var(--gold)}@media(max-width:850px){.focus-session{align-items:start;flex-direction:column}.focus-controls output{font-size:38px}}`}</style>
 </section>;
}
