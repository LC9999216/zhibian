import { DBQuery, DBAnswer, DBClaim, DBConcept, DBEdge } from "../../shared/models.js";
import { db } from "../db/store.js";
import crypto from "crypto";

export interface GraphBuildResult {
  nodes: Array<{
    id: string;
    type: "QUERY" | "ANSWER" | "CLAIM" | "CONCEPT";
    label: string;
    size: number;
    color: string;
    stance?: string;
    voteup_count?: number;
    url?: string;
    claims_count?: number;
    full_text?: string;
    confidence?: number;
    is_consensus?: boolean;
    consensus_count?: number;
    supporters?: Array<{
      answerId: string;
      authorName: string;
      voteupCount: number;
      originalText: string;
    }>;
    parentId?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation_type: string;
    label?: string;
  }>;
}

interface RawClaimItem {
  claimId: string;
  text: string;
  confidence: number;
  answerId: string;
  authorName: string;
  voteupCount: number;
  concepts: string[];
}

interface MergedClaimCluster {
  id: string;
  canonicalText: string;
  fullText: string;
  supporters: Array<{
    answerId: string;
    authorName: string;
    voteupCount: number;
    originalText: string;
    confidence: number;
  }>;
  relatedConcepts: Set<string>;
  confidence: number;
}

/**
 * Text normalizer for semantic comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:\s\(\)（）"“”'']/g, "")
    .replace(
      /^(我觉得|我认为|其实|总体而言|因此|所以|如果|那么|也就是说|总的来说|在我看来|个人建议|需要注意的是|对于|来说)+/,
      ""
    )
    .trim();
}

/**
 * Extract character 2-grams
 */
function getBigrams(norm: string): Set<string> {
  const bg = new Set<string>();
  for (let i = 0; i < norm.length - 1; i++) {
    bg.add(norm.slice(i, i + 2));
  }
  return bg;
}

// Key semantic clusters for Chinese academic / career / opinion queries
const SEMANTIC_SYNONYM_GROUPS: string[][] = [
  ["跟风", "盲从", "盲目", "从众", "随大流", "没有明确目的", "无明确目标", "替代思考未来"],
  ["逃避", "逃避就业", "逃避工作", "缓就业", "拖延就业"],
  ["硬性门槛", "学历门槛", "门槛", "硬性需求", "高校门槛", "公职门槛", "考公选调"],
  ["机会成本", "权衡成本", "手头资源", "时间成本", "昂贵代价"],
  ["科研院所", "中科院", "研究所", "科学院", "体制体系"],
  ["补贴覆盖", "生活费", "全覆盖", "补贴", "不用花钱", "经济压力小"],
  ["更换城市", "换平台", "改变现状", "地域发展", "城市平台", "换赛道"],
  ["大厂", "工程能力", "业务实践", "开发岗", "代码能力"],
];

/**
 * Compute semantic similarity between two claim texts (0.0 to 1.0)
 */
function computeClaimSimilarity(textA: string, textB: string): number {
  const normA = normalizeText(textA);
  const normB = normalizeText(textB);

  if (normA === normB) return 1.0;

  // Substring containment
  if (
    (normA.length >= 6 && normB.length >= 6) &&
    (normA.includes(normB) || normB.includes(normA))
  ) {
    return 0.88;
  }

  // Character bigram Jaccard similarity
  const bgA = getBigrams(normA);
  const bgB = getBigrams(normB);
  let inter = 0;
  for (const b of bgA) {
    if (bgB.has(b)) inter++;
  }
  const union = bgA.size + bgB.size - inter;
  const bigramScore = union > 0 ? inter / union : 0;

  // Semantic concept group matching
  let matchedGroupCount = 0;
  for (const group of SEMANTIC_SYNONYM_GROUPS) {
    const hasA = group.some((word) => normA.includes(word));
    const hasB = group.some((word) => normB.includes(word));
    if (hasA && hasB) {
      matchedGroupCount++;
    }
  }

  // If both share semantic anchors, boost similarity
  const anchorBoost = matchedGroupCount >= 2 ? 0.45 : matchedGroupCount === 1 ? 0.28 : 0;

  return Math.min(1.0, bigramScore + anchorBoost);
}

/**
 * Cluster and merge consistent claims across answers
 */
