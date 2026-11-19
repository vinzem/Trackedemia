/**
 * Validates request parts against zod schemas. Parsed (and therefore
 * sanitised / coerced) values replace the raw input on `req.valid`.
 */
export function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    try {
      req.valid = {
        body: body ? body.parse(req.body ?? {}) : undefined,
        query: query ? query.parse(req.query ?? {}) : undefined,
        params: params ? params.parse(req.params ?? {}) : undefined,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
