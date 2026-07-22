/**
 * Theme preference persistence and system-mode tests.
 *
 * @author Quasar
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readThemePreference,
  resolveEffectiveTheme,
  subscribeToSystemTheme,
  writeThemePreference,
} from './themeStorage.js';

function storage(value, { readError = false, writeError = false } = {}) {
  return {
    getItem() {
      if (readError) throw new Error('blocked');
      return value;
    },
    setItem(key, next) {
      if (writeError) throw new Error('blocked');
      this.saved = [key, next];
    },
  };
}

function media(matches = false) {
  const listeners = new Set();
  return {
    matches,
    listeners,
    addEventListener(type, listener) {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'change') listeners.delete(listener);
    },
  };
}

test('reads valid preferences and falls back to system for invalid or blocked storage', () => {
  assert.equal(readThemePreference(storage('light')), 'light');
  assert.equal(readThemePreference(storage('dark')), 'dark');
  assert.equal(readThemePreference(storage('system')), 'system');
  assert.equal(readThemePreference(storage('sepia')), 'system');
  assert.equal(readThemePreference(storage(null, { readError: true })), 'system');
});

test('writes only valid preferences and tolerates blocked storage', () => {
  const available = storage(null);
  assert.equal(writeThemePreference('dark', available), true);
  assert.deepEqual(available.saved, ['quasar.theme.mode', 'dark']);
  assert.equal(writeThemePreference('sepia', available), false);
  assert.equal(writeThemePreference('light', storage(null, { writeError: true })), false);
});

test('tolerates an unavailable global storage getter', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  try {
    assert.equal(readThemePreference(), 'system');
    assert.equal(writeThemePreference('dark'), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('resolves system mode and subscribes only while system preference is active', () => {
  assert.equal(resolveEffectiveTheme('system', true), 'dark');
  assert.equal(resolveEffectiveTheme('system', false), 'light');
  assert.equal(resolveEffectiveTheme('light', true), 'light');
  assert.equal(resolveEffectiveTheme('dark', false), 'dark');

  const query = media(true);
  const changes = [];
  const unsubscribe = subscribeToSystemTheme('system', query, (dark) => changes.push(dark));
  assert.equal(query.listeners.size, 1);
  query.listeners.forEach((listener) => listener({ matches: false }));
  assert.deepEqual(changes, [false]);
  unsubscribe();
  assert.equal(query.listeners.size, 0);

  subscribeToSystemTheme('dark', query, () => changes.push(true));
  assert.equal(query.listeners.size, 0);
});
