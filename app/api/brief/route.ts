import path from 'node:path';
import { getEiaMarketData } from '../../../lib/eia';
import { buildPublicEiaBrief } from '../../../lib/public-eia-brief';
import { listOfficialSteoVintages } from '../../../lib/steo-official-vintage';
import { buildSteoRevisionIntelligence, type SteoRevisionIntelligence } from '../../../lib/steo-revision-intelligence';

export const dynamic = 'force-dynamic';

function readRevisionContext(): SteoRevisionIntelligence | null {
  try {
    const directory = path.join(process.cwd(), 'data', 'steo-official-vintages');
    return buildSteoRevisionIntelligence(listOfficialSteoVintages(directory));
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const market = await getEiaMarketData();
    const generatedAt = new Date().toISOString();
    const brief = buildPublicEiaBrief({ generatedAt, market, revisions: readRevisionContext() });
    const date = generatedAt.slice(0, 10);

    return new Response(brief, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="lastbarrel-public-eia-brief-${date}.md"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live EIA data unavailable';
    return new Response(
      `# LastBarrel Public EIA Evidence Brief unavailable\n\nLive core EIA evidence could not be retrieved, so no export was produced.\n\nError: ${message}\n`,
      {
        status: 503,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
