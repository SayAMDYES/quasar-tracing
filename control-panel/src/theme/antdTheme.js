/**
 * Ant Design theme configuration for the ConfigProvider.
 * Maps the design tokens onto AntD's token + per-component overrides so the
 * whole component library inherits the white/orange identity automatically.
 *
 * @author Quasar
 */
import { theme } from 'antd';
import { brand, neutral, status, fonts } from './tokens';

export const antdTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: brand.primary,
    colorInfo: status.info,
    colorSuccess: status.ok,
    colorWarning: status.warn,
    colorError: status.error,
    colorLink: brand.strong,
    colorLinkHover: brand.primary,

    colorTextBase: neutral.text,
    colorTextHeading: neutral.heading,
    colorTextSecondary: neutral.textSecondary,
    colorBgLayout: neutral.canvas,
    colorBorder: neutral.border,
    colorBorderSecondary: neutral.border,

    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: fonts.sans,
    fontFamilyCode: fonts.mono,
    fontSize: 14,
    controlHeight: 36,
    wireframe: false,
    boxShadowTertiary:
      '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
  },
  components: {
    Layout: {
      headerBg: neutral.surface,
      headerHeight: 56,
      headerPadding: '0 20px',
      bodyBg: neutral.canvas,
      siderBg: neutral.surface,
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: neutral.textSecondary,
      itemHoverColor: neutral.heading,
      itemHoverBg: '#F4F5F7',
      itemSelectedBg: brand.tint,
      itemSelectedColor: brand.strong,
      itemActiveBg: brand.tint,
      itemHeight: 40,
      itemMarginInline: 8,
      itemMarginBlock: 4,
      itemBorderRadius: 8,
      iconSize: 16,
      fontSize: 14,
      groupTitleColor: neutral.textMuted,
      groupTitleFontSize: 11,
    },
    Card: {
      headerFontSize: 15,
      headerHeight: 52,
      paddingLG: 20,
    },
    Table: {
      headerBg: neutral.surfaceMuted,
      headerColor: neutral.textSecondary,
      headerSplitColor: 'transparent',
      borderColor: neutral.border,
      rowHoverBg: brand.tint,
      cellPaddingBlock: 10,
      cellPaddingInline: 14,
      fontSize: 13,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: 'none',
      defaultShadow: 'none',
    },
    Tag: { borderRadiusSM: 6, fontSizeSM: 12 },
    Tabs: {
      titleFontSize: 14,
      inkBarColor: brand.primary,
      itemSelectedColor: brand.strong,
      itemHoverColor: brand.primary,
      itemColor: neutral.textSecondary,
    },
    Segmented: {
      itemSelectedBg: neutral.surface,
      itemSelectedColor: brand.strong,
      trackBg: '#EDEFF2',
    },
    Statistic: { contentFontSize: 26, titleFontSize: 13 },
    Drawer: { paddingLG: 20 },
    Descriptions: { labelBg: neutral.surfaceMuted, titleMarginBottom: 12 },
    Tooltip: { colorBgSpotlight: '#1B1F26' },
  },
};
