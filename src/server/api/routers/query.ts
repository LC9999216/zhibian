import { Router, Request, Response } from "express";
import { IngestionService } from "../../services/ingestion.js";
import { ZhihuSearchAdapter } from "../../services/zhihu-adapter.js";
import { GraphService } from "../../services/graph-service.js";
import { GraphRAGService } from "../../services/graph-rag.js";
import { ExtractionService } from "../../services/extraction.js";
import { db } from "../../db/store.js";

export const queryRouter = Router();

// POST /api/queries/analyze - 提交自然语言问题并启动分析流水线
queryRouter.post("/analyze", async (req: Request, res: Response): Promise<any> => {
  try {
    const text = (req.body.text || req.body.query || "").trim();
    
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Query text is required" });
    }

    const result = await IngestionService.startAnalyzeJob(text);
    
    // Also generate fixtures if needed for stage testing
    ZhihuSearchAdapter.generateFixtures().catch(console.error);

    return res.json({
      query: result.query,
      answers: result.answers,
    });
  } catch (error) {
    console.error("Error analyzing query:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/queries/:id - 获取查询基本信息
queryRouter.get("/:id", (req: Request, res: Response): any => {
  const query = db.getQuery(req.params.id);
  if (!query) {
    return res.status(404).json({ error: "Query not found" });
  }
  return res.json(query);
});

// GET /api/queries/:id/answers - 获取回答列表，支持 voteup / concept 筛选
queryRouter.get("/:id/answers", (req: Request, res: Response): any => {
  const { concept, minVoteup } = req.query;
  let answers = db.getAnswersByQuery(req.params.id);

  if (concept && typeof concept === "string") {
    answers = answers.filter((ans) =>
      ans.concepts?.some((c) => c.toLowerCase().includes(concept.toLowerCase()))
    );
  }

  if (minVoteup && !isNaN(Number(minVoteup))) {
    const min = Number(minVoteup);
    answers = answers.filter((ans) => ans.voteup_count >= min);
  }

  return res.json(answers);
});

// GET /api/queries/:id/graph - 返回 Stage 5 知识图谱 (QUERY -> ANSWERS -> CLAIMS & CONCEPTS)
queryRouter.get("/:id/graph", (req: Request, res: Response): any => {
  const query = db.getQuery(req.params.id);
  if (!query) {
    return res.status(404).json({ error: "Query not found" });
  }

  const graphData = GraphService.buildGraph(query.id);
  return res.json(graphData);
});

// POST /api/queries/:id/ask - Stage 6 Graph-RAG AI 智能问答
queryRouter.post("/:id/ask", async (req: Request, res: Response): Promise<any> => {
  try {
    const { question, answerId } = req.body;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Question is required" });
    }

    const ragResult = await GraphRAGService.askGraph(
      req.params.id,
      question,
      answerId
    );

    return res.json(ragResult);
  } catch (error: any) {
    console.error("Error in askGraph:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// POST /api/queries/:id/refine/:answerId - 对指定知乎博主的长文回答进行深度AI提炼
queryRouter.post("/:id/refine/:answerId", async (req: Request, res: Response): Promise<any> => {
  try {
    const query = db.getQuery(req.params.id);
    const answer = db.getAnswer(req.params.answerId);

    if (!answer) {
      return res.status(404).json({ error: "Answer not found" });
    }

    const queryText = query ? query.query_text : "知乎问题分析";
    const refined = await ExtractionService.deepRefineAnswer(
      queryText,
      answer.author_name,
      answer.content_text
    );

    return res.json({
      answerId: answer.id,
      authorName: answer.author_name,
      ...refined,
    });
  } catch (error: any) {
    console.error("Error refining answer:", error);
    return res.status(500).json({ error: error.message || "Failed to refine answer" });
  }
});



