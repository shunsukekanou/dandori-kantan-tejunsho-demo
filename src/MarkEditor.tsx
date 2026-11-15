import { useEffect, useRef, useState } from 'react'
import { drawMarks, loadImage, type Mark, type MarkType } from './lib'

const TOOLS: { type: MarkType; label: string; hint: string }[] = [
  { type: 'arrow', label: '矢印', hint: '写真の上をなぞって、矢印を引きます' },
  { type: 'circle', label: '赤丸', hint: '写真の上をなぞって、丸で囲みます' },
  { type: 'rect', label: '赤枠', hint: '写真の上をなぞって、四角で囲みます' },
  { type: 'text', label: '文字入れ', hint: '文字を入れてから、写真の置きたい場所を押します' },
]

interface Props {
  photo: string
  marks: Mark[]
  onChange: (marks: Mark[]) => void
}

/** 写真の上に、矢印・赤丸・赤枠・文字を直接書き込む（1つ戻す・やり直しつき） */
export default function MarkEditor({ photo, marks, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [ready, setReady] = useState(0)
  const [tool, setTool] = useState<MarkType>('arrow')
  const [text, setText] = useState('')
  const [redo, setRedo] = useState<Mark[]>([])
  const [drag, setDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [warn, setWarn] = useState('')

  useEffect(() => {
    let alive = true
    loadImage(photo).then((img) => {
      if (!alive) return
      imgRef.current = img
      setReady((n) => n + 1)
    })
    return () => {
      alive = false
    }
  }, [photo])

  useEffect(() => {
    const c = canvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const shown = drag && tool !== 'text' ? [...marks, { type: tool, ...drag }] : marks
    drawMarks(ctx, c.width, c.height, shown)
  }, [marks, drag, tool, ready])

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    setWarn('')
    const p = pos(e)
    if (tool === 'text') {
      const t = text.trim()
      if (!t) {
        setWarn('先に、写真に入れたい文字を、下の欄に書いてください。')
        return
      }
      onChange([...marks, { type: 'text', x1: p.x, y1: p.y, x2: p.x, y2: p.y, text: t }])
      setRedo([])
      return
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const p = pos(e)
    setDrag({ ...drag, x2: p.x, y2: p.y })
  }
  const up = () => {
    if (!drag) return
    const size = Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1)
    if (size > 0.02 && tool !== 'text') {
      onChange([...marks, { type: tool, ...drag }])
      setRedo([])
    }
    setDrag(null)
  }

  const undo = () => {
    if (marks.length === 0) return
    setRedo([...redo, marks[marks.length - 1]])
    onChange(marks.slice(0, -1))
  }
  const redoOne = () => {
    if (redo.length === 0) return
    onChange([...marks, redo[redo.length - 1]])
    setRedo(redo.slice(0, -1))
  }
  const clearAll = () => {
    if (marks.length === 0) return
    setRedo([...marks].reverse())
    onChange([])
  }

  const current = TOOLS.find((t) => t.type === tool)!
  return (
    <div className="marker">
      <div className="tool-row" role="toolbar" aria-label="書き込みの道具">
        {TOOLS.map((t) => (
          <button key={t.type} type="button" className={'tool' + (tool === t.type ? ' on' : '')} onClick={() => setTool(t.type)} aria-pressed={tool === t.type}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="hint">{current.hint}</p>
      <canvas ref={canvasRef} className="marker-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="写真に書き込む" />
      {warn && <p className="warn">{warn}</p>}
      {tool === 'text' && (
        <input className="text-in" value={text} onChange={(e) => setText(e.target.value)} placeholder="例：ここを2回押す" maxLength={30} aria-label="写真に入れる文字" />
      )}
      <div className="tool-row">
        <button type="button" className="btn sub" onClick={undo} disabled={marks.length === 0}>
          1つ戻す
        </button>
        <button type="button" className="btn sub" onClick={redoOne} disabled={redo.length === 0}>
          やり直し
        </button>
        <button type="button" className="btn sub" onClick={clearAll} disabled={marks.length === 0}>
          書き込みを全部消す
        </button>
        <span className="count">書き込み {marks.length} 個</span>
      </div>
    </div>
  )
}
