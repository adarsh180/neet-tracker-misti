"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, BookOpen, Mic, Orbit, ShieldCheck, Target } from "lucide-react";
import { getStoredAuth } from "@/lib/auth";
import SubjectMark from "@/components/studio/subject-mark";
import styles from "./landing.module.css";

export default function LandingPage() {
 const router=useRouter();
 useEffect(()=>{if(getStoredAuth())router.replace("/dashboard");},[router]);
 return <main className={styles.landing}>
  <header className={styles.header}><Link href="/" className={styles.brand}><Orbit size={28}/><span>NEET DOCTOR<small>A PRIVATE STUDY STUDIO</small></span></Link><Link href="/signin" className={styles.signin}>Your workspace <ArrowUpRight size={16}/></Link></header>
  <section className={styles.hero}>
   <div className={styles.copy}><span className={styles.eyebrow}>MADE FOR MISTI / NEET 2027</span><h1>A quieter space.<br/>A <em>stronger</em> you.</h1><p>For the chapters you’ll master, the days you’ll show up, and the doctor you’re becoming.</p><Link href="/signin" className={styles.enter}>Step into your studio <ArrowRight size={18}/></Link><div className={styles.private}><ShieldCheck size={15}/> Your progress. Your pace. Your private space.</div></div>
   <div className={styles.studyField} aria-label="Four subjects, one connected study journey">
    <div className={styles.orbitOuter}/><div className={styles.orbitInner}/><div className={styles.axis}/>
    <div className={styles.core}><span>YOUR NEXT CHAPTER</span><strong>It begins<br/><em>with today.</em></strong><span>LEARN · PRACTISE · RETURN</span></div>
    {[["physics","Physics"],["chemistry","Chemistry"],["botany","Botany"],["zoology","Zoology"]].map(([slug,name],i)=><div key={slug} className={styles.subject} data-position={i}><SubjectMark subject={slug} size={23}/><span>{name}</span></div>)}
    <div className={styles.fieldCaption}><span>01 — THE STUDY ORBIT</span><span>A little closer, every day.</span></div>
   </div>
  </section>
  <section className={styles.principles} aria-label="Inside your study studio">
   {[{icon:BookOpen,n:"01",title:"Make knowledge yours.",copy:"Your chapters, NCERT library and revisions, kept together."},{icon:Target,n:"02",title:"Practise with purpose.",copy:"Build a test, revisit mistakes and see where to focus next."},{icon:Mic,n:"03",title:"Just say it.",copy:"Let Bubu help you navigate, plan and record your study."}].map(({icon:Icon,n,title,copy})=><article key={n}><div><span>{n}</span><Icon size={20}/></div><h2>{title}</h2><p>{copy}</p></article>)}
  </section>
  <footer className={styles.footer}><span>Built with care, for your becoming.</span><span>NEET DOCTOR / 2027</span></footer>
 </main>;
}
