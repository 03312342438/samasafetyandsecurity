import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Renders a stock item picture stored privately in the `item-images` bucket. */
export function ItemImage({
  path,
  alt,
  className,
}: {
  path?: string | null;
  alt: string;
  className?: string;
}) {
  const isExternal = !!path && /^https?:\/\//i.test(path);
  const { data: url } = useQuery({
    queryKey: ["item-image", path],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      // External URLs (e.g. imported from an Excel "Picture" column) are used as-is.
      if (isExternal) return path as string;
      const { data } = await supabase.storage.from("item-images").createSignedUrl(path as string, 3600);
      return data?.signedUrl ?? "";
    },
  });

  if (!path || !url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border bg-muted/40 text-muted-foreground",
          className ?? "h-14 w-14",
        )}
        aria-hidden
      >
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn("rounded-md border object-cover", className ?? "h-14 w-14")}
    />
  );
}

/** Upload a picture to the private item bucket and return its storage path. */
export async function uploadItemImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("item-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}
