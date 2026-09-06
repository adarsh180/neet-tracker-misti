"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { Loader2, Minus, Plus } from "lucide-react";
import { passageStyle, validPassageBox, type PassageBox } from "@/lib/reader-geometry";
import "pdfjs-dist/web/pdf_viewer.css";
import styles from "./pdf-page.module.css";

type Highlight = { id: string; text: string; bbox?: PassageBox | null };

export default function PdfPage({ url, title, pageNumber, highlights, onHighlight, onPageCount }: {
  url: string; title: string; pageNumber: number; highlights: Highlight[];
  onHighlight: (id: string) => void; onPageCount: (count: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0, scale: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(1);
  const pageCountCallback = useRef(onPageCount);
  useEffect(() => { pageCountCallback.current = onPageCount; }, [onPageCount]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(1100, Math.max(1, entry.contentRect.width - 32))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setBusy(true); setError(""); setPdf(null);
    void import("pdfjs-dist").then(async library => {
      if (cancelled) return;
      const assets = `/vendor/pdfjs/${library.version}/`;
      library.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
      loadingTask = library.getDocument({ url, withCredentials: true, cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
      const document = await loadingTask.promise;
      if (!cancelled) { setPdf(document); pageCountCallback.current(document.numPages); }
    }).catch(reason => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "The PDF could not be opened."); setBusy(false); } });
    return () => { cancelled = true; void loadingTask?.destroy(); };
  }, [url, retry]);
  useEffect(() => {
    if (!pdf || !width || !canvas.current || !textLayer.current) return;
    let cancelled = false;
    let rendering: RenderTask | undefined;
    let textRendering: TextLayer | undefined;
    setBusy(true); setError("");
    const targetCanvas = canvas.current;
    const targetText = textLayer.current;
    void (async () => {
      const page = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, pageNumber)));
      const library = await import("pdfjs-dist");
      if (cancelled) return;
      const initial = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:width*zoom/initial.width});
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4_000_000 / (viewport.width * viewport.height)));
      targetCanvas.width = Math.floor(viewport.width * pixelRatio);
      targetCanvas.height = Math.floor(viewport.height * pixelRatio);
      targetCanvas.style.width = `${viewport.width}px`;
      targetCanvas.style.height = `${viewport.height}px`;
      setSize({width:viewport.width,height:viewport.height,scale:viewport.scale});
      targetText.replaceChildren();
      targetText.style.setProperty("--total-scale-factor", String(viewport.scale));
      rendering = page.render({canvas:targetCanvas,viewport,transform:[pixelRatio,0,0,pixelRatio,0,0]});
      await rendering.promise;
      if (cancelled) return;
      textRendering = new library.TextLayer({textContentSource:page.streamTextContent(),container:targetText,viewport});
      await textRendering.render();
      if (!cancelled) { setBusy(false); host.current?.scrollTo({top:0}); }
    })().catch(reason => { if (!cancelled) { setError(reason instanceof Error ? reason.message : "Page rendering failed."); setBusy(false); } });
    return () => { cancelled = true; rendering?.cancel(); textRendering?.cancel(); };
  }, [pdf, pageNumber, width, zoom]);
  return <div ref={host} className={styles.viewport} aria-busy={busy}>
    <div className={styles.tools} aria-label="PDF zoom"><button aria-label="Zoom out" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.25))}><Minus size={16}/></button><button aria-label="Fit PDF to page width" onClick={()=>setZoom(1)}>{zoom===1?"Fit width":`${Math.round(zoom*100)}%`}</button><button aria-label="Zoom in" disabled={zoom>=2.5} onClick={()=>setZoom(value=>Math.min(2.5,value+.25))}><Plus size={16}/></button></div>
    {busy && <div className={styles.status} role="status"><Loader2 size={18}/> Opening page {pageNumber}…</div>}
    {error && <div className={styles.failure} role="alert"><p>This page could not be displayed. Your reading position is preserved.</p><button onClick={()=>setRetry(value=>value+1)}>Try again</button><a href={url} target="_blank" rel="noreferrer">Open original PDF</a><details><summary>Details</summary>{error}</details></div>}
    <div ref={paper} className={styles.paper} style={{width:size.width || undefined,height:size.height || undefined,"--total-scale-factor":size.scale,visibility:busy||error?"hidden":"visible"} as CSSProperties}>
      <canvas ref={canvas} aria-label={`${title}, page ${pageNumber}`}/>
      <div ref={textLayer} className="textLayer"/>
      {!busy && !error && highlights.filter(item=>validPassageBox(item.bbox)).map(item=><button key={item.id} className={styles.highlight} style={passageStyle(item.bbox!)} onClick={()=>onHighlight(item.id)} aria-label={`Attempt linked question: ${item.text}`} title="Open linked historical question"/>)}
    </div>
  </div>;
}