function clusterClaims(rawClaims: RawClaimItem[]): MergedClaimCluster[] {
  const clusters: MergedClaimCluster[] = [];

  for (const item of rawClaims) {
    let bestCluster: MergedClaimCluster | null = null;
    let highestSim = 0;

    for (const cluster of clusters) {
      // Check similarity against canonical text and all supporters
      const simToCanonical = computeClaimSimilarity(item.text, cluster.canonicalText);
      let maxSimInCluster = simToCanonical;

      for (const sup of cluster.supporters) {
        const s = computeClaimSimilarity(item.text, sup.originalText);
        if (s > maxSimInCluster) maxSimInCluster = s;
      }

      // Threshold: 0.32 provides high precision semantic unification for Chinese claims
      if (maxSimInCluster >= 0.32 && maxSimInCluster > highestSim) {
        highestSim = maxSimInCluster;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      // Avoid duplicate entries from same answer in supporters list
      const alreadySupported = bestCluster.supporters.some(
        (s) => s.answerId === item.answerId
      );
      if (!alreadySupported) {
        bestCluster.supporters.push({
          answerId: item.answerId,
          authorName: item.authorName,
          voteupCount: item.voteupCount,
          originalText: item.text,
          confidence: item.confidence,
        });
      }

      // Merge concepts
      item.concepts.forEach((c) => bestCluster!.relatedConcepts.add(c));

      // Choose most representative text (prefer articulate length 12-28 chars)
      const currentLen = bestCluster.canonicalText.length;
      const itemLen = item.text.length;
      if (
        (itemLen >= 12 && itemLen <= 32 && (currentLen < 12 || currentLen > 35)) ||
        (item.voteupCount > bestCluster.supporters[0].voteupCount && itemLen <= 35)
      ) {
        bestCluster.canonicalText = item.text;
      }
    } else {
      const clusterId = `claim_m_${crypto
        .createHash("md5")
        .update(normalizeText(item.text).slice(0, 16) + "_" + item.claimId)
        .digest("hex")
        .slice(0, 10)}`;

      clusters.push({
        id: clusterId,
        canonicalText: item.text,
        fullText: item.text,
        supporters: [
          {
            answerId: item.answerId,
            authorName: item.authorName,
            voteupCount: item.voteupCount,
            originalText: item.text,
            confidence: item.confidence,
          },
        ],
        relatedConcepts: new Set(item.concepts),
        confidence: item.confidence,
      });
    }
  }

  return clusters;
}

/**
 * GraphService (Stage 5)
 * Builds multipartite knowledge graph:
 * QUERY -(RETURNS_ANSWER)-> ANSWER -(MAKES_CLAIM)-> MERGED_CLAIM -(REFERS_TO)-> CONCEPT
 * Also connects ANSWERS -(DISCUSSES)-> CONCEPT
 * Merges identical or consistent viewpoints from different authors into unified consensus nodes.
 */
export class GraphService {
  static buildGraph(queryId: string): GraphBuildResult {
    const query = db.getQuery(queryId);
    if (!query) {
      return { nodes: [], edges: [] };
    }

    const answers = db.getAnswersByQuery(queryId);
    const nodesMap = new Map<string, any>();
    const edgesList: any[] = [];

    // 1. Query Node (Root Centerpiece)
    nodesMap.set(query.id, {
      id: query.id,
      type: "QUERY",
      label: query.query_text,
      size: 22,
      color: "#4f46e5", // Electric Indigo
    });

    const stanceColors: Record<string, string> = {
      support: "#059669", // Vibrant Emerald
      oppose: "#e11d48", // Clean Crimson/Rose
      conditional: "#d97706", // Warm Golden Amber
      neutral: "#64748b", // Slate Neutral
    };

    const conceptFrequency = new Map<string, number>();
    const allRawClaims: RawClaimItem[] = [];

    // 2. Process Answer Nodes & Gather Claims/Concepts
    answers.forEach((ans, ansIdx) => {
      const answerColor = ans.stance
        ? stanceColors[ans.stance] || "#64748b"
        : "#475569";

      nodesMap.set(ans.id, {
        id: ans.id,
        type: "ANSWER",
        label: `${ans.author_name}`,
        size: Math.min(14 + Math.log10(ans.voteup_count + 1) * 2, 18),
        color: answerColor,
        stance: ans.stance,
        voteup_count: ans.voteup_count,
        url: ans.url,
        summary: ans.summary,
        answerIndex: ansIdx,
      });

      // Edge: QUERY -> ANSWER
      const qToAEdgeId = `e_${query.id}_${ans.id}`;
      edgesList.push({
        id: qToAEdgeId,
        source: query.id,
        target: ans.id,
        relation_type: "RETURNS_ANSWER",
        label: "回答",
      });
      db.saveEdge({
        id: qToAEdgeId,
        source_type: "QUERY",
        source_id: query.id,
        target_type: "ANSWER",
        target_id: ans.id,
        relation_type: "RETURNS_ANSWER",
        weight: 1.2,
        confidence: 1,
      });

      // Collect raw claims for cross-author merging
      if (ans.claims && ans.claims.length > 0) {
        ans.claims.forEach((claim) => {
          allRawClaims.push({
            claimId: claim.id,
            text: claim.text,
            confidence: claim.confidence,
            answerId: ans.id,
            authorName: ans.author_name,
            voteupCount: ans.voteup_count,
            concepts: ans.concepts || [],
          });
        });
      }

      // Concepts registration
      if (ans.concepts && ans.concepts.length > 0) {
        ans.concepts.forEach((conceptName) => {
          const count = (conceptFrequency.get(conceptName) || 0) + 1;
          conceptFrequency.set(conceptName, count);

          const conceptId = `concept_${crypto
            .createHash("md5")
            .update(conceptName)
            .digest("hex")
            .slice(0, 8)}`;

          if (!nodesMap.has(conceptId)) {
            nodesMap.set(conceptId, {
              id: conceptId,
              type: "CONCEPT",
              parentId: ans.id,
              label: `#${conceptName}`,
              size: 6.5,
              color: "#0284c7", // Sky Blue
            });

            db.saveConcept({
              id: conceptId,
              canonical_name: conceptName,
              aliases: [],
              frequency: count,
            });
          }

          const ansToConceptEdgeId = `e_${ans.id}_${conceptId}`;
          edgesList.push({
            id: ansToConceptEdgeId,
            source: ans.id,
            target: conceptId,
            relation_type: "REFERS_TO",
            label: "提及",
          });
        });
      }
    });

    // 3. Merge identical / consistent viewpoints from different authors
    const mergedClusters = clusterClaims(allRawClaims);

    mergedClusters.forEach((cluster) => {
      const isConsensus = cluster.supporters.length > 1;
      const consensusCount = cluster.supporters.length;

      // Clean label
      let displayLabel = cluster.canonicalText;
      if (isConsensus) {
        displayLabel = `[${consensusCount}人共识] ${cluster.canonicalText}`;
      }
      if (displayLabel.length > 20) {
        displayLabel = displayLabel.slice(0, 18) + "...";
      }

      // Size scales nicely with consensus popularity
      const nodeSize = isConsensus
        ? Math.min(8 + consensusCount * 2.2, 16)
        : 7.5;

      // Rich violet for individual claim, radiant consensus purple for merged claim
      const nodeColor = isConsensus ? "#9333ea" : "#7c3aed";

      nodesMap.set(cluster.id, {
        id: cluster.id,
        type: "CLAIM",
        label: displayLabel,
        full_text: cluster.canonicalText,
        size: nodeSize,
        color: nodeColor,
        confidence: cluster.confidence,
        is_consensus: isConsensus,
        consensus_count: consensusCount,
        supporters: cluster.supporters,
      });

      // Connect EACH supporting answer to this unified Claim node!
      cluster.supporters.forEach((supporter) => {
        const edgeId = `e_${supporter.answerId}_${cluster.id}`;
        const edgeLabel = isConsensus ? "共识观点" : "观点";

        edgesList.push({
          id: edgeId,
          source: supporter.answerId,
          target: cluster.id,
          relation_type: "MAKES_CLAIM",
          label: edgeLabel,
        });

        db.saveEdge({
          id: edgeId,
          source_type: "ANSWER",
          source_id: supporter.answerId,
          target_type: "CLAIM",
          target_id: cluster.id,
          relation_type: "MAKES_CLAIM",
          weight: isConsensus ? 1.4 : 1.0,
          confidence: supporter.confidence,
        });
      });

      // Also link merged claim to top 2 relevant concepts
      const topConcepts = Array.from(cluster.relatedConcepts).slice(0, 2);
      topConcepts.forEach((conceptName) => {
        const conceptId = `concept_${crypto
          .createHash("md5")
          .update(conceptName)
          .digest("hex")
          .slice(0, 8)}`;

        if (nodesMap.has(conceptId)) {
          const claimToConceptEdgeId = `e_${cluster.id}_${conceptId}`;
          edgesList.push({
            id: claimToConceptEdgeId,
            source: cluster.id,
            target: conceptId,
            relation_type: "REFERS_TO",
            label: "涉及",
          });
        }
      });
    });

    // 4. Adjust concept size based on co-occurrence frequency
    conceptFrequency.forEach((freq, name) => {
      const conceptId = `concept_${crypto
        .createHash("md5")
        .update(name)
        .digest("hex")
        .slice(0, 8)}`;
      const node = nodesMap.get(conceptId);
      if (node) {
        node.size = Math.min(6.5 + freq * 0.8, 9.5);
      }
    });

    return {
      nodes: Array.from(nodesMap.values()),
      edges: edgesList,
    };
  }
}

