const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const TYPES = [
  { key: 'book', label: '书' },
  { key: 'movie', label: '电影' },
  { key: 'tv', label: '剧' },
  { key: 'music', label: '音乐' }
];
const STATUSES = [
  { key: 'done', label: '看完' },
  { key: 'doing', label: '在看' },
  { key: 'todo', label: '想看' }
];
const TYPE_TEXT = { book: '书', movie: '电影', tv: '剧', music: '音乐' };
const STATUS_TEXT = { done: '看完', doing: '在看', todo: '想看' };

Page({
  data: {
    view: 'wall',
    list: [],
    stats: { done: 0, doing: 0, todo: 0, year: 0 },
    types: TYPES,
    statuses: STATUSES,
    detailVisible: false,
    form: { isNew: true, id: '', title: '', type: 'book', status: 'todo', rating: 0, review: '' }
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const year = util.todayStr().slice(0, 4);

    const list = s.media.slice().reverse().map(x => Object.assign({}, x, {
      typeText: TYPE_TEXT[x.type] || '其他',
      statusText: STATUS_TEXT[x.status] || '想看',
      starText: x.rating ? '★'.repeat(x.rating) + '☆'.repeat(5 - x.rating) : '未评分',
      initial: (x.title || '?').slice(0, 1)
    }));

    this.setData({
      list,
      stats: {
        done: s.media.filter(x => x.status === 'done').length,
        doing: s.media.filter(x => x.status === 'doing').length,
        todo: s.media.filter(x => x.status === 'todo').length,
        year: s.media.filter(x => (x.date || '').slice(0, 4) === year).length
      }
    });
  },

  onViewTap(e) {
    this.setData({ view: e.currentTarget.dataset.v });
  },

  onTileTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.media.find(x => x.id === id);
    if (!item) return;
    this.setData({
      detailVisible: true,
      form: {
        isNew: false,
        id: item.id,
        title: item.title,
        type: item.type || 'book',
        status: item.status || 'todo',
        rating: item.rating || 0,
        review: item.review || ''
      }
    });
  },

  showAdd() {
    this.setData({
      detailVisible: true,
      form: { isNew: true, id: '', title: '', type: 'book', status: 'todo', rating: 0, review: '' }
    });
  },
  hideDetail() {
    this.setData({ detailVisible: false });
  },
  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },
  onTypeTap(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.t });
  },
  onStatusTap(e) {
    this.setData({ 'form.status': e.currentTarget.dataset.s });
  },
  onStarTap(e) {
    this.setData({ 'form.rating': +e.currentTarget.dataset.r });
  },

  async saveItem() {
    const f = this.data.form;
    if (!f.title.trim()) {
      wx.showToast({ title: '填个标题', icon: 'none' });
      return;
    }
    if (f.isNew) {
      this.state.media.push({
        id: util.uid(),
        type: f.type,
        title: f.title.trim().slice(0, 40),
        status: f.status,
        rating: f.rating,
        review: (f.review || '').slice(0, 60),
        cover: '',
        date: util.todayStr()
      });
    } else {
      const item = this.state.media.find(x => x.id === f.id);
      if (item) {
        item.title = f.title.trim().slice(0, 40);
        item.type = f.type;
        item.status = f.status;
        item.rating = f.rating;
        item.review = (f.review || '').slice(0, 60);
      }
    }
    await this.persist();
    this.setData({ detailVisible: false });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  delItem() {
    const f = this.data.form;
    wx.showModal({
      title: '删除',
      content: '确定删除「' + f.title + '」？',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        this.state.media = this.state.media.filter(x => x.id !== f.id);
        await this.persist();
        this.setData({ detailVisible: false });
      }
    });
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
