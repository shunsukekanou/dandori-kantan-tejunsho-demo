import { useCallback, useEffect, useRef, useState } from 'react'
import MarkEditor from './MarkEditor'
import {
  downloadText,
  emptyManual,
  fileToPhoto,
  loadManual,
  manualToJson,
  newStep,
  parseManual,
  renderMarked,
  sampleManual,
  saveManual,
  type Manual,
  type Step,
} from './lib'

type Mode = 'field' | 'check' | 'desk' | 'print'

const TABS: { mode: Mode; label: string; sub: string }[] = [
  { mode: 'field', label: '現場で撮る', sub: 'スマホ' },
  { mode: 'check', label: '確認', sub: 'スマホ' },
  { mode: 'desk', label: '机で仕上げ', sub: 'PC' },
  { mode: 'print', label: 'A4で印刷', sub: 'PC' },
]

function useMarked(step: Step | undefined): string {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    if (!step) {
      setSrc('')
      return
    }
    renderMarked(step).then((u) => alive && setSrc(u))
    return () => {
      alive = false
    }
  }, [step])
  return src
}

function MarkedImg({ step, className }: { step: Step; className?: string }) {
  const src = useMarked(step)
  return src ? <img src={src} className={className} alt={`${step.title || '工程'}の写真`} /> : <div className={'ph ' + (className ?? '')} />
}

/** 押すと「もう一度押すと実行します」に変わるボタン（確認の画面を出さずに、うっかり消すのを防ぐ） */
function ConfirmButton({ label, onYes, className }: { label: string; onYes: () => void; className?: string }) {
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    if (!ask) return
    const t = setTimeout(() => setAsk(false), 4000)
    return () => clearTimeout(t)
  }, [ask])
  return (
    <button
      type="button"
      className={(className ?? 'btn sub') + (ask ? ' danger' : '')}
      onClick={() => {
        if (ask) {
          setAsk(false)
          onYes()
        } else setAsk(true)
      }}
    >
      {ask ? 'もう一度押すと実行します' : label}
    </button>
  )
}

