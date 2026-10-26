import { Router } from 'express';
import { methodNotAllowed } from '../middleware/errorHandler.js';

export function createHealthRouter(): Router {
  const router = Router();
  router
    .route('/health')
    .get((_req, res) => {
      res.status(200).json({ status: 'ok' });
    })
    .all(methodNotAllowed(['GET', 'HEAD']));
  return router;
}
