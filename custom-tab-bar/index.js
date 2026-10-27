Component({
  data: {
    selected: 0,
    list: [
      { url: '/pages/index/index', text: '今天' },
      { url: '/pages/course/course', text: '课程' },
      { url: '/pages/account/account', text: '记账' },
      { url: '/pages/habit/habit', text: '习惯' },
      { url: '/pages/mine/mine', text: '我的' }
    ]
  },
  methods: {
    onTap(e) {
      const url = e.currentTarget.dataset.url;
      wx.switchTab({ url });
    },
    setSelected(i) {
      if (this.data.selected !== i) this.setData({ selected: i });
    }
  }
});
