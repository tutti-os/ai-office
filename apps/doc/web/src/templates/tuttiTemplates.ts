import type { DocumentLibraryTemplate } from "@ai-doc/shared";

export type TuttiTemplate = DocumentLibraryTemplate;

export const allTemplatesLabel = "All Templates";

export function normalizeTemplates(templates: TuttiTemplate[]) {
  return templates
    .filter((template) => template.id && template.name)
    .map((template) => ({
      ...template,
      classification: template.classification || "Uncategorized",
    }));
}

export function templateCategoriesFor(templates: TuttiTemplate[]) {
  return [
    allTemplatesLabel,
    ...Array.from(new Set(templates.map((template) => template.classification))).sort((a, b) => a.localeCompare(b)),
  ];
}

export function templateCountsFor(templates: TuttiTemplate[]) {
  return templates.reduce<Record<string, number>>(
    (counts, template) => {
      counts[allTemplatesLabel] = (counts[allTemplatesLabel] ?? 0) + 1;
      counts[template.classification] = (counts[template.classification] ?? 0) + 1;
      return counts;
    },
    { [allTemplatesLabel]: 0 },
  );
}

export function templatesForCategory(templates: TuttiTemplate[], category: string) {
  return category === allTemplatesLabel
    ? templates
    : templates.filter((template) => template.classification === category);
}

export const tuttiTemplates: TuttiTemplate[] = [];
export const templateCategories = [allTemplatesLabel];
export const templateCounts: Record<string, number> = { [allTemplatesLabel]: 0 };
