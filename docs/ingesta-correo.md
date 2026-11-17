# Ingesta de gastos desde Gmail y Outlook (Byte → Finanfy)

Este documento es el **contrato** entre Byte (el asistente personal de Diego) y la app. Si Byte y la app no coinciden en este formato, la importación se rechaza con un mensaje claro.

## Quién hace qué

| | Byte | App (Finanfy) |
|---|---|---|
| Lee el correo | Sí, con sus propios conectores de Gmail y Outlook | **Nunca**. No pide ni guarda credenciales de correo ni de banco |
| Detecta gastos | Sí, y genera el archivo JSON de abajo | No |
| Valida y deduplica | — | Sí |
| Registra gastos | — | Solo cuando **Diego confirma** cada uno |
| Mueve dinero / cancela suscripciones | No | **No**. Solo avisa |

Flujo: Byte entrega el `.json` → Diego lo pega o lo carga en **Importar** → la app lo valida, marca duplicados y deja cada gasto **pendiente** → Diego confirma (uno o varios), edita categoría/monto/cuenta o descarta.

## Qué debe detectar Byte

Estados de cuenta y movimientos bancarios, compras en Mercado Libre, Mercado Pago y Amazon, suscripciones (Netflix, Xbox, etc.), retiros de efectivo, transferencias enviadas y recibidas, cargos recurrentes y reembolsos.

## Esquema (versión 1)

```json
{
  "version": 1,
  "source": "gmail",
  "detected_at": "2026-11-17T10:00:00-06:00",
  "expenses": [
    {
      "id": "hash-estable-para-deduplicar",
      "date": "2026-11-16",
      "merchant": "Amazon México",
      "description": "Pedido 702-2776683-7637868",
      "amount_cents": 74299,
      "currency": "MXN",
      "type": "compra",
      "category_suggested": "hogar",
      "account_hint": "tarjeta ****1234",
      "reference": "702-2776683-7637868",
      "source_message": "gmail:1a1e..."
    }
  ]
}
```

### Archivo

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `version` | número | sí | Siempre `1`. |
| `source` | texto | sí | `"gmail"` u `"outlook"`. Un archivo por origen. |
| `detected_at` | texto | sí | Fecha y hora ISO 8601 con zona, p. ej. `2026-11-17T10:00:00-06:00`. |
| `expenses` | lista | sí | De 0 a 2000 gastos. |

### Cada gasto

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `id` | texto | sí | **Estable y único por gasto** (máx. 200 caracteres). Recomendado: SHA-256 de `date + "|" + amount_cents + "|" + merchant + "|" + reference`. Si Byte vuelve a ver el mismo correo, debe producir el mismo `id`. |
| `date` | texto | sí | Fecha real `AAAA-MM-DD` del cargo (no la del correo, si son distintas). |
| `merchant` | texto | sí | Comercio o contraparte (máx. 120). |
| `description` | texto | no | Detalle corto (máx. 240). |
| `amount_cents` | entero | sí | **Centavos enteros, siempre positivo** (`742.99` pesos → `74299`). Nunca decimales ni negativos. |
| `currency` | texto | sí | `"MXN"`. Otras monedas se rechazan por ahora. |
| `type` | texto | sí | `compra`, `suscripcion`, `transferencia`, `retiro_efectivo`, `cargo_recurrente` o `reembolso`. |
| `direction` | texto | no | `"salida"` (por omisión) o `"entrada"`. Solo `transferencia` puede ser de entrada (transferencia recibida). `reembolso` siempre es entrada. |
| `category_suggested` | texto | no | Una categoría de la app (lista abajo). Si no es exacta, la app propone la más cercana y queda editable. |
| `account_hint` | texto | no | **Solo los últimos 4 dígitos**: `"tarjeta ****1234"`, `"cuenta ****5678"`, `"Mercado Pago"`. |
| `reference` | texto | no | Número de pedido, folio o clave de rastreo (máx. 120). |
| `source_message` | texto | no | Identificador del correo en el origen (`gmail:<id>`, `outlook:<id>`). La app no guarda el correo, solo esta referencia. |

