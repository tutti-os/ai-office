import templateLibrary from "./template.json";

export type GensparkTemplate = {
  id: string;
  name: string;
  classification: string;
  content: string;
  screenshot_cdn_url?: string;
  screenshot_width?: number;
  screenshot_height?: number;
};

export const allTemplatesLabel = "All Templates";

export const gensparkTemplates = (templateLibrary as GensparkTemplate[])
  .filter((template) => template.id && template.name && template.content)
  .map((template) => ({
    ...template,
    classification: template.classification || "Uncategorized",
  }));

export const templateCategories = [
  allTemplatesLabel,
  ...Array.from(new Set(gensparkTemplates.map((template) => template.classification))).sort((a, b) => a.localeCompare(b)),
];

export const templateCounts = gensparkTemplates.reduce<Record<string, number>>((counts, template) => {
  counts[template.classification] = (counts[template.classification] ?? 0) + 1;
  return counts;
}, {});

export function templatesForCategory(category: string) {
  return category === allTemplatesLabel
    ? gensparkTemplates
    : gensparkTemplates.filter((template) => template.classification === category);
}
