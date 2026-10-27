/*
 * 本地规则解析引擎（nlu）：自然语言 → 结构化记录
 * 不依赖任何外部服务；预留 AI 升级位（正式企业主体后可换云端大模型）。
 * 返回 {type, data, toast}，type: 'schedule'|'homework'|'account'|'shopping'|'habit'|'unknown'
 */
const util = require('./util.js');

/* ---------- 日期解析 → 'YYYY-MM-DD' ---------- */
function parseDate(t, base) {
  const today = base || new Date();
  const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate();
  const wd = today.getDay(); /* 0=周日 */

  let r;
  if ((r = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/))) return y + '-' + util.pad(+r[1]) + '-' + util.pad(+r[2]);
  if ((r = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return r[1] + '-' + util.pad(+r[2]) + '-' + util.pad(+r[3]);
  if (/大后天/.test(t)) return util.addDays(util.fmtDate(today), 3);
  if (/后天/.test(t)) return util.addDays(util.fmtDate(today), 2);
  if (/明天|明日/.test(t)) return util.addDays(util.fmtDate(today), 1);
  if (/今天|今晚|今日|现在/.test(t)) return util.fmtDate(today);
  const wm = t.match(/(下?下?周|星期|礼拜)([一二三四五六日天])/);
  if (wm) {
    /* '日一二三四五六'.indexOf → 0=周日 1=周一 … 6=周六，与 JS getDay() 对齐 */
    const target = '日一二三四五六'.indexOf(wm[2]);
    let diff = (target - wd + 7) % 7;
    if (diff === 0) diff = 7;
    if (wm[1].indexOf('下') === 0) diff += 7;
    return util.addDays(util.fmtDate(today), diff);
  }
  const rm = t.match(/(\d+)\s*天[后以之]?后/);
  if (rm) return util.addDays(util.fmtDate(today), +rm[1]);
  return null;
}

/* ---------- 时间解析 → 'HH:MM' 或 '' ---------- */
/* 单位数中文数字显式映射（小时用）：三→3、两→2、十→10；十位以上走 cnNum */
const CN_NUM = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
function toNum(s) {
  if (/^\d+$/.test(s)) return +s;
  if (s.length === 1 && s in CN_NUM) return CN_NUM[s];
  if (/^十[一二三四五六七八九]$/.test(s)) return 10 + CN_NUM[s[1]]; /* 十二 → 12 */
  return cnNum(s);
}
/* 「X刻」→ 分钟：一刻 15、二刻 30、三刻 45 */
function quarterMin(s) {
  return { '一刻': 15, '二刻': 30, '三刻': 45 }[s] || 0;
}
/* 时段数字字符类：阿拉伯 + 中文（含两/十） */
const NUM = '[\\d零一二两三四五六七八九十]{1,3}';
/* 分钟独立抽取：半点 / X刻 / X分（中文数字，覆盖「十五」「二十」「五」三种结构） */
function parseMinute(t) {
  if (/[点時时]\s*半/.test(t)) return 30;
  const q = t.match(/[点時时]\s*(一刻|二刻|三刻)/);
  if (q) return quarterMin(q[1]);
  const fm = t.match(/[点時时]\s*((十[一二三四五六七八九]?)|([一二三四五六七八九]十[一二三四五六七八九]?)|([一二三四五六七八九])|\d{1,2})\s*分?/);
  if (fm) return toNum(fm[1].replace(/\s/g, ''));
  return 0;
}
function parseTime(t) {
  let r;
  if ((r = t.match(/(\d{1,2}):(\d{2})/))) return util.pad(+r[1] % 24) + ':' + r[2];
  if ((r = t.match(new RegExp('(上午|早上|凌晨)\\s*(' + NUM + ')\\s*[点時时]')))) {
    return util.pad(toNum(r[2]) % 12) + ':' + util.pad(parseMinute(t));
  }
  if ((r = t.match(new RegExp('(下午|晚上|午后)\\s*(' + NUM + ')\\s*[点時时]')))) {
    const n = toNum(r[2]);
    const h = n === 12 ? 0 : (n % 12) + 12; /* 晚上十二点 = 午夜 00:00 */
    return util.pad(h) + ':' + util.pad(parseMinute(t));
  }
  if ((r = t.match(new RegExp('(' + NUM + ')\\s*[点時时]')))) {
    return util.pad(toNum(r[1])) + ':' + util.pad(parseMinute(t));
  }
  return '';
}
function cnNum(s) {
  const map = { '一': 10, '两': 20, '二': 20, '三': 30, '四': 40, '五': 50, '六': 60 };
  s = String(s).replace(/\s/g, '');
  if (map[s]) return map[s];
  const m = s.match(/([一二三四五六七八九])十([一二三四五六七八九]?)/);
  if (m) return (m[1] === '一' ? 10 : '一二三四五六七八九'.indexOf(m[1]) + 1) * 10 + (m[2] ? '一二三四五六七八九'.indexOf(m[2]) + 1 : 0);
  return 0;
}

/* ---------- 主入口 ---------- */
function parse(text) {
  const raw = String(text || '').trim();
  if (!raw) return { type: 'unknown' };
  const t = raw.replace(/[。！!，,]/g, ' ');

  /* 1. 记账：「记一笔/花了/支出/收入/付了/买了…N 元」 */
  if (/记一笔|记账|花了|支出|收入|付了|付款|到账|充值/.test(t) || (/[¥￥]\s*\d/.test(t))) {
    const amount = firstNum(t);
    if (amount != null) {
      const isIn = /收入|到账|充值|赚了|进账/.test(t);
      let note = t
        .replace(/记一笔|记账|花了|支出|收入|付了|付款|到账|充值|赚了|进账/g, '')
        .replace(/[¥￥]\s*\d+(\.\d+)?/, '')
        .replace(/\d+(\.\d+)?\s*(元|块|圆|rmb)?/i, '')
        .replace(/\s+/g, ' ').trim();
      return {
        type: 'account',
        data: { id: util.uid(), type: isIn ? 'in' : 'out', amount: amount, cat: guessCat(note), note: note.slice(0, 40) || (isIn ? '收入' : '支出'), date: util.todayStr() },
        toast: '已记 ' + (isIn ? '收入 ' : '支出 ') + '¥' + amount
      };
    }
  }

  /* 2. 待买：「想买/加入待买/购物车…」 */
  if (/想买|加入待买|待买|购物车|想入/.test(t)) {
    let name = t.replace(/想买|加入待买|待买|购物车|想入/g, '').replace(/\d+(\.\d+)?\s*(元|块)?/g, '').trim();
    const est = firstNum(t);
    if (name) {
      return {
        type: 'shopping',
        data: { id: util.uid(), name: name.slice(0, 40), category: guessCat(name), est: est || 0, bought: false },
        toast: '已加入待买：' + name
      };
    }
  }

  /* 3. 打卡：「打卡/完成了…习惯名」 */
  if (/打卡|完成了|完成一下/.test(t)) {
    const name = t.replace(/打卡|完成了|完成一下/g, '').trim();
    if (name) return { type: 'habit', data: { name: name.slice(0, 20) }, toast: '已打卡：' + name };
  }

  /* 4. 作业：「…作业/截止/要交/提交 + 日期」 */
  if (/作业|截止|要交|提交|ddl/i.test(t)) {
    const date = parseDate(t);
    const title = t.replace(/截止|要交|提交|之前|以前|前|交/g, '').replace(/\s+/g, ' ').trim() || '作业';
    return {
      type: 'homework',
      data: { id: util.uid(), courseId: '', title: title.slice(0, 40), deadline: (date || util.todayStr()) + ' 23:59', priority: /重要|紧急|期中|期末/.test(t) ? 'high' : 'normal', done: false, note: '' },
      toast: '已加入作业：' + title.slice(0, 20)
    };
  }

  /* 5. 日程（兜底，任何带时间信息的话都当日程） */
  {
    const date = parseDate(t) || util.todayStr();
    const time = parseTime(t);
    let title = t
      .replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/, '')
      .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/, '')
      .replace(/(下?下?周|星期|礼拜)([一二三四五六日天])/, '')
      .replace(/\d+\s*天[后以之]?后/, '')
      .replace(new RegExp('(上午|早上|凌晨|下午|晚上|午后)?\\s*' + NUM + '\\s*[点時时]\\s*(半|[一二三四五六七八九]十?\\s*分)?'), '')
      .replace(/\d{1,2}:\d{2}/, '')
      .replace(/今天|今晚|今日|明天|明日|后天|大后天|现在|记得|提醒我|有个|安排/g, '')
      .replace(/\s+/g, ' ').trim();
    if (title) {
      return {
        type: 'schedule',
        data: { id: util.uid(), date: date, time: time, title: title.slice(0, 40), note: '', priority: /重要|紧急|考试|模考/.test(t) ? 'high' : 'normal', done: false, rolled: false },
        toast: '已加入日程：' + title.slice(0, 20) + (date !== util.todayStr() ? '（' + date.slice(5) + '）' : '')
      };
    }
  }

  return { type: 'unknown', toast: '没听懂，可以试试：明天下午三点 高数讨论 / 记一笔 午饭 15 / 高数作业 周五交' };
}

function firstNum(t) {
  const m = t.match(/(\d+(?:\.\d{1,2})?)/);
  return m ? +m[1] : null;
}
function guessCat(s) {
  if (/饭|食堂|外卖|吃|餐|咖啡|奶茶|水/.test(s)) return '食材';
  if (/书|资料|笔|本/.test(s)) return '书籍';
  if (/耳机|手机|电脑|数码|充电/.test(s)) return '数码';
  if (/衣|裤|鞋/.test(s)) return '衣物';
  if (/车|地铁|公交|打车/.test(s)) return '交通';
  return '其他';
}

module.exports = { parse, parseDate, parseTime };
