import assert from 'node:assert/strict'
import {
  convertirCantidad,
  esUnidadMedida,
  validarCantidadParaUnidad,
} from './src/utils/unidades'

function comprobar(
  descripcion: string,
  prueba: () => void,
): void {
  prueba()
  console.log(`✅ ${descripcion}`)
}

function casiIgual(
  obtenido: number,
  esperado: number,
  tolerancia = 0.000000001,
): void {
  assert.ok(
    Math.abs(obtenido - esperado) <= tolerancia,
    `Esperado ${esperado}, obtenido ${obtenido}`,
  )
}

console.log('\n=== PRUEBAS DEL CONVERSOR DE UNIDADES ===\n')

comprobar('180 g equivalen a 0.18 kg', () => {
  casiIgual(convertirCantidad(180, 'g', 'kg'), 0.18)
})

comprobar('1.5 kg equivalen a 1500 g', () => {
  casiIgual(convertirCantidad(1.5, 'kg', 'g'), 1500)
})

comprobar('2500 mg equivalen a 2.5 g', () => {
  casiIgual(convertirCantidad(2500, 'mg', 'g'), 2.5)
})

comprobar('30 ml equivalen a 0.03 L', () => {
  casiIgual(convertirCantidad(30, 'ml', 'L'), 0.03)
})

comprobar('1.25 L equivalen a 1250 ml', () => {
  casiIgual(convertirCantidad(1.25, 'L', 'ml'), 1250)
})

comprobar('Las unidades contables se conservan sin conversión', () => {
  assert.equal(convertirCantidad(12, 'unidad', 'unidad'), 12)
})

comprobar('Se rechaza convertir kg a L', () => {
  assert.throws(
    () => convertirCantidad(1, 'kg', 'L'),
    /familias diferentes/,
  )
})

comprobar('Se rechazan unidades fuera del catálogo', () => {
  assert.equal(esUnidadMedida('kilos'), false)
  assert.throws(
    () => convertirCantidad(1, 'kilos', 'kg'),
    /no está permitida/,
  )
})

comprobar('Se rechazan fracciones de unidades contables', () => {
  assert.equal(validarCantidadParaUnidad(1, 'unidad'), true)
  assert.equal(validarCantidadParaUnidad(1.5, 'unidad'), false)
  assert.throws(
    () => convertirCantidad(1.5, 'unidad', 'unidad'),
    /no es válida/,
  )
})

comprobar('Se rechazan cantidades negativas o no finitas', () => {
  assert.equal(validarCantidadParaUnidad(-1, 'kg'), false)
  assert.equal(validarCantidadParaUnidad(Infinity, 'kg'), false)
})

console.log('\n✅ TODAS LAS PRUEBAS DEL CONVERSOR PASARON.\n')
