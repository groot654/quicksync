import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: "Enter your email." })
    .pipe(z.email({ error: "Enter a valid email address." })),
  password: z
    .string()
    .min(1, { error: "Enter your password." })
    .max(256, { error: "Password is too long." }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof LoginInput, string>>;
  /** Echoed back so the email field keeps its value after a failed attempt. */
  email?: string;
};
