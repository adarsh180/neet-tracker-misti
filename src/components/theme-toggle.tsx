"use client";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
function subscribe(callback: () => void) {
  window.addEventListener("neet-theme-change",callback); window.addEventListener("storage",callback);
  return () => {window.removeEventListener("neet-theme-change",callback);window.removeEventListener("storage",callback);};
}
export default function ThemeToggle() {
  const theme=useSyncExternalStore(subscribe,()=>document.documentElement.dataset.theme ?? "dark",()=>"dark");
  const next=theme==="dark"?"light":"dark";
  return <button data-studio-chrome className="studio-theme" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={()=>{
    document.documentElement.dataset.theme=next;document.documentElement.style.colorScheme=next;
    try{localStorage.setItem("neet-theme",next);}catch{}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",next==="light"?"#f4f4f0":"#0b0d10");
    window.dispatchEvent(new Event("neet-theme-change"));
  }}>{theme==="dark"?<Moon size={19} strokeWidth={1.6}/>:<Sun size={19} strokeWidth={1.6}/>}<style jsx>{`.studio-theme{position:fixed;right:82px;top:calc(16px + env(safe-area-inset-top));width:44px;height:44px;display:grid;place-items:center;border:1px solid var(--glass-border);border-radius:12px;background:var(--bg-surface);color:var(--text-secondary);z-index:1000;cursor:pointer}.studio-theme:hover{color:var(--gold);background:var(--bg-hover)}@media(max-width:640px){.studio-theme{right:64px;width:38px;height:38px;top:calc(19px + env(safe-area-inset-top))}}`}</style></button>;
}
