/** Account endpoints: current user and profile settings. */
import { getProfile, updateProfile } from '../services/profile.service.js';

export const authController = {
  async me(req, res) {
    const profile = await getProfile(req.db, req.user);
    res.json({ data: { user: req.user, profile } });
  },
  async updateProfile(req, res) {
    res.json({ data: await updateProfile(req.db, req.user, req.valid.body) });
  },
};
