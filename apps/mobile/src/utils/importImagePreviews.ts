const previews = new Map<string, string>()

export const setImportImagePreview = (jobId: string, uri: string): void => {
  previews.set(jobId, uri)
}

export const getImportImagePreview = (jobId: string): string | null => previews.get(jobId) ?? null

export const clearImportImagePreview = (jobId: string): void => {
  previews.delete(jobId)
}
