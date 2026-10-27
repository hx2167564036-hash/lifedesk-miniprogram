/*
 * 双轨数据层：本地存储（测试号/离线） ↔ 云开发数据库（正式号填 EnvId 后自动启用）
 * 数据结构单 blob，与 HTML 版生活工作台同源；云模式按 openid 自动隔离。
 */
const util = require('./util.js');

const KEY = 'wb_lifedesk_data_v1';
const LASTGOOD = 'wb_lifedesk_lastgood_v1';
const COLLECTION = 'lifedesk';
const ENV_KEY = 'wb_lifedesk_cloudenv';

/* ↓↓↓ 云开发环境 ID（2026-10-14 开通，所属应用 wx7d0eb326d73f6bc8）。预填后所有用户打开即云同步；数据面板里可覆盖 ↓↓↓ */
let CLOUD_ENV = 'cloud1-d0garh2hy2f7bfdf7';

let mode = 'local';

function init() {
  /* 启动时读取用户在数据面板保存的 EnvId */
  try {
    const saved = wx.getStorageSync(ENV_KEY);
    if (saved) CLOUD_ENV = saved;
  } catch (e) {}
  if (CLOUD_ENV && wx.cloud) {
    try {
      wx.cloud.init({ env: CLOUD_ENV, traceUser: false });
      mode = 'cloud';
    } catch (e) {
      mode = 'local';
    }
  }
}

function defaultState() {
  return {
    meta: {
      owner: '',
      version: 1,
      updatedAt: Date.now(),
      createdAt: Date.now(),
      ownerOpenid: '',
      profile: { avatar: '', nick: '' },
      checkin: { last: '', streak: 0, total: 0 }
    },
    account: { budget: 2000, records: [] },
    habits: [],
    fitness: { entries: [], height: 172, gender: 'm', age: 21, goalWeight: 65, activity: 1.375, daily: {}, plan: {} },
    schedule: [],
    shopping: [],
    media: [],
    /* 新增：大学生模块 */
    courses: [],
    courseCfg: {
      termStart: '',
      totalWeeks: 20,
      periods: [
        { n: 1, start: '08:00', end: '08:45' },
        { n: 2, start: '08:50', end: '09:35' },
        { n: 3, start: '09:50', end: '10:35' },
        { n: 4, start: '10:40', end: '11:25' },
        { n: 5, start: '11:30', end: '12:15' },
        { n: 6, start: '13:15', end: '14:00' },
        { n: 7, start: '14:05', end: '14:50' },
        { n: 8, start: '15:05', end: '15:50' },
        { n: 9, start: '15:55', end: '16:40' },
        { n: 10, start: '18:30', end: '19:15' },
        { n: 11, start: '19:20', end: '20:05' },
        { n: 12, start: '20:10', end: '20:55' }
      ]
    },
    homework: [],
    gpa: []
  };
}

/* 字段兜底迁移：旧数据缺字段时补默认值 */
function migrate(s) {
  const d = defaultState();
  const out = Object.assign({}, d, s);
  out.meta = Object.assign({}, d.meta, s.meta || {});
  out.meta.profile = Object.assign({}, d.meta.profile, (s.meta && s.meta.profile) || {});
  out.meta.checkin = Object.assign({}, d.meta.checkin, (s.meta && s.meta.checkin) || {});
  out.account = Object.assign({}, d.account, s.account || {});
  out.fitness = Object.assign({}, d.fitness, s.fitness || {});
  out.courseCfg = Object.assign({}, d.courseCfg, s.courseCfg || {});
  if (!Array.isArray(out.courses)) out.courses = [];
  if (!Array.isArray(out.homework)) out.homework = [];
  if (!Array.isArray(out.gpa)) out.gpa = [];
  if (!Array.isArray(out.media)) out.media = [];
  if (!Array.isArray(out.shopping)) out.shopping = [];
  if (!Array.isArray(out.schedule)) out.schedule = [];
  if (!Array.isArray(out.habits)) out.habits = [];
  if (!Array.isArray(out.account.records)) out.account.records = [];
  if (!Array.isArray(out.fitness.entries)) out.fitness.entries = [];
  return out;
}

