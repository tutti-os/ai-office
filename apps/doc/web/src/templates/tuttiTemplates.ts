import type { DocumentLibraryTemplate } from "@ai-doc/shared";

export type TuttiTemplate = DocumentLibraryTemplate;

export const allTemplatesLabel = "All Templates";

const featuredTemplateOrder = [
  "79ac44f0-385c-4409-ae11-d19d66f242ee", // Art Gallery Showcase Poster
  "ef07c326-d8a2-4b92-91b9-b9a50e64affb", // Basketball Tournament Poster
  "83bdfe9f-79d9-47af-bab1-74b58cc52b45", // Dinner Menu
  "1a1a4258-68ee-47b0-98e7-afe3b0cc6fea", // Brand Story Page
  "978e3083-3bba-44fc-9caf-170031d74ea6", // Creative UX/UI Designer Resume
  "00fec139-a205-4800-8b12-338e5417fc9b", // Academic Research Poster
  "fcad6782-fc04-4400-b03b-9f8132057b3c", // Company Annual Report
  "d3d0125d-d587-412f-ab13-66cc2c60e119", // Social Media Analytics Dashboard
  "4bbb2def-d4b4-4bef-a9c9-e59e835d5905", // Sustainability Impact Report
  "7c31ecec-f710-46f5-8cbc-0feb73f98a2b", // Business Model Canvas
  "7a7a0fc7-52be-4678-b13b-34765dbae77d", // Product Launch Event Agenda
  "016bab43-cd7d-4fe6-abc8-661886fe3347", // Bold Digital Marketing Specialist Resume
] as const;

const featuredTemplateRanks = new Map<string, number>(featuredTemplateOrder.map((id, index) => [id, index]));

export function normalizeTemplates(templates: TuttiTemplate[]) {
  return templates
    .filter((template) => template.id && template.name)
    .map((template) => ({
      ...template,
      classification: template.classification || "Uncategorized",
    }))
    .sort((a, b) => templateVisualRank(a) - templateVisualRank(b));
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

function templateVisualRank(template: TuttiTemplate) {
  return featuredTemplateRanks.get(template.id) ?? featuredTemplateOrder.length;
}

export const tuttiTemplates: TuttiTemplate[] = [];
export const templateCategories = [allTemplatesLabel];
export const templateCounts: Record<string, number> = { [allTemplatesLabel]: 0 };
