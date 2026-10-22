/** Must match the `messages_content_length` constraint in the database. */
export const MAX_MESSAGE_LENGTH = 10_000;

/** Show the character counter once a message gets this long. */
export const CHARACTER_COUNT_THRESHOLD = 8_000;

/** Must match the interval in the `messages_set_timestamps` trigger. */
export const MESSAGE_RETENTION_HOURS = 24;

export const MESSAGE_PAGE_SIZE = 30;

/** Columns sent to the browser. `user_id` and `client_id` are not needed by the UI. */
export const MESSAGE_COLUMNS = "id, content, created_at, expires_at" as const;
