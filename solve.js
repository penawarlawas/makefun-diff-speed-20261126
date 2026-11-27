// Fast line diff producing makefun-diff/1 patches (identical output to the reference diffPatch).
const CONTEXT = 3;

function split(text) {
  const parts = text.split('\n');
  const last = parts.length - 1;
  const noNl = parts[last] !== '';
  const n = last + (noNl ? 1 : 0);
  return { parts, n, noNl };
}

function lineStr(t, i) {
  return t.parts[i];
}

function written(op, t, i) {
  return i === t.n - 1 && t.noNl ? op + t.parts[i] + '\n%\n' : op + t.parts[i] + '\n';
}

export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const A = split(input.old);
  const B = split(input.new);
  const n = A.n;
  const m = B.n;
  const ids = new Map();
  const intern = (t) => {
    const r = new Int32Array(t.n);
    const p = t.parts;
    const lastNo = t.noNl ? t.n - 1 : -1;
    for (let i = 0; i < t.n; i++) {
      const key = i === lastNo ? p[i] + '\n' : p[i];
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      r[i] = id;
    }
    return r;
  };
  const a = intern(A);
  const b = intern(B);

  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;
  const N = n - prefix - suffix;
  const M = m - prefix - suffix;

  // changes: flat arrays [o, p, dels, ins]
  const ch = [];
  let deleted = 0;
  let inserted = 0;

  if (N > 0 || M > 0) {
    const ao = prefix;
    const off = N + M + 1;
    const V = new Int32Array(2 * (N + M) + 3).fill(-1);
    const T = [];
    let x = 0;
    while (x < N && x < M && a[ao + x] === b[ao + x]) x++;
    V[off] = x;
    T.push(Int32Array.of(x));
    let D = 0;
    let endK = 0;
    if (!(x >= N && x >= M)) {
      outer: for (let d = 1; ; d++) {
        const Td = new Int32Array(d + 1);
        for (let k = -d, idx = 0; k <= d; k += 2, idx++) {
          const xr = V[off + k - 1];
          const xa = V[off + k + 1];
          const canR = xr >= 0 && xr < N;
          const canA = xa >= 0 && xa - k - 1 < M;
          if (!canR && !canA) {
            V[off + k] = -1;
            Td[idx] = -1;
            continue;
          }
          let px;
          if (canR && (!canA || xr + 1 >= xa)) px = xr + 1;
          else px = xa;
          let y = px - k;
          while (px < N && y < M && a[ao + px] === b[ao + y]) {
            px++;
            y++;
          }
          V[off + k] = px;
          Td[idx] = px;
          if (px >= N && y >= M) {
            T.push(Td);
            D = d;
            endK = k;
            break outer;
          }
        }
        T.push(Td);
      }
    }
    // traceback
    const ops = new Uint8Array(D + 1); // 1 = deletion, 2 = insertion
    const snake = new Int32Array(D + 1);
    let k = endK;
    let xe = T[D][(k + D) >> 1];
    for (let d = D; d >= 1; d--) {
      const Tp = T[d - 1];
      const kr = k - 1;
      const ka = k + 1;
      const xr = kr < -(d - 1) || kr > d - 1 ? -1 : Tp[(kr + d - 1) >> 1];
      const xa = ka < -(d - 1) || ka > d - 1 ? -1 : Tp[(ka + d - 1) >> 1];
      const canR = xr >= 0 && xr < N;
      const canA = xa >= 0 && xa - k - 1 < M;
      let start;
      if (canR && (!canA || xr + 1 >= xa)) {
        ops[d] = 1;
        start = xr + 1;
        snake[d] = xe - start;
        k = kr;
        xe = xr;
      } else {
        ops[d] = 2;
        start = xa;
        snake[d] = xe - start;
        k = ka;
        xe = xa;
      }
    }
    snake[0] = xe;
    // forward
    let o = prefix + snake[0];
    let p = prefix + snake[0];
    let co = -1;
    let cp = 0;
    let cd = 0;
    let ci = 0;
    for (let d = 1; d <= D; d++) {
      if (!(co >= 0 && co + cd === o && cp + ci === p)) {
        if (co >= 0) ch.push(co, cp, cd, ci);
        co = o;
        cp = p;
        cd = 0;
        ci = 0;
      }
      if (ops[d] === 1) {
        cd++;
        o++;
        deleted++;
      } else {
        ci++;
        p++;
        inserted++;
      }
      const s = snake[d];
      o += s;
      p += s;
    }
    if (co >= 0) ch.push(co, cp, cd, ci);
  }

  const nc = ch.length >> 2;
  // hunks as [startChange, endChange)
  const hs = [];
  for (let c = 0; c < nc; c++) {
    if (hs.length > 0) {
      const pc = c - 1;
      if (ch[c * 4] - (ch[pc * 4] + ch[pc * 4 + 2]) <= 2 * CONTEXT) {
        hs[hs.length - 1][1] = c + 1;
        continue;
      }
    }
    hs.push([c, c + 1]);
  }
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hs.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const [s, e] of hs) {
    const f = s * 4;
    const l = (e - 1) * 4;
    const oldStart = Math.max(0, ch[f] - CONTEXT);
    const newStart = ch[f + 1] - (ch[f] - oldStart);
    const after = Math.min(CONTEXT, n - (ch[l] + ch[l + 2]));
    const oldEnd = ch[l] + ch[l + 2] + after;
    const newEnd = ch[l + 1] + ch[l + 3] + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (let c = s; c < e; c++) {
      const co = ch[c * 4];
      const cp = ch[c * 4 + 1];
      const cd = ch[c * 4 + 2];
      const ci = ch[c * 4 + 3];
      for (; at < co; at++) out.push(written('=', A, at));
      for (let i = 0; i < cd; i++) out.push(written('-', A, co + i));
      for (let i = 0; i < ci; i++) out.push(written('+', B, cp + i));
      at = co + cd;
    }
    for (; at < oldEnd; at++) out.push(written('=', A, at));
  }
  return out.join('');
}
