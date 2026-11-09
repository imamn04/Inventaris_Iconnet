const authService = require('../services/authService');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const result = await authService.loginUser(username, password);

    if (!result.success) {
      return res.status(401).json(result);
    }

    return res.json({
      success: true,
      message: 'Login successful',
      user: result.user
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login
};

