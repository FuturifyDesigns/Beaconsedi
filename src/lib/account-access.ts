export function hasRegisteredAccount<T extends { id: string; is_anonymous?: boolean }>(user: T | null | undefined): user is T {
  return Boolean(user?.id) && user?.is_anonymous !== true;
}