### Categorías de la app

`gas`, `luz`, `agua`, `telefonia`, `colegiaturas`, `despensa`, `mantenimiento`, `transporte`, `salud`, `ocio`, `otros`.

Sinónimos aceptados (se convierten a la más cercana y la app lo avisa): `hogar`/`casa` → `mantenimiento`; `supermercado`/`comida` → `despensa`; `restaurante`/`entretenimiento`/`streaming`/`suscripciones` → `ocio`; `gasolina`/`uber` → `transporte`; `internet`/`celular` → `telefonia`; `farmacia`/`medico` → `salud`; `educacion`/`escuela` → `colegiaturas`; cualquier otra → `otros`.

## Reglas que aplica la app

1. **Validación.** Un error en el archivo (versión, origen, fecha de detección) rechaza todo. Un error en un gasto (falta `id`, fecha imposible, monto con decimales, moneda distinta de MXN, `type` desconocido…) solo excluye ese gasto; los demás se importan y se lista qué falló.
2. **Deduplicación por `id`.** Un `id` que ya se importó antes (pendiente, confirmado o descartado) se marca como **duplicado** y no se vuelve a registrar. Reimportar el mismo archivo no agrega nada. Un `id` repetido dentro del mismo archivo es error.
3. **Pendiente de confirmación.** Todo gasto nuevo queda pendiente con su categoría sugerida, comercio, fecha, monto y cuenta sugerida. Nada es gasto oficial hasta que Diego lo confirma.
4. **Cuenta sugerida.** Se empareja por los últimos 4 dígitos del `account_hint` con las cuentas registradas en la app (o por "Mercado Pago"). Si no hay coincidencia única, queda **por asignar**.
5. **Al confirmar:**
   - `compra`, `suscripcion`, `cargo_recurrente`, `transferencia` de salida → **gasto**, descontado de la cuenta.
   - `reembolso` y `transferencia` de entrada → **ingreso** («otro»), sumado a la cuenta.
   - `retiro_efectivo` → si hay una cuenta de tipo Efectivo, se registra como **movimiento entre cuentas** (sale del banco, entra al efectivo; no es gasto). Si no, como gasto.
6. **Privacidad.** Cualquier número de tarjeta o cuenta completo que llegue por error (16 dígitos, Amex, CLABE de 18) se recorta a `****1234` antes de guardarse, en `account_hint`, `merchant`, `description` y `reference`, y la app lo avisa. Los números de pedido con guiones (Amazon) y las claves de rastreo alfanuméricas se conservan.
7. **Reglas por comercio** (apagadas por defecto, en Ajustes): al confirmar un comercio, los siguientes gastos de ese comercio toman la misma categoría. La **auto-confirmación** se enciende aparte, comercio por comercio, y nunca aplica a un cargo que parezca duplicado o inusual.
8. **Historial.** Cada importación queda registrada: fecha, origen, cuántos gastos, duplicados, confirmados, descartados y pendientes.

## Dónde se guarda

- Con Firebase: `users/{uid}/inbox` (pendientes y decididos), `users/{uid}/imports` (historial), `users/{uid}/accounts`, `users/{uid}/transfers`, `users/{uid}/merchantRules`, `users/{uid}/habits`. Mismas reglas de Firestore del MVP: solo el usuario autorizado.
- En modo demo: en el navegador (localStorage), nada sale del equipo.

## Ejemplo

[`ejemplo-ingesta.json`](ejemplo-ingesta.json) trae 6 casos **ficticios** (todos marcados «EJEMPLO»): compra de Amazon, pago de Mercado Pago, transferencia enviada, retiro de efectivo, suscripción de Netflix y un reembolso. En la demo, la cuenta «Nómina (ejemplo)» termina en `0193`, igual que el `account_hint` del ejemplo, para que el emparejamiento de cuenta se vea funcionando.
