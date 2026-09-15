import { create } from "zustand";
import { DBAnswer, DBQuery } from "../../shared/models";

export interface GraphNodeData {
  id: string;
  type: "QUERY" | "ANSWER" | "CLAIM" | "CONCEPT";
  label: string;
  size?: number;
  color?: string;
  stance?: string;
  voteup_count?: number;
  url?: string;
  full_text?: string;
  summary?: string;
  [key: string]: any;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  relation_type: string;
  label?: string;
  [key: string]: any;
}

interface AppState {
  currentQuery: DBQuery | null;
  answers: DBAnswer[];
  graphNodes: GraphNodeData[];
  graphEdges: GraphEdgeData[];
  selectedAnswerId: string | null;
  selectedNodeId: string | null;
  articleModalAnswerId: string | null;
  activeConcept: string | null;
  activeFilter: "ALL" | "ANSWER" | "CLAIM" | "CONCEPT";
  isLoading: boolean;
  pendingChatPrompt: string | null;

  setCurrentData: (data: { query: DBQuery; answers: DBAnswer[] }) => void;
  setGraphData: (data: { nodes: GraphNodeData[]; edges: GraphEdgeData[] }) => void;
  setLoading: (loading: boolean) => void;
  selectAnswer: (answerId: string | null) => void;
  openArticleModal: (answerId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setActiveConcept: (concept: string | null) => void;
  setActiveFilter: (filter: "ALL" | "ANSWER" | "CLAIM" | "CONCEPT") => void;
  setPendingChatPrompt: (prompt: string | null) => void;
  fetchGraph: (queryId: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentQuery: null,
  answers: [],
  graphNodes: [],
  graphEdges: [],
  selectedAnswerId: null,
  selectedNodeId: null,
  articleModalAnswerId: null,
  activeConcept: null,
  activeFilter: "ALL",
  isLoading: false,
  pendingChatPrompt: null,

  setPendingChatPrompt: (pendingChatPrompt) => set({ pendingChatPrompt }),

  setCurrentData: ({ query, answers }) => {
    set({
      currentQuery: query,
      answers,
      selectedAnswerId: null,
      selectedNodeId: null,
      articleModalAnswerId: null,
      activeConcept: null,
    });
    // Immediately fetch full Stage 5 graph
    get().fetchGraph(query.id);
  },

  setGraphData: ({ nodes, edges }) => set({ graphNodes: nodes, graphEdges: edges }),

  setLoading: (isLoading) => set({ isLoading }),

  selectAnswer: (answerId) =>
    set({
      selectedAnswerId: answerId,
      selectedNodeId: answerId ? answerId : null,
    }),

  openArticleModal: (answerId) => set({ articleModalAnswerId: answerId }),

  selectNode: (nodeId) => {
    if (!nodeId) {
      set({ selectedNodeId: null });
      return;
    }
    const isAnswer = get().answers.some((a) => a.id === nodeId);
    set({
      selectedNodeId: nodeId,
      selectedAnswerId: isAnswer ? nodeId : get().selectedAnswerId,
    });
  },

  setActiveConcept: (concept) => set({ activeConcept: concept }),

  setActiveFilter: (activeFilter) => set({ activeFilter }),

  fetchGraph: async (queryId: string) => {
    try {
      const res = await fetch(`/api/queries/${queryId}/graph`);
      if (res.ok) {
        const data = await res.json();
        set({ graphNodes: data.nodes || [], graphEdges: data.edges || [] });
      }
    } catch (err) {
      console.error("Failed to fetch graph:", err);
    }
  },
}));
