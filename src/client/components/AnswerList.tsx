import React, { useEffect, useRef } from "react";
import {
  FileText,
  Clock,
  ThumbsUp,
  ExternalLink,
  Sparkles,
  Tag,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  BookOpen,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export default function AnswerList() {
  const {
    currentQuery,
    answers,
    selectedAnswerId,
    selectAnswer,
    openArticleModal,
    isLoading,
  } = useAppStore();

  // Reference for scrolling active item into view
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selectedAnswerId && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedAnswerId]);

  if (isLoading) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-slate-400 text-sm">
        <div className="w-9 h-9 border-[2.5px] border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-semibold text-slate-700">正在检索知乎高赞回答与观点...</p>
        <p className="text-xs text-slate-400 mt-1">LLM 批量结构化抽取立场与概念中</p>
      </div>
    );
  }

  if (!currentQuery) {
    return (
      <div className="p-8 h-full flex flex-col items-center justify-center text-slate-400 text-sm text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 shadow-inner">
          <FileText size={22} />
        </div>
        <p className="font-semibold text-slate-800">等待查询分析</p>
        <p className="text-xs text-slate-400 mt-1.5 max-w-[210px] leading-relaxed">
          在顶部搜索框输入您感兴趣的社会议题或抉择问题，即可自动构建多维观点图谱。
        </p>
      </div>
    );
  }

  const getStanceBadge = (stance?: string) => {
    switch (stance) {
      case "support":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} className="text-emerald-600" />
            支持
          </span>
        );
      case "oppose":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/80 px-2 py-0.5 rounded-full">
            <AlertCircle size={11} className="text-rose-600" />
            反对
          </span>
        );
      case "conditional":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-full">
            <HelpCircle size={11} className="text-amber-600" />
            条件/中立
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            中立
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-200/80 bg-white shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600" />
            <span>精选高赞回答</span>
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
            {answers.length} 篇论述
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          点击卡片可在图谱中聚焦并阅读全文；点击图谱球体也可直接跳转到对应文章。
        </p>
      </div>

      {/* Answer Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        <div className="text-[11px] font-medium text-slate-400 px-1 pt-1 flex items-center justify-between">
          <span>按知乎点赞权重与论证度排序</span>
          <span>共 {answers.length} 篇</span>
        </div>

        {answers.map((ans, idx) => {
          const isSelected = selectedAnswerId === ans.id;
          return (
            <div
              key={ans.id}
              ref={isSelected ? activeItemRef : null}
              onClick={() => {
                selectAnswer(isSelected ? null : ans.id);
                openArticleModal(ans.id);
              }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                isSelected
                  ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-sm"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs"
              }`}
            >
              {/* Top Row: Author & Stance */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] flex items-center justify-center font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {ans.author_name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {getStanceBadge(ans.stance)}
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <ThumbsUp size={10} className="text-slate-400" />
                    {ans.voteup_count.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Summary / Snippet */}
              {ans.summary ? (
                <p className="text-xs text-slate-700 leading-relaxed mb-2 line-clamp-2">
                  {ans.summary}
                </p>
              ) : (
                <p className="text-xs text-slate-600 leading-relaxed mb-2 line-clamp-2">
                  {ans.content_text}
                </p>
              )}

              {/* Claims & Concept Badges */}
              {ans.concepts && ans.concepts.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {ans.concepts.slice(0, 3).map((concept, cIdx) => (
                    <span
                      key={cIdx}
                      className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100 font-medium"
                    >
                      #{concept}
                    </span>
                  ))}
                  {ans.claims && ans.claims.length > 0 && (
                    <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 font-medium">
                      {ans.claims.length} 条论点
                    </span>
                  )}
                </div>
              )}

              {/* Footer row */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-indigo-600 font-semibold flex items-center gap-1">
                  <BookOpen size={11} />
                  结构化精读
                </span>
                <a
                  href={ans.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  知乎原文 <ExternalLink size={10} />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
