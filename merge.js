/* 日常生活工作台 · 数据合并
 *
 * mergeStore(pc, phone, base?)  —— 合并两份数据，返回新对象，绝不修改入参
 *     不带 base ：老规矩 —— 电脑优先，手机只补电脑没记的
 *     带 base   ：三方合并。base 是"上次同步完之后的样子"，于是能分清
 *                 "这是手机新改的" 和 "这是手机上留下的老值"：
 *                    · 某字段 手机 ≠ 清单  → 手机动过 → 用手机的（新改的一定进得去）
 *                    · 某字段 手机 = 清单  → 手机没动 → 用电脑的（电脑改了就保得住）
 *                 两边都动过的，按"手机刚动过"处理。
 *
 * listPhoneOnlyConflicts(pc, phone) —— 列出两边都记过、值还不一样的字段（只提示）
 *
 * 纯函数：不联网、不读写任何存储、不修改入参。
 */

function __isBlank(v) {
  /* 空 = "这项没记"：undefined / null / 空串 / 数字 0 / false
     工作台里 steps:0、weight:0、done:false 都表示没记（前端自己也是用 >0 判断的） */
  return v === undefined || v === null || v === "" || v === 0 || v === false;
}

function __isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function __clone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(__clone);
  var o = {};
  for (var k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = __clone(v[k]);
  }
  return o;
}

