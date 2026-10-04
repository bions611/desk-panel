/* 日常生活工作台 · 数据合并
 * 两个纯函数：mergeStore(pc, phone)、listPhoneOnlyConflicts(pc, phone)
 * 不联网、不读写任何存储、不修改入参。
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

function __mergeDay(pDay, hDay) {
  var out = {};
  var keys = {};
  Object.keys(pDay || {}).forEach(function (k) { keys[k] = 1; });
  Object.keys(hDay || {}).forEach(function (k) { keys[k] = 1; });
  Object.keys(keys).forEach(function (k) {
    var pv = pDay ? pDay[k] : undefined;
    var hv = hDay ? hDay[k] : undefined;
    if (__isBlank(pv) && __isBlank(hv)) {
      /* 两边都没记：保留电脑原有的写法，别把键丢掉（否则结构被改瘦） */
      if (pDay && Object.prototype.hasOwnProperty.call(pDay, k)) out[k] = __clone(pv);
      return;
    }
    if (__isBlank(pv)) { out[k] = __clone(hv); return; }
    if (__isObj(pv) && __isObj(hv)) { out[k] = __mergeDay(pv, hv); return; }
    out[k] = __clone(pv);
  });
  return out;
}

function __mergeById(pList, hList, kind) {
  var pArr = Array.isArray(pList) ? pList : [];
  var hArr = Array.isArray(hList) ? hList : [];
  var map = {};
  pArr.forEach(function (it) {
    if (it && it.id) map[it.id] = __clone(it);
  });
  hArr.forEach(function (it) {
    if (!it || !it.id) return;
    if (map[it.id]) {
      if (kind === "todos") {
        map[it.id].done = !!(map[it.id].done || it.done);
      }
    } else {
      map[it.id] = __clone(it);
    }
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

function mergeStore(pc, phone) {
  if (!__isObj(pc)) pc = {};
  if (!__isObj(phone)) phone = {};

  var pcW = __isObj(pc.workouts) ? pc.workouts : {};
  var phW = __isObj(phone.workouts) ? phone.workouts : {};
  var workouts = {};
  var days = {};
  Object.keys(pcW).forEach(function (d) { days[d] = 1; });
  Object.keys(phW).forEach(function (d) { days[d] = 1; });
  Object.keys(days).forEach(function (d) {
    var p = pcW[d], h = phW[d];
    if (p && h) {
      workouts[d] = __mergeDay(p, h);
    } else if (p) {
      workouts[d] = __clone(p);
    } else if (h) {
      workouts[d] = __clone(h);
    }
  });

  return {
    workouts: workouts,
    todos: __mergeById(pc.todos, phone.todos, "todos"),
    notes: __mergeById(pc.notes, phone.notes, "notes"),
    books: __mergeById(pc.books, phone.books, "books")
  };
}

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
