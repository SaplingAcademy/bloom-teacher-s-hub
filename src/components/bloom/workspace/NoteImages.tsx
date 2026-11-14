import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { NoteImage } from "@/lib/workspace-note-images";
import { cn } from "@/lib/utils";

/**
 * Images below the note text. Space is reserved from the saved width/height before the file loads,
 * so the note's height (and the board layout measured from it) does not jump. Native image drag is
 * disabled so pressing an image still drags the whole note.
 */
export function NoteImages({ images, urls, label }: { images: readonly NoteImage[]; urls: Readonly<Record<string, string>>; label: (index: number) => string }) {
  if (images.length === 0) return null;
  const single = images.length === 1;
  return (
    <span className={cn("mt-3 grid gap-2", single ? "grid-cols-1" : "grid-cols-2")} data-testid="note-images">
      {images.map((image, index) => (
        <NoteImageTile key={image.id} image={image} url={urls[image.file_path]} alt={label(index + 1)}
          className={cn(single ? "max-h-60" : "aspect-square", !single && images.length === 3 && index === 0 && "col-span-2 aspect-[2/1]")}
          ratio={single ? `${image.width} / ${image.height}` : undefined} />
      ))}
    </span>
  );
}

function NoteImageTile({ image, url, alt, className, ratio }: { image: NoteImage; url?: string; alt: string; className?: string; ratio?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("relative block w-full overflow-hidden rounded-md bg-note-ink/10", className)} style={ratio ? { aspectRatio: ratio } : undefined}>
      {url && !failed ? (
        <img src={url} alt={alt} width={image.width} height={image.height} loading="lazy" decoding="async" draggable={false}
          onError={() => setFailed(true)} className="pointer-events-none h-full w-full select-none object-cover" />
      ) : failed ? (
        <span role="img" aria-label={alt} className="flex h-full w-full items-center justify-center text-note-ink/50"><ImageOff className="h-5 w-5" aria-hidden /></span>
      ) : (
        <span aria-hidden className="block h-full w-full animate-pulse motion-reduce:animate-none" />
      )}
    </span>
  );
}
