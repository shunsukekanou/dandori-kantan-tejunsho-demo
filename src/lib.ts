// 段取りかんたん手順書：データの形・保存・画像の処理・見本データ
// 外部への通信はいっさい行わない（fetch・XMLHttpRequest なし）。

export type MarkType = 'arrow' | 'circle' | 'rect' | 'text'

/** 画像への書き込み。位置は画像の幅・高さに対する割合（0〜1）で持つ */
export interface Mark {
  type: MarkType
  x1: number
  y1: number
  x2: number
  y2: number
  text?: string
}

export interface Step {
  id: string
  title: string // 工程名（現場では仮タイトル）
  memo: string // 現場の一言メモ
  note: string // 作業内容（机で仕上げる）
  caution: string // 注意点
  tools: string // 使用工具
  photo: string // 写真（data:image/jpeg;base64,...）
  marks: Mark[]
}

export interface Manual {
  app: 'dandori-kantan-tejunsho'
  version: 1
  title: string
  madeAt: string
  steps: Step[]
}

export const APP_ID = 'dandori-kantan-tejunsho'
export const MARK_COLOR = '#e0201b'

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function todayText(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function emptyManual(): Manual {
  return { app: APP_ID, version: 1, title: '', madeAt: todayText(), steps: [] }
}

export function newStep(photo: string, title = '', memo = ''): Step {
  return { id: uid(), title, memo, note: '', caution: '', tools: '', photo, marks: [] }
}

// ---------- 端末の中への保存（IndexedDB） ----------
const DB_NAME = 'dandori-kantan'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveManual(m: Manual): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(m, 'current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // 保存できない環境（プライベートモードなど）でも、画面は動かす
  }
}

export async function loadManual(): Promise<Manual | null> {
  try {
    const db = await openDb()
    const v = await new Promise<Manual | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current')
      req.onsuccess = () => resolve((req.result as Manual | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return v && Array.isArray(v.steps) ? v : null
  } catch {
    return null
  }
}

// ---------- 画像 ----------
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像を読み込めませんでした'))
    img.src = src
  })
}

/** 撮った写真を、幅 1280px までの JPEG に縮める（ファイルを軽くして、受け渡しやすくする） */
export async function fileToPhoto(file: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 矢印・赤丸・赤枠・文字を、画像の上に描く */
export function drawMarks(ctx: CanvasRenderingContext2D, w: number, h: number, marks: Mark[]): void {
  const lw = Math.max(4, w * 0.007)
  ctx.save()
  ctx.lineWidth = lw
  ctx.strokeStyle = MARK_COLOR
  ctx.fillStyle = MARK_COLOR
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const m of marks) {
    const x1 = m.x1 * w
    const y1 = m.y1 * h
    const x2 = m.x2 * w
    const y2 = m.y2 * h
    if (m.type === 'arrow') {
      const ang = Math.atan2(y2 - y1, x2 - x1)
      const head = Math.max(18, w * 0.045)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45))
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45))
      ctx.closePath()
      ctx.fill()
    } else if (m.type === 'circle') {
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(2, Math.abs(x2 - x1) / 2), Math.max(2, Math.abs(y2 - y1) / 2), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (m.type === 'rect') {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
    } else if (m.type === 'text' && m.text) {
      const size = Math.max(20, w * 0.05)
      ctx.font = `bold ${size}px 'Hiragino Sans','Yu Gothic UI','Meiryo',sans-serif`
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(4, size * 0.2)
      ctx.strokeStyle = '#ffffff'
      ctx.strokeText(m.text, x1, y1)
      ctx.fillStyle = MARK_COLOR
      ctx.fillText(m.text, x1, y1)
      ctx.lineWidth = lw
      ctx.strokeStyle = MARK_COLOR
    }
  }
  ctx.restore()
}

const markedCache = new Map<string, string>()

/** 写真に書き込みを焼き付けた画像（表示・印刷用）を返す */
export async function renderMarked(step: Pick<Step, 'id' | 'photo' | 'marks'>): Promise<string> {
  if (step.marks.length === 0) return step.photo
  const key = step.id + step.photo.length + JSON.stringify(step.marks)
  const hit = markedCache.get(key)
  if (hit) return hit
  const img = await loadImage(step.photo)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  drawMarks(ctx, c.width, c.height, step.marks)
  const url = c.toDataURL('image/jpeg', 0.88)
  if (markedCache.size > 60) markedCache.clear()
  markedCache.set(key, url)
  return url
}

