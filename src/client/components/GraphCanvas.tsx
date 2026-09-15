import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as d3 from "d3";
import { useAppStore, GraphNodeData, GraphEdgeData } from "../store/useAppStore";
import {
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  Sun,
  Moon,
  ChevronRight,
  Sliders,
  Filter,
  Eye,
  Activity,
  Layers,
  HelpCircle,
  X,
  Users,
} from "lucide-react";

interface GraphCanvasProps {
  onAskAI?: (prompt: string) => void;
}

// Internal simulation node and link types extending D3 simulation types
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: "QUERY" | "ANSWER" | "CLAIM" | "CONCEPT";
  stance?: "support" | "oppose" | "neutral";
  summary?: string;
  full_text?: string;
  voteup_count?: number;
  color: string;
  radius: number;
  degree: number;
  is_consensus?: boolean;
  consensus_count?: number;
  supporters?: Array<{
    answerId: string;
    authorName: string;
    voteupCount: number;
    originalText: string;
  }>;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
  relation_type?: string;
  label?: string;
  weight?: number;
}

export default function GraphCanvas({ onAskAI }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    currentQuery,
    answers,
    graphNodes,
    graphEdges,
    activeFilter,
    setActiveFilter,
    selectedNodeId,
    selectNode,
    selectedAnswerId,
    selectAnswer,
    openArticleModal,
  } = useAppStore();

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showControlPanel, setShowControlPanel] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"filter" | "force" | "appearance">("force");

  // Physics parameter states (customizable via panel like user's screenshot)
  const [repulsionStrength, setRepulsionStrength] = useState<number>(-280);
  const [linkDistance, setLinkDistance] = useState<number>(100);
  const [linkStrength, setLinkStrength] = useState<number>(0.7);
  const [collisionRadius, setCollisionRadius] = useState<number>(24);
  const [isElasticRelease, setIsElasticRelease] = useState<boolean>(true); // Release after drag or fix
  const [labelSize, setLabelSize] = useState<number>(11);

  // References to keep simulation and zoom instances accessible
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);

  // Filter visible nodes based on activeFilter
  const visibleNodes = useMemo(() => {
    if (!currentQuery || graphNodes.length === 0) return [];
    return graphNodes.filter((node) => {
      if (node.type === "QUERY") return true;
      if (activeFilter === "ALL") return true;
      return node.type === activeFilter;
    });
  }, [graphNodes, currentQuery, activeFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return graphEdges.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );
  }, [graphEdges, visibleNodeIds]);

  // Node counts for filter toolbar
  const counts = useMemo(() => {
    let answers = 0;
    let claims = 0;
    let concepts = 0;
    graphNodes.forEach((n) => {
      if (n.type === "ANSWER") answers++;
      else if (n.type === "CLAIM") claims++;
      else if (n.type === "CONCEPT") concepts++;
    });
    return { answers, claims, concepts, total: graphNodes.length };
  }, [graphNodes]);

  // Active inspected node
  const activeFocusId = hoveredNodeId || selectedNodeId || selectedAnswerId;
  const inspectedNode = useMemo(() => {
    if (!activeFocusId) return null;
    return graphNodes.find((n) => n.id === activeFocusId) || null;
  }, [activeFocusId, graphNodes]);

  // Prepare D3 simulation data
  const simulationData = useMemo(() => {
    // Calculate degree (connectivity count) for node sizing
    const degreeMap = new Map<string, number>();
    visibleEdges.forEach((e) => {
      degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
      degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
    });

    const nodes: SimNode[] = visibleNodes.map((n) => {
      let radius = 10;
      let color = n.color;

      if (n.type === "QUERY") {
        radius = 24;
        color = theme === "dark" ? "#818cf8" : "#4f46e5";
      } else if (n.type === "ANSWER") {
        radius = 16;
        if (!color) {
          if (n.stance === "support") color = theme === "dark" ? "#34d399" : "#059669";
          else if (n.stance === "oppose") color = theme === "dark" ? "#f87171" : "#e11d48";
          else color = theme === "dark" ? "#fbbf24" : "#d97706";
        }
      } else if (n.type === "CLAIM") {
        const isConsensus = Boolean((n as any).is_consensus);
        const consensusCount = Number((n as any).consensus_count || 1);
        radius = isConsensus ? Math.min(11 + consensusCount * 2, 17) : 10;
        color = isConsensus
          ? theme === "dark" ? "#c084fc" : "#9333ea"
          : theme === "dark" ? "#a855f7" : "#7c3aed";
      } else if (n.type === "CONCEPT") {
        radius = 9;
        color = theme === "dark" ? "#38bdf8" : "#0284c7";
      }

      return {
        id: n.id,
        label: n.label,
        type: n.type,
        stance: n.stance,
        summary: n.summary,
        full_text: n.full_text,
        voteup_count: n.voteup_count,
        color: color || "#64748b",
        radius,
        degree: degreeMap.get(n.id) || 1,
        is_consensus: (n as any).is_consensus,
        consensus_count: (n as any).consensus_count,
        supporters: (n as any).supporters,
      };
    });

    const links: SimLink[] = visibleEdges.map((e) => ({
      id: e.id || `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      relation_type: e.relation_type,
      label: e.label,
    }));

    return { nodes, links };
  }, [visibleNodes, visibleEdges, theme]);

  // Keep track of connected nodes for highlighting
  const connectedNodeIds = useMemo(() => {
    if (!activeFocusId) return new Set<string>();
    const set = new Set<string>([activeFocusId]);
    visibleEdges.forEach((e) => {
      if (e.source === activeFocusId) set.add(e.target);
      if (e.target === activeFocusId) set.add(e.source);
    });
    return set;
  }, [activeFocusId, visibleEdges]);

  // Render loop on HTML5 Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    const transform = transformRef.current;
    ctx.scale(dpr, dpr);
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    const nodes = simulationData.nodes;
    const links = simulationData.links;
    const isDark = theme === "dark";

    // 1. Draw Links (spring lines)
    links.forEach((link) => {
      const source = link.source as SimNode;
      const target = link.target as SimNode;
      if (!source.x || !source.y || !target.x || !target.y) return;

      const isConnectedToFocus =
        activeFocusId && (source.id === activeFocusId || target.id === activeFocusId);

      const isQueryLink =
        source.type === "QUERY" ||
        target.type === "QUERY" ||
        link.relation_type === "RETURNS_ANSWER";

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (activeFocusId) {
        if (isConnectedToFocus) {
          ctx.strokeStyle = isDark ? "#a5b4fc" : "#4338ca";
          ctx.lineWidth = 3.2;
          ctx.globalAlpha = 1.0;
        } else {
          ctx.strokeStyle = isDark ? "#1e293b" : "#e2e8f0";
          ctx.lineWidth = 1.0;
          ctx.globalAlpha = 0.25;
        }
      } else {
        if (isQueryLink) {
          ctx.strokeStyle = isDark ? "#6366f1" : "#818cf8";
          ctx.lineWidth = 2.4;
          ctx.globalAlpha = 0.75;
        } else if (source.type === "CLAIM" || target.type === "CLAIM") {
          ctx.strokeStyle = isDark ? "#a855f7" : "#c084fc";
          ctx.lineWidth = 1.8;
          ctx.globalAlpha = 0.65;
        } else {
          ctx.strokeStyle = isDark ? "#38bdf8" : "#93c5fd";
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 0.6;
        }
      }

      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });

    // 2. Draw Nodes (spheres with glow and distinct levels)
    nodes.forEach((node) => {
      if (node.x === undefined || node.y === undefined) return;

      const isFocused = node.id === activeFocusId;
      const isNeighbor = activeFocusId ? connectedNodeIds.has(node.id) : true;

      const baseRadius = node.radius;
      const radius = isFocused ? baseRadius * 1.3 : baseRadius;

      // Glow effect for Query, focused nodes, or consensus claim nodes
      if (node.type === "QUERY" || isFocused || (node.type === "CLAIM" && node.is_consensus)) {
        const isConsensus = node.type === "CLAIM" && Boolean(node.is_consensus);
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + (isConsensus ? 5 : 7), 0, 2 * Math.PI);
        ctx.fillStyle = isConsensus
          ? isDark
            ? "rgba(192, 132, 252, 0.35)"
            : "rgba(147, 51, 234, 0.28)"
          : isDark
          ? isFocused
            ? "rgba(165, 180, 252, 0.35)"
            : "rgba(99, 102, 241, 0.25)"
          : isFocused
          ? "rgba(79, 70, 229, 0.25)"
          : "rgba(99, 102, 241, 0.2)";
        ctx.fill();
      }

      // Main Node Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);

      if (activeFocusId && !isNeighbor) {
        ctx.fillStyle = isDark ? "#1e293b" : "#cbd5e1";
        ctx.globalAlpha = 0.4;
      } else {
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 1.0;
      }

      ctx.fill();

      // Border ring
      ctx.strokeStyle = isDark ? "#090d16" : "#ffffff";
      ctx.lineWidth = isFocused ? 3 : 2;
      ctx.stroke();

      // If consensus claim node: draw outer golden/purple decorative ring
      if (node.type === "CLAIM" && node.is_consensus) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = isDark ? "#d8b4fe" : "#9333ea";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.globalAlpha = 1.0;

      // Inner highlight for 3D sphere feel
      ctx.beginPath();
      ctx.arc(node.x - radius * 0.3, node.y - radius * 0.3, radius * 0.35, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fill();
    });

    // 3. Draw Crisp Text Labels (every ball has clear, high-contrast text label)
    ctx.textBaseline = "middle";
    const fontSize = labelSize;

    nodes.forEach((node) => {
      if (node.x === undefined || node.y === undefined) return;

      const isFocused = node.id === activeFocusId;
      const isNeighbor = activeFocusId ? connectedNodeIds.has(node.id) : true;

      // Text styling setup
      const isQuery = node.type === "QUERY";
      const isAnswer = node.type === "ANSWER";

      ctx.font = isQuery
        ? `bold ${fontSize + 3}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif`
        : isAnswer
        ? `600 ${fontSize + 1}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif`
        : `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif`;

      let textX = node.x + node.radius + 6;
      let textY = node.y;
      ctx.textAlign = "left";

      // If Query node: position label centered below node for majesty
      if (isQuery) {
        textX = node.x;
        textY = node.y + node.radius + 16;
        ctx.textAlign = "center";
      }

      // Label text truncate or full
      let text = node.label || "";
      if (text.length > 20 && !isQuery && !isFocused) {
        text = text.slice(0, 18) + "...";
      }

      // Contrast outline halo so text is 100% visible against any background / intersecting line
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = isDark ? "#090d16" : "#ffffff";

      if (activeFocusId && !isNeighbor) {
        ctx.globalAlpha = 0.3;
      } else {
        ctx.globalAlpha = 1.0;
      }

      ctx.strokeText(text, textX, textY);

      // Text Fill
      if (activeFocusId) {
        if (isFocused) {
          ctx.fillStyle = isDark ? "#ffffff" : "#0f172a";
        } else if (isNeighbor) {
          ctx.fillStyle = isDark ? "#e2e8f0" : "#1e293b";
        } else {
          ctx.fillStyle = isDark ? "#64748b" : "#94a3b8";
        }
      } else {
        if (isQuery) {
          ctx.fillStyle = isDark ? "#ffffff" : "#1e1b4b";
        } else if (isAnswer) {
          ctx.fillStyle = isDark ? "#f1f5f9" : "#1e293b";
        } else {
          ctx.fillStyle = isDark ? "#cbd5e1" : "#334155";
        }
      }

      ctx.fillText(text, textX, textY);
      ctx.globalAlpha = 1.0;
    });

    ctx.restore();
  }, [
    simulationData,
    theme,
    activeFocusId,
    connectedNodeIds,
    labelSize,
  ]);

  // Setup D3 Simulation with interactive spring drag
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;

    // Destroy existing simulation if any
    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const { nodes, links } = simulationData;
    if (nodes.length === 0) return;

    // Initialize simulation with full spring dynamics
    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((link) => {
            const s = link.source as SimNode;
            const t = link.target as SimNode;
            if (s.type === "QUERY" || t.type === "QUERY") {
              return linkDistance * 1.35;
            }
            if (s.type === "ANSWER" || t.type === "ANSWER") {
              return linkDistance;
            }
            return linkDistance * 0.8;
          })
          .strength(linkStrength)
      )
      .force("charge", d3.forceManyBody().strength(repulsionStrength))
      .force(
        "collide",
        d3.forceCollide<SimNode>().radius((d) => d.radius + collisionRadius).iterations(3)
      )
      .force("x", d3.forceX(width / 2).strength(0.015))
      .force("y", d3.forceY(height / 2).strength(0.015))
      .velocityDecay(0.38)
      .alphaDecay(0.025);

    simulation.on("tick", () => {
      renderCanvas();
    });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [
    simulationData,
    repulsionStrength,
    linkDistance,
    linkStrength,
    collisionRadius,
    renderCanvas,
  ]);

  // Canvas Resize and Retina DPR handler
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateDimensions = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      renderCanvas();
    };

    updateDimensions();
    const observer = new ResizeObserver(() => {
      updateDimensions();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [renderCanvas]);

  // Setup D3 Zoom and Drag Interactivity
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const d3Canvas = d3.select(canvas);

    // Find node under mouse/touch event taking current transform into account
    function getNodeAt(event: MouseEvent | TouchEvent): SimNode | null {
      const transform = transformRef.current;
      const rect = canvas!.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;
      if ("touches" in event && event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else if ("clientX" in event) {
        clientX = (event as MouseEvent).clientX;
        clientY = (event as MouseEvent).clientY;
      } else {
        return null;
      }

      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      // Invert transform to graph coordinate space
      const [gx, gy] = transform.invert([mouseX, mouseY]);

      const nodes = simulationData.nodes;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.x === undefined || node.y === undefined) continue;
        const dx = gx - node.x;
        const dy = gy - node.y;
        // Hit-test with generous tolerance for easy clicking & dragging
        const hitRadius = Math.max(node.radius + 6, 16);
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return node;
        }
      }
      return null;
    }

    // Zoom behavior: ONLY pan when clicking empty canvas space, NEVER when dragging a ball!
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.2, 4.5])
      .filter((event: any) => {
        // Wheel zoom is always permitted
        if (event.type === "wheel") return true;
        // If clicking/touching a ball, prevent canvas zoom/pan so only the ball moves!
        if (event.type === "mousedown" || event.type === "touchstart") {
          const hitNode = getNodeAt(event);
          if (hitNode) {
            return false;
          }
        }
        return !event.ctrlKey && !event.button;
      })
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        renderCanvas();
      });

    zoomBehaviorRef.current = zoom;
    d3Canvas.call(zoom);

    // Interactive Drag Behavior: When dragging any ball, the connected links
    // pull all surrounding balls elastically!
    let draggedNode: SimNode | null = null;
    let isDragging = false;
    let dragMoved = false;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // only left click
      const node = getNodeAt(e);

      if (node) {
        draggedNode = node;
        isDragging = true;
        dragMoved = false;

        // Awaken simulation with alpha so other balls move along elastically!
        if (simulationRef.current) {
          simulationRef.current.alphaTarget(0.25).restart();
        }

        const transform = transformRef.current;
        const rect = canvas!.getBoundingClientRect();
        const [gx, gy] = transform.invert([e.clientX - rect.left, e.clientY - rect.top]);
        draggedNode.fx = gx;
        draggedNode.fy = gy;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      const transform = transformRef.current;

      if (isDragging && draggedNode) {
        dragMoved = true;
        const [gx, gy] = transform.invert([e.clientX - rect.left, e.clientY - rect.top]);
        draggedNode.fx = gx;
        draggedNode.fy = gy;
        renderCanvas();
      } else {
        // Hover inspection
        const hovered = getNodeAt(e);
        if (hovered) {
          canvas!.style.cursor = "grab";
          if (hovered.id !== hoveredNodeId) {
            setHoveredNodeId(hovered.id);
          }
        } else {
          canvas!.style.cursor = "default";
          if (hoveredNodeId !== null) {
            setHoveredNodeId(null);
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging && draggedNode) {
        if (simulationRef.current) {
          simulationRef.current.alphaTarget(0);
        }

        // If elastic release is enabled, release fixed position so it settles naturally
        if (isElasticRelease) {
          draggedNode.fx = null;
          draggedNode.fy = null;
        }

        // If not dragged significantly, treat as Click selection
        if (!dragMoved) {
          selectNode(draggedNode.id);

          if (draggedNode.type === "ANSWER") {
            // Clicked an ANSWER node: jump directly to and open this answer's article
            selectAnswer(draggedNode.id);
            openArticleModal(draggedNode.id);
          } else if (draggedNode.type === "CLAIM") {
            // Clicked a CLAIM node: find the supporting answer with the most upvotes
            const supporters = draggedNode.supporters || [];
            let bestAnswerId: string | null = null;
            let highestVotes = -1;

            // 1. First check supporters in the cluster
            if (supporters.length > 0) {
              supporters.forEach((s: any) => {
                const ansId = s.answerId || s.id;
                const matchingAns = answers.find((a) => a.id === ansId);
                const votes = matchingAns ? matchingAns.voteup_count : s.voteupCount || 0;
                if (votes > highestVotes) {
                  highestVotes = votes;
                  bestAnswerId = ansId;
                }
              });
            }

            // 2. Fallback to graph edges if supporters array wasn't populated
            if (!bestAnswerId) {
              const incomingEdges = visibleEdges.filter(
                (e) => (typeof e.target === "string" ? e.target : e.target.id) === draggedNode?.id
              );
              incomingEdges.forEach((e) => {
                const sourceId = typeof e.source === "string" ? e.source : e.source.id;
                const matchingAns = answers.find((a) => a.id === sourceId);
                if (matchingAns && matchingAns.voteup_count > highestVotes) {
                  highestVotes = matchingAns.voteup_count;
                  bestAnswerId = matchingAns.id;
                }
              });
            }

            // If still not found, fallback to the first answer
            if (!bestAnswerId && answers.length > 0) {
              bestAnswerId = answers[0].id;
            }

            if (bestAnswerId) {
              selectAnswer(bestAnswerId);
              openArticleModal(bestAnswerId);
            }
          } else if (draggedNode.type === "CONCEPT") {
            // Clicked a CONCEPT node: find the most popular answer mentioning this concept
            const conceptClean = draggedNode.label.replace(/^#/, "");
            const relatedAnswers = answers.filter((a) =>
              a.concepts?.some((c) => c.toLowerCase().includes(conceptClean.toLowerCase()))
            );
            if (relatedAnswers.length > 0) {
              const best = [...relatedAnswers].sort((a, b) => b.voteup_count - a.voteup_count)[0];
              selectAnswer(best.id);
              openArticleModal(best.id);
            }
          }
        }

        draggedNode = null;
        isDragging = false;
        renderCanvas();
      } else if (!dragMoved) {
        // Click on empty stage clears selection
        const clicked = getNodeAt(e);
        if (!clicked) {
          selectNode(null);
          setHoveredNodeId(null);
        }
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    simulationData,
    hoveredNodeId,
    selectNode,
    selectAnswer,
    openArticleModal,
    answers,
    visibleEdges,
    isElasticRelease,
    renderCanvas,
  ]);

  // Zoom control handlers
  const handleZoomIn = () => {
    if (!canvasRef.current || !zoomBehaviorRef.current) return;
    d3.select(canvasRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!canvasRef.current || !zoomBehaviorRef.current) return;
    d3.select(canvasRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.77);
  };

  const handleResetZoom = () => {
    if (!canvasRef.current || !zoomBehaviorRef.current) return;
    d3.select(canvasRef.current)
      .transition()
      .duration(400)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const handleRestartPhysics = () => {
    if (simulationRef.current) {
      simulationRef.current.alpha(1).restart();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative flex flex-col transition-colors duration-300 select-none overflow-hidden ${
        theme === "dark" ? "bg-[#090d16]" : "bg-[#f8fafc]"
      }`}
      style={{
        backgroundImage:
          theme === "dark"
            ? "radial-gradient(#1e293b 1.2px, transparent 1.2px)"
            : "radial-gradient(#cbd5e1 1.2px, transparent 1.2px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Top Floating Filter and Action Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Filter Pills */}
        <div className="pointer-events-auto flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-xl p-1 shadow-sm shadow-black/5">
          <button
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeFilter === "ALL"
                ? "bg-slate-900 text-white dark:bg-indigo-600 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <span>全部</span>
            <span className="text-[10px] opacity-75 font-mono px-1 rounded bg-black/10 dark:bg-white/20">
              {counts.total}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter("ANSWER")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeFilter === "ANSWER"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>回答</span>
            <span className="text-[10px] opacity-75 font-mono">{counts.answers}</span>
          </button>
          <button
            onClick={() => setActiveFilter("CLAIM")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeFilter === "CLAIM"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>论点</span>
            <span className="text-[10px] opacity-75 font-mono">{counts.claims}</span>
          </button>
          <button
            onClick={() => setActiveFilter("CONCEPT")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeFilter === "CONCEPT"
                ? "bg-sky-600 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>概念</span>
            <span className="text-[10px] opacity-75 font-mono">{counts.concepts}</span>
          </button>
        </div>

        {/* Right Tools: Theme & Graph Control Panel Toggle (matching user's screenshot) */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === "light" ? (
              <>
                <Moon size={13} className="text-indigo-600" />
                <span>曜黑星系</span>
              </>
            ) : (
              <>
                <Sun size={13} className="text-amber-400" />
                <span>极简明亮</span>
              </>
            )}
          </button>

          {/* Graph Control Panel Toggle Button (like the panel in user's image) */}
          <button
            onClick={() => setShowControlPanel(!showControlPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-md border text-xs font-medium transition-all cursor-pointer shadow-sm ${
              showControlPanel
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white/90 dark:bg-slate-900/90 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Sliders size={13} />
            <span>图谱控制</span>
          </button>
        </div>
      </div>

      {/* Interactive Physics & Appearance Control Panel (matching user's screenshot) */}
      {showControlPanel && (
        <div className="absolute top-16 right-4 z-30 w-72 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl shadow-black/10 text-xs transition-all overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800">
            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Activity size={14} className="text-indigo-600 dark:text-indigo-400" />
              <span>关系图谱动力学与外观</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRestartPhysics}
                title="重新物理排版"
                className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={() => setShowControlPanel(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="p-3.5 space-y-3.5">
            {/* 1. Force / Elasticity */}
            <div>
              <div className="flex justify-between items-center mb-1 text-slate-600 dark:text-slate-400">
                <span className="font-medium">连线弹力 (Spring):</span>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                  {Math.round(linkStrength * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.5"
                step="0.05"
                value={linkStrength}
                onChange={(e) => setLinkStrength(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* 2. Repulsion */}
            <div>
              <div className="flex justify-between items-center mb-1 text-slate-600 dark:text-slate-400">
                <span className="font-medium">节点排斥力 (Repulsion):</span>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                  {Math.abs(repulsionStrength)}
                </span>
              </div>
              <input
                type="range"
                min="-600"
                max="-100"
                step="20"
                value={repulsionStrength}
                onChange={(e) => setRepulsionStrength(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* 3. Link Distance */}
            <div>
              <div className="flex justify-between items-center mb-1 text-slate-600 dark:text-slate-400">
                <span className="font-medium">连线间距 (Distance):</span>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                  {linkDistance}px
                </span>
              </div>
              <input
                type="range"
                min="60"
                max="200"
                step="10"
                value={linkDistance}
                onChange={(e) => setLinkDistance(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* 4. Collision Radius Buffer */}
            <div>
              <div className="flex justify-between items-center mb-1 text-slate-600 dark:text-slate-400">
                <span className="font-medium">碰撞防重叠 (Buffer):</span>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                  {collisionRadius}px
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="45"
                step="2"
                value={collisionRadius}
                onChange={(e) => setCollisionRadius(parseFloat(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* 5. Label Font Size */}
            <div>
              <div className="flex justify-between items-center mb-1 text-slate-600 dark:text-slate-400">
                <span className="font-medium">标签字号 (Label Size):</span>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
                  {labelSize}px
                </span>
              </div>
              <input
                type="range"
                min="9"
                max="16"
                step="1"
                value={labelSize}
                onChange={(e) => setLabelSize(parseInt(e.target.value))}
                className="w-full accent-indigo-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>

            {/* Elastic Release toggle */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400 font-medium">松手后弹性归位</span>
              <button
                onClick={() => setIsElasticRelease(!isElasticRelease)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  isElasticRelease ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.75 ${
                    isElasticRelease ? "translate-x-4.5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Legend Bar */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 shadow-sm shadow-black/5 pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-950" />
          <span className="text-slate-800 dark:text-slate-200 font-medium">问题</span>
        </div>
        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>支持</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span>反对</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>视情况</span>
        </div>
        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-600 ring-2 ring-purple-300 dark:ring-purple-700" />
          <span className="font-semibold text-purple-700 dark:text-purple-300">共识观点 (多方合并)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
          <span>独立观点</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 dark:bg-sky-400" />
          <span>概念</span>
        </div>
        <div className="hidden md:block w-px h-3 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        <div className="hidden md:flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px]">
          <span>💡 相同观点已智能合并为同一节点；拖拽共识球将联动拉扯所有认同它的答主</span>
        </div>
      </div>

      {/* Floating Camera Navigation Controls (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-black/5 pointer-events-auto">
        <button
          onClick={handleZoomIn}
          title="放大视角"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          title="缩小视角"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleResetZoom}
          title="居中适应屏幕"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <RotateCcw size={15} />
        </button>
        <div className="w-full h-px bg-slate-200 dark:bg-slate-800 my-0.5" />
        <button
          onClick={handleRestartPhysics}
          title="重置物理弹性排版"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Empty State Prompt */}
      {simulationData.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none z-10">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 shadow-sm">
            <Layers size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
            暂无知识图谱数据
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            请在上方输入框中搜索或选择一个知乎讨论议题，系统将实时解构各方观点并生成弹性物理关系图谱。
          </p>
        </div>
      )}

      {/* Canvas Element for 60FPS High Performance Force Graph */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none cursor-default"
      />
    </div>
  );
}
