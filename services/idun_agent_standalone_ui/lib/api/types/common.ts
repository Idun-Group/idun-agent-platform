export type ReloadStatus =
  | "reloaded"
  | "restart_required"
  | "reload_failed"
  | "not_attempted";

export type ReloadResult = {
  status: ReloadStatus;
  message: string;
  error: string | null;
};

export type MutationResponse<T> = {
  data: T;
  reload: ReloadResult;
};

export type DeleteResult = {
  id: string;
  deleted: true;
};

export type SingletonDeleteResult = {
  deleted: true;
};

export type FieldError = {
  field: string;
  message: string;
  code: string | null;
};

export type AdminErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
    fieldErrors?: FieldError[] | null;
  };
};

export type ConnectionCheckResult = {
  ok: boolean;
  details: Record<string, unknown> | null;
  error: string | null;
};
