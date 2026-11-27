// Fast line diff producing makefun-diff/1 patches (identical output to the reference diffPatch).
const CONTEXT = 3;

function split(text) {
  const parts = text.split('\n');
  const last = parts.length - 1;
  const noNl = parts[last] !== '';
  const n = last + (noNl ? 1 : 0);
  return { parts, n, noNl };
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
  const a = new Int32Array(n);
  const ap = A.parts;
  const aLastNo = A.noNl ? n - 1 : -1;
  for (let i = 0; i < n; i++) {
    const key = i === aLastNo ? ap[i] + '\n' : ap[i];
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    a[i] = id;
  }
  const b = new Int32Array(m);
  const bp = B.parts;
  const bLastNo = B.noNl ? m - 1 : -1;
  for (let i = 0; i < m; i++) {
    const key = i === bLastNo ? bp[i] + '\n' : bp[i];
    const id = ids.get(key);
    b[i] = id === undefined ? -1 : id;
  }

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

  if (N === 0) {
    if (M > 0) {
      ch.push(prefix, prefix, 0, M);
      inserted = M;
    }
  } else if (M === 0) {
    ch.push(prefix, prefix, N, 0);
    deleted = N;
  } else {
    const ao = prefix;
    const off = N + M + 1;
    const V = new Int32Array(2 * (N + M) + 3).fill(-1);
    const traceLimit = Math.min(8191, N + M);
    const trace = new Uint8Array(Math.ceil((traceLimit + 1) * (traceLimit + 2) / 16));
    V[off] = 0;
    let D = 0;
    let endK = 0;
    outer: for (let d = 1; ; d++) {
      const traceRow = d * (d + 1) / 2;
      for (let k = -d, idx = 0, vi = off - d; k <= d; k += 2, idx++, vi += 2) {
        const xr = V[vi - 1];
        const xa = V[vi + 1];
        const canR = xr >= 0 && xr < N;
        const canA = xa >= 0 && xa - k - 1 < M;
        if (!canR && !canA) {
          V[vi] = -1;
          continue;
        }
        let px;
        if (canR && (!canA || xr + 1 >= xa)) {
          px = xr + 1;
        } else {
          px = xa;
          if (d <= traceLimit) {
            const bit = traceRow + idx;
            trace[bit >> 3] |= 1 << (bit & 7);
          }
        }
        let y = px - k;
        while (px < N && y < M && a[ao + px] === b[ao + y]) {
          px++;
          y++;
        }
        V[vi] = px;
        if (px >= N && y >= M) {
          D = d;
          endK = k;
          break outer;
        }
      }
    }

    // Recover predecessor choices. Large edit distances are recomputed in fixed-size
    // blocks so the retained trace never grows quadratically.
    const ops = new Uint8Array(D + 1); // 1 = deletion, 2 = insertion
    let k = endK;
    let target = D;
    const BLOCK = 2048;
    while (target > traceLimit) {
      const start = Math.max(traceLimit, target - BLOCK);
      const firstBit = (start + 1) * (start + 2) / 2;
      const lastBit = (target + 1) * (target + 2) / 2;
      const blockTrace = new Uint8Array(Math.ceil((lastBit - firstBit) / 8));
      const W = new Int32Array(V.length).fill(-1);
      W[off] = 0;
      for (let d = 1; d <= target; d++) {
        const row = d * (d + 1) / 2;
        for (let q = -d, idx = 0, vi = off - d; q <= d; q += 2, idx++, vi += 2) {
          const xr = W[vi - 1];
          const xa = W[vi + 1];
          const canR = xr >= 0 && xr < N;
          const canA = xa >= 0 && xa - q - 1 < M;
          if (!canR && !canA) {
            W[vi] = -1;
            continue;
          }
          let px;
          if (canR && (!canA || xr + 1 >= xa)) {
            px = xr + 1;
          } else {
            px = xa;
            if (d > start) {
              const bit = row + idx - firstBit;
              blockTrace[bit >> 3] |= 1 << (bit & 7);
            }
          }
          let y = px - q;
          while (px < N && y < M && a[ao + px] === b[ao + y]) {
            px++;
            y++;
          }
          W[vi] = px;
          if (d === target && q === k) break;
        }
      }
      for (let d = target; d > start; d--) {
        const bit = d * (d + 1) / 2 + ((k + d) >> 1) - firstBit;
        if ((blockTrace[bit >> 3] & (1 << (bit & 7))) !== 0) {
          ops[d] = 2;
          k++;
        } else {
          ops[d] = 1;
          k--;
        }
      }
      target = start;
    }
    for (let d = target; d >= 1; d--) {
      const bit = d * (d + 1) / 2 + ((k + d) >> 1);
      if ((trace[bit >> 3] & (1 << (bit & 7))) !== 0) {
        ops[d] = 2;
        k++;
      } else {
        ops[d] = 1;
        k--;
      }
    }
    // Replay the chosen edits and maximal equal runs to form changes.
    let o = prefix;
    let p = prefix;
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
      while (o < n - suffix && p < m - suffix && a[o] === b[p]) {
        o++;
        p++;
      }
    }
    if (co >= 0) ch.push(co, cp, cd, ci);
  }

  const nc = ch.length >> 2;
  // hunks as flat [startChange, endChange] pairs
  const hs = [];
  for (let c = 0; c < nc; c++) {
    if (hs.length > 0) {
      const pc = c - 1;
      if (ch[c * 4] - (ch[pc * 4] + ch[pc * 4 + 2]) <= 2 * CONTEXT) {
        hs[hs.length - 1] = c + 1;
        continue;
      }
    }
    hs.push(c, c + 1);
  }
  const hunkCount = hs.length >> 1;
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunkCount} deleted=${deleted} inserted=${inserted}\n`];
  for (let hi = 0; hi < hs.length; hi += 2) {
    const s = hs[hi];
    const e = hs[hi + 1];
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
