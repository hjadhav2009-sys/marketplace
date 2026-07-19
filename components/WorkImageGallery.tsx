"use client";

import { useState } from "react";
import { ProductImage } from "./ProductImage";

export function WorkImageGallery({ images, alt, priority = false }: { images: Array<string | null | undefined>; alt: string; priority?: boolean }) {
  const available = [...new Set(images.filter((value): value is string => Boolean(value)))];
  const [index, setIndex] = useState(0);
  const current = available[index] ?? null;
  const move = (offset: number) => setIndex(value => (value + offset + Math.max(available.length, 1)) % Math.max(available.length, 1));
  return <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" data-work-gallery>
    <ProductImage src={current} alt={`${alt}${available.length > 1 ? ` image ${index + 1}` : ""}`} size="lg" showBadge={false} priority={priority}/>
    {available.length > 1 ? <><button type="button" aria-label="Previous image" onClick={() => move(-1)} className="absolute left-2 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-full border bg-white/95 text-xl font-black shadow">‹</button><button type="button" aria-label="Next image" onClick={() => move(1)} className="absolute right-2 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-full border bg-white/95 text-xl font-black shadow">›</button><span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-black text-white">{index + 1} / {available.length}</span></> : null}
  </div>;
}
