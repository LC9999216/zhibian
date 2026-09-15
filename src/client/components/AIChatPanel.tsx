import React, { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import {
  PlusSquare,
  SquarePen,
  History,
  FileText,
  User,
  Lightbulb,
  ExternalLink,
  ArrowUp,
  X,
  Sparkles,
  Search,
  BookOpen,
  SendHorizontal,
  Copy,
  Check,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    author_name: string;
    voteup_count: number;
    url: string;
    quote: string;
  }>;
  timestamp?: string;
}

interface ContextTag {
  id: string;
  type: "query" | "answer" | "claim" | "concept";
  label: string;
  fullData?: any;
}

// 8-point geometric starburst logo in Indigo
function ZhiBianStarburst({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4f46e5"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="4.93" y1="19.07" x2="19.07" y2="4.93" />
    </svg>
  );
}

export default function AIChatPanel() {
  const {
    currentQuery,
    answers,
    graphNodes,
    graphEdges,
    selectedAnswerId,
    selectAnswer,
    pendingChatPrompt,
    setPendingChatPrompt,
  } = useAppStore();

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [attachedContexts, setAttachedContexts] = useState<ContextTag[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Initialize context tag when currentQuery changes
  useEffect(() => {
    if (currentQuery) {
      const fileName = `${currentQuery.query_text.replace(/[？?]/g, "")}.md`;
      setAttachedContexts((prev) => {
        const hasQuery = prev.some((c) => c.type === "query");
        if (hasQuery) {
          return prev.map((c) => (c.type === "query" ? { ...c, label: fileName } : c));
        }
        return [
          {
            id: `q_${currentQuery.id}`,
            type: "query",
            label: fileName,
          },
          ...prev,
        ];
      });
    }
  }, [currentQuery]);

  // Synchronize when an answer is selected in graph or answer list
  useEffect(() => {
    if (selectedAnswerId) {
      const ans = answers.find((a) => a.id === selectedAnswerId);
      if (ans) {
        setAttachedContexts((prev) => {
          const filtered = prev.filter((c) => c.type !== "answer");
          return [
            ...filtered,
            {
              id: `ans_${ans.id}`,
              type: "answer",
              label: `${ans.author_name}.ans`,
              fullData: ans,
            },
          ];
        });
      }
    }
  }, [selectedAnswerId, answers]);

  // Auto trigger when a node's "研判追问" is clicked in the graph
  useEffect(() => {
    if (pendingChatPrompt) {
      handleAsk(pendingChatPrompt);
      setPendingChatPrompt(null);
    }
  }, [pendingChatPrompt]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isAsking]);

  // Remove a specific context tag
  const removeContext = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAttachedContexts((prev) => prev.filter((c) => c.id !== id));
    if (id.startsWith("ans_")) {
      selectAnswer(null);
    }
  };

  // Add context from picker
  const addContext = (tag: ContextTag) => {
    if (!attachedContexts.some((c) => c.id === tag.id)) {
      setAttachedContexts((prev) => [...prev, tag]);
    }
    setShowAttachPicker(false);
  };

  // Reset/Clear conversation back to empty greeting state
  const handleResetChat = () => {
    setMessages([]);
    setQuestion("");
  };

  const handleAsk = async (textToAsk?: string) => {
    const q = (textToAsk || question).trim();
    if (!q || isAsking) return;

    setQuestion("");
    const userMsg: ChatMessage = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setIsAsking(true);

    try {
      const activeAnswerContext = attachedContexts.find((c) => c.type === "answer");
      const targetAnsId = activeAnswerContext?.fullData?.id || selectedAnswerId || undefined;

      const res = await fetch(`/api/queries/${currentQuery?.id || "q_13be7d033b"}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          answerId: targetAnsId,
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (parseErr) {
        data = { error: "服务端响应格式异常" };
      }

      if (res.ok && data.answer) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            citations: data.citations,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || data.message || "提问遇到异常，请稍后重试。",
          },
        ]);
      }
    } catch (err: any) {
      console.error("[AIChatPanel] Ask request error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.message ? `请求发生错误: ${err.message}` : "网络连接出现问题，请检查后端运行状态。",
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  // Dynamic status strip numbers
  const totalEdgesCount = graphEdges.length > 0 ? graphEdges.length : 74;
  const totalNotesCount =
    graphNodes.filter((n) => n.type === "CLAIM" || n.type === "CONCEPT").length || 18;

  // Approximate word count and character count from answers
  const totalChars = answers.reduce((sum, a) => sum + (a.content_text?.length || 0), 0) || 4375;
  const totalWords = Math.round(totalChars * 0.48) || 2100;

  // Quick preset suggestions
  const presetQueries = [
    { title: "总结主要分歧焦点", prompt: "总结各答主的核心分歧焦点、态度分布与不同人群建议" },
    { title: "梳理支持方核心论据", prompt: "梳理支持考研答主的核心依据、收益分析与长期平台价值" },
    { title: "提取反对方风险与沉没成本", prompt: "梳理反对方答主提到的核心风险、沉没成本与非刚需盲目报考弊端" },
    { title: "跨城市与科研补贴分析", prompt: "分析回答中提到的科研院所学费补贴及跨城市流动的具体观点" },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50/60 text-slate-800 font-sans select-text relative">
      {/* Top Brand Header: ZhiBian Graph-RAG */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200/80 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <ZhiBianStarburst size={18} />
          <span className="font-bold text-slate-800 text-[14.5px] tracking-tight">
            知辨 AI 研判
          </span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100/80 ml-1">
            Graph-RAG
          </span>
        </div>

        {/* Header Right Mini Controls */}
        <div className="flex items-center gap-1.5 text-slate-500">
          {messages.length > 0 && (
            <button
              onClick={handleResetChat}
              className="px-2 py-1 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1 font-medium"
              title="新建会话"
            >
              <History size={13} />
              <span>新会话</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Conversation / Greeting Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col justify-between">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[180px] my-auto">
            {/* Clean, gentle greeting matching overall design */}
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3.5 shadow-2xs">
              <Sparkles size={22} />
            </div>
            <h1 className="text-[22px] sm:text-[25px] font-bold text-slate-800 tracking-tight text-center select-none mb-2">
              你好，有什么需要帮助的吗？
            </h1>
            <p className="text-xs text-slate-500 text-center max-w-[300px] leading-relaxed">
              知乎全网高赞回答与观点图谱已就绪，可随时针对答主分歧、共识论点进行交叉研判。
            </p>

            {/* Subtle preset starter pills */}
            <div className="flex flex-wrap justify-center gap-1.5 mt-5 max-w-[320px]">
              {presetQueries.slice(0, 3).map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAsk(p.prompt)}
                  className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200/90 rounded-xl text-[11.5px] text-slate-600 font-medium transition-all shadow-2xs cursor-pointer text-left truncate max-w-[280px]"
                >
                  💡 {p.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {msg.role === "user" ? (
                  <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-xs">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-4 text-xs text-slate-800 shadow-xs space-y-3 leading-relaxed">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <ZhiBianStarburst size={13} />
                        <span className="font-semibold text-indigo-700 font-sans">
                          知辨 Graph-RAG 研判报告
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {msg.timestamp && <span className="font-mono text-[10px] text-slate-400">{msg.timestamp}</span>}
                        <button
                          onClick={() => handleCopy(msg.content, idx)}
                          className="hover:text-indigo-600 p-1 rounded hover:bg-slate-100 transition-colors flex items-center gap-1 text-[10px] text-slate-500 font-medium cursor-pointer"
                          title="复制研判内容"
                        >
                          {copiedIdx === idx ? (
                            <>
                              <Check size={12} className="text-emerald-600" />
                              <span className="text-emerald-600">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>复制</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Rich Rendered Markdown */}
                    <div className="markdown-rendered space-y-2 text-slate-700 font-sans text-[12.5px] leading-relaxed">
                      <Markdown
                        components={{
                          h3: ({ children }) => (
                            <div className="text-[13.5px] font-bold text-slate-900 mt-4 mb-2 pt-2 pb-1 border-b border-slate-100 flex items-center gap-1.5 tracking-tight">
                              <span>{children}</span>
                            </div>
                          ),
                          h4: ({ children }) => (
                            <div className="text-[12px] font-semibold text-indigo-900 bg-indigo-50/80 border border-indigo-100/70 px-2 py-0.5 rounded-md inline-block mt-2 mb-1">
                              {children}
                            </div>
                          ),
                          p: ({ children }) => (
                            <p className="text-[12.5px] leading-relaxed text-slate-700 my-1.5">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="space-y-1.5 my-2 pl-2 border-l-2 border-indigo-100">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="space-y-1.5 my-2 pl-4 list-decimal marker:text-indigo-600">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-[12px] leading-relaxed text-slate-700 pl-1">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-slate-900">{children}</strong>
                          ),
                          hr: () => (
                            <hr className="my-3 border-t border-slate-100" />
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-3 border-indigo-500 bg-indigo-50/40 px-3 py-1.5 my-2 rounded-r-lg text-slate-700 text-[12px]">
                              {children}
                            </blockquote>
                          ),
                          code: ({ children }) => (
                            <code className="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded text-[11.5px] font-mono border border-slate-200/60">
                              {children}
                            </code>
                          ),
                        }}
                      >
                        {msg.content}
                      </Markdown>
                    </div>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px]">
                        <span className="font-semibold text-slate-400 block text-[10.5px] uppercase tracking-wider">
                          图谱证据与答主出处（点击可联动图谱定位）：
                        </span>
                        <div className="grid grid-cols-1 gap-1.5">
                          {msg.citations.map((c, cIdx) => {
                            const matchedAnswer = answers.find(
                              (a) => a.author_name === c.author_name || a.url === c.url
                            );
                            return (
                              <div
                                key={cIdx}
                                onClick={() => {
                                  if (matchedAnswer) {
                                    selectAnswer(matchedAnswer.id);
                                  }
                                }}
                                className="bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-200 px-2.5 py-1.5 rounded-lg flex items-center justify-between text-slate-700 transition-colors group cursor-pointer"
                              >
                                <div className="truncate pr-2 flex items-center gap-1.5">
                                  <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] border border-indigo-100 shrink-0">
                                    来源 {cIdx + 1}
                                  </span>
                                  <span className="font-medium text-slate-800">@{c.author_name}</span>
                                  <span className="text-slate-400 text-[10.5px]">
                                    ({c.voteup_count} 赞)
                                  </span>
                                </div>
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-slate-400 hover:text-indigo-600 p-1 rounded shrink-0"
                                  title="打开知乎原文"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isAsking && (
              <div className="flex items-center gap-2 text-xs text-slate-500 p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="font-medium text-slate-600">正在交叉研判图谱共识与答主论点...</span>
              </div>
            )}
          </div>
        )}

        {/* Input Region with Floating Card */}
        <div className="mt-auto pt-2 space-y-1.5">
          {/* Action Icons above the Card on the Right: [+] 关联实体, [✏️] 研判预设, [🕒] 重置 */}
          <div className="flex items-center justify-end gap-1 px-1 text-slate-400">
            {/* [+] Attach context */}
            <div className="relative">
              <button
                onClick={() => setShowAttachPicker((prev) => !prev)}
                className="w-6 h-6 rounded-md hover:bg-slate-200/70 flex items-center justify-center transition-colors cursor-pointer hover:text-slate-700"
                title="添加关联笔记/知识节点"
              >
                <PlusSquare size={16} strokeWidth={1.7} />
              </button>

              {/* Attach Context Popover */}
              {showAttachPicker && (
                <div className="absolute right-0 bottom-8 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-30 space-y-1 text-xs text-slate-700">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 border-b border-slate-100">
                    可关联的图谱知识实体：
                  </div>
                  {currentQuery && (
                    <button
                      onClick={() =>
                        addContext({
                          id: `q_${currentQuery.id}`,
                          type: "query",
                          label: `${currentQuery.query_text.replace(/[？?]/g, "")}.md`,
                        })
                      }
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 truncate cursor-pointer"
                    >
                      <FileText size={13} className="text-slate-400 shrink-0" />
                      <span className="truncate">{currentQuery.query_text}.md</span>
                    </button>
                  )}
                  {answers.slice(0, 4).map((ans) => (
                    <button
                      key={ans.id}
                      onClick={() =>
                        addContext({
                          id: `ans_${ans.id}`,
                          type: "answer",
                          label: `${ans.author_name}.ans`,
                          fullData: ans,
                        })
                      }
                      className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-lg flex items-center gap-2 truncate cursor-pointer"
                    >
                      <User size={13} className="text-indigo-600 shrink-0" />
                      <span className="truncate">@{ans.author_name} ({ans.voteup_count}赞)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* [✏️] Edit / Presets */}
            <div className="relative">
              <button
                onClick={() => setShowPresetPicker((prev) => !prev)}
                className="w-6 h-6 rounded-md hover:bg-slate-200/70 flex items-center justify-center transition-colors cursor-pointer hover:text-slate-700"
                title="预设研判指令"
              >
                <SquarePen size={16} strokeWidth={1.7} />
              </button>

              {/* Presets Popover */}
              {showPresetPicker && (
                <div className="absolute right-0 bottom-8 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-30 space-y-1 text-xs text-slate-700">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 border-b border-slate-100">
                    快速研判模版：
                  </div>
                  {presetQueries.map((p, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => {
                        handleAsk(p.prompt);
                        setShowPresetPicker(false);
                      }}
                      className="w-full text-left px-2.5 py-2 hover:bg-indigo-50/60 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <p className="font-semibold text-slate-800">{p.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{p.prompt}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* [🕒] History / Reset */}
            <button
              onClick={handleResetChat}
              className="w-6 h-6 rounded-md hover:bg-slate-200/70 flex items-center justify-center transition-colors cursor-pointer hover:text-slate-700"
              title="重置对话 / 返回初始欢迎"
            >
              <History size={16} strokeWidth={1.7} />
            </button>
          </div>

          {/* Clean, Modern Floating Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:border-slate-300 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all p-3 space-y-2">
            {/* Top context tags inside the card (e.g. [ 📄 大学生要不要考研.md  × ]) */}
            {attachedContexts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {attachedContexts.map((ctx) => (
                  <div
                    key={ctx.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 text-slate-700 text-xs border border-slate-200 font-medium shadow-2xs group"
                  >
                    {ctx.type === "query" ? (
                      <FileText size={12} className="text-slate-500" />
                    ) : ctx.type === "answer" ? (
                      <User size={12} className="text-indigo-600" />
                    ) : (
                      <Lightbulb size={12} className="text-amber-600" />
                    )}
                    <span className="max-w-[170px] truncate">{ctx.label}</span>
                    <button
                      onClick={(e) => removeContext(ctx.id, e)}
                      className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer transition-colors"
                      title="移除上下文"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Clean, spacious textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                rows={3}
                placeholder="针对本议题输入您想研判的问题..."
                value={question}
                disabled={isAsking}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                className="w-full bg-transparent border-none p-0 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none resize-none font-sans leading-relaxed disabled:opacity-60"
              />
            </div>

            {/* Bottom row inside Card: Clean send button */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                按 Enter 发送，Shift + Enter 换行
              </span>

              <button
                onClick={() => handleAsk()}
                disabled={isAsking || !question.trim()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
                title="发送提问 (Enter)"
              >
                <span>研判</span>
                <ArrowUp size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Status Strip Aligned with Overall Theme */}
      <div className="px-4 py-2 border-t border-slate-200/80 bg-white text-[11px] text-slate-500 font-sans flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span>{totalEdgesCount} 条反向链接</span>
          <span>{totalNotesCount} 个笔记属性</span>
          <span className="flex items-center gap-1">
            <span>✎</span>
            <span>{totalWords.toLocaleString()} 个词</span>
          </span>
          <span>{totalChars.toLocaleString()} 个字符</span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-indigo-600 cursor-pointer" title="图谱实时同步">
            🔀
          </span>
          <span className="text-emerald-600 font-bold" title="就绪">
            ✓
          </span>
          <span className="font-mono text-[10px] text-slate-500 font-medium">main</span>
        </div>
      </div>
    </div>
  );
}
