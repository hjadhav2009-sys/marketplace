import Image from "next/image";

type ProductImageProps = {
  src?: string | null;
  alt: string;
  size?: "sm" | "md" | "lg";
};

const sizeClass = {
  sm: "h-16 w-16",
  md: "h-28 w-28",
  lg: "h-40 w-full sm:h-52"
};

export function ProductImage({ src, alt, size = "md" }: ProductImageProps) {
  return (
    <div className={`relative flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 ${sizeClass[size]}`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="(max-width: 640px) 40vw, 220px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          No image
        </div>
      )}
    </div>
  );
}