export default function App() {
  const [manual, setManual] = useState<Manual>(emptyManual())
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<Mode>('field')
  const [sel, setSel] = useState('')
  const [idx, setIdx] = useState(0)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadManual().then((m) => {
      if (m) {
        setManual(m)
        setSel(m.steps[0]?.id ?? '')
      }
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => saveManual(manual), 400)
    return () => clearTimeout(t)
  }, [manual, loaded])

  const update = useCallback((fn: (m: Manual) => Manual) => setManual((m) => fn(m)), [])
  const patchStep = (id: string, p: Partial<Step>) => update((m) => ({ ...m, steps: m.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  const move = (id: string, d: -1 | 1) =>
    update((m) => {
      const i = m.steps.findIndex((s) => s.id === id)
      const j = i + d
      if (i < 0 || j < 0 || j >= m.steps.length) return m
      const steps = [...m.steps]
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...m, steps }
    })
  const remove = (id: string) => update((m) => ({ ...m, steps: m.steps.filter((s) => s.id !== id) }))

  const loadSample = () => {
    const s = sampleManual()
    setManual(s)
    setSel(s.steps[0].id)
    setIdx(0)
    setMsg('見本の手順書（架空の治具清掃）を読み込みました。')
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMsg('')
    try {
      const photos: string[] = []
      for (const f of Array.from(files)) photos.push(await fileToPhoto(f))
      update((m) => ({ ...m, steps: [...m.steps, ...photos.map((p) => newStep(p))] }))
    } catch {
      setMsg('写真を読み込めませんでした。別の写真で試してください。')
    }
  }

  const exportFile = () => {
    const safe = (manual.title || '手順書').replace(/[\\/:*?"<>|]/g, '')
    downloadText(`${safe}_${manual.madeAt}.json`, manualToJson(manual))
    setMsg('ファイルを書き出しました（ダウンロードの中）。PC に渡して、「机で仕上げ」で読み込みます。')
  }

  const importText = (text: string) => {
    const r = parseManual(text)
    if ('error' in r) {
      setMsg(r.error)
      return
    }
    setManual(r.manual)
    setSel(r.manual.steps[0].id)
    setIdx(0)
    setMsg(`ファイルを読み込みました（${r.manual.steps.length} 工程）。`)
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setMsg('')
    window.scrollTo(0, 0)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ▣
          </span>
          <div>
            <h1>段取りかんたん手順書</h1>
            <p>現場はスマホで撮る。あとは机で仕上げて、A4で印刷。</p>
          </div>
        </div>
        <nav className="tabs" aria-label="画面の切り替え">
          {TABS.map((t) => (
            <button key={t.mode} type="button" className={'tab' + (mode === t.mode ? ' on' : '')} onClick={() => switchMode(t.mode)} aria-current={mode === t.mode ? 'page' : undefined}>
              <span>{t.label}</span>
              <small>{t.sub}</small>
            </button>
          ))}
        </nav>
      </header>
      <main>
        {msg && (
          <p className="msg" role="status">
            {msg}
          </p>
        )}
        {mode === 'field' && <FieldView manual={manual} update={update} patchStep={patchStep} move={move} remove={remove} addPhotos={addPhotos} exportFile={exportFile} loadSample={loadSample} reset={() => { setManual(emptyManual()); setSel(''); setMsg('最初からやり直せます。') }} goCheck={() => switchMode('check')} />}
        {mode === 'check' && <CheckView manual={manual} idx={idx} setIdx={setIdx} loadSample={loadSample} onBack={() => switchMode('field')} />}
        {mode === 'desk' && <DeskView manual={manual} sel={sel} setSel={setSel} update={update} patchStep={patchStep} move={move} remove={remove} importText={importText} loadSample={loadSample} />}
        {mode === 'print' && <PrintView manual={manual} loadSample={loadSample} />}
      </main>
      <footer className="foot">写真・文章は、この端末のブラウザの中だけに保存します。外部のサーバーや AI には送りません。</footer>
    </div>
  )
}

function Empty({ loadSample, text }: { loadSample: () => void; text: string }) {
  return (
    <section className="card empty">
      <p>{text}</p>
      <button type="button" className="btn main" onClick={loadSample}>
        見本の手順書を読み込む
      </button>
    </section>
  )
}

// ---------------- 現場（スマホ） ----------------
interface FieldProps {
  manual: Manual
  update: (fn: (m: Manual) => Manual) => void
  patchStep: (id: string, p: Partial<Step>) => void
  move: (id: string, d: -1 | 1) => void
  remove: (id: string) => void
  addPhotos: (f: FileList | null) => void
  exportFile: () => void
  loadSample: () => void
  reset: () => void
  goCheck: () => void
}

function FieldView({ manual, update, patchStep, move, remove, addPhotos, exportFile, loadSample, reset, goCheck }: FieldProps) {
  const n = manual.steps.length
  return (
    <>
      {n === 0 && (
        <section className="card flow">
          <h2>使い方は3つだけ</h2>
          <ol>
            <li>
              <b>現場で撮る</b>
              <span>工程の順に、スマホで写真を撮ります。</span>
            </li>
            <li>
              <b>ファイルで PC へ</b>
              <span>ボタン1つで、写真ごと1つのファイルにします。</span>
            </li>
            <li>
              <b>机で仕上げて印刷</b>
              <span>矢印・文字を書き込み、A4 の手順書にします。</span>
            </li>
          </ol>
        </section>
      )}
      <section className="card">
        <label className="lab" htmlFor="mtitle">
          手順書の名前
        </label>
        <input id="mtitle" className="in" value={manual.title} onChange={(e) => update((m) => ({ ...m, title: e.target.value }))} placeholder="例：治具の清掃とワークセット" />
        <div className="add-row">
          <label className="btn main big">
            カメラで撮る（STEP {n + 1}）
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
          <label className="btn sub big">
            写真を選ぶ
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </section>

      {n === 0 && <Empty loadSample={loadSample} text="まだ写真がありません。撮るか、見本で動きを試せます。" />}

      <ol className="steps">
        {manual.steps.map((s, i) => (
          <li key={s.id} className="card step">
            <div className="step-head">
              <span className="badge">STEP {i + 1}</span>
              <div className="step-btns">
                <button type="button" className="mini" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label={`STEP ${i + 1} を前へ`}>
                  ↑
                </button>
                <button type="button" className="mini" onClick={() => move(s.id, 1)} disabled={i === n - 1} aria-label={`STEP ${i + 1} を後ろへ`}>
                  ↓
                </button>
                <ConfirmButton className="mini" label="削除" onYes={() => remove(s.id)} />
              </div>
            </div>
            <div className="step-body">
              <MarkedImg step={s} className="thumb" />
              <div className="step-inputs">
                <input className="in" value={s.title} onChange={(e) => patchStep(s.id, { title: e.target.value })} placeholder="仮タイトル（例：治具をはずす）" aria-label={`STEP ${i + 1} の仮タイトル`} />
                <textarea className="in" rows={3} value={s.memo} onChange={(e) => patchStep(s.id, { memo: e.target.value })} placeholder="一言メモ（例：ボルトは2本）" aria-label={`STEP ${i + 1} の一言メモ`} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {n > 0 && (
        <section className="card send">
          <h2>PC へ渡す</h2>
          <p>撮った写真・順番・メモを、1つの .json ファイルにまとめます。メールや共有フォルダなどで PC に渡し、「机で仕上げ」で読み込みます。</p>
          <button type="button" className="btn main big" onClick={exportFile}>
            PC へ渡すファイルを書き出す
          </button>
          <div className="row">
            <button type="button" className="btn sub" onClick={goCheck}>
              1ステップずつ確認する
            </button>
            <ConfirmButton label="最初からやり直す" onYes={reset} />
          </div>
        </section>
      )}
    </>
  )
}

// ---------------- 1ステップ確認（スマホ） ----------------
function CheckView({ manual, idx, setIdx, loadSample, onBack }: { manual: Manual; idx: number; setIdx: (n: number) => void; loadSample: () => void; onBack: () => void }) {
  const n = manual.steps.length
  const i = Math.min(idx, Math.max(0, n - 1))
  const step = manual.steps[i]
  const touch = useRef<number | null>(null)
  const go = useCallback((d: number) => setIdx(Math.min(n - 1, Math.max(0, i + d))), [i, n, setIdx])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go])

  if (n === 0) return <Empty loadSample={loadSample} text="確認する手順書がありません。「現場で撮る」で撮るか、見本を読み込みます。" />
  return (
    <section
      className="check"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return
        const dx = e.changedTouches[0].clientX - touch.current
        touch.current = null
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
      }}
    >
      <div className="progress" aria-label={`${n} 工程のうち ${i + 1} 番目`}>
        <div style={{ width: `${((i + 1) / n) * 100}%` }} />
      </div>
      <p className="where">
        {manual.title || '手順書'}　<b>STEP {i + 1} / {n}</b>
      </p>
      <MarkedImg step={step} className="big-photo" />
      <h2 className="check-title">
        <span className="badge">STEP {i + 1}</span> {step.title || '（工程名なし）'}
      </h2>
      <p className="check-note">{step.note || step.memo || '（作業内容は、机で書き足せます）'}</p>
      {step.caution && (
        <div className="caution">
          <b>注意</b>
          <span>{step.caution}</span>
        </div>
      )}
      {step.tools && (
        <p className="tools">
          <b>使う工具</b>　{step.tools}
        </p>
      )}
      <div className="pager">
        <button type="button" className="btn sub big" onClick={() => go(-1)} disabled={i === 0}>
          ← 前へ
        </button>
        <button type="button" className="btn main big" onClick={() => go(1)} disabled={i === n - 1}>
          次へ →
        </button>
      </div>
      <p className="hint center">写真を左右になぞっても、めくれます。</p>
      <button type="button" className="btn sub big back" onClick={onBack}>
        確認をやめて、撮影の画面に戻る
      </button>
    </section>
  )
}

// ---------------- 机（PC） ----------------
interface DeskProps {
  manual: Manual
  sel: string
  setSel: (id: string) => void
  update: (fn: (m: Manual) => Manual) => void
  patchStep: (id: string, p: Partial<Step>) => void
  move: (id: string, d: -1 | 1) => void
  remove: (id: string) => void
  importText: (t: string) => void
  loadSample: () => void
}

function DeskView({ manual, sel, setSel, update, patchStep, move, remove, importText, loadSample }: DeskProps) {
  const [over, setOver] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const n = manual.steps.length
  const step = manual.steps.find((s) => s.id === sel) ?? manual.steps[0]

  const readFile = (f: File | undefined) => {
    if (!f) return
    f.text().then(importText)
  }

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return
    update((m) => {
      const from = m.steps.findIndex((s) => s.id === fromId)
      const to = m.steps.findIndex((s) => s.id === toId)
      if (from < 0 || to < 0) return m
      const steps = [...m.steps]
      const [it] = steps.splice(from, 1)
      steps.splice(to, 0, it)
      return { ...m, steps }
    })
  }

  return (
    <>
      <section
        className={'card drop' + (over ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          readFile(e.dataTransfer.files[0])
        }}
      >
        <div>
          <h2>スマホで書き出したファイルを読み込む</h2>
          <p>.json ファイルを、ここへドラッグするか、ボタンで選びます。</p>
        </div>
        <div className="row">
          <label className="btn main">
            ファイルを選ぶ
            <input type="file" accept=".json,application/json" hidden onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <button type="button" className="btn sub" onClick={loadSample}>
            見本を読み込む
          </button>
        </div>
      </section>

      {n === 0 || !step ? (
        <Empty loadSample={loadSample} text="まだ手順書が読み込まれていません。" />
      ) : (
        <div className="desk">
          <aside className="card list">
            <h2>工程の順番</h2>
            <p className="hint">ドラッグ、または ↑↓ で入れ替えます。</p>
            <ol>
              {manual.steps.map((s, i) => (
                <li
                  key={s.id}
                  className={(s.id === step.id ? 'on ' : '') + (dragId === s.id ? 'drag' : '')}
                  draggable
                  onDragStart={() => setDragId(s.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (dragId) reorder(dragId, s.id)
                    setDragId(null)
                  }}
                >
                  <button type="button" className="pick" onClick={() => setSel(s.id)}>
                    <span className="badge sm">{i + 1}</span>
                    <span className="t">{s.title || '（工程名なし）'}</span>
                    {s.marks.length > 0 && <span className="dot" title="書き込みあり" />}
                  </button>
                  <button type="button" className="mini" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label={`${i + 1} 番を上へ`}>
                    ↑
                  </button>
                  <button type="button" className="mini" onClick={() => move(s.id, 1)} disabled={i === n - 1} aria-label={`${i + 1} 番を下へ`}>
                    ↓
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <section className="card edit" key={step.id}>
            <div className="edit-head">
              <h2>
                <span className="badge">STEP {manual.steps.findIndex((s) => s.id === step.id) + 1}</span> を仕上げる
              </h2>
              <ConfirmButton label="この工程を削除" onYes={() => { remove(step.id); setSel('') }} />
            </div>
            <div className="edit-grid">
              <MarkEditor photo={step.photo} marks={step.marks} onChange={(marks) => patchStep(step.id, { marks })} />
              <div className="fields">
                <label className="lab" htmlFor="f-title">
                  工程名
                </label>
                <input id="f-title" className="in" value={step.title} onChange={(e) => patchStep(step.id, { title: e.target.value })} />
                {step.memo && <p className="memo">現場メモ：{step.memo}</p>}
                <label className="lab" htmlFor="f-note">
                  作業内容
                </label>
                <textarea id="f-note" className="in" rows={4} value={step.note} onChange={(e) => patchStep(step.id, { note: e.target.value })} placeholder="何を、どの順で行うか" />
                <label className="lab" htmlFor="f-caution">
                  注意点
                </label>
                <textarea id="f-caution" className="in" rows={3} value={step.caution} onChange={(e) => patchStep(step.id, { caution: e.target.value })} placeholder="ケガ・ミスにつながる点" />
                <label className="lab" htmlFor="f-tools">
                  使用工具
                </label>
                <input id="f-tools" className="in" value={step.tools} onChange={(e) => patchStep(step.id, { tools: e.target.value })} placeholder="例：六角レンチ（5mm）" />
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

// ---------------- A4 印刷 ----------------
function PrintView({ manual, loadSample }: { manual: Manual; loadSample: () => void }) {
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const f = () => setZoom(Math.min(1, (window.innerWidth - 24) / 794))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  if (manual.steps.length === 0) return <Empty loadSample={loadSample} text="印刷する手順書がありません。" />
  return (
    <>
      <section className="card noprint print-bar">
        <div>
          <h2>A4 の「写真つき作業手順書」</h2>
          <p>下の見本どおりに印刷されます。印刷の設定は「A4・縦・倍率100%」。「PDFに保存」を選べば、PDF にもできます。</p>
        </div>
        <button type="button" className="btn main big" onClick={() => window.print()}>
          印刷する／PDFに保存
        </button>
      </section>
      <div className="sheet-wrap" style={{ zoom }}>
        <article className="sheet" aria-label="作業手順書（A4）">
          <header className="sheet-head">
            <div>
              <p className="sheet-kind">作業手順書</p>
              <h2>{manual.title || '（名前なし）'}</h2>
              <p className="sheet-meta">作成日 {manual.madeAt}　／　全 {manual.steps.length} 工程</p>
            </div>
            <table className="sign">
              <tbody>
                <tr>
                  <th>作成</th>
                  <th>確認</th>
                  <th>承認</th>
                </tr>
                <tr>
                  <td />
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </header>
          {manual.steps.map((s, i) => (
            <PrintStep key={s.id} step={s} no={i + 1} />
          ))}
        </article>
      </div>
    </>
  )
}

function PrintStep({ step, no }: { step: Step; no: number }) {
  return (
    <section className="pstep">
      <div className="pphoto">
        <MarkedImg step={step} />
      </div>
      <div className="ptext">
        <h3>
          <span className="pno">{no}</span> {step.title || '（工程名なし）'}
        </h3>
        <p className="pnote">{step.note || step.memo}</p>
        {step.caution && (
          <p className="pcaution">
            <b>注意</b> {step.caution}
          </p>
        )}
        {step.tools && (
          <p className="ptools">
            <b>使用工具</b> {step.tools}
          </p>
        )}
      </div>
    </section>
  )
}
