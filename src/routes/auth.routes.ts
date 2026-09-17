//src/routes/auth.routes.ts
import { Router } from 'express'
import {
  loginUsuario,
  verificarCodigo,
  reenviarCodigo,
  forgotPassword,
  resetPassword
} from '../controllers/auth.controller'

const router = Router()

router.post('/login', loginUsuario)
router.post('/verificar-codigo', verificarCodigo)
router.post('/reenviar-codigo', reenviarCodigo)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

export default router
