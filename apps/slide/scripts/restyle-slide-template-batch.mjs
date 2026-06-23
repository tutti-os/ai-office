import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.resolve(process.env.AI_SLIDE_TEMPLATE_ROOT ?? path.join(appRoot, "templates", "source"));

const profiles = {
  "kakenhi-nrf-grant": {
    name: "review dossier indigo",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Alegreya+Sans:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;700&display=swap');",
    bodyFont: "'Alegreya Sans','Noto Sans JP','IBM Plex Sans',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(238,232,216,0.28) 0%, rgba(255,255,255,0) 42%), radial-gradient(circle at 92% 10%, rgba(182,113,61,0.10), transparent 26%), #FBFAF5",
    textureCss:
      "linear-gradient(90deg, rgba(23,52,92,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(23,52,92,0.025) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#0F2A4E": "#17345C",
      "#1B3A66": "#23507E",
      "#2A4F86": "#3F6E97",
      "#B91C2C": "#C43A31",
      "#E8C4C8": "#F0D8CF",
      "#0B1426": "#172033",
      "#2C3E5C": "#354660",
      "#6B7A92": "#697990",
      "#D6DCE6": "#D8D4C8",
      "#E8ECF2": "#EEE9DD",
      "#F7F9FC": "#F6F2E8",
      "#FFFFFF": "#FBFAF5",
      "#B08D57": "#B6713D",
    },
  },
  "lab-meeting-weekly": {
    name: "graph-paper lab log",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono',ui-monospace,Menlo,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(36,87,197,0.06), rgba(255,255,255,0) 48%), radial-gradient(circle at 88% 18%, rgba(228,91,73,0.12), transparent 24%), #FCFBF7",
    textureCss:
      "linear-gradient(90deg, rgba(36,87,197,0.045) 1px, transparent 1px), linear-gradient(0deg, rgba(32,36,44,0.035) 1px, transparent 1px)",
    textureSize: "48px 48px",
    replacements: {
      "#1A1F2A": "#20242C",
      "#3A4150": "#424957",
      "#6B7280": "#667084",
      "#FFFFFF": "#FCFBF7",
      "#E45858": "#E45B49",
      "#E7EAEE": "#E7E3D8",
      "#9BA3AF": "#9AA2AD",
      "#1F4FB6": "#2457C5",
      "#D7DBE1": "#D7D2C5",
      "#1F8A4C": "#16885B",
      "#F4F6F8": "#F3EFE5",
      "#C98A1A": "#B87916",
    },
  },
  "nature-conference-readout": {
    name: "fieldnotes journal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 8% 12%, rgba(12,113,92,0.09), transparent 25%), radial-gradient(circle at 96% 4%, rgba(167,91,34,0.13), transparent 22%), #FEFCF4",
    textureCss:
      "linear-gradient(90deg, rgba(27,42,70,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(27,42,70,0.025) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#1A1A2E": "#1B2A46",
      "#16213E": "#203A5F",
      "#233455": "#345478",
      "#10B981": "#0C9B74",
      "#0A8F66": "#087B61",
      "#0E7C7B": "#0C715C",
      "#E6F4F3": "#E5F1EC",
      "#B8650A": "#A75B22",
      "#FBEFD9": "#F7E8CE",
      "#FFFFFF": "#FEFCF4",
      "#D9DCE3": "#D9D5C8",
      "#ECEEF2": "#ECE7DA",
      "#5A6072": "#60687A",
      "#3A4A6A": "#405570",
      "#E6E8F0": "#E8E2D5",
      "#A8B3CC": "#9FAFC0",
      "#0A4948": "#0A4E43",
      "#0E223F": "#112944",
      "#5A2F00": "#5A3214",
    },
  },
  "neurips-oral-presentation": {
    name: "cobalt proof stage",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 82% 8%, rgba(0,180,216,0.13), transparent 24%), radial-gradient(circle at 6% 88%, rgba(247,70,117,0.11), transparent 26%), #F9F8F0",
    textureCss:
      "linear-gradient(90deg, rgba(20,38,77,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(20,38,77,0.028) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#D72660": "#F04675",
      "#FAFAF7": "#F9F8F0",
      "#1B1B1B": "#171B26",
      "#0F1F3D": "#14264D",
      "#E3E3DD": "#E4DFD2",
      "#8A8A8A": "#737D8B",
      "#FFFFFF": "#FDFCF7",
      "#0A1530": "#071A38",
    },
  },
  "phd-thesis-defense": {
    name: "dissertation slate",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(20,48,78,0.055), rgba(255,255,255,0) 44%), radial-gradient(circle at 92% 12%, rgba(158,42,43,0.09), transparent 24%), #FFFCF3",
    textureCss:
      "linear-gradient(90deg, rgba(20,48,78,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(20,48,78,0.025) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#8C1515": "#9E2A2B",
      "#6B0F0F": "#7E1F24",
      "#0B2545": "#14304E",
      "#334155": "#38465A",
      "#64748B": "#68788E",
      "#CBD5E1": "#D4CEC1",
      "#F1F5F9": "#F4EFE5",
      "#FFFFFF": "#FFFCF3",
      "#94A3B8": "#91A1B0",
      "#E2E8F0": "#E6DFD0",
    },
  },
  "enterprise-ai-copilot-rollout-brief": {
    name: "executive mint control room",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,750&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Fraunces','Source Serif Pro',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(0,105,72,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(0,128,180,0.13), transparent 24%), #FBFCF8",
    textureCss:
      "linear-gradient(90deg, rgba(0,85,58,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.028) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#00553A": "#006948",
      "#003D2A": "#004832",
      "#E6EFEC": "#E5F2EC",
      "#0078D4": "#0080B4",
      "#E5F1FB": "#E2F3F8",
      "#0F172A": "#111B2E",
      "#1F2937": "#243144",
      "#475569": "#536176",
      "#94A3B8": "#95A5B6",
      "#E2E8F0": "#DDE6E5",
      "#F3F4F6": "#F0F3ED",
      "#F8FAFC": "#FBFCF8",
      "#FFFFFF": "#FBFCF8",
      "#fff": "#FBFCF8",
      "#FFF": "#FBFCF8",
      "#B45309": "#B66A16",
      "#FEF3C7": "#F7E7BE",
      "#BE123C": "#C12B4E",
      "#FEE2E2": "#F7DDDA",
      "#9DC3B5": "#9ED2C0",
    },
  },
  "ai-vertical-industry-briefing-deck": {
    name: "clinical operator briefing",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Public Sans','Inter',system-ui,sans-serif",
    serifFont: "'Spectral','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(23,76,115,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 92% 10%, rgba(13,126,110,0.10), transparent 25%), #FDFEFB",
    textureCss:
      "linear-gradient(90deg, rgba(23,76,115,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(12,16,20,0.026) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#0A0A0A": "#0B1014",
      "#1F4E79": "#174C73",
      "#374151": "#37485A",
      "#6B7280": "#667486",
      "#0F766E": "#0D7E6E",
      "#E5E7EB": "#E2E7E7",
      "#D1D5DB": "#CDD7D6",
      "#B45309": "#A96616",
      "#F9FAFB": "#F4F8F6",
      "#FFFFFF": "#FDFEFB",
    },
  },
  "ai-model-capability-selection-deck": {
    name: "routing lab magenta",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');",
    bodyFont: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
    monoFont: "'Space Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 12%, rgba(194,24,91,0.10), transparent 24%), linear-gradient(135deg, rgba(0,128,111,0.06), rgba(255,255,255,0) 46%), #FBFBF6",
    textureCss:
      "linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(0,128,111,0.035) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#6B7280": "#697386",
      "#0F766E": "#00806F",
      "#E2247F": "#C2185B",
      "#000000": "#080A0E",
      "#000": "#080A0E",
      "#E5E7EB": "#E2E2DA",
      "#A1A1AA": "#9AA0A9",
      "#374151": "#39465A",
      "#1F2937": "#223044",
      "#D97706": "#BF7416",
      "#9CA3AF": "#9AA3AF",
      "#FAFAFA": "#FBFBF6",
      "#FFFFFF": "#FEFDF8",
      "#fff": "#FEFDF8",
      "#FFF": "#FEFDF8",
      "#B91C1C": "#B02A2A",
      "#B45309": "#A86412",
      "#F1F5F9": "#F1F3EA",
      "#71717A": "#747887",
    },
  },
  "ai-101-explainer-deck": {
    name: "public radio explainer",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,650&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Newsreader','Source Serif 4',Georgia,serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(11,29,52,0.055), rgba(255,255,255,0) 42%), radial-gradient(circle at 88% 8%, rgba(207,68,85,0.10), transparent 24%), #E9F1EE",
    textureCss:
      "linear-gradient(90deg, rgba(11,29,52,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(11,29,52,0.026) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#0F1A2C": "#0B1D34",
      "#D6435B": "#CF4455",
      "#2C3A52": "#2A4057",
      "#EAF0F4": "#E9F1EE",
      "#5A6982": "#5E6E83",
      "#9AAABF": "#98A8B2",
      "#DCE5EC": "#D9E6E2",
      "#FFFFFF": "#FEFCF6",
      "#E5B92C": "#D2A726",
      "#7FB07F": "#73A985",
      "#7E91AB": "#7D93A8",
    },
  },
  "ai-landscape-report-deck": {
    name: "venture broadsheet redline",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    serifFont: "'Libre Baskerville','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(143,27,45,0.045), rgba(255,255,255,0) 45%), radial-gradient(circle at 94% 9%, rgba(31,111,67,0.08), transparent 24%), #FFFEFA",
    textureCss:
      "linear-gradient(90deg, rgba(26,26,26,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(143,27,45,0.026) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#1A1A1A": "#171716",
      "#6B6B6B": "#696A67",
      "#E5E5E5": "#E2DED6",
      "#A6192E": "#8F1B2D",
      "#3A3A3A": "#3B3C39",
      "#FFFFFF": "#FFFEFA",
      "#1F6F43": "#1F6F43",
      "#F2F2F2": "#F4F0E8",
      "#8A8A8A": "#898A86",
      "#B47A00": "#A97408",
    },
  },
  "b2b-saas-sales-proposal": {
    name: "enterprise deal desk amber",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,500;0,650;1,500&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Source Serif 4','Source Serif Pro',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(22,47,84,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 92% 10%, rgba(218,103,36,0.12), transparent 24%), #FFFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(22,47,84,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(218,103,36,0.026) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#F26B1F": "#DA6724",
      "#475569": "#546178",
      "#0F172A": "#111A2C",
      "#FFFFFF": "#FFFCF7",
      "#1A2B4A": "#162F54",
      "#8FA0BD": "#96A6BD",
      "#E2E8F0": "#E0E5E7",
      "#CBD5E1": "#CCD5DC",
      "#F1F5F9": "#F3F1EA",
      "#B91C1C": "#B43A2F",
      "#0E8A5F": "#0A8666",
      "#FDEADD": "#F8E8D8",
      "#2A3B5A": "#2D4266",
    },
  },
  "chain-franchise-recruitment-deck": {
    name: "qsr operator ledger",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,650;8..60,750&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Roboto Condensed','Inter',system-ui,sans-serif",
    serifFont: "'Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(34,42,48,0.06), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(181,54,40,0.12), transparent 24%), #ECEDEA",
    textureCss:
      "linear-gradient(90deg, rgba(34,42,48,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(181,54,40,0.026) 1px, transparent 1px)",
    textureSize: "54px 54px",
    replacements: {
      "#1F2933": "#222A30",
      "#7E8B98": "#7E8991",
      "#C0392B": "#B53628",
      "#9CA8B5": "#98A4AE",
      "#C9CFD5": "#C8CED0",
      "#E2E6EA": "#E1E4E2",
      "#FFFFFF": "#FCFBF6",
      "#EDEFF1": "#ECEDEA",
      "#4A5562": "#49535D",
      "#2F6F4F": "#2B7450",
      "#3A4552": "#3A454E",
      "#2C3641": "#303942",
      "#FFEAE6": "#F8E6DE",
      "#8E2A20": "#86281F",
    },
  },
  "ibd-company-roadshow-deck": {
    name: "institutional navy prospectus",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    serifFont: "'Libre Caslon Text','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(8,38,70,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 10%, rgba(198,164,82,0.13), transparent 24%), #FAFBF7",
    textureCss:
      "linear-gradient(90deg, rgba(8,38,70,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(198,164,82,0.026) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#E8EAF0": "#E6E8ED",
      "#0A2540": "#082646",
      "#6B7689": "#69778B",
      "#C9A957": "#C6A452",
      "#B08D2F": "#A9822A",
      "#FFFFFF": "#FAFBF7",
      "#FFF": "#FAFBF7",
      "#2B4768": "#2A4C70",
      "#D7DBE2": "#D6DBE0",
      "#8FA0B8": "#8EA0B5",
      "#3B4A60": "#3C4D63",
      "#F5F7FB": "#F5F6F2",
      "#8B1F1F": "#8D2A27",
      "#FAFBFD": "#FAFBF7",
      "#13365A": "#123A60",
      "#0E2E4E": "#0D3154",
      "#E6EAF2": "#E6E8EF",
      "#6E7F97": "#6E7E93",
      "#C7D2E1": "#C5D0DC",
      "#1F5C3A": "#1F6845",
    },
  },
  "sales-battlecard": {
    name: "competitive command center",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Archivo','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 12%, rgba(230,57,70,0.13), transparent 24%), linear-gradient(135deg, rgba(16,185,129,0.06), rgba(255,255,255,0) 48%), #F8FAF7",
    textureCss:
      "linear-gradient(90deg, rgba(12,18,32,0.045) 1px, transparent 1px), linear-gradient(0deg, rgba(230,57,70,0.03) 1px, transparent 1px)",
    textureSize: "48px 48px",
    replacements: {
      "#DC2626": "#E63946",
      "#F9FAFB": "#F8FAF7",
      "#64748B": "#66768A",
      "#0F172A": "#101827",
      "#E2E8F0": "#DDE5E8",
      "#94A3B8": "#95A5B8",
      "#16A34A": "#10A66A",
      "#FFFFFF": "#FEFEFA",
      "#FFF": "#FEFEFA",
      "#1E293B": "#202B3E",
      "#F59E0B": "#D89113",
      "#475569": "#536178",
      "#CBD5E1": "#CBD6DE",
      "#0B1220": "#0C1220",
      "#FEF2F2": "#F8E8E7",
      "#FCA5A5": "#F1A0A1",
      "#F1F5F9": "#F2F4EF",
    },
  },
  "customer-qbr-renewal-deck": {
    name: "renewal healthroom teal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,650&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(13,126,112,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(191,91,63,0.11), transparent 24%), #F7F8F3",
    textureCss:
      "linear-gradient(90deg, rgba(13,126,112,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(31,41,51,0.026) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#1F2933": "#202A34",
      "#6C7A89": "#6D7B88",
      "#0F766E": "#0D7E70",
      "#F4F6F8": "#F7F8F3",
      "#A7E8DD": "#A8E5D8",
      "#9AA6B2": "#98A6AF",
      "#EEF1F4": "#EEF2EE",
      "#E2E7EC": "#E0E8E6",
      "#3A4654": "#3A4852",
      "#E6F4F1": "#E3F3EC",
      "#B45309": "#A66A16",
      "#FFFFFF": "#FEFEF9",
      "#FEF3E2": "#F7EBD7",
      "#27313D": "#293541",
      "#FFD89B": "#F2CC8F",
      "#B91C1C": "#B43A30",
      "#FCE7E2": "#F6E2DC",
      "#1F8C82": "#218E82",
      "#C8553D": "#BF5B3F",
      "#D9DEE3": "#D9DFE0",
    },
  },
  "case-interview-deck": {
    name: "strategy case bluebook",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;500;600;700&family=Aptos:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Aptos','Inter',system-ui,sans-serif",
    serifFont: "'Source Serif 4','IBM Plex Serif',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(28,67,137,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 92% 10%, rgba(197,107,21,0.10), transparent 24%), #FBFCF8",
    textureCss:
      "linear-gradient(90deg, rgba(28,67,137,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(31,41,55,0.026) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#1F2937": "#202A37",
      "#94A3B8": "#94A5B6",
      "#1E3A8A": "#1C4389",
      "#1D4ED8": "#2557B8",
      "#FFFFFF": "#FBFCF8",
      "#475569": "#526177",
      "#FEF3C7": "#F6E7BD",
      "#D97706": "#C56B15",
      "#15803D": "#157A4B",
      "#E2E8F0": "#DFE6E8",
      "#CBD5E1": "#CBD6DE",
      "#F8FAFC": "#F5F7F4",
      "#334155": "#35465B",
      "#FED7AA": "#F0C99B",
      "#EFF4FF": "#EEF4FA",
      "#F1F5F9": "#F2F5EF",
    },
  },
  "slide-resume-portfolio-deck": {
    name: "designer folio slate coral",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    serifFont: "'Instrument Serif','IBM Plex Serif',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(27,39,51,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(213,78,48,0.13), transparent 24%), #FFFEFA",
    textureCss:
      "linear-gradient(90deg, rgba(27,39,51,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(213,78,48,0.026) 1px, transparent 1px)",
    textureSize: "62px 62px",
    replacements: {
      "#1B2733": "#192938",
      "#FFFFFF": "#FFFEFA",
      "#E5482B": "#D54E30",
      "#5B6573": "#5D6875",
      "#E6E8EC": "#E4E7E8",
      "#0E1721": "#0E1824",
    },
  },
  "onboarding-self-intro-deck": {
    name: "warm onboarding notebook",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,650&family=Nunito+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Nunito Sans','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','IBM Plex Serif',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(42,43,48,0.045), rgba(255,255,255,0) 45%), radial-gradient(circle at 88% 10%, rgba(199,96,64,0.12), transparent 24%), #FFFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(42,43,48,0.03) 1px, transparent 1px), linear-gradient(0deg, rgba(199,96,64,0.026) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#FFFFFF": "#FFFCF7",
      "#3A3A3F": "#3C3B41",
      "#1B1B1F": "#202026",
      "#D45F3D": "#C76040",
      "#E5E7EB": "#E7E3DD",
      "#6B6F76": "#6D7078",
      "#C9CACD": "#CBC7C1",
      "#FAFAFA": "#FAF6EE",
      "#F2EEEC": "#F1E9E1",
    },
  },
  "year-end-self-review-deck": {
    name: "promo packet teal graphite",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Literata','IBM Plex Serif',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(13,126,112,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(20,184,166,0.11), transparent 24%), #FBFCF8",
    textureCss:
      "linear-gradient(90deg, rgba(13,126,112,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(31,41,55,0.026) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#0F766E": "#0D7E70",
      "#115E59": "#12685F",
      "#1F2937": "#202B38",
      "#FFFFFF": "#FBFCF8",
      "#64748B": "#66778B",
      "#94A3B8": "#94A5B5",
      "#5EEAD4": "#57DCCB",
      "#475569": "#536177",
      "#E2E8F0": "#DEE7E8",
      "#BE123C": "#B52A4A",
      "#F8FAFC": "#F5F7F2",
      "#059669": "#068A63",
      "#334155": "#35475B",
      "#CBD5E1": "#CBD6DD",
      "#CCFBF1": "#C9F2EA",
      "#F1F5F9": "#F1F4EF",
      "#FEF2F2": "#F7E7E6",
      "#0B1220": "#0D1423",
    },
  },
  "ted-personal-talk-deck": {
    name: "mainstage documentary red",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=DM+Sans:wght@300;400;500;600&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    serifFont: "'Fraunces',Georgia,serif",
    monoFont: "'DM Sans','Inter',system-ui,sans-serif",
    backgroundCss:
      "radial-gradient(circle at 86% 12%, rgba(216,42,35,0.18), transparent 24%), linear-gradient(135deg, rgba(10,10,10,0.08), rgba(255,255,255,0) 46%), #F8F6EF",
    textureCss:
      "linear-gradient(90deg, rgba(10,10,10,0.028) 1px, transparent 1px), linear-gradient(0deg, rgba(216,42,35,0.026) 1px, transparent 1px)",
    textureSize: "72px 72px",
    replacements: {
      "#FAF9F6": "#F8F6EF",
      "#E62B1E": "#D82A23",
      "#0A0A0A": "#080808",
    },
  },
  "consulting-diagnostic-audit-deck": {
    name: "operations diagnostic control tower",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'IBM Plex Sans','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(10,27,51,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 92% 10%, rgba(196,43,43,0.11), transparent 24%), #FBFCF8",
    textureCss:
      "linear-gradient(90deg, rgba(10,27,51,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(196,43,43,0.026) 1px, transparent 1px)",
    textureSize: "52px 52px",
    replacements: {
      "#0B1729": "#0A1B33",
      "#94A3B8": "#94A6B8",
      "#FFFFFF": "#FBFCF8",
      "#B91C1C": "#C42B2B",
      "#64748B": "#65778D",
      "#E2E8F0": "#DEE7EA",
      "#1E40AF": "#2450B8",
      "#60A5FA": "#62A8F4",
      "#475569": "#526178",
      "#334155": "#35475C",
      "#CBD5E1": "#CBD6DE",
      "#F1F5F9": "#F2F5F0",
      "#15803D": "#147A46",
      "#0F172A": "#101A2C",
      "#F8FAFC": "#F5F7F4",
      "#FEE2E2": "#F8DFDD",
      "#B45309": "#A96515",
      "#FEF3C7": "#F6E7BE",
      "#1E3A8A": "#213F88",
      "#F87171": "#EC7474",
    },
  },
  "consulting-final-deck": {
    name: "boardroom option memo",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    serifFont: "'Libre Caslon Text','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(29,43,72,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 92% 10%, rgba(174,132,45,0.13), transparent 24%), #FFFEFA",
    textureCss:
      "linear-gradient(90deg, rgba(29,43,72,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(174,132,45,0.026) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#1F2A44": "#1D2B48",
      "#141C30": "#121B31",
      "#5A6271": "#5B6575",
      "#B68C2E": "#AE842D",
      "#E5E7EB": "#E2E5E5",
      "#FFF": "#FFFEFA",
      "#FFFFFF": "#FFFEFA",
      "#A4ABB8": "#A0AAB8",
      "#1B1B1B": "#17191D",
      "#A11C1C": "#9D2B2B",
      "#1F6B3A": "#1E7045",
      "#F4F5F7": "#F5F5F0",
      "#FFF8EC": "#F8EEDB",
      "#8E6C20": "#85651E",
    },
  },
  "consulting-capability-pitch": {
    name: "partner capability dossier",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Public Sans','Inter',system-ui,sans-serif",
    serifFont: "'Spectral','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(31,44,74,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 90% 12%, rgba(186,135,37,0.13), transparent 24%), #FDFDF8",
    textureCss:
      "linear-gradient(90deg, rgba(31,44,74,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(186,135,37,0.026) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#B68C2E": "#BA8725",
      "#5A6271": "#5E6674",
      "#1F2A44": "#1F2C4A",
      "#FFFFFF": "#FDFDF8",
      "#D9A538": "#D6A033",
      "#D8DAE0": "#D8D9DA",
      "#8A909C": "#888F9A",
      "#1B1B1B": "#181A1D",
      "#F4F5F7": "#F4F4EF",
      "#2A375A": "#2D3B61",
      "#E8E9ED": "#E7E7E4",
    },
  },
  "kickoff-steerco-deck": {
    name: "steerco command ledger",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(30,44,74,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 92% 10%, rgba(196,49,55,0.11), transparent 24%), #FDFDF9",
    textureCss:
      "linear-gradient(90deg, rgba(30,44,74,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(196,49,55,0.026) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#5A6271": "#5C6576",
      "#FFFFFF": "#FDFDF9",
      "#1F2A44": "#1E2C4A",
      "#D7DAE0": "#D7DADD",
      "#8A8F9A": "#8B909B",
      "#2E7D34": "#2D7A3A",
      "#C9252D": "#C43137",
      "#D9881E": "#C9821F",
      "#F4F5F7": "#F3F4EF",
      "#2B3656": "#2C3A5B",
      "#FCEEEE": "#F7E8E8",
      "#FCF3E5": "#F6EBD8",
      "#E8F2E9": "#E4F1E6",
    },
  },
  "consulting-framework-pack": {
    name: "framework atelier green",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(22,105,61,0.055), rgba(255,255,255,0) 46%), radial-gradient(circle at 92% 10%, rgba(174,132,45,0.11), transparent 24%), #FFFEFA",
    textureCss:
      "linear-gradient(90deg, rgba(22,105,61,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(63,63,63,0.026) 1px, transparent 1px)",
    textureSize: "62px 62px",
    replacements: {
      "#3F3F3F": "#3D423D",
      "#196B36": "#16693D",
      "#FFFFFF": "#FFFEFA",
      "#6B6B6B": "#696D68",
      "#B23A2E": "#A94135",
      "#B68C2E": "#AE842D",
      "#D8D8D8": "#D8D8D2",
      "#E9D9AE": "#E6D39E",
      "#9E9E9E": "#9A9D96",
      "#EAEAEA": "#E8E8E2",
      "#F4F4F2": "#F4F3EE",
      "#E8E8E6": "#E7E7DF",
      "#C9DDCF": "#C8DCCF",
      "#9EC2A6": "#9BC3A9",
      "#D9E8DD": "#D7E8DD",
      "#0F4923": "#0D4B28",
    },
  },
  "internal-audit-quality-deck": {
    name: "assurance ledger graphite",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(37,49,69,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(171,91,42,0.12), transparent 24%), #FBFAF4",
    textureCss:
      "linear-gradient(90deg, rgba(37,49,69,0.036) 1px, transparent 1px), linear-gradient(0deg, rgba(171,91,42,0.025) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#051C2C": "#172436",
      "#1B2A4E": "#253145",
      "#3F4A5E": "#465062",
      "#7A8499": "#788397",
      "#9C4A1E": "#AB5B2A",
      "#E5A100": "#C98A1A",
      "#C03A2B": "#B94335",
      "#8E1A14": "#8B2A22",
      "#EEF1F6": "#EEEDE5",
      "#F8F9FB": "#F7F6EF",
      "#F4F6FA": "#F2F1EA",
      "#D7DBE3": "#D7D5CC",
      "#FFFFFF": "#FBFAF4",
      "#FFF": "#FBFAF4",
      "#1F1F1F": "#1B1E24",
      "#5A5A5A": "#5E625F",
    },
  },
  "exec-decision-brief-1pager": {
    name: "decision room signal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    monoFont: "'Space Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 10%, rgba(228,79,55,0.11), transparent 24%), linear-gradient(135deg, rgba(19,51,92,0.055), rgba(255,255,255,0) 45%), #FCFBF5",
    textureCss:
      "linear-gradient(90deg, rgba(19,51,92,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(228,79,55,0.024) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#2251FF": "#2458D6",
      "#4F46E5": "#4357C8",
      "#A5B4FC": "#9BADEB",
      "#EEF2FF": "#E8ECFB",
      "#1B2A4E": "#13335C",
      "#3F4A5E": "#435062",
      "#7A8499": "#778295",
      "#C42E2E": "#D5483D",
      "#E97B5A": "#E44F37",
      "#FBE9E6": "#F8E6DE",
      "#EEF1F6": "#ECEFF3",
      "#FFFFFF": "#FCFBF5",
      "#F9FAFB": "#F6F5EF",
      "#1F1F1F": "#151820",
      "#6B7280": "#6D7685",
    },
  },
  "executive-retreat-agenda-deck": {
    name: "offsite cedar agenda",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,750&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Fraunces','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(34,80,61,0.06), rgba(255,255,255,0) 47%), radial-gradient(circle at 92% 12%, rgba(190,96,53,0.13), transparent 25%), #FBFAF2",
    textureCss:
      "linear-gradient(90deg, rgba(34,80,61,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(190,96,53,0.025) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#1F3A2E": "#22503D",
      "#177B57": "#2A8463",
      "#142319": "#17271D",
      "#0F1A14": "#132219",
      "#2A5040": "#2E5D49",
      "#6BBF77": "#68B879",
      "#9FD9C2": "#9ED6BD",
      "#C9D1CB": "#CAD4CA",
      "#8FA098": "#8B9B93",
      "#B86038": "#BE6035",
      "#E3B341": "#D7A836",
      "#F1F4F2": "#F0F2EA",
      "#E8F4EE": "#E5F1EA",
      "#FFFFFF": "#FBFAF2",
      "#1F1F1F": "#182019",
    },
  },
  "corporate-profile-intro-deck": {
    name: "company atlas teal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 10%, rgba(14,116,144,0.12), transparent 24%), linear-gradient(135deg, rgba(11,41,64,0.055), rgba(255,255,255,0) 46%), #FDFBF4",
    textureCss:
      "linear-gradient(90deg, rgba(11,41,64,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(159,110,0,0.024) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#0B2940": "#0C314C",
      "#1B2C3D": "#1A3448",
      "#3D5063": "#3A5366",
      "#5A6B85": "#5C7088",
      "#6B7E9E": "#6A819C",
      "#9FB0CC": "#9BB1C7",
      "#0E7490": "#0C7A93",
      "#9F6E00": "#B07210",
      "#FBE7C2": "#F6E2BA",
      "#FFF3D9": "#F7E9CF",
      "#EEF1F6": "#ECEFEB",
      "#EAEEF5": "#E9EEE9",
      "#FFFFFF": "#FDFBF4",
      "#1F2937": "#1F3342",
    },
  },
  "org-chart-raci-slide-deck": {
    name: "governance grid lime",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(24,35,48,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 92% 10%, rgba(184,205,71,0.16), transparent 24%), #FBFCF4",
    textureCss:
      "linear-gradient(90deg, rgba(24,35,48,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(114,135,58,0.03) 1px, transparent 1px)",
    textureSize: "52px 52px",
    replacements: {
      "#1B2A4E": "#182330",
      "#2A3A5A": "#243245",
      "#3A4A6E": "#394C63",
      "#3F4A5E": "#44515F",
      "#64748B": "#657486",
      "#6B7280": "#6C7480",
      "#9CA3AF": "#99A1A9",
      "#15803D": "#278048",
      "#184203": "#2F5A19",
      "#B9CDA7": "#B8CD47",
      "#D3DFC4": "#D6E3B4",
      "#F4EFC9": "#F2EAC3",
      "#E5E7EB": "#E3E6E0",
      "#F1F4F2": "#F1F4EC",
      "#FFFFFF": "#FBFCF4",
    },
  },
  "csv-to-chart-deck": {
    name: "spreadsheet observatory bronze",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(13,39,74,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(181,117,48,0.12), transparent 24%), #FBFAF3",
    textureCss:
      "linear-gradient(90deg, rgba(13,39,74,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(181,117,48,0.025) 1px, transparent 1px)",
    textureSize: "52px 52px",
    replacements: {
      "#082147": "#0D274A",
      "#1E3357": "#213A60",
      "#5A6379": "#5C687C",
      "#8FA0BC": "#8EA0BA",
      "#B8975A": "#B57530",
      "#D8C291": "#D7BC86",
      "#F4F4F0": "#F3F1E8",
      "#E2E0D6": "#E2DED2",
      "#FFFFFF": "#FBFAF3",
      "#fff": "#FBFAF3",
      "#1A7F37": "#1F7D46",
      "#C8102E": "#B8323D",
      "#F5A524": "#D9921F",
      "#221F1F": "#1F2226",
    },
  },
  "sql-kpi-weekly-deck": {
    name: "query console cyan",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');",
    bodyFont: "'Inter',system-ui,sans-serif",
    monoFont: "'Space Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(45,232,232,0.12), transparent 24%), linear-gradient(135deg, rgba(10,14,55,0.065), rgba(255,255,255,0) 45%), #FAFBF6",
    textureCss:
      "linear-gradient(90deg, rgba(11,10,60,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(0,184,184,0.028) 1px, transparent 1px)",
    textureSize: "48px 48px",
    replacements: {
      "#0B0A3C": "#0B123F",
      "#1E1A78": "#25217D",
      "#14116A": "#1A1B67",
      "#00B8B8": "#009EA6",
      "#2DE8E8": "#22D7DD",
      "#007A7A": "#087D82",
      "#9AA7E8": "#94A7DD",
      "#C9D2FB": "#C7D4F4",
      "#D9DEF7": "#D8DEF1",
      "#E7EBFE": "#E6ECF7",
      "#FFFFFF": "#FAFBF6",
      "#fff": "#FAFBF6",
      "#1F2937": "#1D2A3A",
      "#6B7280": "#6C7482",
      "#E50914": "#DA2E3A",
    },
  },
  "crm-funnel-qbr-deck": {
    name: "pipeline room coral",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(31,41,55,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(220,79,75,0.12), transparent 24%), #FFFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(31,41,55,0.036) 1px, transparent 1px), linear-gradient(0deg, rgba(220,79,75,0.026) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#1F2937": "#202A38",
      "#374151": "#3B4656",
      "#6B7280": "#6E7786",
      "#9CA3AF": "#9EA6AE",
      "#E5E7EB": "#E4E5DF",
      "#F3F4F6": "#F2F1EA",
      "#F9FAFB": "#F7F6EF",
      "#FFFFFF": "#FFFCF7",
      "#16A34A": "#198C4B",
      "#0F766E": "#147A70",
      "#14B8A6": "#1AA99A",
      "#BE185D": "#B62A62",
      "#DC2626": "#D24A45",
      "#B45309": "#A96615",
      "#FEF3C7": "#F5E7C3",
      "#FCE7F3": "#F5E1EA",
    },
  },
  "product-analytics-deck": {
    name: "cohort lab electric",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Plus Jakarta Sans','Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 10%, rgba(84,104,239,0.12), transparent 24%), linear-gradient(135deg, rgba(15,110,51,0.055), rgba(255,255,255,0) 45%), #FBFCF6",
    textureCss:
      "linear-gradient(90deg, rgba(20,32,54,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(84,104,239,0.025) 1px, transparent 1px)",
    textureSize: "54px 54px",
    replacements: {
      "#0F6E33": "#126E39",
      "#0B8A4C": "#178C55",
      "#1FB57A": "#20A970",
      "#A8E6BA": "#A8DFAF",
      "#E7F6EC": "#E6F3E9",
      "#CCFBF1": "#D0F4EB",
      "#4F63E8": "#5468EF",
      "#6376EC": "#687BEA",
      "#C9D2FB": "#CCD5F6",
      "#1A1F2E": "#182236",
      "#2A3142": "#2E3748",
      "#6B7280": "#6D7685",
      "#FFFFFF": "#FBFCF6",
      "#fff": "#FBFCF6",
      "#F4F6FB": "#F3F5EE",
    },
  },
  "equity-research-earnings-deck": {
    name: "earnings desk ink",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    serifFont: "'Literata','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(8,33,71,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(229,9,20,0.09), transparent 24%), #FDFBF4",
    textureCss:
      "linear-gradient(90deg, rgba(8,33,71,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(184,151,90,0.025) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#082147": "#0A2448",
      "#0A2540": "#0D2A49",
      "#5A6379": "#5D687B",
      "#7B8AAA": "#788AA5",
      "#B8975A": "#A9874D",
      "#D8C291": "#D4BC86",
      "#E50914": "#C9232E",
      "#B00610": "#A42129",
      "#A2161A": "#982C2E",
      "#F2EBED": "#F0E8E7",
      "#F4F4F0": "#F2F0E7",
      "#FFFFFF": "#FDFBF4",
      "#fff": "#FDFBF4",
      "#221F1F": "#1C1F24",
      "#6E696B": "#6E6B69",
    },
  },
  "brand-application-deck": {
    name: "brand system ultramarine citrus",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Space Grotesk','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(255,180,0,0.16), transparent 23%), linear-gradient(135deg, rgba(0,102,255,0.06), rgba(255,255,255,0) 46%), #FFFEF8",
    textureCss:
      "linear-gradient(90deg, rgba(0,102,255,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(10,10,10,0.025) 1px, transparent 1px)",
    textureSize: "48px 48px",
    replacements: {
      "#0066FF": "#145DFF",
      "#1F6FEB": "#1462E8",
      "#7DA7FF": "#82A9FF",
      "#BFD4FF": "#C5D8FF",
      "#00C2FF": "#00A9DD",
      "#FFB400": "#E5A100",
      "#C8102E": "#C7353C",
      "#FF3D2E": "#E84A3C",
      "#0A0A0A": "#0D0D10",
      "#111111": "#151515",
      "#6E6E6E": "#6B7077",
      "#E5E7EB": "#E6E6DF",
      "#FFFFFF": "#FFFEF8",
      "#fff": "#FFFEF8",
    },
  },
  "annual-report-art-direction-deck": {
    name: "annual report gallery ochre",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(15,37,64,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(194,138,0,0.13), transparent 24%), #FAF7F0",
    textureCss:
      "linear-gradient(90deg, rgba(15,37,64,0.032) 1px, transparent 1px), linear-gradient(0deg, rgba(194,138,0,0.026) 1px, transparent 1px)",
    textureSize: "66px 66px",
    replacements: {
      "#0F2540": "#132B47",
      "#0A1626": "#0C1A2B",
      "#3F4A57": "#445160",
      "#6B7785": "#6F7984",
      "#8B5A00": "#9A6400",
      "#C28A00": "#C58A13",
      "#D89B1E": "#C98C18",
      "#E3C36D": "#D8B65D",
      "#F1DDA8": "#EAD79D",
      "#F5EFE3": "#F4ECDE",
      "#FAF7F2": "#FAF7F0",
      "#FFFFFF": "#FFFCF5",
      "#fff": "#FFFCF5",
      "#0E0E0E": "#111315",
    },
  },
  "minimalist-content-cleanup-deck": {
    name: "minimal edit slate sage",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(42,47,54,0.05), rgba(255,255,255,0) 48%), radial-gradient(circle at 92% 12%, rgba(14,138,74,0.10), transparent 24%), #FBFBF7",
    textureCss:
      "linear-gradient(90deg, rgba(42,47,54,0.032) 1px, transparent 1px), linear-gradient(0deg, rgba(14,138,74,0.022) 1px, transparent 1px)",
    textureSize: "72px 72px",
    replacements: {
      "#2A2F36": "#2B3037",
      "#5B6470": "#5E6872",
      "#3A3A3A": "#383A3A",
      "#2A2A2A": "#2C2E2D",
      "#0E8A4A": "#168652",
      "#0F8A4F": "#188956",
      "#86C4A0": "#8CC5A5",
      "#C8E8D2": "#CBE6D1",
      "#E6ECF2": "#E7EAE7",
      "#EEF1F4": "#EEEFEA",
      "#F8F8F6": "#FBFBF7",
      "#FFFFFF": "#FBFBF7",
      "#fff": "#FBFBF7",
      "#C9C9C5": "#C9CBC4",
    },
  },
  "brand-template-system-deck": {
    name: "template token lab azure",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    monoFont: "'Space Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 10%, rgba(0,194,255,0.12), transparent 24%), linear-gradient(135deg, rgba(10,22,38,0.055), rgba(255,255,255,0) 46%), #FBFCF8",
    textureCss:
      "linear-gradient(90deg, rgba(10,22,38,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(0,102,255,0.025) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#0066FF": "#1B6EFF",
      "#00C2FF": "#00A9DF",
      "#7DA7FF": "#86AAFF",
      "#BFD4FF": "#C6D9FF",
      "#0A1626": "#0D1B2D",
      "#101010": "#121416",
      "#0A0A0A": "#0D0F12",
      "#6B7785": "#6D7A88",
      "#E6ECF2": "#E6EBEE",
      "#EEF2FA": "#EEF2F4",
      "#D7DCE3": "#D8DDE0",
      "#FFFFFF": "#FBFCF8",
      "#fff": "#FBFCF8",
      "#C8102E": "#C73545",
    },
  },
  "brand-event-experiential-deck": {
    name: "experiential stage red cyan",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Archivo','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 12%, rgba(0,194,255,0.13), transparent 24%), linear-gradient(135deg, rgba(200,16,46,0.06), rgba(255,255,255,0) 44%), #FFFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(14,14,14,0.04) 1px, transparent 1px), linear-gradient(0deg, rgba(200,16,46,0.026) 1px, transparent 1px)",
    textureSize: "46px 46px",
    replacements: {
      "#C8102E": "#D2383E",
      "#D2331F": "#D64A35",
      "#C8312A": "#CF4038",
      "#FF3D2E": "#EA4F3F",
      "#F4C8BF": "#F2C8BE",
      "#E89A8E": "#E69486",
      "#00C2FF": "#00A9D8",
      "#0E0E0E": "#111214",
      "#0f0f0f": "#111214",
      "#111111": "#151515",
      "#6E6E6E": "#6E7276",
      "#E4E4E1": "#E5E3DC",
      "#FFFFFF": "#FFFCF7",
      "#fff": "#FFFCF7",
    },
  },
  "strategic-cvc-pitch-deck": {
    name: "cvc boardroom teal amber",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(11,61,92,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(232,163,61,0.12), transparent 24%), #FBFAF4",
    textureCss:
      "linear-gradient(90deg, rgba(11,61,92,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(232,163,61,0.025) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#0B3D5C": "#0C425F",
      "#0B5A6A": "#0E6570",
      "#073C48": "#0B4653",
      "#1F2B3A": "#243142",
      "#5B6B7C": "#5E6D7C",
      "#E8A33D": "#D99A34",
      "#F26625": "#E1642C",
      "#C0392B": "#B94637",
      "#D8E8EB": "#D7E7E7",
      "#E6EBF0": "#E5E9E8",
      "#FFFFFF": "#FBFAF4",
      "#ffffff": "#FBFAF4",
      "#fff": "#FBFAF4",
      "#1A1A1A": "#1B2024",
    },
  },
  "emerging-market-founder-pitch-deck": {
    name: "frontier founder clay",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,750&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Fraunces','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(216,91,42,0.13), transparent 24%), linear-gradient(135deg, rgba(30,127,92,0.055), rgba(255,255,255,0) 45%), #F8F4ED",
    textureCss:
      "linear-gradient(90deg, rgba(92,58,30,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(30,127,92,0.025) 1px, transparent 1px)",
    textureSize: "62px 62px",
    replacements: {
      "#5C3A1E": "#684124",
      "#C2410C": "#C6501F",
      "#D85B2A": "#D1602F",
      "#C8472B": "#C55235",
      "#F26625": "#DC642B",
      "#178A55": "#21865A",
      "#1E7F5C": "#247B5F",
      "#7DD3A8": "#83CFA9",
      "#FCE8DA": "#F3E0D2",
      "#F8F4ED": "#F8F4ED",
      "#FBFAF7": "#FBF7EF",
      "#FFFFFF": "#FBF7EF",
      "#ffffff": "#FBF7EF",
      "#0E0E0E": "#171411",
    },
  },
  "smb-business-plan-deck": {
    name: "local lender workbook",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=Roboto+Slab:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Roboto Slab','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(15,46,92,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(178,121,31,0.12), transparent 24%), #FCFAF2",
    textureCss:
      "linear-gradient(90deg, rgba(15,46,92,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(178,121,31,0.025) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#0F2E5C": "#123764",
      "#1A3D6B": "#214671",
      "#365A8C": "#3A608F",
      "#5C6E8F": "#60718F",
      "#9FB4D6": "#9CB2CF",
      "#B7791F": "#A8731F",
      "#F7C948": "#DCA935",
      "#FCE8DA": "#F2E2D1",
      "#FAFAF7": "#FCFAF2",
      "#FFFFFF": "#FCFAF2",
      "#ffffff": "#FCFAF2",
      "#1A1A1A": "#1A1F26",
      "#6B7383": "#6D7480",
    },
  },
  "accelerator-demo-day-pitch": {
    name: "demo day kinetic coral",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');",
    bodyFont: "'Archivo','Inter',system-ui,sans-serif",
    monoFont: "'Space Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(242,102,37,0.14), transparent 24%), linear-gradient(135deg, rgba(15,26,46,0.06), rgba(255,255,255,0) 45%), #FFFDF7",
    textureCss:
      "linear-gradient(90deg, rgba(15,26,46,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(242,102,37,0.026) 1px, transparent 1px)",
    textureSize: "46px 46px",
    replacements: {
      "#0F1A2E": "#121E32",
      "#0E1620": "#111A25",
      "#1B2742": "#202D49",
      "#A8B0C4": "#A3ADC1",
      "#F26625": "#EF5E2B",
      "#C0392B": "#C44939",
      "#B23030": "#B63F3B",
      "#FFB8B8": "#F3B3A8",
      "#FFE1E1": "#F8DAD4",
      "#FAFAF7": "#FFFDF7",
      "#FFFFFF": "#FFFDF7",
      "#ffffff": "#FFFDF7",
      "#000000": "#111111",
    },
  },
  "series-a-pitch-deck": {
    name: "growth memo navy green",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,500;6..72,650;6..72,750&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(15,46,92,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(23,138,85,0.12), transparent 24%), #FBFAF7",
    textureCss:
      "linear-gradient(90deg, rgba(15,46,92,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(23,138,85,0.026) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#0F2E5C": "#113765",
      "#1A3D6B": "#214D79",
      "#3A4866": "#3D506B",
      "#5C6E8F": "#5E7090",
      "#9FB4D6": "#9BB2D0",
      "#178A55": "#218A5A",
      "#7DD3A8": "#80D0A6",
      "#E8A33D": "#DCA13A",
      "#C8102E": "#BD3343",
      "#C0392B": "#B94637",
      "#E6EBF0": "#E4E9E8",
      "#F4F6FB": "#F3F5EF",
      "#FFFFFF": "#FBFAF7",
      "#ffffff": "#FBFAF7",
      "#fff": "#FBFAF7",
    },
  },
  "sbir-rd-grant-deck": {
    name: "federal lab grant blue",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(27,58,111,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(200,147,43,0.12), transparent 24%), #FBFAF4",
    textureCss:
      "linear-gradient(90deg, rgba(27,58,111,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(200,147,43,0.025) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#1B3A6F": "#1C427A",
      "#1F3A5F": "#244164",
      "#3D5C8C": "#436390",
      "#5A85B7": "#5C86B3",
      "#9CC2FF": "#A0C0F4",
      "#C8932B": "#BF8D2F",
      "#F0DA7B": "#E3CE73",
      "#E2DED3": "#E1DED4",
      "#FAFAF7": "#FBFAF4",
      "#FFFFFF": "#FBFAF4",
      "#1B1B1B": "#1B2026",
      "#5C6470": "#606873",
    },
  },
  "gdpr-ai-act-compliance-deck": {
    name: "compliance docket burgundy",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(166,25,46,0.10), transparent 24%), linear-gradient(135deg, rgba(21,39,63,0.055), rgba(255,255,255,0) 45%), #FBFAF6",
    textureCss:
      "linear-gradient(90deg, rgba(21,39,63,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(166,25,46,0.024) 1px, transparent 1px)",
    textureSize: "54px 54px",
    replacements: {
      "#15273F": "#182A43",
      "#142A47": "#19304F",
      "#334155": "#38495C",
      "#64748B": "#68788E",
      "#A6192E": "#A72A3C",
      "#7A1F2B": "#7E2A35",
      "#9A2B2B": "#933033",
      "#B91C1C": "#B23636",
      "#F2A2A6": "#EDA7AA",
      "#FBE3E4": "#F7E1E2",
      "#F1F5F9": "#F0F2EC",
      "#F8FAFC": "#F8F8F2",
      "#FFFFFF": "#FBFAF6",
      "#0F172A": "#141E2C",
    },
  },
  "policy-briefing-deck": {
    name: "public memo slate",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(31,58,95,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(183,121,31,0.12), transparent 24%), #FCFAF3",
    textureCss:
      "linear-gradient(90deg, rgba(31,58,95,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(183,121,31,0.024) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#1B3A6B": "#223F69",
      "#1F3A5F": "#253F65",
      "#3D5B7E": "#425F81",
      "#5C6470": "#606975",
      "#9FB3CC": "#9AAFC5",
      "#B7791F": "#A87320",
      "#D9531E": "#CE5A2B",
      "#E8ECF2": "#E7E9E4",
      "#F7F9FC": "#F7F7F1",
      "#FAFAF7": "#FCFAF3",
      "#FFFFFF": "#FCFAF3",
      "#1B1B1B": "#1C2024",
    },
  },
  "municipal-hearing-deck": {
    name: "civic hearing cobalt",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(252,204,0,0.13), transparent 24%), linear-gradient(135deg, rgba(0,51,153,0.055), rgba(255,255,255,0) 45%), #FFFCF3",
    textureCss:
      "linear-gradient(90deg, rgba(0,51,153,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(252,204,0,0.026) 1px, transparent 1px)",
    textureSize: "52px 52px",
    replacements: {
      "#003399": "#1248A0",
      "#00226B": "#163277",
      "#102648": "#172D50",
      "#475569": "#506174",
      "#94A3B8": "#94A2B4",
      "#FFCC00": "#E6B800",
      "#FFF4CC": "#F7EBC1",
      "#C9252D": "#C03A3F",
      "#FCD5D5": "#F5D2D0",
      "#F4EFE6": "#F4EDE2",
      "#FFFFFF": "#FFFCF3",
      "#1B1B1B": "#1B2024",
    },
  },
  "nonprofit-fundraising-deck": {
    name: "mission pledge green rose",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,750&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Fraunces','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(19,119,82,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(169,42,58,0.10), transparent 24%), #FFFBF5",
    textureCss:
      "linear-gradient(90deg, rgba(19,119,82,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(169,42,58,0.024) 1px, transparent 1px)",
    textureSize: "62px 62px",
    replacements: {
      "#137752": "#1D7956",
      "#1F7A4D": "#277A55",
      "#B5D5C0": "#B7D6C1",
      "#BFE0D0": "#C0E0CF",
      "#DDEEE3": "#DEEEE2",
      "#A6192E": "#A72F3E",
      "#7A1F2B": "#802C36",
      "#F0B6B9": "#ECB7BA",
      "#FBEAEA": "#F8E7E6",
      "#F7F2E8": "#F7F0E5",
      "#FFFFFF": "#FFFBF5",
      "#1B1B1B": "#1A211E",
    },
  },
  "curiosity-hobby-deck": {
    name: "specimen cabinet amber",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(196,133,62,0.14), transparent 24%), linear-gradient(135deg, rgba(30,93,58,0.055), rgba(255,255,255,0) 45%), #FAF7F0",
    textureCss:
      "linear-gradient(90deg, rgba(22,19,16,0.032) 1px, transparent 1px), linear-gradient(0deg, rgba(196,133,62,0.024) 1px, transparent 1px)",
    textureSize: "66px 66px",
    replacements: {
      "#C4853E": "#B87B38",
      "#D9A521": "#C9962B",
      "#E97725": "#D96A2E",
      "#B0492A": "#A84B31",
      "#1E5D3A": "#28613E",
      "#0E7C66": "#1A7B69",
      "#F4EBD6": "#F1E5CF",
      "#FAFAF7": "#FAF7F0",
      "#FAF9F6": "#FAF7F0",
      "#FFFFFF": "#FAF7F0",
      "#fff": "#FAF7F0",
      "#1A1A1A": "#1B1815",
      "#2D2D2D": "#302D28",
    },
  },
  "tedx-18min-resident-talk-deck": {
    name: "stage talk red ink",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,500;6..72,650;6..72,750&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Archivo','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 12%, rgba(230,43,30,0.12), transparent 24%), linear-gradient(135deg, rgba(5,5,5,0.055), rgba(255,255,255,0) 45%), #FFFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(5,5,5,0.036) 1px, transparent 1px), linear-gradient(0deg, rgba(230,43,30,0.024) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#E62B1E": "#D9342B",
      "#B5365E": "#B73A62",
      "#0A0A0A": "#101010",
      "#050505": "#080808",
      "#131313": "#151515",
      "#2D2D2D": "#2E3032",
      "#4B5563": "#545C68",
      "#C9CDD4": "#CACBC8",
      "#F2F4F8": "#F1F1EA",
      "#FFFFFF": "#FFFCF7",
      "#fff": "#FFFCF7",
    },
  },
  "life-event-storyboard-deck": {
    name: "family archive indigo",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,750&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Fraunces','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(45,63,142,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(196,133,62,0.12), transparent 24%), #FAF7F2",
    textureCss:
      "linear-gradient(90deg, rgba(45,63,142,0.032) 1px, transparent 1px), linear-gradient(0deg, rgba(196,133,62,0.024) 1px, transparent 1px)",
    textureSize: "62px 62px",
    replacements: {
      "#3949AB": "#35499D",
      "#2D3F8E": "#31428A",
      "#1F2D6E": "#283675",
      "#5B3A8F": "#60428C",
      "#DDE0F1": "#DCDEF0",
      "#C8CFDC": "#C8CDD8",
      "#C4853E": "#B9803D",
      "#F5EFE3": "#F3EBDD",
      "#F7F3EB": "#F7F1E8",
      "#FAF9F6": "#FAF7F2",
      "#FFFFFF": "#FAF7F2",
      "#1A1A1A": "#1B1B20",
    },
  },
  "travel-photo-essay-deck": {
    name: "photo essay dusk ochre",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&family=Libre+Franklin:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    serifFont: "'Literata','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(31,78,121,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(201,137,44,0.13), transparent 24%), #FAF7F0",
    textureCss:
      "linear-gradient(90deg, rgba(31,78,121,0.032) 1px, transparent 1px), linear-gradient(0deg, rgba(201,137,44,0.024) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#1F4E79": "#25577F",
      "#C4853E": "#C08238",
      "#E97725": "#D96D2E",
      "#B0492A": "#A95033",
      "#F4EBD6": "#F1E5D0",
      "#E8E4DC": "#E7E1D8",
      "#F0ECE2": "#EFE8DE",
      "#FAF7F2": "#FAF7F0",
      "#FFFFFF": "#FAF7F0",
      "#fff": "#FAF7F0",
      "#1A1A1A": "#1C1A18",
      "#4A4A4A": "#4A4A46",
    },
  },
  "event-sponsorship-pitch-deck": {
    name: "sponsorship arena neon",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Archivo','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(62,226,166,0.14), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.065), rgba(255,255,255,0) 45%), #FAFBF6",
    textureCss:
      "linear-gradient(90deg, rgba(15,23,42,0.038) 1px, transparent 1px), linear-gradient(0deg, rgba(62,226,166,0.026) 1px, transparent 1px)",
    textureSize: "48px 48px",
    replacements: {
      "#0F172A": "#101A2B",
      "#1E293B": "#223047",
      "#334155": "#3A4A5F",
      "#475569": "#536174",
      "#64748B": "#6A788D",
      "#94A3B8": "#98A7B8",
      "#3EE2A6": "#26C993",
      "#9BE15D": "#95D94F",
      "#D7263D": "#D8434F",
      "#E11D74": "#D72A72",
      "#E2E8F0": "#E3E7E5",
      "#F8FAFC": "#FAFBF6",
      "#FFFFFF": "#FAFBF6",
      "#fff": "#FAFBF6",
    },
  },
  "social-carousel-content-deck": {
    name: "social studio candy",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');",
    bodyFont: "'Space Grotesk','Inter',system-ui,sans-serif",
    monoFont: "'Space Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 10%, rgba(255,90,95,0.13), transparent 24%), linear-gradient(135deg, rgba(43,107,255,0.055), rgba(255,255,255,0) 45%), #FFFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(43,107,255,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(255,90,95,0.024) 1px, transparent 1px)",
    textureSize: "46px 46px",
    replacements: {
      "#2B6BFF": "#336DFF",
      "#002A8F": "#123EA0",
      "#3F62A8": "#4468AE",
      "#9AA8BE": "#98A8BD",
      "#FF5A5F": "#F05A62",
      "#FFC7C9": "#F8C4C4",
      "#FFE9EA": "#FBE7E6",
      "#F2B544": "#E7A93A",
      "#F4F5F7": "#F5F3EC",
      "#FFFFFF": "#FFFCF7",
      "#fff": "#FFFCF7",
      "#0A0A0A": "#101113",
      "#6B7280": "#707783",
    },
  },
  "kol-campaign-recap-deck": {
    name: "creator analytics rose",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(225,29,116,0.11), transparent 24%), linear-gradient(135deg, rgba(15,27,45,0.055), rgba(255,255,255,0) 45%), #FCFAF5",
    textureCss:
      "linear-gradient(90deg, rgba(15,27,45,0.036) 1px, transparent 1px), linear-gradient(0deg, rgba(225,29,116,0.024) 1px, transparent 1px)",
    textureSize: "52px 52px",
    replacements: {
      "#0F1B2D": "#132033",
      "#1F2A3D": "#253044",
      "#5B6B82": "#607083",
      "#7E8DA7": "#7D8CA2",
      "#E11D74": "#D72A76",
      "#B01457": "#A92D61",
      "#FCE4EE": "#F7E2EA",
      "#D7263D": "#C9414E",
      "#15803D": "#23824B",
      "#E4E8EF": "#E4E6E2",
      "#F3F5F9": "#F3F3EC",
      "#FFFFFF": "#FCFAF5",
      "#fff": "#FCFAF5",
      "#101418": "#111820",
    },
  },
  "brand-identity-portfolio": {
    name: "portfolio gallery graphite",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Libre+Franklin:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(16,20,24,0.052), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(200,208,220,0.18), transparent 24%), #F7F6F2",
    textureCss:
      "linear-gradient(90deg, rgba(16,20,24,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(217,200,168,0.026) 1px, transparent 1px)",
    textureSize: "68px 68px",
    replacements: {
      "#101418": "#151719",
      "#0F131C": "#141821",
      "#0A0D14": "#10131A",
      "#3A3A3A": "#3B3B39",
      "#6B7280": "#6F747C",
      "#8A99AE": "#8A98A8",
      "#C8D0DC": "#C8CDD6",
      "#DDDDDA": "#DCDAD3",
      "#E5E2D9": "#E4DFD4",
      "#D9C8A8": "#D7C6A6",
      "#F7F6F2": "#F7F6F2",
      "#FAFBFC": "#F7F6F2",
      "#FFFFFF": "#F7F6F2",
      "#fff": "#F7F6F2",
    },
  },
  "kol-influencer-deck": {
    name: "influencer dealroom teal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(14,92,88,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(29,143,138,0.13), transparent 24%), #F8FBF6",
    textureCss:
      "linear-gradient(90deg, rgba(14,92,88,0.036) 1px, transparent 1px), linear-gradient(0deg, rgba(229,39,92,0.022) 1px, transparent 1px)",
    textureSize: "54px 54px",
    replacements: {
      "#0E5C58": "#136762",
      "#0E5C3F": "#176448",
      "#1D8F8A": "#218C87",
      "#2F7A23": "#387C2E",
      "#4E7A1F": "#5B812D",
      "#B7E0DD": "#B9DDDA",
      "#E2F3F2": "#E3F1EF",
      "#ECF8DB": "#EAF5D9",
      "#E5275C": "#D83B64",
      "#B33B3F": "#A94349",
      "#F4F5F7": "#F3F4EE",
      "#FFFFFF": "#F8FBF6",
      "#fff": "#F8FBF6",
      "#0A1422": "#101B2A",
    },
  },
  "pm-feature-business-case-deck": {
    name: "product memo violet mint",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'DM Sans','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(99,91,255,0.12), transparent 24%), linear-gradient(135deg, rgba(0,128,96,0.055), rgba(255,255,255,0) 45%), #FBFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(15,23,42,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(99,91,255,0.024) 1px, transparent 1px)",
    textureSize: "52px 52px",
    replacements: {
      "#635BFF": "#665CDA",
      "#312E81": "#3F3A93",
      "#008060": "#0E8064",
      "#0F5E47": "#17634F",
      "#E6F2EE": "#E4F0EA",
      "#F4F2FF": "#F0EEFB",
      "#0F172A": "#121B2D",
      "#1F2937": "#243042",
      "#475569": "#536273",
      "#94A3B8": "#96A4B5",
      "#E2E8F0": "#E2E6E4",
      "#FFFFFF": "#FBFCF7",
      "#fff": "#FBFCF7",
    },
  },
  "prd-product-roadmap-deck": {
    name: "roadmap workshop blue amber",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(10,37,64,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(217,119,6,0.12), transparent 24%), #FCFAF3",
    textureCss:
      "linear-gradient(90deg, rgba(10,37,64,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(217,119,6,0.024) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#0A2540": "#0F2E4C",
      "#08427B": "#164D82",
      "#1168BD": "#226BB7",
      "#438DD5": "#4A8FD0",
      "#85BBF0": "#86B9E9",
      "#D97706": "#C87517",
      "#B45309": "#A86616",
      "#FFF7E6": "#F6EBD4",
      "#F0F6FC": "#EEF4F5",
      "#F6F9FC": "#F5F6F0",
      "#FFFFFF": "#FCFAF3",
      "#fff": "#FCFAF3",
      "#1B1B1B": "#1B2026",
    },
  },
  "architecture-review-deck": {
    name: "systems review cyan slate",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 88% 10%, rgba(96,165,250,0.12), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.06), rgba(255,255,255,0) 45%), #FAFBF6",
    textureCss:
      "linear-gradient(90deg, rgba(15,23,42,0.038) 1px, transparent 1px), linear-gradient(0deg, rgba(96,165,250,0.024) 1px, transparent 1px)",
    textureSize: "48px 48px",
    replacements: {
      "#0F172A": "#111B2C",
      "#111827": "#141D2B",
      "#1E293B": "#243044",
      "#334155": "#3B4C60",
      "#64748B": "#68788C",
      "#94A3B8": "#96A4B5",
      "#2563EB": "#2F6EDB",
      "#60A5FA": "#5B9FEA",
      "#DBEAFE": "#DCE9F7",
      "#E2E8F0": "#E3E7E5",
      "#F8FAFC": "#FAFBF6",
      "#FFFFFF": "#FAFBF6",
      "#fff": "#FAFBF6",
    },
  },
  "incident-postmortem-deck": {
    name: "incident review graphite red",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(220,38,38,0.10), transparent 24%), linear-gradient(135deg, rgba(15,23,42,0.055), rgba(255,255,255,0) 45%), #FBFAF5",
    textureCss:
      "linear-gradient(90deg, rgba(15,23,42,0.036) 1px, transparent 1px), linear-gradient(0deg, rgba(220,38,38,0.024) 1px, transparent 1px)",
    textureSize: "54px 54px",
    replacements: {
      "#0F172A": "#111B2C",
      "#1F2937": "#242F3E",
      "#374151": "#3D4856",
      "#6B7280": "#6F7783",
      "#9CA3AF": "#9EA5AD",
      "#DC2626": "#C93A3A",
      "#991B1B": "#8F2B2B",
      "#F87171": "#E97979",
      "#FEE2E2": "#F6DFDC",
      "#FEF2F2": "#F8EDEC",
      "#F9FAFB": "#F6F5EF",
      "#FFFFFF": "#FBFAF5",
      "#fff": "#FBFAF5",
    },
  },
  "rfc-technical-proposal-deck": {
    name: "rfc proposal green terminal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(6,95,70,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(52,211,153,0.13), transparent 24%), #FAFCF5",
    textureCss:
      "linear-gradient(90deg, rgba(6,95,70,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.024) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#065F46": "#0E684F",
      "#047857": "#157C5C",
      "#059669": "#1D946C",
      "#10B981": "#2AB77F",
      "#34D399": "#43C88F",
      "#A7F3D0": "#A8E9C9",
      "#D1FAE5": "#D4F2E3",
      "#ECFDF5": "#EEF9F1",
      "#0F172A": "#111B2C",
      "#334155": "#3B4A5E",
      "#64748B": "#69798B",
      "#E2E8F0": "#E3E7E2",
      "#FFFFFF": "#FAFCF5",
      "#fff": "#FAFCF5",
    },
  },
  "personal-finance-client-edu-deck": {
    name: "advisor briefing navy gold",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=Literata:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Literata','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(11,37,64,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(242,169,59,0.13), transparent 24%), #FCFAF2",
    textureCss:
      "linear-gradient(90deg, rgba(11,37,64,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(242,169,59,0.024) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#0B2540": "#12304E",
      "#173A5E": "#21466B",
      "#3D5A80": "#436185",
      "#6B8FB5": "#6D8FAE",
      "#F2A93B": "#DFA23A",
      "#D98A1E": "#C98724",
      "#8A5A00": "#8D6514",
      "#FCE7BD": "#F4DEB2",
      "#FFF8EE": "#F7EEDF",
      "#F4F4F2": "#F3F1E8",
      "#FFFFFF": "#FCFAF2",
      "#fff": "#FCFAF2",
      "#1A1F24": "#1C2328",
    },
  },
  "patient-public-health-edu-deck": {
    name: "public health calm teal",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(0,98,89,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(188,235,230,0.24), transparent 24%), #F8FCF7",
    textureCss:
      "linear-gradient(90deg, rgba(0,98,89,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(31,122,76,0.024) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#006259": "#147068",
      "#00857C": "#19857D",
      "#1F7A4C": "#2C8059",
      "#1E6F4A": "#2A7350",
      "#5B8C6E": "#639476",
      "#7FB9A0": "#84BAA2",
      "#BCEBE6": "#C0E9E4",
      "#E2F0E9": "#E4F0E8",
      "#F4F8F6": "#F8FCF7",
      "#FFFFFF": "#F8FCF7",
      "#ffffff": "#F8FCF7",
      "#1B1B1B": "#17211E",
    },
  },
  "ocw-stem-lecture-deck": {
    name: "chalkboard lecture amber",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(14,42,71,0.06), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(200,85,61,0.11), transparent 24%), #F8F6EF",
    textureCss:
      "linear-gradient(90deg, rgba(14,42,71,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(200,85,61,0.024) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#0E2A47": "#173655",
      "#081A2E": "#10253C",
      "#14365B": "#1D4264",
      "#3A4257": "#424A5D",
      "#566069": "#5D656D",
      "#8A8E99": "#898D94",
      "#C8553D": "#B85A45",
      "#B0410E": "#A94B20",
      "#E26A4E": "#D16650",
      "#FCEFE0": "#F6E7D6",
      "#F8F3EA": "#F8F1E6",
      "#F4F4F2": "#F8F6EF",
      "#FFFFFF": "#F8F6EF",
      "#fff": "#F8F6EF",
    },
  },
  "executive-90day-onboarding-deck": {
    name: "executive operating cadence",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(35,42,61,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(155,27,48,0.10), transparent 24%), #FBFAF5",
    textureCss:
      "linear-gradient(90deg, rgba(35,42,61,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(155,27,48,0.023) 1px, transparent 1px)",
    textureSize: "58px 58px",
    replacements: {
      "#232A3D": "#283148",
      "#2C3447": "#30384C",
      "#525B66": "#58616B",
      "#6B7689": "#707A8A",
      "#A9B7C7": "#A7B4C2",
      "#9B1B30": "#A03346",
      "#F2A8B7": "#E8A7B1",
      "#FBEAE8": "#F5E5E1",
      "#FAEEEE": "#F7EAEA",
      "#EEF1F4": "#EEEFEA",
      "#F4F6FA": "#F4F4EF",
      "#FFFFFF": "#FBFAF5",
      "#fff": "#FBFAF5",
      "#1A1F24": "#1B2026",
    },
  },
  "cert-exam-prep-deck": {
    name: "exam drill cobalt saffron",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Roboto+Slab:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Roboto Slab','Zilla Slab','Source Serif Pro',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(245,166,35,0.13), transparent 24%), linear-gradient(135deg, rgba(0,59,92,0.055), rgba(255,255,255,0) 45%), #FBFAF4",
    textureCss:
      "linear-gradient(90deg, rgba(0,59,92,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(245,166,35,0.024) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#003B5C": "#0F4A68",
      "#1B3D63": "#254D70",
      "#5C7794": "#607C96",
      "#C9D1D8": "#CAD2D6",
      "#D9E2EC": "#DAE3E8",
      "#F5A623": "#E49B28",
      "#B8531C": "#AB5628",
      "#C8392E": "#B9463E",
      "#FCE3E3": "#F5DFDC",
      "#FBF1DE": "#F7EBD7",
      "#FFFFFF": "#FBFAF4",
      "#fff": "#FBFAF4",
      "#1A1F2E": "#1D2534",
    },
  },
  "phd-survey-defense-deck": {
    name: "committee survey oxblood",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Literata','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(27,42,78,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(164,30,30,0.10), transparent 24%), #FBF8F1",
    textureCss:
      "linear-gradient(90deg, rgba(27,42,78,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(164,30,30,0.024) 1px, transparent 1px)",
    textureSize: "64px 64px",
    replacements: {
      "#1B2A4E": "#20345C",
      "#13223C": "#182A48",
      "#3A4A6F": "#3F5375",
      "#7A8AA3": "#798AA0",
      "#A41E1E": "#9B2A2B",
      "#8C1515": "#8C2424",
      "#C03A2B": "#B34238",
      "#FDE8EA": "#F5E4E2",
      "#D6DCE6": "#D7D9D2",
      "#EAF0F7": "#E8EEE9",
      "#FFFFFF": "#FBF8F1",
      "#fff": "#FBF8F1",
      "#1A1A1A": "#1A1B1D",
    },
  },
  "stem-student-research-project-deck": {
    name: "science fair cobalt lime",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap');",
    bodyFont: "'Atkinson Hyperlegible','Inter',system-ui,sans-serif",
    monoFont: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(60,227,164,0.15), transparent 24%), linear-gradient(135deg, rgba(15,77,146,0.055), rgba(255,255,255,0) 45%), #FAFCF6",
    textureCss:
      "linear-gradient(90deg, rgba(15,77,146,0.035) 1px, transparent 1px), linear-gradient(0deg, rgba(60,227,164,0.026) 1px, transparent 1px)",
    textureSize: "50px 50px",
    replacements: {
      "#0F4D92": "#1B5C9A",
      "#0A356A": "#164272",
      "#1F6FB2": "#2C75B1",
      "#5BA9E8": "#62A7DF",
      "#7FA9D1": "#80A8CC",
      "#3CE3A4": "#37C990",
      "#28A745": "#32A65D",
      "#E9F7EE": "#E8F5EC",
      "#D6DCE4": "#D6DCE0",
      "#F4F6F9": "#F3F6EF",
      "#FFFFFF": "#FAFCF6",
      "#fff": "#FAFCF6",
      "#212529": "#20272B",
    },
  },
  "self-study-explainer-deck": {
    name: "self study notebook blue",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Manrope','Inter',system-ui,sans-serif",
    serifFont: "'Newsreader','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(26,46,78,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(226,165,61,0.12), transparent 24%), #FCFAF2",
    textureCss:
      "linear-gradient(90deg, rgba(26,46,78,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(226,165,61,0.024) 1px, transparent 1px)",
    textureSize: "60px 60px",
    replacements: {
      "#1A2E4E": "#233B60",
      "#1B2A41": "#22344F",
      "#3A536F": "#425C76",
      "#8FA7C9": "#8EA6C2",
      "#E2A53D": "#D39B35",
      "#E8B400": "#D6A924",
      "#A06F00": "#A06C13",
      "#FFF1D6": "#F6E9CB",
      "#F4F4F2": "#F4F0E6",
      "#FFFFFF": "#FCFAF2",
      "#fff": "#FCFAF2",
      "#1A1A1A": "#1B1D20",
    },
  },
  "preclinical-nursing-class-deck": {
    name: "clinical classroom teal red",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');",
    bodyFont: "'Libre Franklin','Inter',system-ui,sans-serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "linear-gradient(135deg, rgba(46,125,91,0.055), rgba(255,255,255,0) 45%), radial-gradient(circle at 90% 12%, rgba(216,38,56,0.10), transparent 24%), #FAFCF7",
    textureCss:
      "linear-gradient(90deg, rgba(46,125,91,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(216,38,56,0.023) 1px, transparent 1px)",
    textureSize: "56px 56px",
    replacements: {
      "#2E7D5B": "#347F61",
      "#1F7A4D": "#2D7E57",
      "#D72638": "#C83A47",
      "#B23A48": "#A93F4A",
      "#7A1616": "#7E2626",
      "#E8786A": "#E17768",
      "#FBE8E5": "#F6E4E0",
      "#E1F1E8": "#E1F0E7",
      "#D6DCE6": "#D7DDD8",
      "#F4F5F7": "#F3F5EF",
      "#FFFFFF": "#FAFCF7",
      "#fff": "#FAFCF7",
      "#1A1A1A": "#1B211E",
    },
  },
  "cross-language-seminar-deck": {
    name: "comparative seminar ink",
    fontImport:
      "@import url('https://fonts.googleapis.com/css2?family=Literata:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');",
    bodyFont: "'Source Sans 3','Inter',system-ui,sans-serif",
    serifFont: "'Literata','Source Serif 4',Georgia,serif",
    monoFont: "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace",
    backgroundCss:
      "radial-gradient(circle at 90% 12%, rgba(192,58,43,0.10), transparent 24%), linear-gradient(135deg, rgba(27,42,61,0.055), rgba(255,255,255,0) 45%), #FAF7F0",
    textureCss:
      "linear-gradient(90deg, rgba(27,42,61,0.034) 1px, transparent 1px), linear-gradient(0deg, rgba(192,58,43,0.023) 1px, transparent 1px)",
    textureSize: "66px 66px",
    replacements: {
      "#1B2A3D": "#223247",
      "#0F1B2C": "#172538",
      "#2E445F": "#354A64",
      "#5C6B7A": "#626F7C",
      "#C03A2B": "#B7473A",
      "#D7263D": "#C9414D",
      "#F5EFE3": "#F2E8D8",
      "#F7F3EB": "#F6EFE5",
      "#FAF7F2": "#FAF7F0",
      "#FFFFFF": "#FAF7F0",
      "#fff": "#FAF7F0",
      "#000000": "#111111",
      "#000": "#111111",
    },
  },
};

