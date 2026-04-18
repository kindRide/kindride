"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type Node = {
  id: string;
  label: string;
  type: "university" | "church" | "nonprofit" | "hub";
  x: number;
  y: number;
};

type Pulse = {
  id: string;
  fromIndex: number;
  toIndex: number;
  progress: number;
};

const NODES: Node[] = [
  { id: "n1", label: "State U", type: "university", x: 18, y: 20 },
  { id: "n2", label: "Grace Church", type: "church", x: 52, y: 12 },
  { id: "n3", label: "Tech Corp", type: "hub", x: 82, y: 22 },
  { id: "n4", label: "Elm Nonprofit", type: "nonprofit", x: 12, y: 58 },
  { id: "n5", label: "Riverside Hub", type: "hub", x: 45, y: 48 },
  { id: "n6", label: "City Church", type: "church", x: 78, y: 56 },
  { id: "n7", label: "Community Coll.", type: "university", x: 30, y: 80 },
  { id: "n8", label: "Harbor Hub", type: "hub", x: 65, y: 82 },
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [0, 4], [1, 4],
  [2, 5], [3, 4], [4, 5], [4, 6], [5, 7],
  [6, 7], [3, 6],
];

const NODE_COLORS: Record<Node["type"], string> = {
  university: "#0d9488",
  church: "#7c3aed",
  nonprofit: "#ea580c",
  hub: "#1d4ed8",
};

function usePulses() {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const spawnInterval = setInterval(() => {
      const edgeIndex = Math.floor(Math.random() * EDGES.length);
      const [from, to] = EDGES[edgeIndex];
      const id = String(nextId.current++);
      setPulses((prev) => [...prev, { id, fromIndex: from, toIndex: to, progress: 0 }]);
    }, 1200);

    return () => clearInterval(spawnInterval);
  }, []);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      setPulses((prev) =>
        prev
          .map((p) => ({ ...p, progress: p.progress + 0.008 }))
          .filter((p) => p.progress < 1.05)
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return pulses;
}

export default function CommunityNetworkSection() {
  const pulses = usePulses();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-10 max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-teal-400">How it works</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
          A living network of neighbors.
        </h2>
        <p className="mt-4 text-lg leading-8 text-white/60">
          Every hub is a trust anchor. Every ride is a connection. The network grows as your community grows.
        </p>
      </div>

      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#060f1e]" style={{ paddingBottom: "52%" }}>
        <svg
          viewBox="0 0 100 55"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
        >
          {/* Edges */}
          {EDGES.map(([fromIdx, toIdx], i) => {
            const from = NODES[fromIdx];
            const to = NODES[toIdx];
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.3"
              />
            );
          })}

          {/* Pulses */}
          {pulses.map((pulse) => {
            const from = NODES[pulse.fromIndex];
            const to = NODES[pulse.toIndex];
            const t = Math.min(pulse.progress, 1);
            const cx = from.x + (to.x - from.x) * t;
            const cy = from.y + (to.y - from.y) * t;
            const opacity = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
            return (
              <circle
                key={pulse.id}
                cx={cx}
                cy={cy}
                r="0.6"
                fill="#5eead4"
                opacity={opacity}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map((node) => (
            <g key={node.id}>
              {/* Glow ring */}
              <circle
                cx={node.x}
                cy={node.y}
                r="2.2"
                fill={NODE_COLORS[node.type]}
                opacity="0.15"
              />
              {/* Main dot */}
              <circle
                cx={node.x}
                cy={node.y}
                r="1.4"
                fill={NODE_COLORS[node.type]}
              />
              {/* Label */}
              <text
                x={node.x}
                y={node.y + 3.5}
                textAnchor="middle"
                fontSize="2.2"
                fill="rgba(255,255,255,0.55)"
                fontFamily="system-ui, sans-serif"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex flex-wrap gap-3">
          {(
            [
              { type: "university", label: "University" },
              { type: "church", label: "Church" },
              { type: "nonprofit", label: "Nonprofit" },
              { type: "hub", label: "Corp Hub" },
            ] as { type: Node["type"]; label: string }[]
          ).map(({ type, label }) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: NODE_COLORS[type] }}
              />
              <span className="text-xs font-semibold text-white/50">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Below-graph value props */}
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[
          {
            icon: "🏫",
            title: "Hub-verified trust",
            body: "Your hub verifies drivers in the community, so passengers know who they're riding with.",
          },
          {
            icon: "🔄",
            title: "Rides chain forward",
            body: "Multi-leg matching means a single trip can hand off seamlessly between drivers already heading your way.",
          },
          {
            icon: "🌿",
            title: "Fewer cars, less CO₂",
            body: "Every shared ride removes a solo car from the road. The more neighbors join, the bigger the impact.",
          },
        ].map((item) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45 }}
            className="rounded-2xl border border-white/10 bg-white/5 p-6"
          >
            <span className="text-3xl">{item.icon}</span>
            <h3 className="mt-3 text-lg font-black text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">{item.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
