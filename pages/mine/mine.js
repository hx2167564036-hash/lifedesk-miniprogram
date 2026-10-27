const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

Page({
  data: {
    profile: { avatar: '', nick: '' },
    profileInitial: '我',
    storeMode: 'local',
    openidMask: '未登录',
    loginOk: false,
    checkin: { last: '', streak: 0, total: 0 },
    checkedToday: false,
    stats: { days: 0, streak: 0, courses: 0, hw: 0, total: 0 },
    entries: [
      { idx: 'A1', page: 'fitness', name: '健身', desc: '体重体脂 · 热量缺口' },
      { idx: 'A2', page: 'schedule', name: '日程', desc: '待办 · 逾期顺延' },
      { idx: 'A3', page: 'shopping', name: '待买', desc: '清单 · 预算' },
      { idx: 'A4', page: 'media', name: '书影音', desc: '收藏 · 评分' },
      { idx: 'A5', page: 'homework', name: '作业', desc: 'DDL · 临期提醒' },
      { idx: 'A6', page: 'gpa', name: '成绩', desc: 'GPA · 加权绩点' },
      { idx: 'A7', page: 'data', name: '数据', desc: '备份 · 恢复 · 云配置' }
    ]
  },

  onLoad() {
    this.state = null;
  },

  onShow() {
    this.ensureLogin(); /* 登录态维护：session 过期则静默刷新 */
    this.refresh();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(4);
  },

  /* 微信登录态维护：checkSession 失败 → wx.login 换新会话（openid 由云函数透传） */
  ensureLogin() {
    return new Promise((resolve) => {
      wx.checkSession({
        success: () => { this.setData({ loginOk: true }); resolve(true); },
        fail: () => {
          wx.login({
            success: () => { this.setData({ loginOk: true }); resolve(true); },
            fail: () => { this.setData({ loginOk: false }); resolve(false); }
          });
        }
      });
    });
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();

    /* 连续打卡（全部习惯都有记录的天数，从今天往前） */
    let streak = 0;
    const d = new Date(today + 'T00:00:00');
    for (;;) {
      const key = util.fmtDate(d);
      const done = s.habits.length && s.habits.every(h => h.logs && h.logs[key]);
      if (!done) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }

    const createdAt = (s.meta && s.meta.createdAt) || Date.now();
    const days = Math.max(1, Math.ceil((Date.now() - createdAt) / 86400000));
    const total = s.account.records.length + s.habits.length + s.courses.length
      + s.schedule.length + s.shopping.length + s.media.length
      + s.homework.length + s.gpa.length + (s.fitness.entries || []).length;

    /* openid 脱敏展示 */
    let openidMask = '未登录';
    try {
      const oid = await store.getOpenId();
      if (oid) openidMask = oid.slice(0, 6) + '****' + oid.slice(-4);
    } catch (e) {}

    this.setData({
      profile: (s.meta && s.meta.profile) || { avatar: '', nick: '' },
      profileInitial: (((s.meta && s.meta.profile && s.meta.profile.nick) || '我')).slice(0, 1),
      storeMode: store.mode(),
      openidMask,
      checkin: (s.meta && s.meta.checkin) || { last: '', streak: 0, total: 0 },
      checkedToday: !!(s.meta && s.meta.checkin && s.meta.checkin.last === today),
      stats: {
        days,
        streak,
        courses: s.courses.length,
        hw: s.homework.filter(x => !x.done).length,
        total
      }
    });
  },

  /* ===== 头像：chooseAvatar → 云存储持久化 ===== */
  async onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    if (store.mode() === 'cloud') {
      try {
        const ext = /\.png$/i.test(avatarUrl) ? 'png' : 'jpg';
        const res = await wx.cloud.uploadFile({
          cloudPath: 'avatars/' + util.uid() + '.' + ext,
          filePath: avatarUrl
        });
        this.state.meta.profile.avatar = res.fileID;
        wx.showToast({ title: '头像已更新', icon: 'success' });
      } catch (err) {
        /* 上传失败降级：存临时路径（本次会话可见） */
        this.state.meta.profile.avatar = avatarUrl;
        wx.showToast({ title: '云端保存失败，仅本次生效', icon: 'none' });
      }
    } else {
      this.state.meta.profile.avatar = avatarUrl;
      wx.showToast({ title: '本地模式：仅本机生效', icon: 'none' });
    }
    await this.persist();
  },

  /* ===== 昵称：type=nickname 的 input 必须 blur 才拿得到值 ===== */
  async onNickBlur(e) {
    const nick = (e.detail.value || '').trim().slice(0, 12);
    if (!nick) return;
    this.state.meta.profile.nick = nick;
    await this.persist();
    this.setData({ 'profile.nick': nick, profileInitial: nick.slice(0, 1) });
  },

  onEntryTap(e) {
    const page = e.currentTarget.dataset.page;
    wx.navigateTo({ url: '/pages/' + page + '/' + page });
  },

  /* ===== 每日签到：连续 +1，断档重置 ===== */
  async onCheckin() {
    const s = this.state;
    const today = util.todayStr();
    const ck = s.meta.checkin || { last: '', streak: 0, total: 0 };
    if (ck.last === today) {
      wx.showToast({ title: '今天已签到', icon: 'none' });
      return;
    }
    const yesterday = util.addDays(today, -1);
    const streak = ck.last === yesterday ? (ck.streak || 0) + 1 : 1;
    s.meta.checkin = { last: today, streak, total: (ck.total || 0) + 1 };
    await this.persist();
    this.setData({ checkin: s.meta.checkin, checkedToday: true });
    wx.showToast({ title: '签到成功 · 连续 ' + streak + ' 天', icon: 'success' });
  },

  /* ===== 手动重登（openid 异常时） ===== */
  async onRelogin() {
    await this.ensureLogin();
    const oid = await store.getOpenId();
    this.setData({ openidMask: oid ? oid.slice(0, 6) + '****' + oid.slice(-4) : '未登录' });
    wx.showToast({ title: oid ? '登录态已刷新' : '登录失败，请检查网络', icon: 'none' });
  },

  /* ===== 立即同步 ===== */
  async onSyncNow() {
    wx.showLoading({ title: '同步中', mask: true });
    try {
      const s = await store.load();
      this.state = s;
      await store.save(s);
      wx.hideLoading();
      wx.showToast({ title: store.mode() === 'cloud' ? '已与云端同步' : '本地模式，无云端可同步', icon: 'none' });
      this.refresh();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '同步失败', icon: 'none' });
    }
  },

  /* ===== 切换账号 ===== */
  onSwitchAccount() {
    wx.showModal({
      title: '切换账号',
      content: '将退出当前登录并清空本机缓存（云端数据不会丢）。之后在微信里切换账号，重新打开小程序即可。',
      confirmText: '退出',
      confirmColor: '#A2402A',
      success: (res) => {
        if (!res.confirm) return;
        store.logout();
        wx.showToast({ title: '已退出，重新打开生效', icon: 'none' });
        setTimeout(() => this.refresh(), 800);
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '豆皮的生活台',
      content: '版本 1.0.2 · 本地规则引擎 + 云开发多用户隔离\n数据存于云数据库 lifedesk 集合，按微信 openid 隔离，仅本人可读写。',
      showCancel: false
    });
  },

  async persist() {
    const r = await store.save(this.state);
    if (!r.ok) {
      wx.showToast({ title: '保存失败：空间不足', icon: 'none' });
      return;
    }
    this.refresh();
  },

  onShareAppMessage() { return { title: '豆皮的生活台', path: '/pages/index/index' }; }
});
