"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LiveCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchCount = async () => {
      const { count: total } = await supabase
        .from("rides")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");
      if (total !== null) setCount(total);
    };

    void fetchCount();

    // Refresh every 30 seconds
    const interval = setInterval(() => void fetchCount(), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center">
      <span className="text-8xl md:text-9xl font-black text-white tracking-tight leading-none">
        {count === null ? (
          <span className="animate-pulse">—</span>
        ) : (
          count.toLocaleString()
        )}
      </span>
      <span className="mt-4 text-lg md:text-xl text-teal-300 font-semibold tracking-wide uppercase">
        rides given by neighbors
      </span>
    </div>
  );
}
