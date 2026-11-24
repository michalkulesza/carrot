export class ApiError extends Error {
  status: number;
  code: string | null;
  editor: string | null;
  sameUser: boolean;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    editor: string | null = null,
    sameUser = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.editor = editor;
    this.sameUser = sameUser;
  }
}

export type ConflictInfo =
  | { code: "recipe_locked"; editor: string; sameUser: boolean }
  | { code: "recipe_changed" };

export const getErrorStatus = (error: unknown): number | null =>
  error instanceof ApiError ? error.status : null;

export const getConflictInfo = (error: unknown): ConflictInfo | null => {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (error.code === "recipe_locked") {
    return {
      code: "recipe_locked",
      editor: error.editor ?? "",
      sameUser: error.sameUser,
    };
  }
  if (error.code === "recipe_changed") return { code: "recipe_changed" };
  return null;
};
