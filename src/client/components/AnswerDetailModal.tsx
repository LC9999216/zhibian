import React, { useState } from "react";
import {
  X,
  ThumbsUp,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Tag,
  Quote,
  Sparkles,
  LayoutList,
  AlignLeft,
  Wand2,
  Compass,
  Check,
  ChevronDown,
} from "lucide-react";
import { DBAnswer } from "../../shared/models";
import StructuredContent from "./StructuredContent";

interface AnswerDetailModalProps {
  answer: DBAnswer | null;
  onClose: () => void;
  onAskAI?: (prompt: string) => void;
}

interface RefinedAnalysis {
  takeaways: string[];
  coreLogic: string;
  advice: string;
}

export default function AnswerDetailModal({
  answer,
  onClose,
  onAskAI,
}: AnswerDetailModalProps) {
  const [viewMode, setViewMode] = useState<"structured" | "raw">("structured");
  const [isRefining, setIsRefining] = useState(false);
  const [refinedResult, setRefinedResult] = useState<RefinedAnalysis | null>(null);

  if (!answer) return null;

  const handleDeepRefine = async () => {
    if (isRefining) return;
    setIsRefining(true);
    try {
      const res = await fetch(`/api/queries/${answer.query_id}/refine/${answer.id}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setRefinedResult({
          takeaways: data.takeaways || [],
          coreLogic: data.coreLogic || "",
          advice: data.advice || "",
        });
      }
    } catch (e) {
      console.error("Failed to deep refine answer:", e);
    } finally {
      setIsRefining(false);
    }
  };

  const getStanceBadge = (stance?: string) => {
    switch (stance) {
      case "support":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-1 rounded-full">
            <CheckCircle2 size={13} className="text-emerald-600" />
            支持考研
          </span>
        );
      case "oppose":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 px-2.5 py-1 rounded-full">
            <AlertCircle size={13} className="text-rose-600" />
            反对盲目考研
          </span>
        );
      case "conditional":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-1 rounded-full">
            <HelpCircle size={13} className="text-amber-600" />
            视情况而定
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
            客观中立
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm shadow-indigo-200 shrink-0">
              {answer.author_name ? answer.author_name.slice(0, 1) : "知"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  @{answer.author_name}
                </h3>
                {getStanceBadge(answer.stance)}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1 text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded">
                  <ThumbsUp size={11} className="text-slate-500" />
                  {answer.voteup_count.toLocaleString()} 次赞同
                </span>
                <span>·</span>
                <span>知乎高赞精选回答</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
            title="关闭窗口"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-700 leading-relaxed font-sans">
          {/* Summary Callout if available */}
          {answer.summary && (
            <div className="p-3.5 bg-indigo-50/70 border border-indigo-100/90 rounded-xl space-y-1">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                核心观点摘要：
              </span>
              <p className="text-xs text-indigo-950 leading-relaxed font-medium">
                {answer.summary}
              </p>
            </div>
          )}

          {/* AI Deep Refinement Panel */}
          {refinedResult ? (
            <div className="p-4 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-slate-50 border border-indigo-200/90 rounded-xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-600" />
                  <span>博主核心内容深度提炼（干货与决策框架）</span>
                </span>
                <span className="text-[10px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <Check size={10} />
                  已提炼
                </span>
              </div>

              {/* Takeaways */}
              {refinedResult.takeaways.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider block">
                    📌 核心干货观点清单：
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {refinedResult.takeaways.map((point, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 bg-white/95 p-2 rounded-lg border border-indigo-100 text-xs text-slate-800 leading-snug shadow-2xs"
                      >
                        <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="font-medium">{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Core Logic */}
              {refinedResult.coreLogic && (
                <div className="p-2.5 bg-white/90 rounded-lg border border-indigo-100 space-y-1">
                  <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                    <Compass size={12} className="text-indigo-600" />
                    <span>博主底层思考框架：</span>
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">
                    {refinedResult.coreLogic}
                  </p>
                </div>
              )}

              {/* Advice */}
              {refinedResult.advice && (
                <div className="p-2.5 bg-amber-50/80 rounded-lg border border-amber-200/80 space-y-1">
                  <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                    💡 避坑建议与行动指导：
                  </span>
                  <p className="text-xs text-amber-950 leading-relaxed font-medium">
                    {refinedResult.advice}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-gradient-to-r from-indigo-50/80 to-purple-50/50 border border-indigo-100 rounded-xl flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Wand2 size={16} />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900">
                    一键深度提炼博主全文观点
                  </h5>
                  <p className="text-[11px] text-slate-500 truncate">
                    AI 抽丝剥茧提炼答主干货、底层逻辑框架与避坑建议
                  </p>
                </div>
              </div>

              <button
                onClick={handleDeepRefine}
                disabled={isRefining}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                {isRefining ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>提炼中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    <span>深度提炼干货</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Concepts & Claim Tags */}
          <div className="flex flex-wrap items-center gap-1.5">
            {answer.concepts?.map((c, i) => (
              <span
                key={i}
                className="text-xs font-medium px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-100"
              >
                #{c}
              </span>
            ))}
            {answer.claims && answer.claims.length > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-100">
                包含 {answer.claims.length} 条论点
              </span>
            )}
          </div>

          {/* Full Article Content */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Quote size={13} className="text-indigo-500" />
                <span>知乎回答全文内容</span>
              </h4>

              <div className="flex items-center gap-3">
                {/* View Mode Toggle */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 text-slate-600 text-xs font-medium">
                  <button
                    onClick={() => setViewMode("structured")}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                      viewMode === "structured"
                        ? "bg-white text-indigo-700 font-bold shadow-xs"
                        : "hover:text-slate-900"
                    }`}
                  >
                    <LayoutList size={12} />
                    <span>清晰结构化</span>
                  </button>
                  <button
                    onClick={() => setViewMode("raw")}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                      viewMode === "raw"
                        ? "bg-white text-slate-900 font-bold shadow-xs"
                        : "hover:text-slate-900"
                    }`}
                  >
                    <AlignLeft size={12} />
                    <span>原文纯文本</span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-400">
                  字数：{answer.content_text.length} 字
                </span>
              </div>
            </div>

            {viewMode === "structured" ? (
              <StructuredContent
                content={answer.content_text}
                summary={answer.summary}
                claims={answer.claims}
                evidence={answer.evidence}
              />
            ) : (
              <div className="bg-slate-50/70 p-5 rounded-xl border border-slate-200/70 text-[14px] leading-relaxed text-slate-800 font-sans select-text space-y-3.5">
                {answer.content_text.split(/\n\n+/).map((paragraph, idx) => (
                  <p key={idx} className="leading-7 text-slate-800/95 tracking-normal indent-0">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <a
            href={answer.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            <span>前往知乎查看原回答</span>
            <ExternalLink size={13} />
          </a>

          <div className="flex items-center gap-2">
            {onAskAI && (
              <button
                onClick={() => {
                  onAskAI(`请针对答主「${answer.author_name}」的核心观点与逻辑展开研判`);
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles size={13} />
                <span>研判该答主观点</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
