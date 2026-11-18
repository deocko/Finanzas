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

## Cuentas dadas de alta (Mensaje 4)

Solo nombre, tipo e institución. **Ningún saldo, límite, fecha de corte, fecha límite ni últimos 4 dígitos viene precargado**: todo eso aparece como «por confirmar» hasta que Diego lo capture. Nunca se guardan números completos de tarjeta o cuenta.

| Cuenta | Tipo en la app | Institución | Nota |
|---|---|---|---|
| Nómina Banamex | Banco (débito / nómina) | Banamex | Principal: ahí llega la nómina y los depósitos |
| Nómina Bancomer | Banco (débito / nómina) | BBVA (Bancomer) | Segunda cuenta de nómina |
| BBVA Azul | Tarjeta de crédito | BBVA | |
| Amex Green | Tarjeta de servicios | American Express | No es de crédito |
| Amex Business | Tarjeta (tipo por confirmar) | American Express | Business Card |
| Amex Credit Card | Tarjeta de crédito | American Express | |
| Mercado Pago | Tarjeta de crédito | Mercado Pago | |
| Plata Card | Tarjeta de crédito | Plata | |
| Invex Walmart | Tarjeta de crédito | Invex / Walmart | |
| Hipotecario BBVA | Crédito hipotecario | BBVA | Préstamo: saldo deudor por confirmar |
| Efectivo | Efectivo | — | Se conserva la del MVP; solo se crea si no existe |

**Emparejamiento:** el `account_hint` se compara contra los últimos 4 dígitos que Diego capture en cada cuenta (o «Mercado Pago» por nombre). Mientras una cuenta no tenga sus 4 dígitos, sus gastos llegan con cuenta **por asignar**.

**Saldos:** el saldo confirmado solo usa movimientos confirmados. Lo detectado y pendiente se muestra aparte («si confirmas todo: …») y nunca cambia el saldo. Con el saldo inicial por confirmar, la cuenta muestra el neto de lo confirmado pero no inventa un saldo.

## Ingreso quincenal y recurrentes

- **Nómina:** $25,900.00 cada quincena (`2590000` centavos), días estimados 13 y 28, en Nómina Banamex. Byte puede mandar el depósito como `"type": "transferencia", "direction": "entrada"`; se reconoce por las palabras «nómina», «nomina», «sueldo» o «pago de nómina» en `merchant` o `description`.
- Estados de cada quincena: **esperado** (no llega la fecha), **no detectado aún** (ya pasó y Byte no lo vio; *no* se marca recibido), **detectado · por confirmar**, **diferencia por confirmar** (monto distinto de $25,900.00), **recibido** y **recibido con diferencia** (Diego lo confirmó). Un depósito se asigna a una sola quincena, dentro de ±5 días de la fecha estimada.
- Al confirmar un depósito de nómina se registra como ingreso **sueldo** (Mensaje 1) en la cuenta. Aguinaldo y prima vacacional no cambian.
- **Cargos recurrentes pre-registrados** (monto y fecha por confirmar): Spotify, Amazon Prime (mensual o anual), Netflix, ViX, HBO, Telcel, Uber Eats (variable), Mantenimiento, Gas, Terrenos Ciudad Maderas y Crédito Nissan. Cuando Byte detecta un cargo que coincide, la pantalla Recurrentes lo muestra y Diego puede adoptar ese monto con un toque.

## Catálogo de rubros

Cada rubro se registra con una categoría de la app (para presupuestos, 50/30/20 y reportes). Diego puede agregar, renombrar, reasignar y eliminar rubros en **Rubros**.

| Rubro | Subrubros |
|---|---|
| Ingresos | Nómina, Aguinaldo, Prima vacacional, Reembolsos, Otros ingresos |
| Vivienda | Hipoteca, Mantenimiento, Terrenos (Ciudad Maderas), Renta, Luz, Agua, Gas |
| Transporte | Crédito auto (Nissan), Gasolina, Tenencia, Uber / Didi, Estacionamiento |
| Servicios | Telefonía (Telcel), Internet, TV de paga |
| Suscripciones y entretenimiento | Spotify, Netflix, ViX, HBO, Amazon Prime, Xbox, Cine |
| Alimentación | Despensa, Uber Eats, Restaurantes, Café |
| Compras | Ropa, Electrónica, Mercado Libre, Amazon, Hogar |
| Salud | Médico, Farmacia, Seguro de salud |
| Tarjetas y créditos | Pagos a tarjetas, Intereses, Anualidades |
| Otros / por clasificar | Por clasificar (y los conceptos nuevos que vayan llegando) |

**Reglas comercio → rubro** (colección `merchantRubros`):

1. Siempre activas, porque solo **sugieren**: el movimiento sigue pendiente hasta que Diego confirma. (Las reglas de categoría y la auto-confirmación del Mensaje 3 siguen igual: apagadas por defecto.)
2. Coinciden por palabra completa del comercio, gana la más específica («UBER EATS» → Uber Eats antes que «Uber») y las de Diego ganan a las del catálogo.
3. Comercio sin regla → rubro **Por clasificar** y se agrega a la lista «por clasificar» para que Diego lo tipifique.
4. `category_suggested` que no es categoría ni sinónimo conocido, en un comercio desconocido → se agrega al catálogo como **concepto por clasificar** (nunca se inventa un rubro ni un monto).
5. Si Diego confirma con otro rubro, se guarda como regla de ese comercio para los siguientes movimientos.

Ejemplo ficticio para probarlo: [`ejemplo-ingesta-rubros.json`](ejemplo-ingesta-rubros.json) (dos depósitos de nómina, uno con diferencia; Spotify; Uber Eats; un comercio nuevo).

## Dónde se guarda

- Con Firebase: `users/{uid}/inbox` (pendientes y decididos), `users/{uid}/imports` (historial), `users/{uid}/accounts`, `users/{uid}/transfers`, `users/{uid}/merchantRules`, `users/{uid}/habits`, y desde el Mensaje 4 `users/{uid}/rubros`, `users/{uid}/merchantRubros`, `users/{uid}/recurrings` y `users/{uid}/meta` (marca del alta inicial). Mismas reglas de Firestore del MVP: solo el usuario autorizado.
- En modo demo: en el navegador (localStorage), nada sale del equipo.

## Ejemplo

[`ejemplo-ingesta.json`](ejemplo-ingesta.json) trae 6 casos **ficticios** (todos marcados «EJEMPLO»): compra de Amazon, pago de Mercado Pago, transferencia enviada, retiro de efectivo, suscripción de Netflix y un reembolso. En la demo, la cuenta «Nómina (ejemplo)» termina en `0193`, igual que el `account_hint` del ejemplo, para que el emparejamiento de cuenta se vea funcionando.
