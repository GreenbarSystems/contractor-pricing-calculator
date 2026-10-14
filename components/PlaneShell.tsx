"use client";

import { useEffect, useState, type ReactNode } from "react";
import { copy } from "../host/copy.js";
import { applyPlaneDraft, collectPlaneDraft } from "../lib/planeBridge.js";

type Link = { noun: string; label: string; url: string };
type Row =
  | {
      kind: "version";
      version: string;
      note: string;
      change: { kind: string };
      at: number;
      onGitHub: { kind: string; link?: Link };
    }
  | { kind: "review"; review: number; event: string; at: number; link: Link };
type Card = {
  kind: "publish";
  id: string;
  upTo: { note: string };
  effects: { opensPullRequest: boolean; changesLive: { rows: number }; needs: { kind: string }[] };
};
type Question = { id: string; files: { path: string; combined: string }[] };
type View = {
  live: { version: string; branch: Link; visibility: string };
  draft: { kind: "none" } | { kind: "open"; head: string; branch: Link; review: { kind: string; link?: Link } };
  timeline: Row[];
  next:
    | { kind: "nothing" }
    | {
        kind: "yours";
        move:
          | { kind: "click"; card: Card }
          | { kind: "choose"; question: Question }
          | { kind: "fix"; blocker: { kind: string; message?: string }; link: Link };
      }
    | { kind: "theirs"; waitingOn: { kind: string }[]; share: Link };
};

type Payload = {
  view?: View;
  thread?: { id: string; prompt: string; note: string }[];
  error?: string;
  copy?: typeof copy;
  preview?: unknown;
};

export function PlaneShell({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Payload | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text) as Payload;
    } catch {
      throw new Error(text.trim().slice(0, 200) || "The host did not answer.");
    }
  };

  const reload = async () => {
    const res = await fetch("/api/plane/view");
    const json = await take(res);
    setData(json);
    applyPlaneDraft(json.preview);
    if (!res.ok) setError(json.error ?? copy.notLinked);
    else setError(null);
  };

  useEffect(() => {
    void reload().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : copy.cannotPush);
    });
  }, []);

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const json = await take(res);
      if (!res.ok) {
        setError(json.error ?? "That did not work.");
        return;
      }
      if (url.endsWith("/prompt")) setPrompt("");
      setData(json.view ? json : await take(await fetch("/api/plane/view")));
      applyPlaneDraft(json.preview);
    } catch (caught) {
      setError(caught instanceof Error ? (caught.name === "AbortError" ? "Still saving timed out." : caught.message) : "That did not work.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
      await reload().catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : copy.cannotPush);
      });
    }
  };

  const view = data?.view;
  const thread = data?.thread ?? [];
  const current = view?.timeline[0];
  const previous = view?.timeline.find((row, index) => index > 0 && row.kind === "version");

  return (
    <div className="plane-shell">
      <section className="plane-pane plane-thread" aria-label="Thread">
        <h2>Thread</h2>
        {thread.length === 0 ? (
          <p className="plane-muted">{copy.empty}</p>
        ) : (
          thread.map((turn) => (
            <div className="plane-turn" key={turn.id}>
              <div>{turn.prompt}</div>
              {previous && current && current.kind === "version" ? (
                <button
                  className="plane-secondary"
                  type="button"
                  onClick={() => void post("/api/plane/restore", { to: previous.kind === "version" ? previous.version : "" })}
                >
                  {copy.undo}
                </button>
              ) : null}
            </div>
          ))
        )}
        <label className="plane-label">
          Describe a change
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void post("/api/plane/prompt", { prompt, draft: collectPlaneDraft() })}
        >
          Send
        </button>
        {busy ? <p className="plane-muted">{copy.busy}</p> : null}
        {error ? <p className="plane-error">{error}</p> : null}
        {view ? <NextPanel view={view} onPublish={() => void post("/api/plane/publish", {})} onConfirm={(id) => void post("/api/plane/confirm", { card: id })} /> : null}
      </section>
      <section className="plane-preview" aria-label="Preview">
        {children}
      </section>
      <aside className="plane-pane plane-versions" aria-label="Versions">
        <div className="plane-row">
          <h2>{copy.draft}</h2>
          {view?.draft.kind === "open" ? (
            <a href={view.draft.branch.url} target="_blank" rel="noreferrer">
              {copy.openOnGitHub}
            </a>
          ) : (
            <span className="plane-muted">{copy.noDraft}</span>
          )}
        </div>
        <div className="plane-row">
          <h2>{copy.live}</h2>
          {view ? (
            <a href={view.live.branch.url} target="_blank" rel="noreferrer">
              {copy.openOnGitHub}
            </a>
          ) : null}
        </div>
        <ul className="plane-list">
          {!view || view.timeline.length === 0 ? (
            <li className="plane-muted">{copy.empty}</li>
          ) : (
            view.timeline.map((row) => (
              <li key={row.kind === "version" ? row.version : `${row.event}-${row.review}`}>
                {row.kind === "version" ? (
                  <>
                    <div>{row.note}</div>
                    {row.onGitHub.kind === "yes" && row.onGitHub.link ? (
                      <a href={row.onGitHub.link.url} target="_blank" rel="noreferrer">
                        {row.onGitHub.link.label}
                      </a>
                    ) : (
                      <span className="plane-muted">Not on GitHub yet</span>
                    )}
                  </>
                ) : (
                  <>
                    <div>{row.event === "published" ? "Published to live" : "Asked for review"}</div>
                    <a href={row.link.url} target="_blank" rel="noreferrer">
                      {row.link.label}
                    </a>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  );
}

function NextPanel({
  view,
  onPublish,
  onConfirm,
}: {
  view: View;
  onPublish: () => void;
  onConfirm: (id: string) => void;
}) {
  if (view.next.kind === "nothing") {
    return (
      <p>
        <button type="button" className="plane-secondary" onClick={onPublish}>
          {copy.publish}
        </button>
      </p>
    );
  }
  if (view.next.kind === "theirs") {
    return (
      <div className="plane-wait">
        {copy.waiting}
        <div>
          <a href={view.next.share.url} target="_blank" rel="noreferrer">
            {view.next.share.label}
          </a>
        </div>
      </div>
    );
  }
  const move = view.next.move;
  if (move.kind === "click") {
    return (
      <div className="plane-card">
        <div>Publish to live, up to {move.card.upTo.note}.</div>
        {move.card.effects.needs.length > 0 ? (
          <p className="plane-muted">A person or a check still stands in the way.</p>
        ) : (
          <p className="plane-muted">This click publishes the draft.</p>
        )}
        <button type="button" onClick={() => onConfirm(move.card.id)}>
          {copy.publish}
        </button>
      </div>
    );
  }
  if (move.kind === "fix") {
    return (
      <div className="plane-error">
        {copy.fix}
        <div>
          <a href={move.link.url} target="_blank" rel="noreferrer">
            {move.link.label}
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="plane-question">
      <div className="plane-picker">
        <strong>{copy.thisDraft}</strong>
        <strong>{copy.incoming}</strong>
      </div>
      {move.question.files.map((file) => (
        <div key={file.path}>{file.path}</div>
      ))}
    </div>
  );
}
