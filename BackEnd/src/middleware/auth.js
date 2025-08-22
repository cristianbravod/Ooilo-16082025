// BackEnd/src/middleware/auth.js - VERSIÓN CORREGIDA
const jwt = require('jsonwebtoken');
const config = require('../config/database');

// Middleware principal de autenticación
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Si no hay token, adjuntamos un usuario "invitado" para rutas opcionales
    // y para evitar que el sistema falle si el token no es requerido.
    req.user = { rol: 'invitado' };
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    // Usamos el secreto del entorno o el de la configuración
    const decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwtSecret);
    req.user = decoded; // Adjunta el payload del token (ej: { id, rol, nombre })
    next();
  } catch (error) {
    console.error('❌ Token inválido o expirado:', error.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Token no válido o expirado. Por favor, inicia sesión de nuevo.',
      code: 'TOKEN_INVALID'
    });
  }
};

// Middleware para verificar si el usuario es administrador
const adminMiddleware = (req, res, next) => {
  // Se asume que authMiddleware ya se ejecutó
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Acceso denegado. Se requiere rol de administrador.',
      code: 'FORBIDDEN_ADMIN_REQUIRED'
    });
  }
};

// ✅ FUNCIÓN AÑADIDA Y CORREGIDA
// Middleware para verificar múltiples roles. Es una función de orden superior.
const roleMiddleware = (allowedRoles) => {
  // Devuelve el middleware real que Express usará
  return (req, res, next) => {
    // authMiddleware debe haber sido llamado antes, por lo que req.user debería existir.
    if (!req.user || !req.user.rol) {
      return res.status(401).json({
        success: false,
        message: 'Autenticación requerida. No se encontró información de usuario.',
        code: 'AUTH_REQUIRED'
      });
    }

    const { rol } = req.user;

    // Comprueba si el rol del usuario está en la lista de roles permitidos
    if (allowedRoles.includes(rol)) {
      next(); // El rol del usuario está permitido, continuar.
    } else {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Tu rol ('${rol}') no tiene permiso. Se requiere: ${allowedRoles.join(', ')}.`,
        code: 'FORBIDDEN_ROLE_MISMATCH'
      });
    }
  };
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  roleMiddleware, // ✅ EXPORTACIÓN AÑADIDA
};
