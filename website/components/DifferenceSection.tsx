"use client";

import { motion } from "framer-motion";

type ComparisonRow = {
  left: string;
  right: string;
  emphasis: string;
};

const rows: ComparisonRow[] = [
  { left: "Stranger drives you", right: "Your neighbor drives you", emphasis: "neighbor" },
  {
    left: "Profit extracted from community",
    right: "Points stay in your community",
    emphasis: "stay in your community",
  },
  {
    left: "Algorithm decides who you trust",
    right: "Community builds the trust",
    emphasis: "Community",
  },
  {
    left: "VC money leaves your city",
    right: "Value circulates locally",
    emphasis: "circulates locally",
  },
  { left: "You're a customer", right: "You're a member", emphasis: "member" },
];

function highlightText(text: string, emphasis: string) {
  const parts = text.split(emphasis);
  if (parts.length === 1) {
    return text;
  }

  return (
    <>
      {parts[0]}
      <span className="text-[#0d9488]">{emphasis}</span>
      {parts[1]}
    </>
  );
}

export default function DifferenceSection() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-12 max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-[#5eead4]">The Difference</p>
        <h2 className="mt-4 text-4xl font-black tracking-tight text-white md:text-6xl">
          This is not a taxi app.
        </h2>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#08182f]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr]">
          <div className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r lg:border-r-white/10 lg:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-white/35">Uber / Lyft</p>
          </div>
          <div className="hidden items-center justify-center bg-white/5 px-4 lg:flex">
            <div className="flex h-full flex-col items-center justify-center">
              <div className="h-16 w-px bg-white/15" />
              <span className="my-4 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.3em] text-white/50">
                vs
              </span>
              <div className="h-16 w-px bg-white/15" />
            </div>
          </div>
          <div className="p-6 lg:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#5eead4]">KindRide</p>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {rows.map((row, index) => (
            <motion.div
              key={row.left}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr]"
            >
              <div className="px-6 py-6 text-lg font-medium text-slate-400 lg:border-r lg:border-r-white/10 lg:px-10">
                {row.left}
              </div>
              <div className="hidden bg-white/5 lg:block" />
              <div className="px-6 py-6 text-lg font-semibold text-white lg:px-10">
                {highlightText(row.right, row.emphasis)}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
