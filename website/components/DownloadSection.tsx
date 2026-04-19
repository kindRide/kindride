"use client";

import { motion } from "framer-motion";

export default function DownloadSection() {
  return (
    <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.45 }}
      >
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.28em] text-[#0d9488]">Available Now</p>
        <h2 className="mb-6 whitespace-pre-line text-4xl font-black leading-tight text-white md:text-5xl">
          {"Move together.\nDownload KindRide."}
        </h2>
        <p className="mb-10 text-lg text-white/60">
          Free for passengers. Free for drivers. A community that moves.
        </p>
        
        <div className="flex flex-wrap gap-4">
          <a href="#" className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 transition hover:bg-white/20">
            <svg viewBox="0 0 384 512" fill="currentColor" className="h-5 w-5 text-white">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            <div className="flex flex-col">
              <span className="text-xs text-white/60">Download on the</span>
              <span className="text-sm font-bold text-white">App Store</span>
            </div>
          </a>
          
          <a href="#" className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 transition hover:bg-white/20">
            <svg viewBox="0 0 512 512" fill="currentColor" className="h-5 w-5 text-white">
              <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </svg>
            <div className="flex flex-col">
              <span className="text-xs text-white/60">Get it on</span>
              <span className="text-sm font-bold text-white">Google Play</span>
            </div>
          </a>
        </div>
        
        <p className="mt-4 text-xs text-white/30">Available on iOS and Android &middot; Free</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.45, delay: 0.15 }}
        className="hidden md:block"
      >
        <div className="mx-auto w-full max-w-sm rounded-[2.5rem] border border-white/10 bg-[#060f1e] p-6 shadow-2xl">
          {/* Row 1 */}
          <div className="flex items-center justify-between">
            <span className="text-xl font-black text-white tracking-tight">
              Kind<span className="text-[#0d9488]">Ride</span>
            </span>
            <div className="rounded-full bg-[#0d9488]/20 px-3 py-1">
              <span className="text-xs font-bold tracking-wider text-[#0d9488]">LIVE</span>
            </div>
          </div>
          
          {/* Row 2 */}
          <div className="relative my-6 h-40 w-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-[#0d9488]/20 to-blue-600/20">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSJ0cmFuc3BhcmVudCI+PC9yZWN0Pgo8cGF0aCBkPSJNMCAwTDggOFpNOCAwTDAgOFoiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIj48L3BhdGg+Cjwvc3ZnPg==')] opacity-50 mix-blend-overlay"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg">
              <div className="h-3 w-3 rounded-full bg-[#0d9488]"></div>
            </div>
          </div>
          
          {/* Row 3 */}
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0d9488]/20">
              <span className="text-lg font-bold text-[#0d9488]">M</span>
              <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#060f1e] bg-[#0d9488]"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">Marcus T. is on his way</span>
              <span className="text-xs text-white/50">Arriving in 4 mins</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}