// ---------- 受け渡しファイル（.json） ----------
export function manualToJson(m: Manual): string {
  return JSON.stringify(m)
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export type ParseResult = { ok: true; manual: Manual } | { ok: false; error: string }

const MARK_TYPES = ['arrow', 'circle', 'rect', 'text']

export function parseManual(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'ファイルの中身を読めませんでした。スマホで書き出した .json ファイルか確認してください。' }
  }
  const o = raw as Partial<Manual> | null
  if (!o || typeof o !== 'object' || o.app !== APP_ID || !Array.isArray(o.steps)) {
    return { ok: false, error: 'このアプリで書き出したファイルではないようです。「現場で撮る」の「PCへ渡すファイルを書き出す」で作った .json を選んでください。' }
  }
  const steps: Step[] = []
  for (const s of o.steps as Partial<Step>[]) {
    if (!s || typeof s.photo !== 'string' || !s.photo.startsWith('data:image/')) continue
    const marks = Array.isArray(s.marks)
      ? (s.marks as Mark[]).filter((m) => m && MARK_TYPES.includes(m.type) && [m.x1, m.y1, m.x2, m.y2].every((n) => typeof n === 'number'))
      : []
    steps.push({
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      title: String(s.title ?? ''),
      memo: String(s.memo ?? ''),
      note: String(s.note ?? ''),
      caution: String(s.caution ?? ''),
      tools: String(s.tools ?? ''),
      photo: s.photo,
      marks,
    })
  }
  if (steps.length === 0) return { ok: false, error: 'ファイルの中に、写真つきの工程が見つかりませんでした。' }
  return {
    ok: true,
    manual: { app: APP_ID, version: 1, title: String(o.title ?? ''), madeAt: String(o.madeAt ?? todayText()), steps },
  }
}

