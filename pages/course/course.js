const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const COURSE_COLORS = ['#A2402A', '#3F6B4F', '#4A5D8A', '#8A5D3B', '#6B4A7A', '#2B6E7A', '#8A3B5C', '#5E6E2B'];

Page({
  data: {
    WEEK_CN: util.WEEK_CN,
    todayIdx: 0,
    week: 1,
    totalWeeks: 20,
    weekRange: '',
    rows: [],
    courseCount: 0,
    importVisible: false,
    importText: '',
    importResult: null,
    editVisible: false,
    editForm: null,
    periodsVisible: false,
    cfg: null,
    loadEmpty: true
  },

  onLoad() {
    this.state = null;
  },

  onShow() {
    this.refresh();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(1);
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();
    const todayIdx = util.weekdayIdx(today);
    const cfg = s.courseCfg;
    let week = 1;
    let weekRange = '';
    if (cfg.termStart) {
      const start = new Date(cfg.termStart + 'T00:00:00');
      const now = new Date(today + 'T00:00:00');
      week = Math.floor((now - start) / (7 * 86400000)) + 1;
      week = util.clamp(week, 1, cfg.totalWeeks || 20);
      const wStart = util.addDays(cfg.termStart, (week - 1) * 7);
      const wEnd = util.addDays(cfg.termStart, (week - 1) * 7 + 6);
      weekRange = wStart.slice(5).replace('-', '/') + ' - ' + wEnd.slice(5).replace('-', '/');
    } else {
      weekRange = '未设置开学日，显示全部周次课程';
    }
    this.setData({
      todayIdx,
      week,
      totalWeeks: cfg.totalWeeks || 20,
      weekRange,
      cfg: JSON.parse(JSON.stringify(cfg)),
      courseCount: s.courses.length,
      loadEmpty: s.courses.length === 0
    });
    this.buildGrid();
  },

  buildGrid() {
    const s = this.state;
    if (!s) return;
    const cfg = s.courseCfg;
    const week = this.data.week;
    const rows = cfg.periods.map(p => {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const c = s.courses.find(x => x.day === d && x.start <= p.n && x.end >= p.n && weekMatch(x, week));
        cells.push({ k: 'c' + p.n + '-' + d, course: c || null, isStart: c ? c.start === p.n : false });
      }
      return { n: p.n, start: p.start, end: p.end, cells };
    });
    this.setData({ rows, courseCount: s.courses.length });
  },

  prevWeek() {
    if (this.data.week <= 1) return;
    this.setData({ week: this.data.week - 1 });
    this.buildGrid();
  },
  nextWeek() {
    if (this.data.week >= this.data.totalWeeks) return;
    this.setData({ week: this.data.week + 1 });
    this.buildGrid();
  },
  goThisWeek() {
    this.refresh();
  },

  /* ---------- 导入 ---------- */
  showImport() {
    this.setData({ importVisible: true, importText: '', importResult: null });
  },
  hideImport() {
    this.setData({ importVisible: false });
  },
  hideEdit() {
    this.setData({ editVisible: false, editForm: null });
  },
  onDayChange(e) {
    this.setData({ 'editForm.day': +e.detail.value });
  },
  onWeeksBlur(e) {
    const v = parseInt(e.detail.value, 10);
    this.setData({ totalWeeks: util.clamp(isNaN(v) ? 20 : v, 1, 30) });
  },
  onImportInput(e) {
    this.setData({ importText: e.detail.value });
  },

  /* 从微信聊天会话选 txt/csv 文件，读入内容到 textarea（再点解析） */
  importFromFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'csv'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        if (file.size > 200 * 1024) {
          wx.showToast({ title: '文件过大（限 200KB）', icon: 'none' });
          return;
        }
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: file.path,
          encoding: 'utf-8',
          success: (r) => {
            const text = String(r.data || '').slice(0, 2000);
            if (!text.trim()) {
              wx.showToast({ title: '文件是空的', icon: 'none' });
              return;
            }
            this.setData({ importText: text });
            wx.showToast({ title: '已读入，点解析', icon: 'none' });
          },
          fail: () => wx.showToast({ title: '读取失败', icon: 'none' })
        });
      },
      fail: () => { /* 用户取消，不提示 */ }
    });
  },
  doParse() {
    const text = this.data.importText.trim();
    if (!text) {
      wx.showToast({ title: '先粘贴课表文本', icon: 'none' });
      return;
    }
    const r = util.parseCourseText(text);
    this.setData({ importResult: { ok: r.ok, bad: r.bad } });
    if (!r.ok.length) {
      wx.showToast({ title: '没有解析出课程，检查格式', icon: 'none' });
    }
  },
  fillExample() {
    this.setData({
      importText: '高等数学,周一,1-2,教三-101,王老师,1-16\n大学英语,周三,3-4,教一-205,李老师,1-16\n数据结构,周五,3-5,机房-406,郑老师,1-16'
    });
  },
  async doImport(e) {
    const mode = e.currentTarget.dataset.mode;
    const r = this.data.importResult;
    if (!r || !r.ok.length) return;
    const s = this.state;
    if (mode === 'overwrite') s.courses = [];
    r.ok.forEach((c, i) => {
      c.color = COURSE_COLORS[(s.courses.length + i) % COURSE_COLORS.length];
      s.courses.push(c);
    });
    await this.persist('导入 ' + r.ok.length + ' 门课');
    this.setData({ importVisible: false, importResult: null, importText: '' });
  },

  /* ---------- 课程编辑 ---------- */
  showAdd() {
    this.setData({
      editVisible: true,
      editForm: { id: '', name: '', day: this.data.todayIdx, start: 1, end: 2, location: '', teacher: '', weeks: '1-16', isNew: true }
    });
  },
  editCourse(e) {
    const id = e.currentTarget.dataset.id;
    const c = this.state.courses.find(x => x.id === id);
    if (!c) return;
    this.setData({ editVisible: true, editForm: Object.assign({}, c, { isNew: false }) });
  },
  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    const val = e.detail.value;
    this.setData({ ['editForm.' + key]: key === 'day' || key === 'start' || key === 'end' ? +val : val });
  },
  async saveCourse() {
    const f = this.data.editForm;
    if (!f.name.trim()) {
      wx.showToast({ title: '课程名不能为空', icon: 'none' });
      return;
    }
    const s = this.state;
    const rec = {
      id: f.id || util.uid(),
      name: f.name.trim().slice(0, 30),
      day: f.day, start: f.start, end: Math.max(f.start, f.end),
      location: (f.location || '').slice(0, 30),
      teacher: (f.teacher || '').slice(0, 20),
      weeks: f.weeks || '1-16',
      color: f.color || COURSE_COLORS[s.courses.length % COURSE_COLORS.length]
    };
    if (f.isNew) {
      s.courses.push(rec);
    } else {
      const i = s.courses.findIndex(x => x.id === rec.id);
      if (i >= 0) s.courses[i] = rec;
    }
    this.setData({ editVisible: false, editForm: null });
    await this.persist('已保存');
  },
  async delCourse() {
    const f = this.data.editForm;
    const s = this.state;
    s.courses = s.courses.filter(x => x.id !== f.id);
    this.setData({ editVisible: false, editForm: null });
    await this.persist('已删除');
  },

  /* ---------- 节次设置 ---------- */
  showPeriods() {
    this.setData({ periodsVisible: true });
  },
  hidePeriods() {
    this.setData({ periodsVisible: false });
  },
  onPeriodInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = e.currentTarget.dataset.key;
    this.setData({ ['cfg.periods[' + idx + '].' + key]: e.detail.value });
  },
  onTermStart(e) {
    this.setData({ 'cfg.termStart': e.detail.value });
  },
  onWeeksChange(e) {
    this.setData({ totalWeeks: +e.detail.value });
  },
  async saveCfg() {
    const s = this.state;
    s.courseCfg.periods = this.data.cfg.periods;
    s.courseCfg.termStart = this.data.cfg.termStart;
    s.courseCfg.totalWeeks = this.data.totalWeeks;
    this.setData({ periodsVisible: false });
    await this.persist('设置已保存');
    this.refresh();
  },

  async persist(toast) {
    const r = await store.save(this.state);
    if (!r.ok) {
      wx.showToast({ title: '保存失败：空间不足', icon: 'none' });
      return;
    }
    if (r.mode === 'cloud') wx.showToast({ title: toast + '（已同步）', icon: 'success' });
    else wx.showToast({ title: toast, icon: 'success' });
    this.buildGrid();
  },

  onShareAppMessage() {
    return { title: '我的课程表', path: '/pages/course/course' };
  }
});

function weekMatch(c, week) {
  const m = String(c.weeks || '1-20').match(/^(\d+)-(\d+)$/);
  if (m) return week >= +m[1] && week <= +m[2];
  const list = String(c.weeks || '').split(',').map(Number);
  return list.indexOf(week) >= 0;
}
