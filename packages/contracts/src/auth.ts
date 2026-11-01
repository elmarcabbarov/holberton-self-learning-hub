import { z } from "zod";

export const AuthStatus = z.object({ authenticated: z.boolean() });
export type AuthStatus = z.infer<typeof AuthStatus>;

export const BootstrapRequest = z.object({ token: z.string().max(128) });
export type BootstrapRequest = z.infer<typeof BootstrapRequest>;
