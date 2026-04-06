// FiberPro brand mark.
//
// To swap in a real logo asset, replace the text render below with:
//   import Image from "next/image";
//   <Image src="/fiberpro-logo.svg" alt="FiberPro" width={100} height={20} priority />
//
// Place the asset at /public/fiberpro-logo.svg (or .png).
// The outer <div> keeps dimensions stable when the swap happens.

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      {/* Text mark — swap for <Image> once asset is available */}
      <span className="text-sm font-bold text-ink tracking-tight">
        Fiber<span className="text-primary">Pro</span>
      </span>
      <span className="text-[10px] font-semibold text-muted bg-wash rounded px-1.5 py-0.5 tracking-wide">
        V3
      </span>
    </div>
  );
}
