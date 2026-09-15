import { GoogleGenAI, Type } from "@google/genai";
import { StanceType } from "../../shared/models.js";

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

export interface ExtractedAnswerAnalysis {
  summary: string;
  stance: StanceType;
  claims: Array<{
    text: string;
    confidence: number;
  }>;
  concepts: string[];
  evidence: string[];
}

export interface InputAnswerItem {
  content_id: string;
  author_name: string;
  content_text: string;
}

// Preferred models list: gemini-3.1-flash-lite offers high availability and dedicated throughput
const PRIMARY_MODEL = "gemini-3.1-flash-lite";
const MODEL_FALLBACK_CANDIDATES = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];

/**
 * ExtractionService (Stage 4)
 * Uses Gemini API to batch-extract claims, stances, concepts, and evidence chunks.
 * Uses a single batch request per search query to strictly prevent 429 quota exhaustion and 503 high demand errors.
 */
export class ExtractionService {
  /**
   * Batch analyze all answers in a single API call for maximum performance and quota safety.
   */
  static async batchExtractAnswers(
    queryText: string,
    answers: InputAnswerItem[]
  ): Promise<Map<string, ExtractedAnswerAnalysis>> {
    const resultMap = new Map<string, ExtractedAnswerAnalysis>();
    if (answers.length === 0) return resultMap;

    const ai = getAIClient();

    if (ai) {
      // Build batch prompt with concise, representative content slices (max 800 chars per answer)
      const formattedAnswers = answers
        .map(
          (ans) =>
            `=== 回答 [ID: ${ans.content_id}] 作者: ${ans.author_name} ===\n${ans.content_text.slice(0, 800)}`
        )
        .join("\n\n");

      const prompt = `你是一个专业的知乎观点分析与知识图谱抽取引擎。
用户检索主题: "${queryText}"

请同时分析以下 ${answers.length} 篇知乎回答全文，对每一篇抽取结构化信息（返回列表 results，每个回答严格对应其 content_id）：
1. content_id: 回答对应的唯一ID
2. summary: 一句话核心摘要（30-60字）
3. stance: 作者针对用户问题的核心立场（只能为：'support' 支持/肯定, 'oppose' 反对/否定, 'conditional' 视情况而定/因人而异, 'neutral' 客观中立）
4. claims: 核心观点列表（1-3条），每条包含 text (12-25字精炼概括) 和 confidence (0.0-1.0)。
   【重点要求】：如果不同答主表达了相同或高度一致的观点（例如都强调"不可盲目跟风考研需有清晰职业规划"、或"有硬性岗位门槛才建议读研"、或"科研院所补贴能覆盖学费"），请统一采用规范、精炼的同一种观点句式表述，以便知识图谱将不同人的相同观点合并呈现为群体共识节点！
5. concepts: 回答涉及的2-4个核心概念关键词（如"算法岗"、"应届生"、"选调生"、"机会成本"）
6. evidence: 支撑其论点的1-2句关键证据引言

待分析回答列表：
${formattedAnswers}`;

      // Try primary model with automatic backoff retry for transient 503 spikes
      let processedSuccessfully = false;
      const modelQueue = [PRIMARY_MODEL, PRIMARY_MODEL, ...MODEL_FALLBACK_CANDIDATES.filter((m) => m !== PRIMARY_MODEL)];

      for (let i = 0; i < modelQueue.length && !processedSuccessfully; i++) {
        const modelName = modelQueue[i];
        try {
          if (i > 0 && modelQueue[i] === modelQueue[i - 1]) {
            // Transient retry pause for high demand spikes
            await new Promise((r) => setTimeout(r, 1000));
          }

          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  results: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        content_id: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        stance: {
                          type: Type.STRING,
                          enum: ["support", "oppose", "conditional", "neutral"],
                        },
                        claims: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              text: { type: Type.STRING },
                              confidence: { type: Type.NUMBER },
                            },
                            required: ["text", "confidence"],
                          },
                        },
                        concepts: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        evidence: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: ["content_id", "summary", "stance", "claims", "concepts", "evidence"],
                    },
                  },
                },
                required: ["results"],
              },
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text) as {
              results: Array<ExtractedAnswerAnalysis & { content_id: string }>;
            };

            if (parsed.results && Array.isArray(parsed.results)) {
              for (const item of parsed.results) {
                resultMap.set(item.content_id, {
                  summary: item.summary || "",
                  stance: item.stance || "conditional",
                  claims: item.claims || [],
                  concepts: item.concepts || [],
                  evidence: item.evidence || [],
                });
              }
              processedSuccessfully = true;
              break;
            }
          }
        } catch (err: any) {
          // Gracefully record failure without dumping raw JSON errors into stdout
          const statusCode = err?.status || (err?.message?.includes("503") ? 503 : 429);
          console.log(`[ExtractionService] Model attempt (${modelName}, attempt ${i + 1}) returned status ${statusCode}`);
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    // Ensure every answer has a valid analysis (fallback if LLM missed it or failed)
    for (const ans of answers) {
      if (!resultMap.has(ans.content_id)) {
        resultMap.set(
          ans.content_id,
          this.fallbackExtract(queryText, ans.author_name, ans.content_text)
        );
      }
    }

    return resultMap;
  }

  /**
   * Analyze a single answer (with fallback)
   */
  static async extractFromAnswer(
    queryText: string,
    authorName: string,
    contentText: string
  ): Promise<ExtractedAnswerAnalysis> {
    const singleMap = await this.batchExtractAnswers(queryText, [
      { content_id: "single", author_name: authorName, content_text: contentText },
    ]);
    return singleMap.get("single") || this.fallbackExtract(queryText, authorName, contentText);
  }

  /**
   * Rule-based fallback extraction
   */
  private static fallbackExtract(
    queryText: string,
    authorName: string,
    contentText: string
  ): ExtractedAnswerAnalysis {
    const text = contentText.trim();
    let stance: StanceType = "conditional";

    const lower = text.toLowerCase();
    if (
      lower.includes("不建议") ||
      lower.includes("没必要") ||
      lower.includes("反对") ||
      lower.includes("弊大于利") ||
      lower.includes("风险高") ||
      lower.includes("劝退") ||
      lower.includes("冲击") ||
      lower.includes("被替代") ||
      lower.includes("不要盲目")
    ) {
      stance = "oppose";
    } else if (
      lower.includes("强烈推荐") ||
      lower.includes("强烈建议") ||
      lower.includes("利大于弊") ||
      lower.includes("大有可为") ||
      lower.includes("积极拥抱") ||
      lower.includes("巨大优势") ||
      lower.includes("值得") ||
      lower.includes("赋能") ||
      lower.includes("红利")
    ) {
      stance = "support";
    } else if (
      lower.includes("取决于") ||
      lower.includes("视情况") ||
      lower.includes("看个人") ||
      lower.includes("因人而异") ||
      lower.includes("双刃剑") ||
      lower.includes("门槛") ||
      lower.includes("辩证")
    ) {
      stance = "conditional";
    }

    const candidateKeywords = [
      "AI", "人工智能", "大模型", "效率提升", "自动化", "生产力",
      "就业", "替代风险", "审美把控", "商业变现", "认知鸿沟", "核心竞争力",
      "考研", "科研", "算法", "学历", "体制内", "选调生", "机会成本",
      "大厂", "工程实践", "晋升", "薪资", "高校", "学业", "职业规划",
      "转型", "门槛", "技术红利", "独立开发", "自由职业"
    ];
    let concepts = candidateKeywords.filter((k) => text.includes(k)).slice(0, 4);
    if (concepts.length === 0) {
      // Extract from queryText
      const queryWords = queryText.split(/[对的与和？?，, ]/).filter((w) => w.length >= 2);
      concepts = queryWords.slice(0, 3);
      if (concepts.length === 0) concepts = ["能力提升", "发展机遇", "风险应对"];
    }

    const sentences = text
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 8);

    const firstSentence = sentences[0] || text.slice(0, 50);
    const summary = firstSentence.length > 60 ? firstSentence.slice(0, 57) + "..." : firstSentence;

    const claims = sentences.slice(0, 2).map((s) => ({
      text: s,
      confidence: 0.85,
    }));

    const evidence = sentences.slice(1, 3);

    return {
      summary,
      stance,
      claims,
      concepts,
      evidence,
    };
  }

  /**
   * Deeply refine and summarize an answer on demand using Gemini.
   * Extracts multi-dimension takeaways: core logic, pros/cons breakdown, and recommended action steps.
   */
  static async deepRefineAnswer(
    queryText: string,
    authorName: string,
    contentText: string
  ): Promise<{
    takeaways: string[];
    coreLogic: string;
    advice: string;
  }> {
    const ai = getAIClient();
    if (ai) {
      const prompt = `你是一名高水平的知乎高赞长文分析师。
主题问题: "${queryText}"
答主: "${authorName}"
答主回答内容:
${contentText}

请对该答主的内容进行高浓度提炼，抽丝剥茧提炼出最有价值的信息：
1. takeaways: 答主的3-5条高价值核心观点或经验干货（每条15-40字，一针见血）
2. coreLogic: 答主的底层决策逻辑与思考框架（80-150字）
3. advice: 答主给读者的关键行动建议或避坑指南（50-100字）`;

      const modelQueue = [PRIMARY_MODEL, ...MODEL_FALLBACK_CANDIDATES.filter((m) => m !== PRIMARY_MODEL)];
      for (const modelName of modelQueue) {
        try {
          const res = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  takeaways: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  coreLogic: { type: Type.STRING },
                  advice: { type: Type.STRING },
                },
                required: ["takeaways", "coreLogic", "advice"],
              },
            },
          });

          if (res.text) {
            const parsed = JSON.parse(res.text);
            return {
              takeaways: parsed.takeaways || [],
              coreLogic: parsed.coreLogic || "",
              advice: parsed.advice || "",
            };
          }
        } catch (e: any) {
          console.warn(`[ExtractionService] deepRefineAnswer failed with ${modelName}:`, e.message || e);
        }
      }
    }

    // Heuristic fallback
    const sentences = contentText
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 10 && !s.includes("谢邀"));

    return {
      takeaways: sentences.slice(0, 4),
      coreLogic: `答主「${authorName}」强调结合自身实际情况与长远发展规划做决策，警惕盲目跟风。`,
      advice: "明确自身核心竞争力与机会成本，善用前沿工具赋能个人成长，切忌过度焦虑或纸上谈兵。",
    };
  }
}

