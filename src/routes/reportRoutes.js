const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/ReportController');
const { verificarToken, esAdmin } = require('../middleware/auth');

// Rutas de informes (protegidas y solo para administradores)

// Dashboard de estadísticas rápidas
router.get('/dashboard', verificarToken, esAdmin, ReportController.getDashboardStats);

// Reporte de ventas avanzado con filtros
router.get('/ventas', verificarToken, esAdmin, ReportController.getSalesReport);

// Reporte de productos más populares
router.get('/productos/populares', verificarToken, esAdmin, ReportController.getPopularProducts);

// Reporte de rendimiento por mesa
router.get('/mesas', verificarToken, esAdmin, ReportController.getTableReport);

// Reporte de ventas por período (día, semana, mes)
router.get('/ventas/periodo', verificarToken, esAdmin, ReportController.getSalesByPeriod);

// Ruta para exportar datos
router.get('/exportar', verificarToken, esAdmin, ReportController.exportData);

module.exports = router;
