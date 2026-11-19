/**
 * Runs detection while the user types: instant local parsing for responsive
 * highlights, then debounced AI extraction that replaces the local result.
 * Stale responses (for text that has since changed) are discarded.
 */
import { AI_DETECTION_DELAY_MS, LOCAL_DETECTION_DELAY_MS } from '../../utils/constants.js';
import { debounce } from '../../utils/helpers.js';
import { detectLocally, extractReminders, mightContainEvent } from './detection-service.js';

/**
 * @param {{ timezone: () => string, noteId?: () => string|null, onResult: (result:object, meta:{ pending:boolean, text:string }) => void, aiEnabled?: () => boolean }} options
 */
export function createDetectionController({ timezone, noteId = () => null, onResult, aiEnabled = () => true }) {
  let latestText = '';
  let controller = null;
  let lastAiText = null;

  const runLocal = debounce((text) => {
    const result = detectLocally(text, timezone());
    const needsAi = aiEnabled() && mightContainEvent(text) && text !== lastAiText;
    onResult(result, { pending: needsAi, text });
    if (needsAi) runAi(text);
  }, LOCAL_DETECTION_DELAY_MS);

  const runAi = debounce(async (text) => {
    controller?.abort();
    controller = new AbortController();
    try {
      const result = await extractReminders(text, { timezone: timezone(), noteId: noteId(), signal: controller.signal });
      if (text !== latestText) return; // stale
      lastAiText = text;
      onResult(result, { pending: false, text });
    } catch (error) {
      if (error.name !== 'AbortError') onResult(detectLocally(text, timezone()), { pending: false, text });
    }
  }, AI_DETECTION_DELAY_MS);

  return {
    analyze(text) {
      latestText = text;
      runLocal(text);
    },
    /** Immediate full analysis (e.g. on load or before confirming). */
    async analyzeNow(text) {
      latestText = text;
      runLocal.cancel();
      runAi.cancel();
      const local = detectLocally(text, timezone());
      onResult(local, { pending: aiEnabled() && mightContainEvent(text), text });
      if (aiEnabled() && mightContainEvent(text)) await runAi.flush(text);
    },
    destroy() {
      runLocal.cancel();
      runAi.cancel();
      controller?.abort();
    },
  };
}
