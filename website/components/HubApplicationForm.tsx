"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import { supabase } from "@/lib/supabase";

type HubType = "university" | "church" | "nonprofit" | "corporate";

type FormData = {
  hubName: string;
  hubType: HubType;
  city: string;
  contactName: string;
  contactEmail: string;
  phoneNumber: string;
};

const initialForm: FormData = {
  hubName: "",
  hubType: "university",
  city: "",
  contactName: "",
  contactEmail: "",
  phoneNumber: "",
};

export default function HubApplicationForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const progressWidth = useMemo(() => {
    if (step === 1) return "w-1/3";
    if (step === 2) return "w-2/3";
    return "w-full";
  }, [step]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const nextStep = () => {
    if (step === 1) {
      if (!formData.hubName.trim() || !formData.city.trim()) {
        setSubmitState("error");
        setMessage("Please fill out your organization name and city first.");
        return;
      }
    }

    if (step === 2) {
      if (!formData.contactName.trim() || !formData.contactEmail.trim()) {
        setSubmitState("error");
        setMessage("Please add a contact name and email before continuing.");
        return;
      }
    }

    setSubmitState("idle");
    setMessage(null);
    setStep((current) => Math.min(current + 1, 3));
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitState("idle");
    setMessage(null);

    try {
      const slug = formData.hubName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const { error } = await supabase.from("hubs").insert({
        name: formData.hubName,
        type: formData.hubType,
        slug,
        verified: false,
        approved_by: null,
      });

      if (error) {
        throw error;
      }

      setSubmitState("success");
      setMessage("Application received. The KindRide team will review and reach out within 48 hours.");
      setFormData(initialForm);
      setStep(1);
    } catch {
      setSubmitState("error");
      setMessage("Something went wrong while sending your application. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="mb-8 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#5eead4]">Start a Hub</p>
        <h2 className="mt-4 text-4xl font-black tracking-tight text-white">Bring KindRide to your people.</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.45 }}
        className="rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-[0_20px_45px_rgba(15,23,42,0.12)]"
      >
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between text-sm font-bold text-slate-500">
            <span className={step >= 1 ? "text-[#0d9488]" : ""}>1</span>
            <span className={step >= 2 ? "text-[#0d9488]" : ""}>2</span>
            <span className={step >= 3 ? "text-[#0d9488]" : ""}>3</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div className={`h-2 rounded-full bg-[#0d9488] transition-all duration-300 ${progressWidth}`} />
          </div>
        </div>

        {step === 1 ? (
          <div className="space-y-5">
            <Field
              label="Hub Name"
              value={formData.hubName}
              onChange={(value) => updateField("hubName", value)}
              placeholder="Neighborhood Cooperative"
            />
            <SelectField
              label="Hub Type"
              value={formData.hubType}
              onChange={(value) => updateField("hubType", value)}
            />
            <Field
              label="City"
              value={formData.city}
              onChange={(value) => updateField("city", value)}
              placeholder="College Park"
            />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <Field
              label="Contact Name"
              value={formData.contactName}
              onChange={(value) => updateField("contactName", value)}
              placeholder="Alex Johnson"
            />
            <Field
              label="Contact Email"
              value={formData.contactEmail}
              onChange={(value) => updateField("contactEmail", value)}
              placeholder="alex@example.org"
              type="email"
            />
            <Field
              label="Phone Number"
              value={formData.phoneNumber}
              onChange={(value) => updateField("phoneNumber", value)}
              placeholder="Optional"
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
            <SummaryRow label="Hub Name" value={formData.hubName} />
            <SummaryRow label="Hub Type" value={formData.hubType} />
            <SummaryRow label="City" value={formData.city} />
            <SummaryRow label="Contact Name" value={formData.contactName} />
            <SummaryRow label="Contact Email" value={formData.contactEmail} />
            <SummaryRow label="Phone Number" value={formData.phoneNumber || "Not provided"} />
          </div>
        ) : null}

        {message ? (
          <p
            className={`mt-6 text-sm font-medium ${
              submitState === "success" ? "text-[#0f766e]" : "text-rose-600"
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              setStep((current) => Math.max(current - 1, 1));
              setSubmitState("idle");
              setMessage(null);
            }}
            disabled={step === 1 || submitting}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={nextStep}
              className="rounded-xl bg-[#0d9488] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0f766e]"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-xl bg-[#0d9488] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "email";
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-[#0d9488] focus:ring-4 focus:ring-[#99f6e4]"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HubType;
  onChange: (value: HubType) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as HubType)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base capitalize text-slate-900 outline-none transition focus:border-[#0d9488] focus:ring-4 focus:ring-[#99f6e4]"
      >
        <option value="university">university</option>
        <option value="church">church</option>
        <option value="nonprofit">nonprofit</option>
        <option value="corporate">corporate</option>
      </select>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <span className="text-right text-base font-semibold capitalize text-slate-900">{value}</span>
    </div>
  );
}
