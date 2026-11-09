function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const dataToValidate = req[source];
      const parsed = schema.parse(dataToValidate);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err.errors) {
        const errorMessages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({
          success: false,
          message: `Validasi gagal: ${errorMessages}`,
          errors: err.errors
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Format payload tidak valid'
      });
    }
  };
}

module.exports = { validate };

