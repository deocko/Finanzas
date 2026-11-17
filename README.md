# Finanzas personales

App web personal para controlar ingresos, gastos, tarjetas, vencimientos, despensa (con foto del ticket), aguinaldo, prima vacacional, criptomonedas y fondos de inversión. En español y en pesos mexicanos (MXN).

**Stack:** React 19 + Vite + TypeScript estricto + Tailwind CSS 4 · Firebase (Authentication, Firestore, Storage) · GitHub Pages.

> Mientras Firebase no esté configurado, la app funciona en **modo demo** con datos de ejemplo guardados solo en el navegador. Ningún dato de la demo es real.

## Qué incluye (Fase 1, MVP)

| Sección | Qué hace |
|---|---|
| **Inicio** | Balance del mes (ingresos − gastos), gasto por categoría, próximos vencimientos con días restantes, saldos de tarjetas y aviso de pagos urgentes. |
| **Movimientos** | Ingresos y gastos por mes, filtro por categoría, exportar a CSV. |
| **Ingresos** | Sueldo, aguinaldo (días configurables, mínimo legal 15, proporcional por días trabajados), prima vacacional (25 % mínimo, días según LFT por antigüedad), otros. |
| **Gastos** | Gas, luz, agua, telefonía, colegiaturas, despensa, mantenimiento, transporte, salud, ocio, otros. Fecha, concepto, monto, categoría, método de pago, tarjeta y foto del ticket. Se registra con 2 toques: monto → categoría → Guardar. |
| **Tarjetas** | Crédito y débito con diseño de tarjeta física. Solo últimos 4 dígitos. Corte, fecha límite, pago mínimo, pago sin intereses, uso del crédito. |
| **Vencimientos** | Tarjetas y pagos (mensuales o únicos) ordenados por fecha, semáforo (rojo ≤ 3 días o vencido, amarillo 4–7, verde > 7) y «Marcar pagado». |
| **Despensa** | Compras con tienda, total y foto del ticket. |
| **Inversiones** | Cripto con precio en vivo (CoinGecko, gratis) y ganancia/pérdida. Fondos con captura manual del valor. |
| **Reportes** | Ingresos vs gastos por mes, evolución del balance acumulado, gasto por categoría, tabla mensual, CSV. |
| **Ajustes** | Sueldo y prestaciones, hábitos y salud financiera (50/30/20, fondo de emergencia, regla de 24 h, presupuestos, reglas por comercio), respaldo completo en JSON y CSV, cerrar sesión. |
| **Importar** | Pega o carga el JSON que Byte genera desde Gmail y Outlook. Valida, deduplica por `id` y deja cada gasto pendiente: confirmar uno o varios, editar categoría/monto/cuenta o descartar. Historial de importaciones. Formato: [`docs/ingesta-correo.md`](docs/ingesta-correo.md). |
| **Cuentas** | Banco, efectivo, Mercado Pago, etc. con saldo inicial; el saldo se lleva solo con los movimientos confirmados. Gastos «por asignar» y movimientos entre cuentas (aportes al fondo). |
| **Salud financiera** | Resumen semanal con 1 a 3 recomendaciones, alertas (presupuesto 80 % / excedido, cargo inusual, renovación de suscripción, posible duplicado, saldo bajo, fondo de emergencia), regla 50/30/20 real vs meta, progreso del fondo y auditoría de suscripciones. Solo avisa: nunca mueve dinero ni confirma nada. |

Dinero en **centavos enteros** (nunca flotantes). Cálculos probados en `src/lib/*.test.ts`.

