// BackEnd/src/routes/auth.js - VERSIÓN CORREGIDA
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const config = require('../config/database');
const { authMiddleware } = require('../middleware/auth'); // Importar middleware


const router = express.Router();
const pool = new Pool(config);


const validateLogin = [
  body('email').isEmail().withMessage('Se requiere un email válido.'),
  body('password').notEmpty().withMessage('La contraseña es requerida.')
];

const validateTokenVerification = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token no proporcionado.', code: 'NO_TOKEN' });
    }
    req.token = token;
    next();
};
// Login de usuario
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generar token CON ROL
    const token = jwt.sign(
      { userId: user.id, email: user.email, rol: user.rol }, // ROL AÑADIDO
      process.env.JWT_SECRET || 'tu-secret-key-aqui',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        direccion: user.direccion,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ CORREGIDO: Cambiado de POST a GET para coincidir con la app
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, email, telefono, direccion, rol FROM usuarios WHERE id = $1', [req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error del servidor al obtener datos del usuario' });
  }
});


module.exports = router;
