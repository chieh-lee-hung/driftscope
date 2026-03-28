"use client";

import { useState } from "react";

export function SetupSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="setup-section">
      <button
        type="button"
        className="setup-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        How to integrate
        <span className="setup-arrow">{open ? "↑" : "→"}</span>
      </button>
      {open && (
        <div className="setup-code-wrap">
          <div className="code-block">
            <pre>
              <span className="code-comment"># install and initialise once</span>{"\n"}
              <span className="code-keyword">from</span> <span className="code-fn">driftscope</span> <span className="code-keyword">import</span> <span className="code-fn">DriftScope</span>{"\n"}
              <span className="code-fn">ds</span> = <span className="code-fn">DriftScope</span>(<span className="code-str">project=&quot;my-real-agent&quot;</span>){"\n"}
              {"\n"}
              <span className="code-keyword">@</span><span className="code-fn">ds.trace</span>{"\n"}
              <span className="code-keyword">def </span><span className="code-fn">run_agent</span>(query: str) -{"{"}{">"} str:{"\n"}
              {"    "}<span className="code-keyword">return</span> agent.run(query)
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
