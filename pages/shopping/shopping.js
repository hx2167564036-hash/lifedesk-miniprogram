const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const CATS = ['日用', '数码', '书籍', '衣物', '食材', '其他'];

Page({
  data: {
    list: [],
    todoCount: 0,
    doneCount: 0,
    estTotal: '¥0',
    filter: 'todo',
    cats: CATS,
    catIdx: 0,
    addVisible: false,
    form: { name: '', est: '' }
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const s = await store.load();
    this.state = s;

    const todo = s.shopping.filter(x => !x.bought);
    const done = s.shopping.filter(x => x.bought);
    const estTotal = todo.reduce((a, b) => a + (+b.est || 0), 0);

    const filter = this.data.filter;
    const list = filter === 'todo' ? todo
      : filter === 'done' ? done
      : s.shopping.slice();

    this.setData({
      list,
      todoCount: todo.length,
      doneCount: done.length,
      estTotal: '¥' + estTotal.toFixed(0)
    });
  },

  onFilterTap(e) {
    this.setData({ filter: e.currentTarget.dataset.f });
    this.refresh();
  },

  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.shopping.find(x => x.id === id);
    if (!item) return;
    item.bought = !item.bought;
    await this.persist();
  },

  onDel(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.shopping.find(x => x.id === id);
    wx.showModal({
      title: '删除',
      content: '确定删除「' + (item ? item.name : '') + '」？',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        this.state.shopping = this.state.shopping.filter(x => x.id !== id);
        await this.persist();
      }
    });
  },

  clearDone() {
    const n = this.state.shopping.filter(x => x.bought).length;
    if (!n) return;
    wx.showModal({
      title: '清除已买',
      content: '将移除 ' + n + ' 条已购记录，确定？',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        this.state.shopping = this.state.shopping.filter(x => !x.bought);
        await this.persist();
        wx.showToast({ title: '已清除', icon: 'success' });
      }
    });
  },

  showAdd() {
    this.setData({
      addVisible: true,
      catIdx: 0,
      form: { name: '', est: '' }
    });
  },
  hideAdd() {
    this.setData({ addVisible: false });
  },
  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },
  onCatChange(e) {
    this.setData({ catIdx: +e.detail.value });
  },

  async saveItem() {
    const f = this.data.form;
    if (!f.name.trim()) {
      wx.showToast({ title: '填个名称', icon: 'none' });
      return;
    }
    this.state.shopping.unshift({
      id: util.uid(),
      name: f.name.trim().slice(0, 40),
      category: CATS[this.data.catIdx],
      est: parseFloat(f.est) || 0,
      bought: false
    });
    await this.persist();
    this.setData({ addVisible: false });
    wx.showToast({ title: '已加入清单', icon: 'success' });
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
