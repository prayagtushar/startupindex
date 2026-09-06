# Design source

The artboards behind the September 2026 redesign. Each `.dc.html` is one screen,
and `canvas.json` places them on a single canvas.

```
Main.dc.html       Chat, arrival state (carries a light/dark toggle)
Answer.dc.html     Chat with an answer, citations and the trace rail
Lab.dc.html        Retrieval Lab, four stages side by side
Startups.dc.html   Startups grid
Tokens.dc.html     The palette, the type scale, and what changed
```

`Tokens.dc.html` is the spec the app follows. Every value in it — the five hues,
their measured contrast ratios, the six type steps, the channel sigils — is what
`apps/web/app/globals.css` ships. If the two disagree, the CSS is wrong.

These files are authored for Claude Design's canvas format: the `{{holes}}` and
`<sc-for>` tags render there, not in a plain browser. Opening one directly shows
the layout with its bindings unresolved, which is expected.

The published canvas is a build artifact assembled from these sources and is not
committed — it is roughly 2.4 MB, most of which is the editor runtime.
