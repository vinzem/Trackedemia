/** HTTP handler for /api/ai/extract-reminders. */
import { getProfile } from '../services/profile.service.js';

export function createAiController({ extraction }) {
  return {
    async extract(req, res) {
      const { text, timezone, now } = req.valid.body;
      const profile = await getProfile(req.db, req.user);
      const result = await extraction.extract({
        text,
        timezone: timezone || profile.timezone,
        now,
        allowAi: profile.ai_detection_enabled !== false,
      });
      res.json({ data: result });
    },
  };
}
