/**
 * EN / 中文 language toggle. Switches react-i18next (which re-renders the app),
 * and — via the listener in src/i18n — the Ant Design + dayjs locales too.
 *
 * @author Quasar
 */
import { Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, normalizeLang } from '@/i18n';

export default function LanguageSwitcher({ size = 'middle' }) {
  const { i18n } = useTranslation();
  const current = normalizeLang(i18n.language);
  return (
    <Segmented
      size={size}
      value={current}
      onChange={(value) => i18n.changeLanguage(value)}
      options={SUPPORTED_LANGUAGES.map((l) => ({ label: l.label, value: l.key }))}
    />
  );
}
