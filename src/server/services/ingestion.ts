import { DBQuery, DBAnswer, DBClaim } from "../../shared/models.js";
import { db } from "../db/store.js";
import { ZhihuSearchAdapter } from "./zhihu-adapter.js";
import { ExtractionService } from "./extraction.js";
import crypto from "crypto";

export interface ImportJobResult {
  query: DBQuery;
  answers: DBAnswer[];
}

/**
 * IngestionService (Stage 3 & 4)
 * Orchestrates Query analysis, ingestion into DB, deduplication by content_id,
 * LLM extraction of claims, concepts, stances, and job status tracking.
 */
export class IngestionService {
  static async startAnalyzeJob(queryText: string): Promise<ImportJobResult> {
    const trimmed = queryText.trim();
    const queryId = "q_" + crypto.createHash("md5").update(trimmed).digest("hex").slice(0, 10);

    const now = Date.now();
    let dbQuery = db.getQuery(queryId);

    if (!dbQuery) {
      dbQuery = {
        id: queryId,
        query_text: trimmed,
        status: "fetching",
        result_count: 0,
        created_at: now,
        updated_at: now,
      };
      db.saveQuery(dbQuery);
    } else {
      db.updateQueryStatus(queryId, "fetching");
    }

    try {
      // 1. Fetch search answers via ZhihuSearchAdapter
      const searchResult = await ZhihuSearchAdapter.searchAnswers(trimmed, 10);
      dbQuery.search_hash_id = searchResult.query.search_hash_id;
      dbQuery.result_count = searchResult.answers.length;
      dbQuery.updated_at = Date.now();
      db.updateQueryStatus(queryId, "analyzing");

      // 2. Batch extraction in 1 single Gemini call for all answers (Stage 4)
      const analysisMap = await ExtractionService.batchExtractAnswers(
        trimmed,
        searchResult.answers.map((item) => ({
          content_id: item.content_id,
          author_name: item.author_name,
          content_text: item.content_text,
        }))
      );

      const savedAnswers: DBAnswer[] = [];
      for (const item of searchResult.answers) {
        const answerId = `ans_${item.content_id}`;
        let existing = db.getAnswer(answerId);

        const analysis = analysisMap.get(item.content_id) || {
          summary: item.content_text.slice(0, 60),
          stance: "conditional" as const,
          claims: [],
          concepts: [],
          evidence: [],
        };

        const claims: DBClaim[] = analysis.claims.map((c, idx) => ({
          id: `claim_${answerId}_${idx}`,
          answer_id: answerId,
          text: c.text,
          confidence: c.confidence,
        }));

        claims.forEach((c) => db.saveClaim(c));

        const answerRecord: DBAnswer = {
          id: answerId,
          query_id: queryId,
          content_id: item.content_id,
          content_type: item.content_type,
          author_name: item.author_name,
          content_text: item.content_text,
          voteup_count: item.voteup_count,
          url: item.url,
          edit_time: Date.now(),
          summary: analysis.summary,
          stance: analysis.stance,
          claims,
          concepts: analysis.concepts,
          evidence: analysis.evidence,
        };

        db.upsertAnswer(answerRecord);
        savedAnswers.push(answerRecord);
      }

      // Mark completed
      db.updateQueryStatus(queryId, "completed");

      return {
        query: dbQuery,
        answers: savedAnswers,
      };
    } catch (err: any) {
      db.updateQueryStatus(queryId, "failed");
      throw err;
    }
  }
}

