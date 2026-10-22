import { z } from "zod";

import { MAX_MESSAGE_LENGTH } from "./constants";

/**
 * Counts Unicode code points, which is what Postgres `char_length` measures.
 * `String.prototype.length` counts UTF-16 units, so an emoji would count twice.
 */
export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export const EMPTY_MESSAGE_ERROR = "Type or paste something to send.";
export const MESSAGE_TOO_LONG_ERROR = `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`;

/** Message text is stored exactly as entered: no trimming or normalisation. */
export const messageContentSchema = z
  .string({ error: EMPTY_MESSAGE_ERROR })
  .refine((value) => value.trim().length > 0, { error: EMPTY_MESSAGE_ERROR })
  .refine((value) => countCharacters(value) <= MAX_MESSAGE_LENGTH, {
    error: MESSAGE_TOO_LONG_ERROR,
  });

export const createMessageSchema = z.object({
  clientId: z.uuid({ error: "Invalid request." }),
  content: messageContentSchema,
  /** The sending device's push endpoint, so it isn't notified about its own message. */
  sourceEndpoint: z.string().max(2048).optional().catch(undefined),
});

export const deleteMessageSchema = z.object({
  id: z.uuid({ error: "Invalid message." }),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
