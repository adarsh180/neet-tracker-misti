"use client";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { normalizeQuestionMarkdown } from "@/lib/question-markdown";
export default function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="cbt-md">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeQuestionMarkdown(text)}
      </ReactMarkdown>
      <style jsx>{`
        .cbt-md :global(p) { margin: 0 0 8px; }
        .cbt-md :global(p:last-child) { margin-bottom: 0; }
        .cbt-md :global(.katex) { font-size: 1.03em; white-space: nowrap; }
        .cbt-md :global(table) { border-collapse: collapse; margin: 10px 0; width: max-content; max-width: 100%; }
        .cbt-md :global(td), .cbt-md :global(th) { border: 1px solid var(--glass-border-mid); padding: 6px 10px; font-size: 13px; }
        .cbt-md :global(img) { display: block; max-width: min(100%, 760px); max-height: 440px; object-fit: contain; margin: 14px auto; border-radius: 8px; border: 1px solid var(--glass-border); background: #fff; }
      `}</style>
    </div>
  );
}
