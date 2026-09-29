/**
 * Shared result shape for every `useActionState` form in the app.
 *
 * Lives outside the route folders so pages, client components and server
 * actions can all reference the same type without importing across routes.
 */
export type ActionState = {
  ok: boolean;
  message: string;
};
