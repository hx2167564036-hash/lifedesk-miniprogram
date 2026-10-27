const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const CATS = ['食材', '书籍', '数码', '衣物', '交通', '日用', '娱乐', '其他'];

Page({
  data: {
    type: 'out',
    amount: '',
    cat: '食材',
    note: '',
    date: '',
    budget: 1500,
    monthOut: 0,
    monthIn: 0,
    budgetPct: 0,
    lastMonthOut: 0,
    diffText: '',
    filter: 'all',
    cats: CATS,
    catStats: [],
    records: [],
    toastItem: null
  },

  onLoad() { this.state = null; },
  onShow() {
    this.refresh();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setSelected(2);
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();
    const ym = today.slice(0, 7);
    const lastYm = ym === '2026-01' ? '2025-12' : (+ym.slice(5, 7) > 1 ? ym.slice(0, 5) + util.pad(+ym.slice(5, 7) - 1) : ym);
    const recs = s.account.records || [];
    const monthRecs = recs.filter(r => r.date.slice(0, 7) === ym);
    const lastRecs = recs.filter(r => r.date.slice(0, 7) === lastYm);
    const monthOut = sum(monthRecs.filter(r => r.type === 'out'));
    const monthIn = sum(monthRecs.filter(r => r.type === 'in'));
    const lastMonthOut = sum(lastRecs.filter(r => r.type === 'out'));
    const budget = s.account.budget || 0;
    /* 分类结构（本月支出） */
    const byCat = {};
    monthRecs.filter(r => r.type === 'out').forEach(r => { byCat[r.cat || '其他'] = (byCat[r.cat || '其他'] || 0) + r.amount; });
    const catStats = Object.keys(byCat).map(k => ({ name: k, value: byCat[k], pct: monthOut ? Math.round(byCat[k] / monthOut * 100) : 0 })).sort((a, b) => b.value - a.value);
    /* 筛选列表 */
    const filter = this.data.filter;
    const records = (filter === 'all' ? monthRecs : monthRecs.filter(r => r.cat === filter))
      .slice().sort((a, b) => (b.date + (b.note || '')).localeCompare(a.date + (a.note || '')))
      .map(r => ({ id: r.id, type: r.type, amount: r.amount, cat: r.cat, note: r.note, date: r.date }));
    /* 月度对比 */
    let diffText = '';
    if (lastMonthOut > 0) {
      const pct = Math.round((monthOut - lastMonthOut) / lastMonthOut * 100);
      diffText = pct >= 0 ? '较上月同期多花 ' + pct + '%' : '较上月同期少花 ' + Math.abs(pct) + '%';
    } else {
      diffText = '上月同期无记录';
    }
    this.setData({
      date: today, budget, monthOut, monthIn,
      budgetPct: budget ? Math.min(100, Math.round(monthOut / budget * 100)) : 0,
      budgetLeft: (budget - monthOut).toFixed(2),
      lastMonthOut, diffText, catStats, records,
      storeMode: store.mode()
    });
  },

  onTypeTap(e) { this.setData({ type: e.currentTarget.dataset.t }); },
  onCatTap(e) { this.setData({ cat: e.currentTarget.dataset.c }); },
  onAmount(e) { this.setData({ amount: e.detail.value }); },
  onNote(e) { this.setData({ note: e.detail.value }); },
  onDateChange(e) { this.setData({ date: e.detail.value }); },
  onFilterTap(e) { this.setData({ filter: e.currentTarget.dataset.f }); this.refresh(); },

  async onSubmit() {
    const amount = parseFloat(this.data.amount);
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' });
      return;
    }
    const s = this.state;
    s.account.records.unshift({
      id: util.uid(),
      type: this.data.type,
      amount: Math.round(amount * 100) / 100,
      cat: this.data.type === 'in' ? '收入' : this.data.cat,
      note: (this.data.note || '').slice(0, 40),
      date: this.data.date || util.todayStr()
    });
    const r = await store.save(s);
    if (!r.ok) { wx.showToast({ title: '保存失败：空间不足', icon: 'none' }); return; }
    this.setData({ amount: '', note: '' });
    wx.showToast({ title: '已记录', icon: 'success' });
    this.refresh();
  },

  async onBudgetInput(e) {
    const v = parseFloat(e.detail.value);
    this.state.account.budget = isNaN(v) ? 0 : v;
    const r = await store.save(this.state); /* 先落库再刷新，否则会被云端数据覆盖 */
    if (!r.ok) {
      wx.showToast({ title: '保存失败：空间不足', icon: 'none' });
      return;
    }
    this.refresh();
  },

  onDel(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.state;
    const idx = s.account.records.findIndex(r => r.id === id);
    if (idx < 0) return;
    const removed = s.account.records[idx];
    wx.showModal({
      title: '删除记录',
      content: '确定删除「' + (removed.note || removed.cat || '这条记录') + '」？',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        /* 确认后再删、删了再存、存了再刷新（顺序反了会被云端数据覆盖） */
        const idx2 = s.account.records.findIndex(r => r.id === id);
        if (idx2 < 0) return;
        s.account.records.splice(idx2, 1);
        const r = await store.save(s);
        if (!r.ok) {
          wx.showToast({ title: '删除失败：空间不足', icon: 'none' });
          return;
        }
        this.refresh();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  onShareAppMessage() { return { title: '记账', path: '/pages/account/account' }; }
});

function sum(arr) {
  return Math.round(arr.reduce((a, b) => a + b.amount, 0) * 100) / 100;
}
