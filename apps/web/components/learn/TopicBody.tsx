import type { Topic } from "@/lib/learn";

/** Server-rendered modal content, so every explanation is in the static HTML. */
export function TopicBody({ topic, all }: { topic: Topic; all: Topic[] }) {
  const byId = new Map(all.map((t) => [t.id, t]));
  const S = ({ h, children }: { h: string; children: React.ReactNode }) => (
    <section className="topic-section">
      <h3 className="eyebrow">{h}</h3>
      {children}
    </section>
  );

  return (
    <>
      <p className="topic-lede">{topic.summary}</p>

      <S h="What it is"><p>{topic.what}</p></S>
      <S h="Why it is needed"><p>{topic.why}</p></S>
      <S h="How it works"><p>{topic.how}</p></S>

      {topic.formula ? (
        <S h="Formula">
          <pre className="topic-formula">{topic.formula.notation}</pre>
          <dl className="topic-terms">
            {topic.formula.terms.map((t) => (
              <div key={t.symbol}>
                <dt>{t.symbol}</dt>
                <dd>{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </S>
      ) : null}

      {topic.diagram && topic.diagram.type === "flow" ? (
        <S h="Flow">
          <ol className="topic-flow">
            {(topic.diagram.nodes as string[]).map((n, i) => (
              <li key={n}>
                <span className="topic-flow-n">{i + 1}</span>{n}
              </li>
            ))}
          </ol>
          {topic.diagram.note ? (
            <p className="topic-note">{topic.diagram.note as string}</p>
          ) : null}
        </S>
      ) : null}

      {topic.diagram && topic.diagram.type === "compare" ? (
        <S h="Compared">
          <div className="topic-compare">
            {["left", "right"].map((side) => {
              const d = topic.diagram![side] as { title: string; points: string[] };
              return (
                <div key={side}>
                  <p className="topic-compare-title">{d.title}</p>
                  <ul>{d.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </S>
      ) : null}

      {topic.table ? (
        <S h="At a glance">
          <div className="topic-table-wrap">
            <table className="topic-table">
              <thead>
                <tr>{topic.table.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {topic.table.rows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </S>
      ) : null}

      <S h="In this project"><p>{topic.in_this_project}</p></S>

      {topic.sections.map((s) => (
        <S key={s.heading} h={s.heading}><p>{s.body}</p></S>
      ))}

      {topic.tradeoffs.advantages.length || topic.tradeoffs.limitations.length ? (
        <S h="Trade-offs">
          <div className="topic-compare">
            {topic.tradeoffs.advantages.length ? (
              <div>
                <p className="topic-compare-title">Advantages</p>
                <ul>{topic.tradeoffs.advantages.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            ) : null}
            {topic.tradeoffs.limitations.length ? (
              <div>
                <p className="topic-compare-title">Limitations</p>
                <ul>{topic.tradeoffs.limitations.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            ) : null}
          </div>
        </S>
      ) : null}

      {topic.pitfalls.length ? (
        <S h="Common mistakes">
          <ul className="topic-list">{topic.pitfalls.map((p) => <li key={p}>{p}</li>)}</ul>
        </S>
      ) : null}

      {topic.when.use.length || topic.when.avoid.length ? (
        <S h="When to use it">
          <div className="topic-compare">
            {topic.when.use.length ? (
              <div>
                <p className="topic-compare-title">Reach for it when</p>
                <ul>{topic.when.use.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            ) : null}
            {topic.when.avoid.length ? (
              <div>
                <p className="topic-compare-title">Avoid it when</p>
                <ul>{topic.when.avoid.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            ) : null}
          </div>
        </S>
      ) : null}

      {topic.interacts_with.length ? (
        <S h="How it interacts with the rest of the system">
          <p className="topic-chips">
            {topic.interacts_with.map((id) => (
              <span key={id} className="topic-chip">
                {byId.get(id)?.title ?? id.replace(/-/g, " ")}
              </span>
            ))}
          </p>
        </S>
      ) : null}

      {topic.code ? (
        <S h="Where it lives in this repository">
          <p className="mono text-[length:var(--t-75)]">
            {topic.code.file} · {topic.code.symbol}
          </p>
        </S>
      ) : null}
    </>
  );
}