/* 两个值算不算"一样"（宽一点：0 和 "" 都算没记，数字和字符串同值算一样） */
function __same(a, b) {
  if (a === b) return true;
  if (__isBlank(a) && __isBlank(b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return String(a) === String(b);
  }
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

/* 一天的运动记录：逐字段对账
   base 为空对象（老规矩）时，等价于"电脑优先、手机补空缺"。 */
function __mergeDay(pDay, hDay, bDay, hasBase) {
  var out = {};
  var keys = {};
  function addKeys(o) {
    if (__isObj(o)) Object.keys(o).forEach(function (k) { keys[k] = 1; });
  }
  addKeys(pDay); addKeys(hDay); addKeys(bDay);

  Object.keys(keys).forEach(function (k) {
    var pHas = __isObj(pDay) && Object.prototype.hasOwnProperty.call(pDay, k);
    var hHas = __isObj(hDay) && Object.prototype.hasOwnProperty.call(hDay, k);
    var bHas = __isObj(bDay) && Object.prototype.hasOwnProperty.call(bDay, k);
    var pv = pHas ? pDay[k] : undefined;
    var hv = hHas ? hDay[k] : undefined;
    var bv = bHas ? bDay[k] : undefined;

    /* 这一项是"小格子"（跑/走/冥想那类）→ 继续往里对账 */
    if (__isObj(pv) || __isObj(hv)) {
      var sub = __mergeDay(__isObj(pv) ? pv : {}, __isObj(hv) ? hv : {}, __isObj(bv) ? bv : {}, hasBase);
      if (Object.keys(sub).length || pHas) out[k] = sub;
      return;
    }

    /* 叶子字段（没有对照清单时一律不算"手机动过" → 退化成老规矩：电脑优先）
       优先级：手机明确改过 → 用手机的；否则电脑有值就用电脑的；电脑没值才补手机的值。 */
    var hMoved = hasBase && hHas && !__same(hv, bv);
    if (hMoved) { out[k] = __clone(hv); return; }
    if (pHas && !__isBlank(pv)) { out[k] = __clone(pv); return; }
    if (hHas) { out[k] = __clone(hv); return; }
    if (pHas) { out[k] = __clone(pv); return; }   /* 都没值：保留电脑原有的写法 */
    /* 两边都没有这一项 → 不写（别把结构撑胖） */
  });
  return out;
}

/* 待办 / 灵感 / 读书：按 id 对账。base 为空时等价于老规矩（电脑优先、手机补新）。 */
function __mergeById(pList, hList, bList, kind) {
  var pArr = Array.isArray(pList) ? pList : [];
  var hArr = Array.isArray(hList) ? hList : [];
  var bArr = Array.isArray(bList) ? bList : [];

  var bMap = {};
  bArr.forEach(function (it) { if (it && it.id) bMap[it.id] = it; });

  var map = {};
  pArr.forEach(function (it) { if (it && it.id) map[it.id] = __clone(it); });

  hArr.forEach(function (it) {
    if (!it || !it.id) return;
    var cur = map[it.id];
    if (!cur) { map[it.id] = __clone(it); return; }   /* 电脑没有 → 手机新加的，收下 */

    var base = bMap[it.id];
    Object.keys(it).forEach(function (k) {
      if (k === "id") return;

      if (k === "done") {
        /* 打勾这件事：任一边打了就算完成（防止同步把勾弄丢） */
        cur.done = !!(cur.done || it.done);
        return;
      }
      var bv = base ? base[k] : undefined;
      if (base && !__same(it[k], bv)) cur[k] = __clone(it[k]);   /* 手机改过的字段 → 用手机的 */
    });
  });

  var arr = Object.keys(map).map(function (id) { return map[id]; });
  arr.sort(function (a, b) {
    if (kind === "books") {
      return String(a.date || "").localeCompare(String(b.date || ""));
    }
    return ((+a.created) || 0) - ((+b.created) || 0);
  });
  return arr;
}

function mergeStore(pc, phone, base) {
  if (!__isObj(pc)) pc = {};
  if (!__isObj(phone)) phone = {};
  if (base !== undefined && !__isObj(base)) base = {};

  var pcW = __isObj(pc.workouts) ? pc.workouts : {};
  var phW = __isObj(phone.workouts) ? phone.workouts : {};
  var baW = __isObj(base) && __isObj(base.workouts) ? base.workouts : {};

  var workouts = {};
  var days = {};
  Object.keys(pcW).forEach(function (d) { days[d] = 1; });
  Object.keys(phW).forEach(function (d) { days[d] = 1; });
  Object.keys(baW).forEach(function (d) { days[d] = 1; });

  Object.keys(days).forEach(function (d) {
    var p = pcW[d], h = phW[d], b = baW[d];
    if (p && h) {
      workouts[d] = __mergeDay(p, h, b, !!b);
    } else if (p) {
      workouts[d] = __clone(p);
    } else if (h) {
      workouts[d] = __clone(h);
    }
  });

  return {
    workouts: workouts,
    todos: __mergeById(pc.todos, phone.todos, __isObj(base) ? base.todos : null, "todos"),
    notes: __mergeById(pc.notes, phone.notes, __isObj(base) ? base.notes : null, "notes"),
    books: __mergeById(pc.books, phone.books, __isObj(base) ? base.books : null, "books")
  };
}

/* ---------- 下面这些只用来"提示"：两边都记过、值还不一样的字段 ---------- */

function __collectWorkout(date, pDay, hDay, prefix, out) {
  if (!__isObj(pDay) || !__isObj(hDay)) return;
  Object.keys(pDay).forEach(function (k) {
    var pv = pDay[k], hv = hDay[k];
    if (__isBlank(pv) || __isBlank(hv)) return;
    var field = prefix ? prefix + "." + k : k;
    if (__isObj(pv) && __isObj(hv)) {
      __collectWorkout(date, pv, hv, field, out);
    } else if (String(pv) !== String(hv)) {
      out.push({ scope: "workouts", key: date, field: field, pc: pv, phone: hv });
    }
  });
}

function __collectId(scope, pList, hList, out) {
  var pArr = Array.isArray(pList) ? pList : [];
  var hArr = Array.isArray(hList) ? hList : [];
  var pMap = {};
  pArr.forEach(function (it) { if (it && it.id) pMap[it.id] = it; });
  hArr.forEach(function (it) {
    if (!it || !it.id || !pMap[it.id]) return;
    var p = pMap[it.id];
    Object.keys(it).forEach(function (k) {
      if (k === "id") return;
      if (!(k in p)) return;
      var pv = p[k], hv = it[k];
      if (__isBlank(pv) || __isBlank(hv)) return;
      if (String(pv) !== String(hv)) {
        out.push({ scope: scope, key: it.id, field: k, pc: pv, phone: hv });
      }
    });
  });
}

function listPhoneOnlyConflicts(pc, phone) {
  var out = [];
  if (!__isObj(pc)) pc = {};
  if (!__isObj(phone)) phone = {};

  var pcW = __isObj(pc.workouts) ? pc.workouts : {};
  var phW = __isObj(phone.workouts) ? phone.workouts : {};
  Object.keys(pcW).forEach(function (d) {
    if (phW[d]) __collectWorkout(d, pcW[d], phW[d], "", out);
  });

  __collectId("todos", pc.todos, phone.todos, out);
  __collectId("notes", pc.notes, phone.notes, out);
  __collectId("books", pc.books, phone.books, out);

  return out;
}
