import React from "react";
import {
  ListOrdered,
  Sparkles,
  ChevronRight,
  Lightbulb,
  CheckCircle2,
  HelpCircle,
  AlertCircle,
  Quote,
} from "lucide-react";

interface StructuredContentProps {
  content: string;
  summary?: string;
  claims?: Array<{ text: string; confidence?: number }>;
  evidence?: string[];
}

interface SectionBlock {
  type: "heading" | "list-item" | "quote" | "key-value" | "paragraph";
  title?: string;
  content: string;
  badge?: string;
}

/**
 * Parses raw Zhihu answers into clear, structured, readable semantic sections:
 * - Automatically detects numbered headings (第一步、一、1.、第1点)
 * - Identifies sub-bullet points (・, -, •, 1), 2))
 * - Highlights quotes ("...", “...”)
 * - Parses key-value subheaders (家庭经济条件、目标门槛)
 */
function parseStructuredSections(text: string): SectionBlock[] {
  if (!text) return [];

  // Split by newlines first
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks: SectionBlock[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // 1. Major Step or Chapter heading: e.g., "第一步：先想清楚你想要什么", "一、学历贬值，不等于学历失去价值", "【1. 核心前提】"
    const headingMatch = line.match(
      /^(第[一二三四五六七八九十0-9]+[步点部分节章节]|(?:[一二三四五六七八九十]+[、.．])|(?:[0-9]+[、.．])|(?:【[^】]+】))\s*(.*)/
    );

    if (headingMatch) {
      const badge = headingMatch[1].replace(/[【】]/g, "").trim();
      const rest = headingMatch[2] || "";
      blocks.push({
        type: "heading",
        badge,
        content: rest,
      });
      continue;
    }

    // 2. Short subheader line (<= 15 chars, not ending with comma/period/question, e.g. "家庭经济条件", "关于机会成本")
    const isSubheader =
      line.length <= 15 &&
      !/[，。？！,?!；;、…]$/.test(line) &&
      !line.startsWith("“") &&
      !line.startsWith('"') &&
      !line.startsWith("・") &&
      !line.startsWith("-") &&
      !line.startsWith("•");

    if (isSubheader && i < rawLines.length - 1) {
      blocks.push({
        type: "key-value",
        title: line,
        content: "",
      });
      continue;
    }

    // 3. Bullet points: e.g. "・如果答案是进高校...", "- 核心问题在于...", "1) 岗位门槛..."
    const bulletMatch = line.match(/^([・•\-–*]|(?:\([0-9]+\))|(?:[①②③④⑤⑥⑦⑧⑨⑩])|(?:[0-9]+\)))\s*(.*)/);
    if (bulletMatch) {
      blocks.push({
        type: "list-item",
        badge: bulletMatch[1],
        content: bulletMatch[2] || "",
      });
      continue;
    }

    // 4. Standalone strong Quote (starts and ends with quotes or starts with "谢邀")
    if (
      (line.startsWith("“") && line.endsWith("”")) ||
      (line.startsWith('"') && line.endsWith('"'))
    ) {
      blocks.push({
        type: "quote",
        content: line.replace(/^[“”"']|[“”"']$/g, "").trim(),
      });
      continue;
    }

    // 5. Standard paragraph
    blocks.push({
      type: "paragraph",
      content: line,
    });
  }

  return blocks;
}

export default function StructuredContent({
  content,
  summary,
  claims = [],
  evidence = [],
}: StructuredContentProps) {
  const blocks = React.useMemo(() => parseStructuredSections(content), [content]);

  return (
    <div className="space-y-4">
      {/* Extracted Core Claims & Insights if available */}
      {claims && claims.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-100/80 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Sparkles size={14} className="text-indigo-600" />
              <span>智能提炼·该回答的核心论点 ({claims.length})</span>
            </span>
            <span className="text-[10px] text-indigo-600/80 font-medium bg-indigo-100/60 px-2 py-0.5 rounded-full">
              结构化论点树
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {claims.map((claim, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 bg-white/90 p-2.5 rounded-lg border border-indigo-50 shadow-xs hover:border-indigo-200 transition-colors"
              >
                <div className="w-5 h-5 rounded-md bg-indigo-100/80 text-indigo-700 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-800 leading-snug font-medium">
                    {claim.text}
                  </p>
                  {claim.confidence !== undefined && (
                    <span className="text-[10px] text-slate-400 mt-0.5 inline-block">
                      可信度置信值: {(claim.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structured Content Viewer */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-5 space-y-3.5 text-slate-800">
        {blocks.map((block, index) => {
          if (block.type === "heading") {
            return (
              <div
                key={index}
                className="pt-3 first:pt-0 pb-1 border-b border-slate-200/60 flex items-center gap-2"
              >
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-600 text-white shadow-xs">
                  {block.badge}
                </span>
                <h4 className="text-[14px] font-bold text-slate-900 leading-snug">
                  {block.content}
                </h4>
              </div>
            );
          }

          if (block.type === "key-value") {
            return (
              <div
                key={index}
                className="pt-2 flex items-center gap-2 text-indigo-950 font-bold text-xs"
              >
                <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full" />
                <span>{block.title}</span>
              </div>
            );
          }

          if (block.type === "quote") {
            return (
              <div
                key={index}
                className="my-2 p-3.5 bg-amber-50/70 border-l-4 border-amber-400 rounded-r-xl text-amber-950 text-xs italic flex items-start gap-2.5 leading-relaxed"
              >
                <Quote size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <span>“{block.content}”</span>
              </div>
            );
          }

          if (block.type === "list-item") {
            return (
              <div
                key={index}
                className="flex items-start gap-2.5 pl-2 text-[13px] leading-relaxed text-slate-700 bg-white/60 p-2 rounded-lg border border-slate-200/40"
              >
                <span className="text-indigo-600 font-bold shrink-0 mt-0.5 text-xs">
                  {block.badge}
                </span>
                <span className="flex-1">{block.content}</span>
              </div>
            );
          }

          // Default clean paragraph with high-legibility typographic spacing
          return (
            <p
              key={index}
              className="text-[13px] leading-6 text-slate-700/95 tracking-normal"
            >
              {block.content}
            </p>
          );
        })}
      </div>

      {/* Supporting Evidence or Real Case Studies if any */}
      {evidence && evidence.length > 0 && (
        <div className="p-3 bg-slate-100/60 border border-slate-200/70 rounded-xl space-y-1.5">
          <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
            <Lightbulb size={12} className="text-amber-500" />
            <span>回答中援引的真实论据与案例 ({evidence.length})</span>
          </span>
          <ul className="space-y-1 pl-4 list-disc text-xs text-slate-600 leading-relaxed">
            {evidence.map((ev, idx) => (
              <li key={idx}>{ev}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
