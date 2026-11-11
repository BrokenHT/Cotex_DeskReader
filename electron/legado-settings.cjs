'use strict';
// The Legado integration is opt-in. These helpers keep the gate in one place so
// the renderer, the IPC layer and the tests all agree on what "enabled" means.
const DEFAULT_LEGADO_SETTINGS = {
  enabled: false,
  mode: 'adb',
  baseUrl: '',
  adbPath: '',
  deviceSerial: '',
  packageName: '',
  webPort: 0,
  accessToken: '',
};

/** Stored settings merged over the defaults, with the mode normalised. */
function readLegadoSettings(stored) {
  const next = { ...DEFAULT_LEGADO_SETTINGS, ...(stored || {}) };
  next.enabled = next.enabled === true;
  next.mode = next.mode === 'http' ? 'http' : 'adb';
  return next;
}

/** Applies a patch, coercing every field the same way the IPC handler does. */
function applyLegadoPatch(stored, patch) {
  const next = readLegadoSettings(stored);
  if (!patch || typeof patch !== 'object') return next;
  for (const key of ['mode', 'baseUrl', 'adbPath', 'deviceSerial', 'packageName', 'accessToken']) {
    if (patch[key] !== undefined) next[key] = String(patch[key] || '');
  }
  if (patch.webPort !== undefined) next.webPort = Math.max(0, Math.min(65535, Math.floor(Number(patch.webPort)) || 0));
  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  return readLegadoSettings(next);
}

/** Human-readable meaning of the current transport, shown next to the switch. */
function transportHint(settings) {
  const mode = readLegadoSettings(settings).mode;
  if (mode === 'http') {
    return 'HTTP 直连要求手机保持亮屏且 Legado 的「Web 服务」持续运行；锁屏或息屏后连接会中断，读取与进度回写都可能失败。';
  }
  return 'USB 直连只需在手机上开启「USB 调试」并授权本机一次，之后插线即可使用；不需要手机亮屏。';
}

module.exports = { DEFAULT_LEGADO_SETTINGS, readLegadoSettings, applyLegadoPatch, transportHint };
