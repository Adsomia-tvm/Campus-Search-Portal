/**
 * Zod validation middleware.
 *
 * Usage:
 *   const { z } = require('zod');
 *   const validate = require('../middleware/validate');
 *
 *   const schema = z.object({
 *     body: z.object({ name: z.string().min(2) }),
 *     params: z.object({ id: z.coerce.number().int().positive() }).optional(),
 *   });
 *
 *   router.post('/', validate(schema), handler);
 */

const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: err.issues.map(i => ({
            field: i.path.slice(1).join('.'), // remove 'body'/'query'/'params' prefix
            message: i.message,
          })),
        });
      }
      next(err);
    }
  };
}

module.exports = validate;
