const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const PRIOS = { high: '高', normal: '中', low: '低' };
const PRIO_LIST = [
  { key: 'high', label: '高' },
  { key: 'normal', label: '中' },
  { key: 'low', label: '低' }
];

Page({
  data: {
    todayList: [],
    groups: [],
    upcoming: 0,
    addVisible: false,
    prios: PRIO_LIST,
    form: { title: '', date: '', time: '', priority: 'normal', note: '' }
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();

    /* 逾期顺延：date < today 且未完成 → 滚到今天（不丢） */
    let rolled = false;
    s.schedule.forEach(x => {
      if (!x.done && x.date < today) {
        x.date = today;
        x.rolled = true;
        rolled = true;
      }
    });
    if (rolled) await store.save(s);

    const decorate = x => Object.assign({}, x, {
      prioText: PRIOS[x.priority] || '中',
      rolled: !!x.rolled
    });

    const todayList = s.schedule
      .filter(x => x.date === today)
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
      .map(decorate);

    /* 后续按日期分组 */
    const later = s.schedule
      .filter(x => x.date > today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

    const groups = [];
    later.forEach(x => {
      let g = groups.find(gg => gg.date === x.date);
      if (!g) {
        g = { date: x.date, week: '周' + '一二三四五六日'[util.weekdayIdx(x.date)], items: [] };
        groups.push(g);
      }
      g.items.push(decorate(x));
    });

    this.setData({
      todayList,
      groups,
      upcoming: later.length
    });
  },

  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.schedule.find(x => x.id === id);
    if (!item) return;
    item.done = !item.done;
    if (item.done) item.rolled = false;
    await this.persist();
  },

  onDel(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.schedule.find(x => x.id === id);
    wx.showModal({
      title: '删除日程',
      content: '确定删除「' + (item ? item.title : '') + '」？',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        this.state.schedule = this.state.schedule.filter(x => x.id !== id);
        await this.persist();
      }
    });
  },

  showAdd() {
    this.setData({
      addVisible: true,
      form: {
        title: '',
        date: util.todayStr(),
        time: '',
        priority: 'normal',
        note: ''
      }
    });
  },
  hideAdd() {
    this.setData({ addVisible: false });
  },
  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },
  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value });
  },
  onPrioTap(e) {
    this.setData({ 'form.priority': e.currentTarget.dataset.p });
  },

  async saveItem() {
    const f = this.data.form;
    if (!f.title.trim()) {
      wx.showToast({ title: '填个事项', icon: 'none' });
      return;
    }
    this.state.schedule.unshift({
      id: util.uid(),
      date: f.date || util.todayStr(),
      time: f.time || '',
      title: f.title.trim().slice(0, 40),
      note: (f.note || '').slice(0, 40),
      priority: f.priority,
      done: false,
      rolled: false
    });
    await this.persist();
    this.setData({ addVisible: false });
    wx.showToast({ title: '已加入日程', icon: 'success' });
  },

  async persist() {
    const r = await store.save(this.state);
    if (!r.ok) {
      wx.showToast({ title: '保存失败：空间不足', icon: 'none' });
      return;
    }
    this.refresh();
  }
});
