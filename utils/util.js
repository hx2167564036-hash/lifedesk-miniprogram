/* 通用工具：日期 / 课程表解析 / 浙大城市学院 GPA 算法 */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayStr() { return fmtDate(new Date()); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
/* 周一=0 … 周日=6 */
function weekdayIdx(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return (d.getDay() + 6) % 7;
}
const WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function uid() {
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

/* ========== 浙大城市学院 GPA 算法（官方：绩点=(百分制-50)/10） ========== */
function scoreToGpa(score) {
  const s = Math.round(score); /* 官方：成绩小数四舍五入至整数 */
  if (s < 60) return 0;
  if (s > 100) s = 100;
  return Math.round((s - 50) / 10 * 10) / 10;
}
const GRADE_GPA = { '优秀': 4.5, '良好': 3.5, '中等': 2.5, '及格': 1.5, '不及格': 0, '合格': 2.5, '不合格': 0 };
function gradeToGpa(grade) {
  if (GRADE_GPA[grade] === undefined) return null;
  return GRADE_GPA[grade];
}
/* GPA = Σ(绩点×学分)/Σ学分，官方保留 4 位小数 */
function calcGPA(records) {
  let pts = 0, cred = 0;
  for (const r of records) {
    const g = r.grade ? gradeToGpa(r.grade) : scoreToGpa(r.score);
    if (g == null || !r.credit) continue;
    pts += g * r.credit;
    cred += r.credit;
  }
  if (!cred) return { gpa: 0, credit: 0, points: 0 };
  return { gpa: Math.round(pts / cred * 10000) / 10000, credit: Math.round(cred * 100) / 100, points: Math.round(pts * 100) / 100 };
}

/* ========== 课程表文本解析（教务复制 / WakeUp 导出 / Excel 粘贴通用） ========== */
function normDay(s) {
  s = String(s || '').trim();
  const m = s.match(/周([一二三四五六日天])/) || s.match(/星期([一二三四五六日天])/);
  if (m) return '日一二三四五六'.indexOf(m[1]) - 1;
  const m2 = s.match(/礼拜([一二三四五六日天])/);
  if (m2) return '日一二三四五六'.indexOf(m2[1]) - 1;
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 1 && n <= 7) return n - 1;
  return -1;
}
function normPeriods(s) {
  s = String(s || '').replace(/[第节课\s]/g, '');
  const m = s.match(/^(\d+)[-,到~](\d+)$/);
  if (m) return { start: +m[1], end: +m[2] };
  const m2 = s.match(/^(\d+)$/);
  if (m2) return { start: +m2[1], end: +m2[1] };
  const parts = s.split(/[,，、]/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
  if (parts.length >= 2) return { start: Math.min.apply(null, parts), end: Math.max.apply(null, parts) };
  if (parts.length === 1) return { start: parts[0], end: parts[0] };
  return null;
}
function normWeeks(s) {
  s = String(s || '').trim();
  if (!s || s === '全' || s === '全部') return '1-20';
  const m = s.match(/(\d+)\s*[-到~]\s*(\d+)/);
  if (m) return m[1] + '-' + m[2];
  const parts = s.match(/\d+/g);
  if (parts && parts.length) return parts.join(',');
  return '1-20';
}
function splitLine(line) {
  if (line.indexOf('\t') >= 0) return line.split('\t').map(x => x.trim());
  if (line.indexOf(',') >= 0) return line.split(',').map(x => x.trim());
  if (line.indexOf('，') >= 0) return line.split('，').map(x => x.trim());
  return line.split(/\s+/).map(x => x.trim());
}
/* 返回 {ok:[课程], bad:[{line, reason}]} */
function parseCourseText(text) {
  const ok = [], bad = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cols = splitLine(line).filter(c => c !== '');
    if (cols.length < 3) { bad.push({ line, reason: '列数不足（至少需要：课程名,星期,节次）' }); continue; }
    const name = cols[0];
    const day = normDay(cols[1]);
    if (day < 0) { bad.push({ line, reason: '星期无法识别："' + cols[1] + '"' }); continue; }
    const pr = normPeriods(cols[2]);
    if (!pr) { bad.push({ line, reason: '节次无法识别："' + cols[2] + '"' }); continue; }
    /* 分列写法兼容：「星期, 5, 6, 地点」→ cols[3] 是数字则当作结束节次，后续列左移 */
    let locIdx = 3, end = pr.end;
    if (/^\d{1,2}$/.test((cols[3] || '').trim())) {
      const e = parseInt(cols[3], 10);
      if (e >= pr.start && e <= 20) { end = e; locIdx = 4; }
    }
    ok.push({
      id: uid(),
      name: name.slice(0, 30),
      day: day,
      start: pr.start,
      end: end,
      location: (cols[locIdx] || '').slice(0, 30),
      teacher: (cols[locIdx + 1] || '').slice(0, 20),
      weeks: normWeeks(cols[locIdx + 2]),
      color: ''
    });
  }
  return { ok, bad };
}

/* 截止日期剩余天数（按自然日，<=0 为已过期/当天） */
function daysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date(todayStr() + 'T00:00:00');
  const end = new Date(deadline.slice(0, 10) + 'T00:00:00');
  return Math.round((end - today) / 86400000);
}

module.exports = {
  pad, fmtDate, todayStr, addDays, weekdayIdx, WEEK_CN, uid, clamp,
  scoreToGpa, gradeToGpa, calcGPA,
  parseCourseText, normDay, normPeriods, normWeeks, daysLeft
};
