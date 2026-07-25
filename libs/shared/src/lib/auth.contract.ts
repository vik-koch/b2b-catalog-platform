import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * Authorization roles.
 * Kept in sync with the `user_role` pg enum in the API schema.
 */
export const USER_ROLES = ['admin', 'manager', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * The authenticated identity exposed to the client. Never carries the password
 * hash, and never a pricing tier — role is authorization only.
 */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  /**
   * The account still carries a password it did not choose itself — the
   * bootstrap admin's seeded one (FR-AUTH-07). The client uses it to force the
   * change-password prompt.
   */
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Minimum length is the one password rule we enforce; argon2 handles the rest.
 * Named and exported so the change-password form validates the very rule the
 * server applies (see zodValidator) instead of a hand-copied near-match.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(200);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: newPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

/**
 * Session auth. Login/logout manage an httpOnly session cookie set
 * by the server, so the token never touches client JavaScript; the contract
 * carries only the user identity, not the token.
 */
export const authContract = c.router({
  login: {
    method: 'POST',
    path: '/auth/login',
    body: loginSchema,
    responses: {
      200: authUserSchema,
      401: z.object({ message: z.string() }),
    },
    summary: 'Authenticate and start a session (sets an httpOnly cookie)',
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    // Idempotent and safe to call unauthenticated — it only clears the cookie.
    body: z.object({}),
    responses: {
      200: z.object({ message: z.string() }),
    },
    summary: 'Clear the session cookie',
  },
  me: {
    method: 'GET',
    path: '/auth/me',
    responses: {
      200: authUserSchema,
      401: z.object({ message: z.string() }),
    },
    summary: 'Return the currently authenticated user',
  },
  changePassword: {
    method: 'POST',
    path: '/auth/change-password',
    body: changePasswordSchema,
    responses: {
      // The refreshed identity (with mustChangePassword cleared), so the client
      // updates its session state from the response rather than re-fetching.
      200: authUserSchema,
      400: z.object({ message: z.string() }),
      401: z.object({ message: z.string() }),
    },
    summary: "Change the current user's password",
  },
});