## Desarrollo local

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas de cálculos
npm run typecheck
npm run build
```

## Configurar Firebase (paso a paso)

Todo esto es **gratis** en el plan Spark, salvo Firebase Storage (ver el paso 6).

1. **Crea el proyecto.** Entra a <https://console.firebase.google.com> → *Agregar proyecto* → nombre, p. ej. `finanzas-personales` → puedes desactivar Google Analytics → *Crear*.
2. **Registra la app web.** En la página del proyecto pulsa el icono `</>` (Web) → apodo `finanzas` → *Registrar app* (no marques Hosting). Copia el objeto `firebaseConfig` que aparece.
3. **Pega tus llaves.** En la carpeta del proyecto:
   ```bash
   cp .env.example .env
   ```
   y llena cada `VITE_FIREBASE_*` con los valores de `firebaseConfig`. `.env` está en `.gitignore`: nunca se sube.
4. **Activa el inicio de sesión con Google.** *Compilación → Authentication → Comenzar → Sign-in method → Google → Habilitar* → elige tu correo de soporte → *Guardar*.
   Luego en *Authentication → Configuración → Dominios autorizados* agrega `deocko.github.io` (y deja `localhost`).
5. **Crea Firestore y sus reglas.** *Compilación → Firestore Database → Crear base de datos* → ubicación `nam5` o la más cercana → *modo de producción*. En la pestaña *Reglas* pega el contenido de [`firestore.rules`](firestore.rules), **cambia `TU_CORREO@gmail.com` por tu correo** y pulsa *Publicar*. Con esto nadie más puede leer ni escribir nada, aunque inicie sesión con Google.
6. **Fotos de tickets.** Por defecto (`VITE_TICKETS_BACKEND=firestore`) la foto se comprime y se guarda en Firestore: **gratis**, sin configurar nada más.
   Si prefieres Firebase Storage: desde octubre de 2024 Storage requiere el **plan Blaze** (pago por uso, con tarjeta; tiene capa gratuita de 5 GB en buckets de EE. UU.). Si lo activas: *Compilación → Storage → Comenzar*, pega [`storage.rules`](storage.rules) con tu correo, *Publicar*, y pon `VITE_TICKETS_BACKEND=storage`.
7. **Prueba local.** `npm run dev` → *Entrar con Google* con tu cuenta. Si entras con otra cuenta verás «no tiene acceso».
8. **Conecta la demo pública.** En GitHub: *Settings → Secrets and variables → Actions → New repository secret*, crea un secreto por cada `VITE_FIREBASE_*` con el mismo valor de tu `.env`. (Opcional: en la pestaña *Variables* crea `VITE_TICKETS_BACKEND=storage` si usas Storage.) Haz un push o *Actions → Desplegar en GitHub Pages → Run workflow*.

> La configuración web de Firebase (apiKey, etc.) no es una contraseña: viaja en el JavaScript público de cualquier app web de Firebase. Lo que protege tus datos son las **reglas** de los pasos 5 y 6. Tu correo solo vive en las reglas dentro de la consola de Firebase, no en el código.

## Subir a GitHub y publicar en GitHub Pages

El repo propuesto es `deocko/finanzas` (público, para que GitHub Pages sea gratis).

```bash
# 1. Crea el repo vacío (sin README) en https://github.com/new  →  nombre: finanzas, Public
#    o con la CLI de GitHub:
gh repo create deocko/finanzas --public --source=. --remote=origin

# 2. Si lo creaste en la web:
git remote add origin https://github.com/deocko/finanzas.git

# 3. Sube la rama principal
git push -u origin main
```

Después, en el repo: *Settings → Pages → Build and deployment → Source: **GitHub Actions***. El workflow `.github/workflows/deploy.yml` corre typecheck, pruebas y build en cada push a `main` y publica en:

**https://deocko.github.io/finanzas/**

Sin secretos de Firebase la página publica la demo con datos de ejemplo; con secretos pide iniciar sesión (y ofrece «Ver demo»).

## Seguridad

- Un solo usuario: Google Sign-In + reglas que exigen tu UID **y** tu correo verificado.
- Tarjetas: solo últimos 4 dígitos. Si se pega el número completo, el campo descarta todo menos los últimos 4 antes de guardarlo. Nunca CVV ni NIP.
- Secretos fuera del código (`.env` / secretos de GitHub).
- Respaldo: *Ajustes → Respaldo completo (JSON)* y CSV.
- CSV protegido contra inyección de fórmulas al abrirse en Excel.

## Fase 2 (pendiente)

- OCR del ticket (Tesseract.js en el navegador) para prellenar el total.
- Recordatorios push o por correo antes de cada vencimiento.
- PWA completa con captura sin conexión (hoy ya es instalable y Firestore guarda caché local).
