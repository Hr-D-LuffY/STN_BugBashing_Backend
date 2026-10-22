// middleware to validate request bodies against Zod schemas

const { ZodError } = require("zod");

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (!(err instanceof ZodError)) return next(err);

    // Zod 4 exposes the problems as `issues`
    const errors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    return res.status(400).json({
      message: errors.map((e) => e.message).join(". "),
      errors,
    });
  }
};

module.exports = validate;