const requestedIds = parseIds(process.argv);
const ids = requestedIds.length ? requestedIds : Object.keys(profiles);
const dryRun = process.argv.includes("--dry-run");

for (const id of ids) {
  const profile = profiles[id];
  if (!profile) throw new Error(`No restyle profile is defined for "${id}"`);
  const templateDir = path.join(sourceRoot, id);
  if (!existsSync(templateDir)) throw new Error(`Template not found: ${templateDir}`);
  const files = await templateFiles(templateDir);
  let changed = 0;
  for (const file of files) {
    const before = await readFile(file, "utf8");
    const after = transformFile(before, profile, file.endsWith(".html"));
    if (after === before) continue;
    changed += 1;
    if (!dryRun) await writeFile(file, after, "utf8");
  }
  if (!dryRun) await writeFile(path.join(templateDir, ".restyle-profile.json"), `${JSON.stringify({ id, profile: profile.name, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(`${dryRun ? "Would restyle" : "Restyled"} ${id} (${profile.name}) — ${changed} files`);
}

function parseIds(argv) {
  const index = argv.findIndex((arg) => arg === "--ids");
  if (index === -1) return [];
  return String(argv[index + 1] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function templateFiles(templateDir) {
  const files = [];
  await collect(path.join(templateDir, "pages"), files);
  await collect(path.join(templateDir, "assets"), files);
  await collect(path.join(templateDir, "deck"), files);
  return files.filter((file) => file.endsWith(".html") || file.endsWith(".css"));
}

async function collect(dir, files) {
  if (!existsSync(dir)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file, files);
    else if (entry.isFile()) files.push(file);
  }
}

function transformFile(source, profile, isHtml) {
  let next = source;
  next = replaceGoogleFontImports(next, profile);
  next = replaceFonts(next, profile);
  next = replaceColors(next, profile.replacements);
  if (isHtml) next = injectRestyleBlock(next, profile);
  else next = appendCssTokens(next, profile);
  return next;
}

function replaceGoogleFontImports(source, profile) {
  let next = source.replace(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com\/css2\?[^'"]+['"]\);?/g, profile.fontImport);
  next = next.replace(/<link\s+href=["']https:\/\/fonts\.googleapis\.com\/css2\?[^"']+["']\s+rel=["']stylesheet["']\s*\/?>/g, "");
  next = next.replace(/<link\s+rel=["']stylesheet["']\s+href=["']https:\/\/fonts\.googleapis\.com\/css2\?[^"']+["']\s*\/?>/g, "");
  return next;
}

function replaceFonts(source, profile) {
  let next = source
    .replace(/font-family\s*:\s*'Inter'([^;"}]*)/g, `font-family:${profile.bodyFont}`)
    .replace(/font-family\s*:\s*Inter([^;"}]*)/g, `font-family:${profile.bodyFont}`)
    .replace(/font-family\s*:\s*'IBM Plex Sans'([^;"}]*)/g, `font-family:${profile.bodyFont}`)
    .replace(/font-family\s*:\s*'JetBrains Mono'([^;"}]*)/g, `font-family:${profile.monoFont}`)
    .replace(/font-family\s*:\s*'IBM Plex Mono'([^;"}]*)/g, `font-family:${profile.monoFont}`);
  if (profile.serifFont) {
    next = next
      .replace(/font-family\s*:\s*'Source Serif Pro'([^;"}]*)/g, `font-family:${profile.serifFont}`)
      .replace(/font-family\s*:\s*'Source Serif 4'([^;"}]*)/g, `font-family:${profile.serifFont}`)
      .replace(/font-family\s*:\s*"Roboto Slab"([^;"}]*)/g, `font-family:${profile.serifFont}`)
      .replace(/font-family\s*:\s*'Roboto Slab'([^;"}]*)/g, `font-family:${profile.serifFont}`);
  }
  next = next
    .replace(/--sans\s*:\s*[^;]+;/g, `--sans: ${profile.bodyFont};`)
    .replace(/--mono\s*:\s*[^;]+;/g, `--mono: ${profile.monoFont};`);
  if (profile.serifFont) next = next.replace(/--serif\s*:\s*[^;]+;/g, `--serif: ${profile.serifFont};`);
  return next;
}

function replaceColors(source, replacements) {
  let next = source;
  for (const [from, to] of Object.entries(replacements)) {
    next = next.replace(new RegExp(escapeRegExp(from), "gi"), to);
  }
  return next;
}

function injectRestyleBlock(source, profile) {
  const block = restyleHtmlBlock(profile);
  if (source.includes('data-ai-office-restyle="v1"')) {
    return source.replace(/<style data-ai-office-restyle="v1">[\s\S]*?<\/style>/, block);
  }
  return source.replace("</head>", `${block}\n</head>`);
}

function appendCssTokens(source, profile) {
  const serifRule = profile.serifFont ? `.serif,.slab{font-family:${profile.serifFont};}\n` : "";
  const block = `\n\n/* AI Office restyle profile: ${profile.name} */\n${profile.fontImport}\nbody,.sans{font-family:${profile.bodyFont};}\n${serifRule}.mono{font-family:${profile.monoFont};}\n`;
  if (source.includes("AI Office restyle profile:")) {
    return source.replace(/\/\* AI Office restyle profile:[\s\S]*$/m, block.trimStart());
  }
  return `${source.trimEnd()}${block}`;
}

function restyleHtmlBlock(profile) {
  const serifRule = profile.serifFont ? `.serif,.slab{font-family:${profile.serifFont};}\n  ` : "";
  return `<style data-ai-office-restyle="v1">
  ${profile.fontImport}
  body{font-family:${profile.bodyFont};background:${profile.backgroundCss};}
  ${serifRule}.slide-container,.sans{font-family:${profile.bodyFont};}
  .mono{font-family:${profile.monoFont};}
  .slide-container::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:${profile.textureCss};background-size:${profile.textureSize};opacity:.62;mix-blend-mode:multiply;}
  .slide-container::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(20,24,32,.035), inset 0 0 120px rgba(20,24,32,.035);}
</style>`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
