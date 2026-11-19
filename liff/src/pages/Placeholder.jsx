// 尚未實作的分頁先用佔位，標明預計在哪個里程碑完成。
export default function Placeholder({ title, desc, milestone }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <section className="card empty">
        <p>{desc}</p>
        <p className="muted small">開發中｜里程碑 {milestone}</p>
      </section>
    </main>
  )
}
