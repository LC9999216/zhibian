import React, { useState, useEffect } from "react";
import AnswerList from "./components/AnswerList";
import GraphCanvas from "./components/GraphCanvas";
import AIChatPanel from "./components/AIChatPanel";
import AnswerDetailModal from "./components/AnswerDetailModal";
import { useAppStore } from "./store/useAppStore";
import { Search, Sparkles, Network, ArrowRight, Compass } from "lucide-react";

export default function App() {
  const [queryInput, setQueryInput] = useState("大学生要不要考研？");
  const {
    currentQuery,
    answers,
    articleModalAnswerId,
    openArticleModal,
    setCurrentData,
    isLoading,
    setLoading,
    setPendingChatPrompt,
  } = useAppStore();

  const handleAnalyze = async (searchQuery?: string) => {
    const textToSearch = (searchQuery || queryInput).trim();
    if (!textToSearch) return;

    if (searchQuery) {
      setQueryInput(searchQuery);
    }

    setLoading(true);
    try {
      const response = await fetch("/api/queries/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSearch }),
      });
      const result = await response.json();
      if (result.query && result.answers) {
        setCurrentData({ query: result.query, answers: result.answers });
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentQuery) {
      handleAnalyze("大学生要不要考研？");
    }
  }, []);

  const sampleQueries = [
    "AI对普通人的影响",
    "大学生要不要考研？",
    "计算机专业读研还是直接就业？",
    "一线城市买房还是回老家？",
  ];

  return (
    <div className="flex h-screen bg-slate-50 flex-col font-sans text-slate-800 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation Cockpit */}
      <header className="flex items-center justify-between px-6 py-2.5 bg-white border-b border-slate-200/80 shadow-xs z-20 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center font-black text-base shadow-sm shadow-indigo-200">
            <Network size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-slate-900 font-sans">
                知辨 ZhiBian
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
                <Sparkles size={10} /> Graph-RAG Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              将知乎高赞回答与多元争议，结构化解构为可研判的观点知识网络
            </p>
          </div>
        </div>

        {/* Central Search + Quick Queries */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <div className="relative flex items-center">
              <Search
                size={15}
                className="absolute left-3.5 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="输入议题，例如：大学生要不要考研？"
                className="pl-9 pr-4 py-1.5 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/90 rounded-xl text-xs outline-none w-72 md:w-96 focus:w-[420px] focus:bg-white focus:border-indigo-500 focus:ring-3 focus:ring-indigo-100 transition-all text-slate-800 placeholder:text-slate-400"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              />
            </div>
          </div>
          <button
            onClick={() => handleAnalyze()}
            disabled={isLoading}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold active:scale-98 transition-all shadow-sm shadow-indigo-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>分析中...</span>
              </>
            ) : (
              <>
                <span>启动图谱解析</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: High-voted Answers Feed */}
        <section className="w-[320px] lg:w-[350px] xl:w-[380px] border-r border-slate-200/80 bg-white flex flex-col h-full z-10 shrink-0">
          <AnswerList />
        </section>

        {/* Middle Panel: Knowledge Graph Visualizer Canvas */}
        <section className="flex-1 bg-slate-100 relative flex flex-col overflow-hidden">
          <GraphCanvas onAskAI={(prompt) => setPendingChatPrompt(prompt)} />
        </section>

        {/* Right Panel: AI Graph-RAG Synthesizer (Obsidian/Claudian card style aligned with indigo/slate palette) */}
        <section className="w-[380px] lg:w-[420px] xl:w-[460px] border-l border-slate-200 bg-slate-50/70 flex flex-col h-full z-10 shrink-0">
          <AIChatPanel />
        </section>
      </main>

      {/* Answer Article Full Text Reading Modal */}
      {articleModalAnswerId && (
        <AnswerDetailModal
          answer={answers.find((a) => a.id === articleModalAnswerId) || null}
          onClose={() => openArticleModal(null)}
          onAskAI={(prompt) => setPendingChatPrompt(prompt)}
        />
      )}
    </div>
  );
}
