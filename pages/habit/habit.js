const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const HABIT_COLORS = ['#A2402A', '#3F6B4F', '#4A5D8A', '#8A5D3B', '#6B4A7A', '#2B6E7A'];

Page({
  data: {
    habits: [],
    heat: [],
    addVisible: false,
    formName: '',
    formType: 'check',
    formTarget: 1,
    formUnit: '',
    types: [
      { key: 'check', label: '勾选' },
      { key: 'count', label: '计数' },
      { key: 'number', label: '数值' }
    ]
  },

  onLoad() { this.state = null; },
  onShow() {
    this.refresh();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(3);
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();
    const habits = s.habits.map((h, i) => {
      const log = (h.logs && h.logs[today]) || null;
      const val = log ? log.value : 0;
      const done = h.type === 'check' ? !!log : (h.target ? val >= h.target : val > 0);
      const target = h.target || 1;
      const pct = h.type === 'check' ? (done ? 100 : 0) : Math.max(0, Math.min(100, Math.round(val / target * 100)));
      return {
        id: h.id,
        name: h.name,
        type: h.type,
        target: target,
        unit: h.unit || '',
        color: h.color || HABIT_COLORS[i % HABIT_COLORS.length],
        todayVal: val,
        done: done,
        pct: pct,
        streak: streakOf(h, today)
      };
    });
    /* 30 天热力图（含今天） */
    const heat = [];
    for (let i = 29; i >= 0; i--) {
      const d = util.addDays(today, -i);
      let cnt = 0;
      s.habits.forEach(h => {
        const log = h.logs && h.logs[d];
        if (log && (h.type === 'check' ? true : (h.target ? log.value >= h.target : log.value > 0))) cnt++;
      });
      const ratio = s.habits.length ? cnt / s.habits.length : 0;
      const pct = Math.round(ratio * 100);
      heat.push({
        date: d,
        ratio: pct,
        day: d.slice(8),
        bgcolor: pct === 0 ? '#EFEAE0' : 'rgba(162, 64, 42, ' + (0.2 + ratio * 0.8).toFixed(2) + ')'
      });
    }
    this.setData({ habits, heat });
  },

  showAdd() {
    this.setData({ addVisible: true, formName: '', formType: 'check', formTarget: 1, formUnit: '' });
  },
  hideAdd() { this.setData({ addVisible: false }); },
  onNameInput(e) { this.setData({ formName: e.detail.value }); },
  onTypeTap(e) {
    const t = e.currentTarget.dataset.t;
    this.setData({ formType: t, formTarget: t === 'check' ? 1 : this.data.formTarget });
  },
  onTargetInput(e) { this.setData({ formTarget: +e.detail.value || 1 }); },
  onUnitInput(e) { this.setData({ formUnit: e.detail.value }); },

  async saveHabit() {
    const name = this.data.formName.trim();
    if (!name) { wx.showToast({ title: '输入习惯名称', icon: 'none' }); return; }
    const s = this.state;
    s.habits.push({
      id: util.uid(),
      name: name.slice(0, 20),
      type: this.data.formType,
      target: this.data.formType === 'check' ? 1 : (this.data.formTarget || 1),
      unit: this.data.formUnit.slice(0, 6),
      color: HABIT_COLORS[s.habits.length % HABIT_COLORS.length],
      logs: {}
    });
    this.setData({ addVisible: false });
    await this.persist();
    wx.showToast({ title: '已添加', icon: 'success' });
  },

  async delHabit(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.state;
    s.habits = s.habits.filter(h => h.id !== id);
    await this.persist();
  },

  /* 打卡 */
  onCheck(e) {
    const id = e.currentTarget.dataset.id;
    const h = this.state.habits.find(x => x.id === id);
    if (!h) return;
    const today = util.todayStr();
    h.logs = h.logs || {};
    if (h.logs[today]) delete h.logs[today];
    else h.logs[today] = { value: 1 };
    this.persist();
  },
  onCountTap(e) {
    const id = e.currentTarget.dataset.id;
    const h = this.state.habits.find(x => x.id === id);
    if (!h) return;
    const today = util.todayStr();
    h.logs = h.logs || {};
    const cur = h.logs[today] ? h.logs[today].value : 0;
    const next = cur >= (h.target || 1) ? 0 : cur + 1;
    if (next === 0) delete h.logs[today];
    else h.logs[today] = { value: next };
    this.persist();
  },
  onNumInput(e) {
    const id = e.currentTarget.dataset.id;
    const h = this.state.habits.find(x => x.id === id);
    if (!h) return;
    const v = parseFloat(e.detail.value);
    const today = util.todayStr();
    h.logs = h.logs || {};
    if (!v || v <= 0) delete h.logs[today];
    else h.logs[today] = { value: v };
    /* 防抖保存 */
    clearTimeout(this._numTimer);
    this._numTimer = setTimeout(() => this.persist(), 500);
    this.refresh();
  },

  async persist() {
    const r = await store.save(this.state);
    if (!r.ok) { wx.showToast({ title: '保存失败：空间不足', icon: 'none' }); return; }
    this.refresh();
  },

  onShareAppMessage() { return { title: '习惯打卡', path: '/pages/habit/habit' }; }
});

function streakOf(h, today) {
  let streak = 0;
  let d = today;
  for (let i = 0; i < 365; i++) {
    const log = h.logs && h.logs[d];
    const done = log && (h.type === 'check' ? true : (h.target ? log.value >= h.target : log.value > 0));
    if (done) { streak++; d = util.addDays(d, -1); }
    else break;
  }
  return streak;
}
