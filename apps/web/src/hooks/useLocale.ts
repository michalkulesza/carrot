import { useTranslation } from "react-i18next";

export function useLocale() {
  const { i18n } = useTranslation();
  return { locale: i18n.language };
}
