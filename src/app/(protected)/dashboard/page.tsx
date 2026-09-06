"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, Clock3, Mic, RefreshCw, Target } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import ResponsiveChart from "@/components/charts/ResponsiveChart";
import SubjectMark from "@/components/studio/subject-mark";
import MetricNote from "@/components/studio/metric-note";
import FocusSession from "@/components/studio/focus-session";
import { SITE_ASSISTANT_OPEN_EVENT } from "@/lib/site-assistant";
import styles from "./dashboard.module.css";
type Subject={id:string;slug:string;name:string;totalTopics:number;completedTopics:number;completionPct:number;totalQuestions:number;pendingRevisions:number;last7DaysHours:number};
type Metrics={studentName:string;subjects:Subject[];overallPct:number;completedTopics:number;totalTopics:number;totalStudyHours:number;totalQuestions:number;streak:number;testCount:number;recentHours7:number;recentQuestions7:number;pulse:number[];pulseDays?:{date:string;hours:number|null}[];dataHealth?:{databaseAvailable:boolean}};
type Task={id:string;title:string;status:string;dueDate:string|null;plannedMinutes:number|null;subject?:{name:string}|null};
type Reader={id:string;title:string;subject:string;progress:{currentPage:number}|null};
const number=(n:number)=>new Intl.NumberFormat("en-IN",{maximumFractionDigits:1}).format(n);
export default function DashboardPage(){
 const [metrics,setMetrics]=useState<Metrics|null>(null);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [reader,setReader]=useState<Reader|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/dashboard/metrics",{cache:"no-store"});
   const data=await response.json();
   if(!response.ok||data.dataHealth?.databaseAvailable===false)throw new Error("Your study data is temporarily unavailable. Nothing has been reset.");
   setMetrics(data);
   const extras=await Promise.allSettled([fetch("/api/tasks").then(r=>r.ok?r.json():[]),fetch("/api/reader").then(r=>r.ok?r.json():{})]);
   if(extras[0].status==="fulfilled"&&Array.isArray(extras[0].value))setTasks(extras[0].value);
   if(extras[1].status==="fulfilled"){const library=extras[1].value as {documents?:Reader[]};setReader(library.documents?.find(d=>d.progress)??null);}
  }catch(e){setError(e instanceof Error?e.message:"Could not load your workspace.");}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const dateKey=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date());
 const todayTasks=tasks.filter(t=>!["DONE","SKIPPED"].includes(t.status)&&(!t.dueDate||t.dueDate.slice(0,10)<=dateKey)).slice(0,3);
 const chart=metrics?.pulseDays?.map(d=>({date:new Date(d.date+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"}),hours:d.hours}))??metrics?.pulse.map((hours,i)=>({date:String(i+1),hours}))??[];
 const ask=()=>window.dispatchEvent(new CustomEvent(SITE_ASSISTANT_OPEN_EVENT));
 return <main className="studio-page">
  <header className="studio-heading"><div><span className="studio-eyebrow">THE DAILY EDITION / NEET 2027</span><h1>Your next chapter, Misti.</h1><p>A little more clarity. A little closer to the doctor you’ll become.</p></div><button className="studio-action" onClick={()=>void load()} disabled={loading} aria-label="Refresh dashboard"><RefreshCw size={16} className={loading?"spin":""}/><span className={styles.date}>{new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</span></button></header>
  {error&&<div className="studio-error" role="alert">{error}<button className="studio-action" onClick={()=>void load()}>Retry</button></div>}
  {loading&&!metrics?<div className={styles.skeleton} aria-label="Loading your study workspace"/>:<>
  <section className={styles.topGrid}>
   <div className={styles.focus}>
    <div className={styles.focusTop}><span className="studio-eyebrow">MAKE ROOM FOR PROGRESS</span><span className={styles.live}><span/> Your private workspace</span></div>
    <div className={styles.focusBody}><div><h2>One focused day.<br/><em>A future in motion.</em></h2><p>Start a session, return to your book, or let Bubu help you record the day.</p><div className={styles.actions}><Link href="/daily-goals" className="studio-action primary">Log today <ArrowRight size={16}/></Link><button className="studio-action" onClick={ask}><Mic size={17}/> Talk to Bubu</button></div></div>
    <div className={styles.completion} aria-label={`${metrics?.overallPct??0}% of tracked topics completed`}><svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="76" className={styles.ringTrack}/><circle cx="90" cy="90" r="76" pathLength="100" className={styles.ringValue} strokeDasharray={`${metrics?.overallPct??0} 100`}/></svg><div><strong>{metrics?.overallPct??"—"}<small>%</small></strong><span>SYLLABUS COVERED</span><p>{metrics?.completedTopics??"—"} / {metrics?.totalTopics??"—"} topics</p></div></div></div>
    <MetricNote>Coverage is the share of your tracked topics marked complete. It measures learning progress, not exam mastery or a predicted score.</MetricNote>
   </div>
   <section className={styles.plan}><div className="studio-panel-head"><h2>On your desk</h2><Link href="/todo"><ArrowUpRight size={18}/><span className="sr-only">Open Todo</span></Link></div>
    {todayTasks.length?todayTasks.map((task,i)=><Link className={styles.task} href="/todo" key={task.id}><span className={styles.taskNumber}>{String(i+1).padStart(2,"0")}</span><div><strong>{task.title}</strong><small>{task.subject?.name??"Personal plan"}{task.plannedMinutes?` · ${task.plannedMinutes} min`:""}</small></div><ArrowUpRight size={15}/></Link>):<div className={styles.empty}><Check size={25}/><p>A clear desk.<br/>Choose your next small step.</p><Link href="/todo">Add a task <ArrowRight size={14}/></Link></div>}
    <Link href={reader?`/reader/${reader.id}`:"/reader"} className={styles.resume}><BookOpen size={20}/><div><small>{reader?"CONTINUE READING":"YOUR NCERT LIBRARY"}</small><strong>{reader?.title??"Open a chapter"}</strong>{reader&&<span>Page {reader.progress?.currentPage}</span>}</div><ArrowRight size={17}/></Link>
   </section>
  </section>
  <section className={styles.stats} aria-label="Saved study totals">{[{label:"Study hours",value:metrics?number(metrics.totalStudyHours):"—",detail:"All saved daily logs",icon:Clock3},{label:"Questions solved",value:metrics?number(metrics.totalQuestions):"—",detail:"Recorded study, not unique questions",icon:Target},{label:"Tests logged",value:metrics?.testCount??"—",detail:"Practice and recorded tests",icon:Check},{label:"Current streak",value:metrics?`${metrics.streak} days`:"—",detail:"Consecutive days with a log",icon:CalendarDays}].map(({label,value,detail,icon:Icon})=><div key={label}><span><Icon size={16}/>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}</section>
  <section className={styles.subjectSection}><div className="studio-panel-head"><div><span className="studio-eyebrow">FOUR SUBJECTS. ONE DIRECTION.</span><h2>Your study lanes</h2></div><span className={styles.subtle}>Open a subject to continue</span></div><div className={styles.subjects}>{metrics?.subjects.map(subject=><Link href={`/subjects/${subject.slug}`} className={styles.subject} key={subject.id}><div className={styles.subjectHead}><SubjectMark subject={subject.slug}/><ArrowUpRight size={18}/></div><h3>{subject.name}</h3><div className={styles.subjectProgress}><span>{subject.completedTopics} / {subject.totalTopics} topics</span><strong>{subject.completionPct}%</strong></div><div className={styles.track}><span style={{width:`${subject.completionPct}%`,background:`var(--${subject.slug})`}}/></div><p>{number(subject.totalQuestions)} questions <span>·</span> {subject.pendingRevisions} revisions due</p></Link>)}</div></section>
  <section className={styles.bottomGrid}><div className="studio-panel"><div className="studio-panel-head"><div><span className="studio-eyebrow">THE LAST FORTNIGHT</span><h2>Your study rhythm</h2></div><span className={styles.subtle}>Hours / day</span></div><ResponsiveChart height={220}>{(width,height)=><AreaChart width={width} height={height} data={chart} accessibilityLayer margin={{top:15,right:12,bottom:0,left:-25}}><defs><linearGradient id="studio-hours" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d7b779" stopOpacity={.25}/><stop offset="100%" stopColor="#d7b779" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--chart-grid)" vertical={false}/><XAxis dataKey="date" minTickGap={30} tick={{fill:"var(--chart-axis)",fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"var(--chart-axis)",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"var(--chart-tooltip-bg)",border:"1px solid var(--glass-border)",borderRadius:10,color:"var(--text-primary)"}}/><Area dataKey="hours" name="Study hours" type="linear" stroke="#d7b779" strokeWidth={2} fill="url(#studio-hours)" connectNulls={false} isAnimationActive={false} dot={{r:3}}/></AreaChart>}</ResponsiveChart><MetricNote>Each point is the total study time saved for that date. Gaps mean no entry, not a failed day. Compare your own rhythm over time rather than aiming for a perfect straight line.</MetricNote></div>
  <div className={styles.practiceCard}><span className="studio-eyebrow">TURN LEARNING INTO RECALL</span><Target size={36} strokeWidth={1.2}/><h2>Find out what<br/>stayed with you.</h2><p>A full mock, an entire Class 11 or 12 sectional, or a custom mix of chapters.</p><Link href="/practice" className="studio-action">Enter Practice Arena <ArrowRight size={16}/></Link><div><span>{metrics?number(metrics.recentQuestions7):"—"}<small>questions this week</small></span><span>{metrics?number(metrics.recentHours7):"—"}<small>hours this week</small></span></div></div></section>
  <FocusSession/>
  </>}
 </main>;
}
