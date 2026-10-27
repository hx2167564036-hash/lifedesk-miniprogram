const nlu = require('../../utils/nlu.js');

const TYPE_LABEL = {
  schedule: '日程',
  homework: '作业',
  account: '记账',
  shopping: '待买',
  habit: '打卡',
  unknown: '未识别'
};

Component({
  properties: {},
  data: {
    visible: false,
    text: '',
    parsed: null
  },
  methods: {
    show() {
      this.setData({ visible: true, text: '', parsed: null });
    },
    hide() {
      this.setData({ visible: false });
    },
    onInput(e) {
      const text = e.detail.value;
      this.setData({ text });
      if (text.trim()) {
        const r = nlu.parse(text);
        this.setData({
          parsed: {
            type: r.type,
            label: TYPE_LABEL[r.type] || '未识别',
            preview: previewOf(r),
            raw: r
          }
        });
      } else {
        this.setData({ parsed: null });
      }
    },
    onCancel() {
      this.triggerEvent('cancel');
      this.hide();
    },
    onConfirm() {
      const r = this.data.parsed && this.data.parsed.raw;
      if (!r || r.type === 'unknown') {
        wx.showToast({ title: '换个说法试试', icon: 'none' });
        return;
      }
      this.triggerEvent('confirm', r);
      this.hide();
    },
    onMaskTap() {
      this.hide();
    }
  }
});

function previewOf(r) {
  const d = r.data || {};
  switch (r.type) {
    case 'schedule':
      return d.date.slice(5).replace('-', '月') + '日' + (d.time ? ' ' + d.time : '') + ' · ' + d.title;
    case 'homework':
      return '截止 ' + d.deadline.replace(' 23:59', '') + ' · ' + d.title;
    case 'account':
      return (d.type === 'in' ? '收入 +' : '支出 -') + '¥' + d.amount + ' · ' + d.note;
    case 'shopping':
      return '待买 · ' + d.name + (d.est ? '（约 ¥' + d.est + '）' : '');
    case 'habit':
      return '打卡 · ' + d.name;
    default:
      return '示例：明天下午三点 高数小组讨论 / 记一笔 午饭 15 / 高数作业 周五交';
  }
}
