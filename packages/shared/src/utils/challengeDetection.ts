export const CHALLENGE_TITLE_PATTERN = /just a moment|attention required|temporary error/i;
export const CHALLENGE_MARKER_PATTERN = /cf-chl-|_cf_chl_opt|challenge-platform/;
export const CAPTURE_REJECTED_DETAIL = "import_job_cannot_accept_capture";

export const isChallengePage = (title: string, html: string): boolean =>
  CHALLENGE_TITLE_PATTERN.test(title) || CHALLENGE_MARKER_PATTERN.test(html);
