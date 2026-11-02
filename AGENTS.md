# Project working preferences

## UI/UX quality — explicit user requirement

The user requires polished, consistent UI/UX for every feature. They have repeatedly rejected functional changes that look awkward or bolted onto the existing interface. Treat visual quality and ease of use as acceptance criteria, not optional follow-up work.

- Inspect the surrounding screen before changing its UI. Match its typography, colors, spacing, control heights, borders, and interaction patterns.
- Design the whole affected section together. Avoid squeezing new controls into existing rows, awkward label wrapping, oversized buttons, uneven alignment, and unnecessary visual clutter.
- Give search, filters, counts, and reset actions a clear hierarchy. Use concise labels and sensible grouping; keep secondary actions visually secondary.
- Keep routine workflows simple. Show implementation details only when they help the user make a decision.
- Provide appropriate empty, loading, error, and disabled states. Use accessible labels and keyboard-operable controls.
- Check desktop and narrow layouts for overflow, wrapping, spacing, and usability.
- Visually inspect the rendered result and exercise the affected interactions before calling a UI change finished. A passing build or screenshot capture alone is not visual verification. Fix visible problems rather than merely reporting them.
- Preserve company records during verification; use unsaved UI interactions or isolated fixtures where possible.

This preference applies to future work throughout the payroll app, including small additions such as filters.
