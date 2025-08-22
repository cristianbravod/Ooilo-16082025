const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-aqui';

// Middleware para verificar la autenticación
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Acceso denegado. No se proporcionó token.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      rol: decoded.rol
    };
    next();
  } catch (error) {
    console.error('Error de autenticación:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado.'
    });
  }
};

// Middleware para verificar si el usuario es administrador
const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado. Se requiere rol de administrador.'
    });
  }
};

// Middleware para verificar roles específicos
const roleMiddleware = (roles) => {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.rol)) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}.`
      });
    }
  };
};


// Middleware para autenticación opcional
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        rol: decoded.rol
      };
    } catch (error) {
      // Ignorar token inválido, simplemente no se establece req.user
      req.user = null;
    }
  }
  
  next();
};


module.exports = {
  authMiddleware,
  adminMiddleware,
  roleMiddleware,
  optionalAuth
};
