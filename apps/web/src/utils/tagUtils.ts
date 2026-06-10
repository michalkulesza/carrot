import type { TFunction } from "i18next";

export function tTag(name: string, t: TFunction): string {
  const key = name.replace(/[-\s]/g, "_");
  return t(`defaultTags.${key}`, { defaultValue: name });
}
