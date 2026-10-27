const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

/* 浙大城市学院绩点规则：绩点 =（百分制 - 50）/ 10，60 分以下记 0，保留 1 位小数 */
function scoreToPoint(score) {
  const s = Math.round(Number(score));
  if (isNaN(s) || s < 60) return 0;
  return Math.round((s - 50) / 10 * 10) / 10;
}

Page({
  data: {
    gpa: '0.0000',
    credits: 0,
    count: 0,
    terms: [],
    termFilter: 'all',
    list: [],
    addVisible: false,
    batchVisible: false,
    batchText: '',
    batchResult: null,
    defaultTerm: '',
    form: { name: '', credit: '', score: '', term: '' },
    previewPoint: '0.0'
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const s = await store.load();
    this.state = s;

    /* 全量绩点计算 */
    const all = s.gpa.map(r => {
      const point = scoreToPoint(r.score);
      return Object.assign({}, r, { point });
    });
    const totalCredit = all.reduce((a, b) => a + (+b.credit || 0), 0);
    const totalPoint = all.reduce((a, b) => a + b.point * (+b.credit || 0), 0);
    const gpa = totalCredit ? (totalPoint / totalCredit) : 0;

    const terms = [];
    s.gpa.forEach(r => {
      if (r.term && terms.indexOf(r.term) < 0) terms.push(r.term);
    });
    terms.sort().reverse();

    const filter = this.data.termFilter;
    const list = filter === 'all' ? all : all.filter(r => r.term === filter);

    this.setData({
      gpa: gpa.toFixed(4),
      credits: Math.round(totalCredit * 10) / 10,
      count: all.length,
      terms,
      list,
      defaultTerm: this.defaultTerm()
    });
  },

  /* ===== 批量导入 ===== */
  showBatch() {
    this.setData({ batchVisible: true, batchText: '', batchResult: null });
  },
  hideBatch() {
    this.setData({ batchVisible: false });
  },
  onBatchInput(e) {
    this.setData({ batchText: e.detail.value });
  },

  /* 逐行解析：课程名, 学分, 成绩, 学期（逗号/制表符/分号/多空格均可，学期可省） */
  doBatchParse() {
    const text = this.data.batchText.trim();
    if (!text) {
      wx.showToast({ title: '先粘贴内容', icon: 'none' });
      return;
    }
    const ok = [], bad = [];
    text.split(/\n/).forEach(line => {
      const t = line.trim();
      if (!t) return;
      const parts = t.replace(/[，,;；\t|]/g, ' ').split(/\s+/).filter(x => x);
      if (parts.length < 3) {
        bad.push({ line: t.slice(0, 30), reason: '至少需要 课程名/学分/成绩' });
        return;
      }
      const name = parts[0];
      const credit = parseFloat(parts[1]);
      const score = parseFloat(parts[2]);
      const term = parts[3] || this.defaultTerm();
      if (!name || name.length > 30) {
        bad.push({ line: t.slice(0, 30), reason: '课程名无效' });
        return;
      }
      if (isNaN(credit) || credit <= 0 || credit > 30) {
        bad.push({ line: t.slice(0, 30), reason: '学分无效' });
        return;
      }
      if (isNaN(score) || score < 0 || score > 100) {
        bad.push({ line: t.slice(0, 30), reason: '成绩需 0-100' });
        return;
      }
      ok.push({
        id: util.uid(),
        name: name.slice(0, 30),
        credit,
        score,
        term: String(term).slice(0, 20),
        point: scoreToPoint(score).toFixed(1)
      });
    });
    if (!ok.length && !bad.length) {
      wx.showToast({ title: '没解析到内容', icon: 'none' });
      return;
    }
    this.setData({ batchResult: { ok, bad } });
  },

  async doBatchImport() {
    const r = this.data.batchResult;
    if (!r || !r.ok.length) return;
    r.ok.forEach(c => {
      this.state.gpa.unshift({
        id: c.id,
        name: c.name,
        credit: c.credit,
        score: c.score,
        term: c.term
      });
    });
    const save = await this.persist();
    if (!save) return;
    this.setData({ batchVisible: false, batchText: '', batchResult: null });
    wx.showToast({ title: '已导入 ' + r.ok.length + ' 门', icon: 'success' });
  },

  onTermTap(e) {
    this.setData({ termFilter: e.currentTarget.dataset.t });
    this.refresh();
  },

  onDel(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.gpa.find(x => x.id === id);
    wx.showModal({
      title: '删除记录',
      content: '确定删除「' + (item ? item.name : '') + '」？',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        this.state.gpa = this.state.gpa.filter(x => x.id !== id);
        await this.persist();
      }
    });
  },

  showAdd() {
    this.setData({
      addVisible: true,
      form: { name: '', credit: '', score: '', term: this.defaultTerm() },
      previewPoint: '0.0'
    });
  },
  hideAdd() {
    this.setData({ addVisible: false });
  },

  defaultTerm() {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return m >= 8 ? y + '-' + (y + 1) + '-1' : (y - 1) + '-' + y + '-2';
  },

  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
    if (key === 'score') {
      this.setData({ previewPoint: scoreToPoint(e.detail.value).toFixed(1) });
    }
  },

  async saveGpa() {
    const f = this.data.form;
    if (!f.name.trim()) {
      wx.showToast({ title: '填课程名', icon: 'none' });
      return;
    }
    const credit = parseFloat(f.credit);
    const score = parseFloat(f.score);
    if (isNaN(credit) || credit <= 0) {
      wx.showToast({ title: '学分要大于 0', icon: 'none' });
      return;
    }
    if (isNaN(score) || score < 0 || score > 100) {
      wx.showToast({ title: '成绩填 0-100', icon: 'none' });
      return;
    }
    this.state.gpa.unshift({
      id: util.uid(),
      name: f.name.trim().slice(0, 30),
      credit,
      score,
      term: f.term.trim() || this.defaultTerm()
    });
    await this.persist();
    this.setData({ addVisible: false });
    wx.showToast({ title: '已录入', icon: 'success' });
  },

  async persist() {
    const r = await store.save(this.state);
    if (!r.ok) {
      wx.showToast({ title: '保存失败：空间不足', icon: 'none' });
      return false;
    }
    this.refresh();
    return true;
  }
});
