import { useEffect, useRef, useState } from 'react';

/**
 * ⚖️ **لوحةُ التوقيع المرسوم** (توجيه ٢٨٧ ③ · `ق-١٦٣٥` ⑫: «صورةُ رسمٍ ساكنة»): يُرسم بالإصبع أو الفأرة، ويُسلَّم صورةَ `PNG` بعد كلِّ
 * خطّ، و«مسح» يعيدها فارغة. لا تحفظ شيئاً ولا ترسل: المستدعي يرسل الصورة مع طلبه.
 */
export function SignaturePad({ onChange, label = 'ارسم توقيعك هنا', height = 160 }: { onChange: (png: Blob | null) => void; label?: string; height?: number }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // دقّةُ الشاشة: اللوحةُ بحجمها الظاهر مضروباً في كثافة البكسل، فلا يبهت الخطّ.
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(c.clientWidth * ratio));
    c.height = Math.max(1, Math.floor(height * ratio));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, [height]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    canvas.current?.toBlob((b) => onChange(b), 'image/png');
  };

  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvas}
        aria-label={label}
        data-testid="signature-pad"
        style={{ width: '100%', height, border: '1px dashed var(--border, #bbb)', borderRadius: 8, touchAction: 'none', background: '#fff' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span className="hint">{empty ? label : 'رُسم التوقيع'}</span>
        <button type="button" className="btn btn-ghost" onClick={clear} disabled={empty}>
          مسح
        </button>
      </div>
    </div>
  );
}
