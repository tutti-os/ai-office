export type DefaultDeckSkillFile = {
  path: string;
  content: string;
};

export const defaultDeckSkillSlug = "deck-authoring";

export const defaultDeckSkillFiles: DefaultDeckSkillFile[] = [
  {
    path: "SKILL.md",
    content: `---
name: ai-slide-blank-deck-authoring
display_name: Author Blank AI Slide Decks
description: Blank-deck methodology for AI Slide projects created without a template. Use only when no template-specific skill is present.
---

# Author Blank AI Slide Decks

You are creating or editing an HTML slide deck inside AI Slide from a blank project. The app system prompt already provides the shared deck file contract and layout quality gates. Use this skill for the extra product work needed when no template has already supplied a visual system or authoring method.

## Blank Deck Method

1. Decide the deck mode before writing slides:
   - Speaker-led: one idea per slide, large type, 1-3 bullets max, more slides.
   - Reading-first: structured grids/tables/cards, concise explanatory copy, still no cramped text.
2. Establish one visual system for the whole deck:
   - Palette: 2-3 core colors plus one accent.
   - Typography: one display voice and one body voice. Avoid default-looking stacks unless the product context demands restraint.
   - Layout rhythm: repeat margins, columns, card geometry, headers, page numbers, and section markers.
3. Build reusable slide patterns:
   - Cover / section divider / thesis statement.
   - Two-column comparison.
   - 3-5 card grid.
   - Metric or pricing card.
   - Timeline or process.
   - Decision / recommendation slide.
4. Generate the deck from the outline, not slide-by-slide improvisation. If content does not fit the chosen pattern, split it.

## Blank Deck Starting Point

- Blank projects are initialized by the app with \`deck.slides/manifest.json\` and a 1920x1080 canvas. Preserve that canvas.
- Start with a compact outline: audience, decision or takeaway, section arc, and expected number of slides.
- Choose one deck mode before writing slides: speaker-led or reading-first.
- Define CSS variables for the deck's palette, spacing, type scale, card shape, and accent behavior before generating many slides.
- Create a small set of reusable classes in \`deck.slides/assets/styles.css\` and reuse them across slides instead of scattering unrelated inline styles everywhere.
- If the user asks for a business deck, include an explicit recommendation or decision slide rather than hiding the ask in a decorative banner.

Read \`references/blank-deck-patterns.md\` for practical blank-deck layout patterns.
`,
  },
  {
    path: "references/blank-deck-patterns.md",
    content: `# Blank Deck Patterns

Use these patterns when a blank project has no template to lean on.

## Density Modes

Speaker-led slides:
- 1 core thought.
- 1 headline or 1 visual structure.
- 1-3 support points.
- Large type and generous negative space.

Reading-first slides:
- 1 clear hierarchy.
- 4-8 short bullets, or 4-6 cards, or one readable table.
- Use labels, dividers, captions, and contrast to guide scanning.

If a slide needs both a detailed comparison and a decision ask, reserve space for the decision ask in the layout from the beginning.

## Useful Slide Recipes

- Thesis cover: short label, large title, compact subtitle, one visual motif.
- Section divider: section number, section promise, 1-2 proof points.
- Two-column comparison: symmetrical columns, explicit labels, one highlighted delta.
- Card grid: 3-5 cards with equal heights and consistent internal hierarchy.
- Metric slide: one hero number plus 2-4 supporting metrics, not a wall of numbers.
- Process or timeline: 3-6 steps with verbs as headings.
- Decision slide: recommendation, rationale, owner, next action, and risk.

## Blank Deck Typography Defaults

- Cover/title: usually 72-128px depending on density.
- Section headline: 56-88px.
- Body: usually 28-40px.
- Captions/meta: usually 18-24px.
- Avoid body text below 22px on 1920x1080 unless it is nonessential metadata.
- Line-height should be intentional: tight for display, relaxed for body.

## Visual System Seeds

Every deck needs a recognizable system:
- repeated margins and alignments;
- consistent card radius and border treatment;
- consistent section labels and page numbers;
- one accent behavior, not many unrelated accents.

Avoid generic AI aesthetics:
- random purple/blue gradients;
- too many floating cards;
- ornamental blobs that do not support the content;
- every slide using the same centered hero layout.
`,
  },
];
