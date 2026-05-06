export type ReloadStatusKind =
  | "reloaded"
  | "restart_required"
  | "reload_failed";

export type RuntimeStatus = {
  lastStatus: ReloadStatusKind | null;
  lastMessage: string | null;
  lastError: string | null;
  lastReloadedAt: string | null; // ISO 8601
};
