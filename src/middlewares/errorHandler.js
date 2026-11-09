function errorHandler(err, req, res, next) {
  console.error('[Unhandled Error]', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan internal pada server';

  res.status(status).json({
    success: false,
    message: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

module.exports = { errorHandler };

