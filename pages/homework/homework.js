const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

Page({
  data: {
    list: [],
    pending: 0,
    overdueCount: 0,
    nearest: '—',
    filter: 'todo',
    addVisible: false,
    courseNames: [],
    courseIdx: 0,
    form: { title: '', courseId: '', date: '', time: '23:59' }
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();

    /* 课程名列表（供关联选择） */
    const courseNames = s.courses.map(c => c.name);
    const courseId = this.data.form.courseId || (s.courses[0] && s.courses[0].id) || '';

    /* 渲染列表：补 courseName / 剩余天数 / 戳 */
    const all = s.homework.map(x => {
      const left = util.daysLeft(x.deadline);
      const course = s.courses.find(c => c.id === x.courseId);
      let stampCls = 'ok', stampText = '';
      if (x.done) {
        stampCls = 'done';
        stampText = '已完成';
      } else if (left < 0) {
        stampCls = 'danger';
        stampText = '逾期 ' + Math.abs(left) + ' 天';
      } else if (left === 0) {
        stampCls = 'danger';
        stampText = '今日截止';
      } else if (left === 1) {
        stampCls = 'warn';
        stampText = '明日截止';
      } else {
        stampText = '剩 ' + left + ' 天';
      }
      return Object.assign({}, x, {
        courseName: course ? course.name : '未关联',
        stampCls, stampText, left
      });
    });

    /* 排序：未完成在前，按截止时间升序 */
    all.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.deadline || '').localeCompare(b.deadline || '');
    });

    const pending = all.filter(x => !x.done);
    const overdueCount = pending.filter(x => x.left < 0).length;
    const next = pending.filter(x => x.left >= 0).sort((a, b) => a.left - b.left)[0];
    const nearest = next ? (next.left === 0 ? '今天' : next.left + ' 天') : (overdueCount ? '已逾期' : '—');

    const filter = this.data.filter;
    const list = filter === 'todo' ? all.filter(x => !x.done)
      : filter === 'done' ? all.filter(x => x.done)
      : all;

    this.setData({
      list,
      pending: pending.length,
      overdueCount,
      nearest,
      courseNames,
      'form.courseId': courseId
    });
  },

  onFilterTap(e) {
    this.setData({ filter: e.currentTarget.dataset.f });
    this.refresh();
  },

  async onToggle(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.homework.find(x => x.id === id);
    if (!item) return;
    item.done = !item.done;
    await this.persist();
  },

  onDel(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.state.homework.find(x => x.id === id);
    wx.showModal({
      title: '删除作业',
      content: '确定删除「' + (item ? item.title : '') + '」？',
      confirmColor: '#A4332B',
      success: async (res) => {
        if (!res.confirm) return;
        this.state.homework = this.state.homework.filter(x => x.id !== id);
        await this.persist();
      }
    });
  },

  showAdd() {
    this.setData({
      addVisible: true,
      form: {
        title: '',
        courseId: this.state.courses[0] ? this.state.courses[0].id : '',
        date: util.addDays(util.todayStr(), 7),
        time: '23:59'
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
  onCourseChange(e) {
    const idx = +e.detail.value;
    this.setData({
      courseIdx: idx,
      'form.courseId': this.state.courses[idx] ? this.state.courses[idx].id : ''
    });
  },
  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  async saveHw() {
    const f = this.data.form;
    if (!f.title.trim()) {
      wx.showToast({ title: '填个标题', icon: 'none' });
      return;
    }
    if (!f.date) {
      wx.showToast({ title: '选个截止日期', icon: 'none' });
      return;
    }
    const deadline = f.date + ' ' + (f.time || '23:59');
    this.state.homework.unshift({
      id: util.uid(),
      courseId: f.courseId,
      title: f.title.trim().slice(0, 40),
      deadline,
      priority: 'normal',
      done: false,
      note: ''
    });
    await this.persist();
    this.setData({ addVisible: false });
    wx.showToast({ title: '已加入作业', icon: 'success' });
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
