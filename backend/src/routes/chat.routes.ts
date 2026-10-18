import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.js';
import { chatService } from '../services/chatService';

const router = Router();

// Validation schemas
const ChatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message cannot exceed 2,000 characters'),
});

const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => !isNaN(val) && val >= 1, 'Page must be an integer >= 1'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 30))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 100, 'Limit must be between 1 and 100'),
});

/**
 * POST /api/v1/chat
 * Send user query, perform RAG retrieval & user-scoped tool aggregate, return grounded response.
 */
router.post(
  '/',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ChatMessageSchema.parse(req.body);
      const userId = req.user!.id;

      const result = await chatService.processUserMessage(userId, parsed.message);
      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/chat/history
 * Paginated chat message history for the authenticated user.
 */
router.get(
  '/history',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = PaginationQuerySchema.parse(req.query);
      const userId = req.user!.id;

      const result = await chatService.getChatHistory(userId, page, limit);
      res.status(200).json({
        data: result.messages,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v1/chat/history
 * Delete all chat message history for the authenticated user.
 */
router.delete(
  '/history',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const result = await chatService.deleteChatHistory(userId);
      res.status(200).json({
        message: 'Chat history deleted successfully',
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
