// Database models & types according to section 6.1 of the design doc:
// queries: id, query_text, search_hash_id, result_count, status, created_at, updated_at
// answers: id, query_id, content_id, content_type, author_name, content_text, summary, stance, voteup_count, url, edit_time, embedding
// claims: id, answer_id, text, confidence, embedding
// concepts: id, canonical_name, aliases, frequency, embedding
// edges: id, source_type, source_id, target_type, target_id, relation_type, weight, confidence, metadata
// answer_chunks: id, answer_id, chunk_text, chunk_index, embedding

export type JobStatus = "pending" | "fetching" | "analyzing" | "completed" | "failed";

export interface DBQuery {
  id: string;
  query_text: string;
  search_hash_id?: string;
  result_count: number;
  status: JobStatus;
  created_at: number;
  updated_at: number;
}

export type StanceType = "support" | "oppose" | "conditional" | "neutral";

export interface DBAnswer {
  id: string;
  query_id: string;
  content_id: string;
  content_type: string;
  author_name: string;
  content_text: string;
  summary?: string;
  stance?: StanceType;
  voteup_count: number;
  url: string;
  edit_time?: number;
  embedding?: number[];
  claims?: DBClaim[];
  concepts?: string[];
  evidence?: string[];
}

export interface DBClaim {
  id: string;
  answer_id: string;
  text: string;
  confidence: number;
  embedding?: number[];
}

export interface DBConcept {
  id: string;
  canonical_name: string;
  aliases: string[];
  frequency: number;
  embedding?: number[];
}

export type EdgeRelationType = "RETURNS_ANSWER" | "MAKES_CLAIM" | "REFERS_TO" | "SIMILAR_TO";

export interface DBEdge {
  id: string;
  source_type: "QUERY" | "ANSWER" | "CLAIM" | "CONCEPT";
  source_id: string;
  target_type: "QUERY" | "ANSWER" | "CLAIM" | "CONCEPT";
  target_id: string;
  relation_type: EdgeRelationType;
  weight: number;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface DBAnswerChunk {
  id: string;
  answer_id: string;
  chunk_text: string;
  chunk_index: number;
  embedding?: number[];
}
