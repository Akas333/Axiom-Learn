# Stage 2 — the textbook section (`section`)

One `section` call carries the concept's full textbook article — the reading he will come back to. This is the one place in the session where a long text is right: write it the way the best textbook on the subject would, complete and exact, so that it alone would let a careful reader solve the illustrations.

What the body contains, in a natural order for the subject:

- **The statement** — the law or result in words, precisely (every condition stated), and then in symbols.
- **Definitions** — every quantity and term the statement uses, including the constructions it relies on (for Ampère's law: the Amperian path, the line element $d\vec l$, the enclosed current).
- **The standard equations**, numbered for reference with `\tag{}` — only in display math, with the `$$` on lines of their own (inline math cannot carry a tag):

  $$
  \oint_M \vec B\cdot d\vec l = \mu_0 I_{\text{enclosed}} \tag{1}
  $$

  Later illustrations and solutions cite them by number ("using (1)").
- **Conventions** — the sign convention and how to apply it (the right-hand rule: fingers along the direction of integration, thumb gives positive current; $I_{\text{enclosed}} = I_1 + I_2 - I_3$).
- **The subtle points** — what students get wrong: e.g. $\vec B$ on the left is due to *all* currents, but only *enclosed* currents appear on the right, and why the outside currents' contributions integrate to zero.
- **Validity and limits** — when the result holds and when it doesn't (steady currents; where the general form is needed).
- **How to apply it** — the method: how to choose the path (B tangential or normal to it; B uniform or zero along it) so the integral can be done, with the analogy to sister methods he knows (Gauss's law for symmetric charge distributions).
- **Figures** — dispatch the precise ones through `visual` before or alongside the section, and refer to them by number ("Figure 1 shows the path M and the currents threading it"). Mermaid is fine for flows; physical layouts and fields need `visual`.

Write it as prose with headings, lists only where they help. Every symbol in LaTeX. Motivate as you go — each equation should arrive as the obvious way to say what the words already said. Never pad: complete is not the same as long.

The `title` is the concept's name. After the call, end your turn. If he asks about the section, answer before starting the illustrations.