// ---------- 見本データ（完全な架空。実在の会社・製品・品番・図面は使っていない） ----------
function scene(i: number): string {
  const W = 1200
  const H = 900
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  // 作業台
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#c9cdd1')
  bg.addColorStop(0.34, '#b4b9be')
  bg.addColorStop(0.35, '#9a7b57')
  bg.addColorStop(1, '#7d6244')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(0,0,0,0.06)'
  for (let y = 330; y < H; y += 46) g.fillRect(0, y, W, 3)
  // 治具（金属の台）
  const jig = () => {
    g.fillStyle = 'rgba(0,0,0,0.22)'
    g.fillRect(210, 700, 800, 30)
    g.fillStyle = '#6f7a85'
    g.fillRect(200, 520, 800, 180)
    const top = g.createLinearGradient(0, 420, 0, 520)
    top.addColorStop(0, '#c4ccd4')
    top.addColorStop(1, '#a3adb7')
    g.fillStyle = top
    g.fillRect(200, 420, 800, 100)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(200, 560, 800, 10)
    g.fillRect(200, 620, 800, 10)
  }
  const bolt = (x: number, y: number) => {
    g.fillStyle = '#3d444b'
    g.beginPath()
    g.arc(x, y, 40, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#8b949d'
    g.beginPath()
    g.arc(x, y, 30, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2d3238'
    g.beginPath()
    for (let k = 0; k < 6; k++) g.lineTo(x + 15 * Math.cos((k * Math.PI) / 3), y + 15 * Math.sin((k * Math.PI) / 3))
    g.fill()
  }
  jig()
  if (i === 0) {
    bolt(300, 500)
    bolt(900, 500)
    // 六角レンチ
    g.strokeStyle = '#2d3238'
    g.lineWidth = 16
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(560, 250)
    g.lineTo(560, 330)
    g.lineTo(700, 330)
    g.stroke()
  } else if (i === 1) {
    bolt(300, 500)
    bolt(900, 500)
    // 切粉
    g.fillStyle = '#3a3f45'
    for (let k = 0; k < 70; k++) {
      const x = 230 + ((k * 97) % 740)
      const y = 435 + ((k * 53) % 70)
      g.fillRect(x, y, 10 + (k % 4) * 3, 4 + (k % 3))
    }
    // ブラシ
    g.fillStyle = '#b5452b'
    g.fillRect(760, 250, 230, 60)
    g.fillStyle = '#e6c26b'
    g.fillRect(740, 310, 270, 40)
  } else if (i === 2) {
    bolt(300, 500)
    bolt(900, 500)
    // ウエス
    g.fillStyle = '#f4f1ea'
    g.beginPath()
    g.moveTo(420, 300)
    g.lineTo(760, 290)
    g.lineTo(790, 380)
    g.lineTo(450, 395)
    g.closePath()
    g.fill()
    g.strokeStyle = '#d6d0c2'
    g.lineWidth = 3
    g.stroke()
  } else if (i === 3) {
    bolt(300, 500)
    bolt(900, 500)
    // ワーク（アルミのブロック）
    const wp = g.createLinearGradient(0, 290, 0, 430)
    wp.addColorStop(0, '#e7ebef')
    wp.addColorStop(1, '#b8c0c8')
    g.fillStyle = wp
    g.fillRect(400, 290, 400, 140)
    g.fillStyle = '#9aa3ac'
    g.fillRect(400, 410, 400, 20)
    g.fillStyle = '#7e8791'
    g.beginPath()
    g.arc(600, 360, 34, 0, Math.PI * 2)
    g.fill()
  } else {
    // ワーク＋クランプ＋ダイヤルゲージ
    const wp = g.createLinearGradient(0, 290, 0, 430)
    wp.addColorStop(0, '#e7ebef')
    wp.addColorStop(1, '#b8c0c8')
    g.fillStyle = wp
    g.fillRect(400, 290, 400, 140)
    g.fillStyle = '#c23b22'
    g.fillRect(340, 330, 70, 60)
    g.fillRect(790, 330, 70, 60)
    bolt(300, 500)
    bolt(900, 500)
    g.fillStyle = '#2d3238'
    g.fillRect(985, 330, 30, 130)
    g.fillStyle = '#f7f7f3'
    g.beginPath()
    g.arc(1000, 260, 82, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 12
    g.strokeStyle = '#2d3238'
    g.stroke()
    g.lineWidth = 5
    g.strokeStyle = '#2d3238'
    g.beginPath()
    g.moveTo(1000, 260)
    g.lineTo(1040, 222)
    g.stroke()
    g.lineWidth = 2
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6
      g.beginPath()
      g.moveTo(1000 + 60 * Math.cos(a), 260 + 60 * Math.sin(a))
      g.lineTo(1000 + 70 * Math.cos(a), 260 + 70 * Math.sin(a))
      g.stroke()
    }
  }
  return c.toDataURL('image/jpeg', 0.85)
}

export function sampleManual(): Manual {
  const m = (type: MarkType, x1: number, y1: number, x2: number, y2: number, text?: string): Mark => ({ type, x1, y1, x2, y2, text })
  const t = (x: number, y: number, text: string): Mark => m('text', x, y, x, y, text)
  const rows: Omit<Step, 'id' | 'photo'>[] = [
    {
      title: '治具をはずす',
      memo: 'ボルトは2本',
      note: 'ボルト2本をゆるめ、治具を持ち上げて作業台の上に置く。',
      caution: '治具は重いので、両手で持つ。',
      tools: '六角レンチ（5mm）',
      marks: [m('circle', 0.2, 0.49, 0.3, 0.62), m('circle', 0.7, 0.49, 0.8, 0.62), t(0.36, 0.3, '2本ゆるめる'), m('arrow', 0.45, 0.4, 0.31, 0.5)],
    },
    {
      title: '切粉を払う',
      memo: 'ブラシで手前から奥へ',
      note: 'ブラシで、溝と角にたまった切粉を、手前から奥へ払う。',
      caution: '素手で切粉をさわらない。保護手袋をつける。',
      tools: 'ブラシ、保護手袋',
      marks: [m('arrow', 0.25, 0.42, 0.75, 0.42), t(0.3, 0.33, '手前から奥へ')],
    },
    {
      title: '当たり面をふく',
      memo: '',
      note: 'ウエスで、ワークが当たる面をふく。汚れが残ると、ワークが傾く原因になる。',
      caution: '油や切粉が残っていないか、目で見て確かめる。',
      tools: 'ウエス、クリーナー',
      marks: [m('rect', 0.16, 0.46, 0.84, 0.58), t(0.4, 0.34, 'ここをふく')],
    },
    {
      title: 'ワークをセットする',
      memo: '',
      note: 'ワークを当たり面にそろえて置く。すき間がないか、目で見て確かめる。',
      caution: 'ワークの角を、治具にぶつけない。',
      tools: 'なし（手作業）',
      marks: [m('arrow', 0.82, 0.24, 0.66, 0.43), t(0.62, 0.17, 'すき間なし')],
    },
    {
      title: 'クランプを締めて確認',
      memo: '',
      note: 'クランプを対角の順に、少しずつ締める。ダイヤルゲージで、ワークが浮いていないか確かめる。',
      caution: '締めすぎるとワークがゆがむ。決められた強さで締める。',
      tools: 'トルクレンチ、ダイヤルゲージ',
      marks: [m('circle', 0.77, 0.2, 0.9, 0.38), t(0.3, 0.12, '針が動かないか見る')],
    },
  ]
  return {
    app: APP_ID,
    version: 1,
    title: '治具の清掃とワークセット手順（見本）',
    madeAt: todayText(),
    steps: rows.map((r, i) => ({ ...r, id: uid(), photo: scene(i) })),
  }
}
