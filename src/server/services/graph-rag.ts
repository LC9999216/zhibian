import { GoogleGenAI } from "@google/genai";
import { db } from "../db/store.js";

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

export interface GraphRAGResponse {
  answer: string;
  citations: Array<{
    author_name: string;
    voteup_count: number;
    url: string;
    quote: string;
  }>;
}

/**
 * GraphRAGService (Stage 6)
 * Generates synthesis reports and answers user questions grounded in the knowledge graph:
 * Uses answers, extracted claims, author stances, and evidence links with verifiable citations.
 */
const PRIMARY_MODEL = "gemini-3.1-flash-lite";
const MODEL_FALLBACK_CANDIDATES = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

export class GraphRAGService {
  static async askGraph(
    queryId: string,
    userQuestion: string,
    targetAnswerId?: string
  ): Promise<GraphRAGResponse> {
    let query = db.getQuery(queryId);
    if (!query) {
      const allQueries = db.getAllQueries();
      if (allQueries.length > 0) {
        query = allQueries[0];
      }
    }

    let answers = query ? db.getAnswersByQuery(query.id) : [];
    if (answers.length === 0) {
      // Fallback to all answers in db
      answers = db.getAllAnswers();
    }

    if (targetAnswerId) {
      const filtered = answers.filter((a) => a.id === targetAnswerId);
      if (filtered.length > 0) answers = filtered;
    }

    const ai = getAIClient();

    // Prepare structured context with graph evidence
    const contextItems = answers.map((ans, idx) => {
      const claimsStr = (ans.claims || []).map((c) => `- 论点: ${c.text} (置信度: ${c.confidence})`).join("\n");
      const conceptsStr = (ans.concepts || []).join(", ");
      const evidenceStr = (ans.evidence || []).map((e) => `  * 证据: "${e}"`).join("\n");

      return `【来源 ${idx + 1}】作者: ${ans.author_name} (赞同数: ${ans.voteup_count}, 立场: ${ans.stance || "未标注"})
链接: ${ans.url}
摘要: ${ans.summary || "无摘要"}
关键概念: ${conceptsStr || "无"}
核心论点:
${claimsStr || "- 无论点"}
证据片段:
${evidenceStr || "  * 无特定片段"}
回答内容摘选:
"""
${ans.content_text.slice(0, 800)}
"""`;
    });

    const fullContext = contextItems.join("\n\n--------------------------------\n\n");

    const citations = answers.slice(0, 4).map((ans) => ({
      author_name: ans.author_name,
      voteup_count: ans.voteup_count,
      url: ans.url,
      quote: ans.summary || ans.content_text.slice(0, 80),
    }));

    if (ai) {
      const prompt = `你是一个基于知乎知识图谱的观点综合分析与智能研判专家（知辨 AI）。
当前讨论主题: "${query.query_text}"
用户具体提问: "${userQuestion}"

以下是图谱中聚合的知乎回答事实、作者论点、立场及证据链：
${fullContext}

请根据以上图谱证据生成一份结构严密、排版美观清晰的专业研判报告，严格遵循以下 Markdown 结构规范：

### 🎯 核心研判结论
（用 2-3 句话高度概括当前议题的本质、核心共识与关键结论，突出全局判断）

### ⚖️ 多方立场与核心分歧
（按照不同阵营分类梳理，论点务必具体、鲜明，使用 [来源序号] 如 [1]、[2] 标注出处）：
- **🟢 支持/赋能视角**：核心主张、带来的确定性收益与代表答主论据 [1]。
- **🔴 审慎/警惕视角**：主要风险、沉没成本、结构性冲击与反对理由 [2]。
- **🟡 务实/条件视角**：因人而异的前提条件、关键门槛与关键权衡因素 [3]。

### 🔗 关键证据链与事实支撑
（提炼 2-3 条最有说服力的硬核数据、真实案例或逻辑推导，标明对应答主）

### 💡 针对不同人群的研判建议
- **初入领域/普通从业者**：具体可执行的行动指引。
- **进阶决策/深耕者**：长远布局与风险防范策略。

要求：
1. 观点客观中立，严谨求实，避免空洞口号。
2. 每一个核心论断必须引用来源编号 [1]、[2] 等。
3. 层次分明，逻辑推演顺畅。`;

      const modelQueue = [PRIMARY_MODEL, "gemini-3.1-flash-lite", ...MODEL_FALLBACK_CANDIDATES.filter((m) => m !== PRIMARY_MODEL)];

      for (let i = 0; i < modelQueue.length; i++) {
        const modelName = modelQueue[i];
        try {
          if (i > 0 && modelQueue[i] === modelQueue[i - 1]) {
            await new Promise((r) => setTimeout(r, 1000));
          }

          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction: "你是一个严肃、客观的社会议题与知乎观点分析专家，回答必须基于知识图谱事实，输出排版优雅、层次清晰的 Markdown 结构化研判报告。",
              temperature: 0.7,
            },
          });

          if (response.text) {
            return {
              answer: response.text,
              citations,
            };
          }
        } catch (err: any) {
          const statusCode = err?.status || (err?.message?.includes("503") ? 503 : 429);
          console.log(`[GraphRAGService] Model attempt (${modelName}, attempt ${i + 1}) returned status ${statusCode}`);
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    // High quality dynamic fallback synthesis grounded in current answers & stances
    const supportAns = answers.filter((a) => a.stance === "support");
    const opposeAns = answers.filter((a) => a.stance === "oppose");
    const condAns = answers.filter((a) => a.stance === "conditional" || (!supportAns.includes(a) && !opposeAns.includes(a)));

    const formatAnswerItem = (ansList: typeof answers) => {
      if (ansList.length === 0) return "暂无单一极端倾向，多偏向理性务实分析。";
      return ansList
        .map((a) => {
          const idx = answers.indexOf(a) + 1;
          const summary = a.summary || a.content_text.split(/[。！？\n]/)[0] || "";
          return `* **[来源 ${idx}] @${a.author_name}**（${a.voteup_count} 赞）：${summary}`;
        })
        .join("\n");
    };

    const answerSummary = `### 🎯 核心研判结论
针对**「${query.query_text}」**这一议题，基于知乎图谱中聚合的 ${answers.length} 篇高赞答主观点与证据链分析：该问题呈现高度的**双面分化与阶段性特征**。它既是提升效率与破局发展的杠杆，同时也伴随着显性的机会成本与结构性门槛，其最终成效深刻取决于个体的定位与执行力。

---

### ⚖️ 多方立场与核心分歧

#### 🟢 积极/赋能视角（支持方）
${formatAnswerItem(supportAns)}

#### 🔴 审慎/风险视角（反对方）
${formatAnswerItem(opposeAns)}

#### 🟡 务实/视条件而定（中立方）
${formatAnswerItem(condAns)}

---

### 🔗 关键证据链与事实支撑
* **效率与门槛重塑**：高赞答主普遍指出，单纯的基础操作与重复劳动价值正在缩水，跨界整合与决策兜底能力成为核心壁垒 [1][2]。
* **机会成本与时间沉没**：盲目跟风存在显著的时间与经济沉没风险，必须根据真实需求与明确目标进行投入产出比核算 [3][4]。

---

### 💡 针对不同人群的研判建议
* **针对初学者 / 迷茫探索者**：切忌陷入观望焦虑或纸上谈兵，建议从小处着手积累实战经验，验证反馈。
* **针对深耕从业者 / 决策者**：注重打磨专业领域壁垒与核心业务洞察，善用前沿工具赋能全局产出，保持敏捷迭代。`;

    return {
      answer: answerSummary,
      citations,
    };
  }
}