function loadLocalSync() {
  try {
    const raw = wx.getStorageSync(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    return null; /* 损坏：由页面层走恢复流程 */
  }
}
function saveLocalSync(state) {
  wx.setStorageSync(KEY, JSON.stringify(state));
  wx.setStorageSync(LASTGOOD, JSON.stringify(state)); /* 滚动备份上次良好副本 */
}

/* 多用户隔离：云模式下每个用户一条文档，_id = openid（安全规则 doc._openid == auth.openid 天然成立） */
let openidCache = '';
async function getOpenId() {
  if (openidCache) return openidCache;
  try {
    const res = await wx.cloud.callFunction({ name: 'openid' });
    if (res && res.result && res.result.openid) openidCache = res.result.openid;
  } catch (e) { /* 云函数未部署/未配置 → 返回空，由调用方降级 */ }
  return openidCache;
}

/* 首次加载：空数据起步，不再灌演示数据（用户要求） */
async function seedIfNew(s) {
  if (s && s.meta && s.meta.initialized) return s;
  const fresh = defaultState();
  fresh.meta.initialized = true;
  await save(fresh);
  return fresh;
}

async function load() {
  if (mode === 'cloud') {
    const openid = await getOpenId();
    if (openid) {
      try {
        const db = wx.cloud.database();
        const res = await db.collection(COLLECTION).doc(openid).get();
        /* 归属校验：blob 必须带 ownerOpenid 且等于当前 openid，否则拒收
           （防 1.0.1 旧版共享文档 main / 同设备上个账号的残留） */
        if (res && res.data && res.data.blob && res.data.blob.meta && res.data.blob.meta.ownerOpenid === openid) {
          const s = migrate(res.data.blob);
          saveLocalSync(s); /* 本地镜像，离线可读 */
          return s;
        }
        return await seedIfNew(defaultState());
      } catch (e) {
        /* 文档不存在 → 新用户：忽略本地旧数据（可能是同设备上一个账号的），空数据初始化 */
        const notExist = e && (e.errCode === -502005 || /not exist/i.test(String(e.errMsg || '')));
        if (!notExist) {
          const local = loadLocalSync();
          /* 本地镜像也要过归属校验，防串账号 */
          if (local && local.meta && local.meta.ownerOpenid === openid) return local;
        }
        return await seedIfNew(defaultState());
      }
    }
    /* 拿不到 openid（云函数未部署）→ 降级本地（本地是唯一数据源，照常返回） */
    const local = loadLocalSync();
    return local ? local : await seedIfNew(defaultState());
  }
  const local = loadLocalSync();
  return local ? local : await seedIfNew(defaultState());
}

async function save(state) {
  state.meta = state.meta || {};
  state.meta.updatedAt = Date.now();
  if (mode === 'cloud') {
    const openid = await getOpenId();
    if (openid) {
      state.meta.ownerOpenid = openid; /* 归属标记：load 时校验，防串账号 */
      try {
        const db = wx.cloud.database();
        await db.collection(COLLECTION).doc(openid).set({
          data: { blob: state, updatedAt: Date.now() }
        });
        saveLocalSync(state);
        return { ok: true, mode: 'cloud' };
      } catch (e) {
        /* 云失败降级本地，界面不阻塞 */
        try {
          saveLocalSync(state);
          return { ok: true, mode: 'local', warn: 'cloud-failed' };
        } catch (e2) {
          return { ok: false, reason: 'quota', message: String(e2.message || e2) };
        }
      }
    }
    /* 拿不到 openid → 仅本地 */
  }
  try {
    saveLocalSync(state);
    return { ok: true, mode: 'local' };
  } catch (e) {
    return { ok: false, reason: 'quota', message: String(e.message || e) };
  }
}

/* 退出登录：清 openid 缓存 + 本地数据副本（云端数据不动，换账号后自然按新 openid 隔离） */
function logout() {
  openidCache = '';
  try {
    wx.removeStorageSync(KEY);
    wx.removeStorageSync(LASTGOOD);
  } catch (e) {}
}

/* 恢复上次良好副本 */
function recoverLastGood() {
  try {
    const raw = wx.getStorageSync(LASTGOOD);
    if (!raw) return null;
    const s = migrate(JSON.parse(raw));
    saveLocalSync(s);
    return s;
  } catch (e) { return null; }
}

function importJSON(text) {
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not-object' };
    return { ok: true, state: migrate(obj) };
  } catch (e) {
    return { ok: false, reason: 'parse', message: String(e.message || e) };
  }
}

function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

module.exports = {
  KEY, LASTGOOD,
  init, migrate,
  mode: () => mode,
  setEnv: (env) => { CLOUD_ENV = env || ''; },
  getOpenId,
  logout,
  load, save,
  loadLocalSync, saveLocalSync, recoverLastGood,
  importJSON, exportJSON, defaultState,
  util
};
