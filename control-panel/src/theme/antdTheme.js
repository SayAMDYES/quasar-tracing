/**
 * Builds the Ant Design configuration from the active runtime token set.
 *
 * @author Quasar
 */
import { theme } from 'antd';

export function createAntdTheme(mode, tokens) {
  const { brand, neutral, status, fonts } = tokens;
  const dark = mode === 'dark';
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: brand.primary,
      colorInfo: status.info,
      colorSuccess: status.ok,
      colorWarning: status.warn,
      colorError: status.error,
      colorLink: brand.strong,
      colorLinkHover: brand.primaryHover,
      colorTextBase: neutral.text,
      colorTextHeading: neutral.heading,
      colorTextSecondary: neutral.textSecondary,
      colorBgBase: neutral.surface,
      colorBgLayout: neutral.canvas,
      colorBgContainer: neutral.surface,
      colorBgElevated: neutral.surface,
      colorBorder: neutral.border,
      colorBorderSecondary: neutral.border,
      borderRadius: 8,
      borderRadiusLG: 8,
      fontFamily: fonts.sans,
      fontFamilyCode: fonts.mono,
      fontSize: 14,
      controlHeight: 36,
      wireframe: false,
      boxShadowTertiary: dark
        ? '0 1px 2px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.16)'
        : '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
    },
    components: {
      Layout: { headerBg: neutral.surface, headerHeight: 56, headerPadding: '0 20px', bodyBg: neutral.canvas, siderBg: neutral.surface },
      Menu: {
        itemBg: 'transparent', itemColor: neutral.textSecondary, itemHoverColor: neutral.heading,
        itemHoverBg: neutral.surfaceMuted, itemSelectedBg: brand.tint, itemSelectedColor: brand.strong,
        itemActiveBg: brand.tint, itemHeight: 40, itemMarginInline: 8, itemMarginBlock: 4,
        itemBorderRadius: 8, iconSize: 16, fontSize: 14, groupTitleColor: neutral.textMuted, groupTitleFontSize: 11,
      },
      Card: { headerFontSize: 15, headerHeight: 52, paddingLG: 20 },
      Table: {
        headerBg: neutral.surfaceMuted, headerColor: neutral.textSecondary, headerSplitColor: 'transparent',
        borderColor: neutral.border, rowHoverBg: brand.tint, cellPaddingBlock: 10, cellPaddingInline: 14, fontSize: 13,
      },
      Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none' },
      Tag: { borderRadiusSM: 6, fontSizeSM: 12 },
      Tabs: {
        titleFontSize: 14, inkBarColor: brand.primary, itemSelectedColor: brand.strong,
        itemHoverColor: brand.primaryHover, itemColor: neutral.textSecondary,
      },
      Segmented: { itemSelectedBg: neutral.surface, itemSelectedColor: brand.strong, trackBg: neutral.surfaceMuted },
      Statistic: { contentFontSize: 26, titleFontSize: 13 },
      Drawer: { paddingLG: 20 },
      Descriptions: { labelBg: neutral.surfaceMuted, titleMarginBottom: 12 },
      Tooltip: { colorBgSpotlight: dark ? '#050608' : '#1B1F26' },
    },
  };
}
