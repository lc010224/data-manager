export function createApiError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}
