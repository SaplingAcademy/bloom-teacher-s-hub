import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requestSchema = z.object({
  accessToken: z.string().min(1).max(8192),
  resourceId: z.string().min(1).max(200),
  operation: z.enum(["open", "generate"]),
  fields: z.record(z.string().max(20000)).optional(),
  // Teacher-owned legacy duplicates; never a substitute for canonical access.
  customContent: z.string().max(200000).optional(),
});

export type LibraryContentRequest = z.infer<typeof requestSchema>;

/** Every access/generation authorizes the real session in the database first. */
export const accessLibraryResource = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { handleLibraryContent } = await import("./library-content.server");
    return handleLibraryContent(data);
  });
