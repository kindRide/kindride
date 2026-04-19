"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

type State = "idle" | "submitting" | "done" | "error";

export default function AskAQuestion() {
  const [question, setQuestion] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState(""); // spam trap
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const remaining = 600 - question.length;
  const canSubmit =
    question.trim().length >= 5 &&
    question.length <= 600 &&
    state === "idle";

  const handleSubmit = async () => {
    if (!canSubmit || honeypot) return; // honeypot filled = bot

    setState("submitting");
    setErrorMsg("");

    try {
      const { error } = await supabase.from("website_questions").insert({
        question: question.trim(),
        email: email.trim() || null,
      });

      if (error) throw error;

      setState("done");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.45 }}
        className="rounded-3xl border border-white/10 bg-[#060f1e] p-10"
      >
        {state === "done" ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="text-5xl">💙</span>
            <h3 className="text-2xl font-black text-white">Got it.</h3>
            <p className="text-base text-white/55">
              We read every question. It might show up in the FAQ — or you might
              get a direct reply if you left your email.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <p className="mb-2 text-sm font-bold uppercase tracking-[0.28em] text-teal-400">
              Still curious?
            </p>
            <h2 className="mb-2 text-3xl font-black text-white md:text-4xl">
              Ask us anything.
            </h2>
            <p className="mb-8 text-base text-white/55">
              No chatbot. Real questions get read by the founder. The best ones
              become FAQ entries.
            </p>

            {/* Honeypot — hidden from humans, filled by bots */}
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              aria-hidden="true"
              tabIndex={-1}
              className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
              autoComplete="off"
            />

            {/* Question textarea */}
            <div className="mb-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What do you want to know about KindRide?"
                maxLength={600}
                rows={4}
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none"
              />
              <p
                className={`mt-1 text-right text-xs ${
                  remaining < 50 ? "text-orange-400" : "text-white/25"
                }`}
              >
                {remaining} characters remaining
              </p>
            </div>

            {/* Optional email */}
            <div className="mb-6">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (optional — if you'd like a reply)"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* Error */}
            {state === "error" && (
              <p className="mb-4 text-center text-sm font-medium text-red-400">
                {errorMsg}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-teal-500 py-4 text-base font-bold text-white transition-colors hover:bg-teal-400 disabled:opacity-40"
            >
              {state === "submitting" ? "Sending…" : "Send my question →"}
            </button>

            <p className="mt-4 text-center text-xs text-white/25">
              Questions are private. We never publish your name or email.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
