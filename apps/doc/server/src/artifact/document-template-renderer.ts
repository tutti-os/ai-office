import type { DocumentTemplate } from "@ai-doc/shared";

export function renderTemplateSeed(template: DocumentTemplate) {
  if (template.category === "Career") return renderCareerTemplate(template);
  if (template.category === "Business") return renderBusinessTemplate(template);
  if (template.category === "Research") return renderResearchTemplate(template);
  if (template.category === "Legal") return renderLegalTemplate(template);
  if (template.category === "Financial") return renderInvoiceTemplate(template);
  return renderCreativeTemplate(template);
}

function renderTemplateShell(template: DocumentTemplate, body: string, extraCss = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(template.name)}</title>
  <style>
    body {
      max-width: 820px;
      margin: 0 auto;
      padding: 56px 72px 96px;
      color: #263238;
      font-family: Lexend, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.62;
    }
    h1 { margin: 0 0 18px; font-size: 34px; line-height: 1.15; letter-spacing: 0; }
    h2 { margin: 30px 0 10px; font-size: 20px; letter-spacing: 0; }
    p { margin: 0 0 14px; }
    .eyebrow { color: #667085; font-size: 12px; font-weight: 700; letter-spacing: .16em; margin: 0 0 10px; text-transform: uppercase; }
    .muted { color: #667085; }
    .rule { border-top: 1px solid #d0d5dd; margin: 24px 0; }
    .grid-2 { display: grid; gap: 24px; grid-template-columns: 1fr 1fr; }
    .section { margin-top: 26px; }
    .pill { background: #eef2f6; border-radius: 999px; display: inline-block; font-size: 13px; margin: 0 8px 8px 0; padding: 6px 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #e4e7ec; padding: 10px 0; text-align: left; }
    th { color: #667085; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }
    ${extraCss}
  </style>
</head>
<body contenteditable="true">
${body}
</body>
</html>`;
}

function renderCareerTemplate(template: DocumentTemplate) {
  const name = escapeHtml(template.name);
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Resume</p>
  <h1>${name}</h1>
  <p class="muted">Product strategist · New York · emily@example.com · (555) 010-2048</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="summary">
    <h2>Profile</h2>
    <p>Accomplished cross-functional operator with experience turning ambiguous business goals into clear product, research, and launch plans.</p>
  </section>
  <section class="section" data-ai-region="experience">
    <h2>Experience</h2>
    <p><strong>Senior Product Manager, Northstar Labs</strong><br><span class="muted">2021 - Present</span></p>
    <p>Led roadmap planning, customer research, and executive reporting for a collaborative AI workflow product.</p>
    <p><strong>Strategy Associate, Meridian Studio</strong><br><span class="muted">2018 - 2021</span></p>
    <p>Built market analysis, operating plans, and launch briefs for enterprise software clients.</p>
  </section>
  <section class="grid-2 section">
    <div data-ai-region="education">
      <h2>Education</h2>
      <p><strong>State University</strong><br><span class="muted">B.A. Economics</span></p>
    </div>
    <div data-ai-region="skills">
      <h2>Skills</h2>
      <span class="pill">Research</span><span class="pill">Roadmapping</span><span class="pill">Analytics</span><span class="pill">Writing</span>
    </div>
  </section>`,
    `h1 { font-size: 42px; } h2 { color: #315c59; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; }`,
  );
}

function renderBusinessTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">${template.id.includes("letter") ? "Client Letter" : "Business Proposal"}</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Prepared for client review</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="overview">
    <h2>Executive Summary</h2>
    <p>This doc outlines the objective, proposed approach, timeline, and next steps for a focused business initiative.</p>
  </section>
  <section class="grid-2 section">
    <div data-ai-region="scope">
      <h2>Scope</h2>
      <p>Discovery, planning, delivery coordination, and a concise implementation handoff.</p>
    </div>
    <div data-ai-region="timeline">
      <h2>Timeline</h2>
      <p>Phase 1: discovery<br>Phase 2: draft<br>Phase 3: delivery</p>
    </div>
  </section>
  <section class="section" data-ai-region="next_steps">
    <h2>Next Steps</h2>
    <p>Confirm goals, assign owners, and schedule the first review checkpoint.</p>
  </section>`,
  );
}

function renderResearchTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Research Brief</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Findings, implications, and recommended actions</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="context">
    <h2>Context</h2>
    <p>This brief summarizes the current state, key evidence, and practical implications for decision makers.</p>
  </section>
  <section class="section" data-ai-region="findings">
    <h2>Key Findings</h2>
    <ul>
      <li>The strongest signal is concentrated around repeat usage and workflow fit.</li>
      <li>Teams need clearer handoffs between analysis, writing, and review.</li>
      <li>Near-term opportunities are actionable with limited engineering risk.</li>
    </ul>
  </section>
  <section class="section" data-ai-region="recommendations">
    <h2>Recommendations</h2>
    <p>Prioritize a focused pilot, validate success metrics, and revisit scope after the first review cycle.</p>
  </section>`,
  );
}

function renderLegalTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Agreement</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Draft for review</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="parties">
    <h2>1. Parties</h2>
    <p>This agreement is entered into by and between Client and Service Provider.</p>
  </section>
  <section class="section" data-ai-region="scope">
    <h2>2. Scope of Services</h2>
    <p>Service Provider will perform the services described in the attached statement of work.</p>
  </section>
  <section class="section" data-ai-region="payment">
    <h2>3. Payment Terms</h2>
    <p>Client will pay fees according to the agreed milestone schedule.</p>
  </section>
  <section class="grid-2 section" data-ai-region="signature">
    <div><p><strong>Client</strong></p><p>Signature: __________________</p></div>
    <div><p><strong>Service Provider</strong></p><p>Signature: __________________</p></div>
  </section>`,
  );
}

function renderInvoiceTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Invoice</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Invoice #INV-2026-001 · Due on receipt</p>
  <div class="rule"></div>
  <section class="grid-2 section">
    <div data-ai-region="vendor"><h2>From</h2><p>Northstar Studio<br>billing@example.com</p></div>
    <div data-ai-region="client"><h2>Bill To</h2><p>Client Name<br>client@example.com</p></div>
  </section>
  <section class="section" data-ai-region="line_items">
    <table>
      <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Strategy and doc production</td><td>1</td><td>$2,400</td></tr>
        <tr><td>Review and revisions</td><td>1</td><td>$600</td></tr>
        <tr><td><strong>Total</strong></td><td></td><td><strong>$3,000</strong></td></tr>
      </tbody>
    </table>
  </section>`,
  );
}

function renderCreativeTemplate(template: DocumentTemplate) {
  return renderTemplateShell(
    template,
    `  <p class="eyebrow">Plan</p>
  <h1>${escapeHtml(template.name)}</h1>
  <p class="muted">Overview, audience, schedule, and execution notes</p>
  <div class="rule"></div>
  <section class="section" data-ai-region="overview">
    <h2>Overview</h2>
    <p>A concise plan that frames the goal, intended audience, creative direction, and success metrics.</p>
  </section>
  <section class="grid-2 section">
    <div data-ai-region="audience"><h2>Audience</h2><p>Primary stakeholders, customers, or event participants.</p></div>
    <div data-ai-region="timeline"><h2>Timeline</h2><p>Milestones, checkpoints, and delivery dates.</p></div>
  </section>
  <section class="section" data-ai-region="actions">
    <h2>Action Items</h2>
    <ul><li>Confirm owner and deadline.</li><li>Draft assets and review materials.</li><li>Prepare final handoff.</li></ul>
  </section>`,
  );
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
