// src/controllers/auth.controller.ts
/**
 * Módulo de autenticación legacy.
 * Las funciones de autenticación y recuperación de contraseñas de Cliente
 * (forgotPassword, resetPassword, verificarCodigo, reenviarCodigo) han sido eliminadas
 * debido a que Cliente ya no es un usuario del sistema.
 *
 * La autenticación oficial y única del sistema corresponde a los empleados y se gestiona
 * a través de POST /api/usuarios/login en usuario.controller.ts.
 */
