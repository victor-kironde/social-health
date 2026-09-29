import type { EventLog, ModelConfig } from '@sg/score-engine';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { LIGHT_THEME } from '../ui/theme';
import type { PersonGroup } from './groups';
import { buildReportHtml } from './report';

const PREFIX = 'social-health-report';

/**
 * Builds the Confidential Social Health report (score, graph, 5-month trends, relationships) as
 * an A4 PDF and opens the share sheet to save or send it. The file stays in the app's cache and is
 * removed with other exports on the next visit to Settings.
 */
export async function exportReportPdf(input: {
  log: EventLog;
  config: ModelConfig;
  positions: Map<string, { x: number; y: number }>;
  groups: PersonGroup[];
}): Promise<void> {
  const html = buildReportHtml({ ...input, now: Date.now(), palette: LIGHT_THEME, range: '5m' });
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  let shareUri = uri;
  try {
    const named = new File(Paths.cache, `${PREFIX}-${new Date().toISOString().slice(0, 10)}.pdf`);
    if (named.exists) named.delete();
    new File(uri).move(named);
    shareUri = named.uri;
  } catch {
    // Keep the generated name if renaming fails.
  }
  await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', dialogTitle: 'Save Social Health report (Confidential)', UTI: 'com.adobe.pdf' });
}
