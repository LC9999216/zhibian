import { z } from "zod";

// DTOs for Zhihu Adapter
export const SearchAnswerDTOSchema = z.object({
  content_id: z.string(),
  content_type: z.literal("Answer"),
  author_name: z.string(),
  voteup_count: z.number(),
  content_text: z.string(),
  url: z.string(),
});

export type SearchAnswerDTO = z.infer<typeof SearchAnswerDTOSchema>;

export const QueryDTOSchema = z.object({
  query: z.object({
    text: z.string(),
    search_hash_id: z.string().optional(),
  }),
  answers: z.array(SearchAnswerDTOSchema),
});

export type QueryDTO = z.infer<typeof QueryDTOSchema>;
