export interface HtmlFixtureResponse {
  path: string;
  title: string;
  type: "html";
  html: string;
}

export async function fetchTuttiStudyPlanFixture(): Promise<HtmlFixtureResponse> {
  const response = await fetch("/api/dev/fixtures/tutti-study-plan");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<HtmlFixtureResponse>;
}
