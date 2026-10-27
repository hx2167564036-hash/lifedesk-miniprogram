/* 数据来源：MOCK 为占位；替换点 = store.load() 后按同名字段 setData */
const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const MOCK = {
  storeMode: '本地模式',
  indexScore: 64,
  parts: { habit: '4 / 4', sched: '3 / 5', acct: '2 笔' },
  advisorNote: '「保研材料」已逾期 2 天，建议上午处理；下午 3 节连上，记得带笔记本。',
  tasks: [
    { no: '01', title: '高等数学 · 教三-101', sub: '第 1-2 节 · 08:00-09:35', tag: '课程' },
    { no: '02', title: '大学英语 · 教一-205', sub: '第 3-4 节 · 09:50-11:25', tag: '课程' },
    { no: '03', title: '保研材料提交', sub: '原定 10-12 · 已顺延', overdue: true },
    { no: '04', title: '小组讨论 · 图书馆', sub: '18:00 · 中等优先级', today: true },
    { no: '05', title: '高数作业 第 3 章', sub: '截止 10-16 23:59', tag: '作业' }
  ],
  entries: [
    { idx: 'A1', page: 'account', name: '记账', desc: '本月 ¥1,286.50 · 预算 ¥2,000' },
    { idx: 'A2', page: 'habit', name: '习惯', desc: '4 项进行中 · 连续 12 天' },
    { idx: 'A3', page: 'course', name: '课程', desc: '本周 18 节 · 今日 2 节' },
    { idx: 'A4', page: 'fitness', name: '健身', desc: '本周训练 3/5 · 体重 65.2kg' },
    { idx: 'A5', page: 'schedule', name: '日程', desc: '今日 3 项待办' },
    { idx: 'A6', page: 'mine', name: '我的', desc: '数据 · 同步 · 设置' }
  ],
  stats: { expense: '¥1,286.50', streak: '12 天', homework: '3 项' }
};

