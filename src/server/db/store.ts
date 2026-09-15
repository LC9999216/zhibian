import { DBQuery, DBAnswer, DBClaim, DBConcept, DBEdge, JobStatus } from "../../shared/models.js";
import fs from "fs";
import path from "path";

/**
 * In-memory / File-backed Database store satisfying Stage 1 & Stage 3 specifications.
 * Supports relational queries for queries, answers, claims, concepts, and edges.
 */
class MemoryDatabase {
  private queries: Map<string, DBQuery> = new Map();
  private answers: Map<string, DBAnswer> = new Map();
  private claims: Map<string, DBClaim> = new Map();
  private concepts: Map<string, DBConcept> = new Map();
  private edges: Map<string, DBEdge> = new Map();

  constructor() {
    this.seedFromFixtures();
  }

  private seedFromFixtures() {
    try {
      const fixturesDir = path.join(process.cwd(), "fixtures");
      const answersFile = path.join(fixturesDir, "answers.json");
      if (fs.existsSync(answersFile)) {
        const rawAnswers = JSON.parse(fs.readFileSync(answersFile, "utf-8"));
        const defaultQueryId = "q_13be7d033b";
        const query: DBQuery = {
          id: defaultQueryId,
          query_text: "大学生要不要考研？",
          status: "completed",
          result_count: rawAnswers.length,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        this.saveQuery(query);

        for (const item of rawAnswers) {
          const ansId = `ans_${item.content_id}`;
          const stance = item.voteup_count > 100 ? "conditional" : item.voteup_count > 10 ? "support" : "oppose";
          const firstSentence = item.content_text.split(/[。！？\n]/)[0] || "";
          const summary = firstSentence.length > 60 ? firstSentence.slice(0, 57) + "..." : firstSentence;
          
          const answer: DBAnswer = {
            id: ansId,
            query_id: defaultQueryId,
            content_id: item.content_id,
            content_type: item.content_type || "Answer",
            author_name: item.author_name,
            content_text: item.content_text,
            voteup_count: item.voteup_count,
            url: item.url,
            edit_time: Date.now(),
            summary,
            stance: stance as any,
            concepts: ["学历贬值", "就业机会", "职业规划", "机会成本"],
            claims: [
              {
                id: `claim_${ansId}_0`,
                answer_id: ansId,
                text: summary || "考研必须根据个人长远规划和岗位门槛决定",
                confidence: 0.9,
              },
            ],
            evidence: [summary],
          };
          this.upsertAnswer(answer);
        }
      }
    } catch (e) {
      console.warn("[MemoryDatabase] Seed error:", e);
    }
  }

  // Queries
  saveQuery(query: DBQuery): void {
    this.queries.set(query.id, query);
  }

  getQuery(id: string): DBQuery | undefined {
    return this.queries.get(id);
  }

  updateQueryStatus(id: string, status: JobStatus): void {
    const q = this.queries.get(id);
    if (q) {
      q.status = status;
      q.updated_at = Date.now();
    }
  }

  getAllQueries(): DBQuery[] {
    return Array.from(this.queries.values()).sort((a, b) => b.created_at - a.created_at);
  }

  // Answers
  upsertAnswer(answer: DBAnswer): void {
    this.answers.set(answer.id, answer);
  }

  getAnswer(id: string): DBAnswer | undefined {
    return this.answers.get(id);
  }

  getAnswersByQuery(queryId: string): DBAnswer[] {
    return Array.from(this.answers.values())
      .filter((a) => a.query_id === queryId)
      .sort((a, b) => b.voteup_count - a.voteup_count);
  }

  // Claims
  saveClaim(claim: DBClaim): void {
    this.claims.set(claim.id, claim);
  }

  getClaimsByAnswer(answerId: string): DBClaim[] {
    return Array.from(this.claims.values()).filter((c) => c.answer_id === answerId);
  }

  // Concepts
  saveConcept(concept: DBConcept): void {
    this.concepts.set(concept.id, concept);
  }

  getConceptByName(name: string): DBConcept | undefined {
    return Array.from(this.concepts.values()).find(
      (c) => c.canonical_name === name || c.aliases.includes(name)
    );
  }

  getAllConcepts(): DBConcept[] {
    return Array.from(this.concepts.values()).sort((a, b) => b.frequency - a.frequency);
  }

  // Edges
  saveEdge(edge: DBEdge): void {
    this.edges.set(edge.id, edge);
  }

  getEdgesForQuery(queryId: string): DBEdge[] {
    // In Stage 5, edges will link query -> answers -> claims -> concepts
    return Array.from(this.edges.values());
  }

  getAllAnswers(): DBAnswer[] {
    return Array.from(this.answers.values()).sort((a, b) => b.voteup_count - a.voteup_count);
  }

  clear(): void {
    this.queries.clear();
    this.answers.clear();
    this.claims.clear();
    this.concepts.clear();
    this.edges.clear();
  }
}

export const db = new MemoryDatabase();
