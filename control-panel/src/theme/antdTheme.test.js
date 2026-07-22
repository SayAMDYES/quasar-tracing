/**
 * Ant Design runtime algorithm and token projection tests.
 *
 * @author Quasar
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { theme } from 'antd';
import { createAntdTheme } from './antdTheme.js';
import { darkTokens, lightTokens } from './tokens.js';

test('selects the matching Ant Design algorithm and surface tokens', () => {
  const light = createAntdTheme('light', lightTokens);
  const dark = createAntdTheme('dark', darkTokens);

  assert.equal(light.algorithm, theme.defaultAlgorithm);
  assert.equal(dark.algorithm, theme.darkAlgorithm);
  assert.equal(light.token.colorBgContainer, lightTokens.neutral.surface);
  assert.equal(dark.token.colorBgContainer, darkTokens.neutral.surface);
  assert.equal(dark.components.Table.headerBg, darkTokens.neutral.surfaceMuted);
  assert.equal(dark.components.Menu.itemSelectedBg, darkTokens.brand.tint);
});