Page({
  data: MOCK,

  onLoad() {
    this.state = null;
    this.ringDrawn = false;
  },

  onShow() {
    this.refresh();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(0);
  },

  onReady() {
    this.ringDrawn = true;
    this.drawRing(this.data.indexScore);
  },

  /* 替换点：以下为真实数据链路（MOCK → store），接入后删除注释保留逻辑 */
  async refresh() {
    /* store.load 首次自动初始化（空数据起步，无演示数据） */
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();
    const todayIdx = util.weekdayIdx(today);

    /* 今日课程 */
    const todayCourses = s.courses
      .filter(c => c.day === todayIdx)
      .sort((a, b) => a.start - b.start);

    /* 任务清单：今日课程 + 顺延/今日日程 + 临期作业 */
    const tasks = [];
    let no = 1;
    todayCourses.forEach(c => {
      const p = s.courseCfg.periods[c.start - 1];
      tasks.push({
        no: String(no++).padStart(2, '0'),
        title: c.name + (c.location ? ' · ' + c.location : ''),
        sub: '第 ' + c.start + '-' + c.end + ' 节' + (p ? ' · ' + p.start : ''),
        tag: '课程'
      });
    });
    s.schedule.filter(x => x.date === today || x.rolled).forEach(x => {
      tasks.push({
        no: String(no++).padStart(2, '0'),
        title: x.title,
        sub: (x.time ? x.time + ' · ' : '') + (x.rolled ? '原定 ' + x.date + ' 已顺延' : '今日'),
        overdue: x.rolled && x.date < today,
        today: !x.rolled
      });
    });
    s.homework.filter(x => !x.done).slice(0, 2).forEach(x => {
      tasks.push({
        no: String(no++).padStart(2, '0'),
        title: x.title,
        sub: '截止 ' + x.deadline.replace(' 23:59', ''),
        tag: '作业'
      });
    });

    /* 指数与统计 */
    const habitTotal = s.habits.length;
    const habitDone = s.habits.filter(x => x.logs && x.logs[today]).length;
    const schedAll = s.schedule.filter(x => x.date === today || x.rolled);
    const schedDone = schedAll.filter(x => x.done).length;
    const acctToday = s.account.records.filter(r => r.date === today).length;
    const habitRate = habitTotal ? habitDone / habitTotal : 0;
    const schedRate = schedAll.length ? schedDone / schedAll.length : 1;
    const indexScore = Math.round(habitRate * 40 + schedRate * 35 + (acctToday ? 1 : 0) * 25);

    const month = today.slice(0, 7);
    const monthOut = s.account.records
      .filter(r => r.type === 'out' && r.date.slice(0, 7) === month)
      .reduce((a, b) => a + b.amount, 0);
    const streak = this.streakOf(s, today);

    this.setData({
      storeMode: store.mode() === 'cloud' ? '云端同步' : '本地模式',
      indexScore,
      parts: {
        habit: habitDone + ' / ' + habitTotal,
        sched: schedDone + ' / ' + schedAll.length,
        acct: acctToday + ' 笔'
      },
      advisorNote: this.advisorNote(s, tasks, today),
      tasks: tasks.slice(0, 5),
      'entries[0].desc': '本月 ¥' + monthOut.toFixed(2) + ' · 预算 ¥' + s.account.budget,
      'entries[2].desc': '本周 ' + this.weekCourses(s, today) + ' 节 · 今日 ' + todayCourses.length + ' 节',
      stats: {
        expense: '¥' + Math.round(monthOut),
        streak: streak + ' 天',
        homework: s.homework.filter(x => !x.done).length + ' 项'
      }
    });
    if (this.ringDrawn) this.drawRing(indexScore);
  },

  streakOf(s, today) {
    let n = 0;
    const d = new Date(today + 'T00:00:00');
    for (;;) {
      const key = util.fmtDate(d);
      const done = s.habits.length && s.habits.every(h => h.logs && h.logs[key]);
      if (!done) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  },

  weekCourses(s, today) {
    return s.courses.length;
  },

  advisorNote(s, tasks, today) {
    const hasAny = s.courses.length || s.homework.length || s.account.records.length || s.habits.length || s.schedule.length;
    if (!hasAny) return '欢迎使用。先去「课程表」导入课表，或点右下角说一句话记账——所有数据只存在你的账号下。';
    const overdue = tasks.find(t => t.overdue);
    if (overdue) return '「' + overdue.title + '」尚未完成，建议优先处理。';
    const hw = s.homework.filter(x => !x.done && util.daysLeft(x.deadline) <= 1)[0];
    if (hw) return '「' + hw.title + '」临近截止，注意时间。';
    return '今日事项都在掌控中，保持节奏。';
  },

  drawRing(score) {
    const q = wx.createSelectorQuery().in(this);
    q.select('#focus-ring').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2) || 2;
      const size = res[0].width;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.scale(dpr, dpr);
      const cx = size / 2, cy = size / 2, r = size / 2 - 10;
      ctx.clearRect(0, 0, size, size);
      ctx.lineWidth = 10;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#DAD4C6';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#A4332B';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100);
      ctx.stroke();
    });
  },

  onEntryTap(e) {
    const page = e.currentTarget.dataset.page;
    const tabs = { index: 1, course: 1, account: 1, habit: 1, mine: 1 };
    const url = '/pages/' + page + '/' + page;
    if (tabs[page]) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  /* ===== 智能收集箱 ===== */
  openQuickAdd() {
    this.selectComponent('#quickadd').show();
  },
  onQuickCancel() {},
  async onQuickConfirm(e) {
    const r = e.detail;
    if (!r || r.type === 'unknown') return;
    const s = this.state;
    if (!s) return;
    switch (r.type) {
      case 'account':
        s.account.records.unshift(r.data);
        break;
      case 'schedule':
        s.schedule.unshift(r.data);
        break;
      case 'homework':
        s.homework.unshift(r.data);
        break;
      case 'shopping':
        s.shopping.unshift(r.data);
        break;
      case 'habit': {
        const name = r.data.name;
        let h = s.habits.find(x => x.name.indexOf(name) >= 0 || name.indexOf(x.name) >= 0);
        if (!h) {
          h = { id: util.uid(), name: name, type: 'check', target: 1, unit: '', color: '', logs: {} };
          s.habits.push(h);
        }
        h.logs = h.logs || {};
        h.logs[util.todayStr()] = { value: 1 };
        break;
      }
      default:
        return;
    }
    const res = await store.save(s);
    if (!res.ok) {
      wx.showToast({ title: '保存失败：空间不足', icon: 'none' });
      return;
    }
    wx.showToast({ title: r.toast || '已加入', icon: 'success' });
    this.refresh();
  }
});
