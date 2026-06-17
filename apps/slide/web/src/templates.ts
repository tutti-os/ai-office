import type { SlideTemplate } from "@ai-slide/shared";

export type { SlideTemplate };
export type OutputType = "html" | "pptx";

export const allTemplatesCategory = "All";

export function allCategoriesForTemplates(templates: SlideTemplate[]) {
  return Array.from(new Set(templates.map((template) => template.category))).sort((a, b) => a.localeCompare(b));
}

export function categoryCountsForTemplates(templates: SlideTemplate[]) {
  return templates.reduce<Record<string, number>>((counts, template) => {
    counts[template.category] = (counts[template.category] ?? 0) + 1;
    return counts;
  }, {});
}
