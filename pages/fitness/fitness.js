const store = require('../../utils/store.js');
const util = require('../../utils/util.js');

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const ACTIVITY_TEXT = { 1.2: '久坐', 1.375: '轻度活动', 1.55: '中度活动', 1.725: '高强度' };

Page({
  data: {
    DAYS,
    entries: [],
    latest: {},
    bmi: '—',
    bmiLevel: '',
    tdee: '—',
    gap: '—',
    goalPct: 0,
    goalWeight: 65,
    todayIdx: 0,
    weekPlan: [[], [], [], [], [], [], []],
    inputs: ['', '', '', '', '', '', ''],
    todayIntake: '',
    todayBurn: '',
    addVisible: false,
    form: { weight: '', fat: '' }
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    const s = await store.load();
    this.state = s;
    const today = util.todayStr();
    const todayIdx = util.weekdayIdx(today);

    const entries = (s.fitness.entries || []).slice(-30);
    const latest = entries.length ? entries[entries.length - 1] : {};

    /* BMI（中国标准分级） */
    let bmi = '—', bmiLevel = '';
    if (latest.weight && s.fitness.height) {
      const h = s.fitness.height / 100;
      bmi = (latest.weight / (h * h)).toFixed(1);
      bmiLevel = bmi < 18.5 ? '偏瘦' : bmi < 24 ? '正常' : bmi < 28 ? '超重' : '肥胖';
    }

    /* BMR / TDEE（Mifflin-St Jeor） */
    let tdee = '—', gap = '—';
    const f = s.fitness;
    if (latest.weight && f.height && f.age) {
      const bmr = f.gender === 'm'
        ? 10 * latest.weight + 6.25 * f.height - 5 * f.age + 5
        : 10 * latest.weight + 6.25 * f.height - 5 * f.age - 161;
      tdee = Math.round(bmr * (f.activity || 1.375));
      const diff = tdee - (f.goalWeight || latest.weight) * 22;
      gap = Math.max(0, Math.round(diff));
    }

    /* 目标进度 */
    let goalPct = 0;
    if (f.goalWeight && entries.length >= 1 && f.entries.length) {
      const first = f.entries[0].weight;
      const cur = latest.weight;
      const total = first - f.goalWeight;
      goalPct = total ? Math.max(0, Math.min(100, Math.round((first - cur) / total * 100))) : 0;
    }

    /* 周计划 */
    const plan = f.plan || {};
    const weekPlan = [];
    for (let i = 0; i < 7; i++) weekPlan.push(plan[String(i)] || []);

    /* 今日摄入/消耗 */
    const daily = (f.daily || {})[today] || {};

    this.setData({
      entries,
      latest,
      bmi, bmiLevel, tdee, gap,
      goalPct,
      goalWeight: f.goalWeight || 0,
      todayIdx,
      weekPlan,
      todayIntake: daily.intake != null ? String(daily.intake) : '',
      todayBurn: daily.burn != null ? String(daily.burn) : ''
    });
    this.drawChart(entries);
  },

  onReady() {
    this.chartReady = true;
    this.drawChart(this.data.entries);
  },

  drawChart(entries) {
    if (!this.chartReady || entries.length < 2) return;
    const q = wx.createSelectorQuery().in(this);
    q.select('#fit-canvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2) || 2;
      const w = res[0].width, h = res[0].height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const vals = entries.map(e => e.weight);
      const min = Math.min.apply(null, vals) - 0.5;
      const max = Math.max.apply(null, vals) + 0.5;
      const padL = 16, padR = 16, padT = 20, padB = 28;
      const iw = w - padL - padR, ih = h - padT - padB;

      /* 网格线：3 条 */
      ctx.strokeStyle = '#DAD4C6';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const y = padT + ih * i / 3;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }

      /* 折线 */
      ctx.strokeStyle = '#A4332B';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = padL + iw * (vals.length === 1 ? 0.5 : i / (vals.length - 1));
        const y = padT + ih * (1 - (v - min) / (max - min));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      /* 数据点 + 末值标注 */
      ctx.fillStyle = '#A4332B';
      vals.forEach((v, i) => {
        const x = padL + iw * (vals.length === 1 ? 0.5 : i / (vals.length - 1));
        const y = padT + ih * (1 - (v - min) / (max - min));
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#22201C';
      ctx.font = '600 20px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      const lx = padL + iw, ly = padT + ih * (1 - (vals[vals.length - 1] - min) / (max - min));
      ctx.fillText(vals[vals.length - 1] + 'kg', lx, ly - 12);
    });
  },

  onIntake(e) {
    const v = parseFloat(e.detail.value) || 0;
    this.saveDaily({ intake: v });
  },
  onBurn(e) {
    const v = parseFloat(e.detail.value) || 0;
    this.saveDaily({ burn: v });
  },
  async saveDaily(patch) {
    const today = util.todayStr();
    const f = this.state.fitness;
    f.daily = f.daily || {};
    f.daily[today] = Object.assign({}, f.daily[today], patch);
    await this.persist();
  },

  onPlanInput(e) {
    const day = e.currentTarget.dataset.day;
    const inputs = this.data.inputs.slice();
    inputs[day] = e.detail.value;
    this.setData({ inputs });
  },

  async addPlan(e) {
    const day = e.currentTarget.dataset.day;
    const v = (this.data.inputs[day] || '').trim();
    if (!v) return;
    const f = this.state.fitness;
    f.plan = f.plan || {};
    f.plan[String(day)] = f.plan[String(day)] || [];
    f.plan[String(day)].push({ id: util.uid(), name: v.slice(0, 20) });
    const inputs = this.data.inputs.slice();
    inputs[day] = '';
    this.setData({ inputs });
    await this.persist();
  },

  async delPlan(e) {
    const day = String(e.currentTarget.dataset.day);
    const id = e.currentTarget.dataset.id;
    const f = this.state.fitness;
    if (!f.plan || !f.plan[day]) return;
    f.plan[day] = f.plan[day].filter(x => x.id !== id);
    await this.persist();
  },

  showWeight() {
    this.setData({
      addVisible: true,
      form: { weight: '', fat: '' }
    });
  },
  hideAdd() {
    this.setData({ addVisible: false });
  },
  onFormInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },

  async saveEntry() {
    const f = this.data.form;
    const weight = parseFloat(f.weight);
    if (isNaN(weight) || weight <= 0) {
      wx.showToast({ title: '体重填个数', icon: 'none' });
      return;
    }
    this.state.fitness.entries.push({
      date: util.todayStr(),
      weight,
      fat: parseFloat(f.fat) || 0
    });
    await this.persist();
    this.setData({ addVisible: false });
    wx.showToast({ title: '已记录', icon: 'success' });
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
