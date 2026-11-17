// Prueba de humo contra el sitio publicado (o cualquier URL).
// Uso: node scripts/smoke.mjs https://deocko.github.io/finanzas/
// Recorre la app en modo demo en 390 px y escritorio, claro y oscuro,
// revisa errores de consola y que el balance del mes cuadre con los datos guardados.
import { chromium } from 'playwright';

const BASE = process.argv[2];
if (!BASE) throw new Error('Falta la URL');
const ROUTES = ['', 'movimientos', 'movimientos?tab=ingresos', 'tarjetas', 'vencimientos', 'despensa', 'inversiones', 'reportes', 'ajustes', 'mas', 'importar', 'cuentas', 'recurrentes', 'rubros'];
const problems = [];

const browser = await chromium.launch();
for (const [vpName, viewport] of [['390px', { width: 390, height: 844 }], ['escritorio', { width: 1366, height: 900 }]]) {
  for (const theme of ['light', 'dark']) {
    const tag = `${vpName}/${theme === 'light' ? 'claro' : 'oscuro'}`;
    const ctx = await browser.newContext({ viewport, colorScheme: theme, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${tag} error JS: ${e.message}`));
    page.on('console', (m) => {
      // CoinGecko puede limitar consultas (429); no es un error de la app.
      if (m.type() === 'error' && !/coingecko/i.test(m.text() + (m.location()?.url ?? ''))) problems.push(`${tag} consola: ${m.text()}`);
    });
    page.on('dialog', (d) => d.accept());
    const res = await page.goto(BASE);
    if (!res || res.status() !== 200) problems.push(`${tag} HTTP ${res?.status()}`);
    // Con Firebase configurado aparece el inicio de sesión: entramos a la demo.
    const demoBtn = page.getByRole('button', { name: 'Ver demo con datos de ejemplo' });
    await Promise.race([page.waitForSelector('text=Tu mes en un vistazo'), demoBtn.waitFor()]).catch(() => {});
    if (await demoBtn.isVisible().catch(() => false)) await demoBtn.click();
    await page.waitForSelector('text=Tu mes en un vistazo', { timeout: 20000 });

    for (const r of ROUTES) {
      await page.goto(`${BASE}#/${r}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(300);
      const h1 = await page.locator('h1').first().innerText().catch(() => '');
      if (!h1) problems.push(`${tag} #/${r}: no se ve el título`);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (ov > 0) problems.push(`${tag} #/${r}: desborde horizontal ${ov}px`);
    }

    // Registrar un ingreso (aguinaldo 30 días con $500 diarios = $15,000.00)
    await page.goto(BASE + '#/');
    await page.getByRole('button', { name: /Ingreso/ }).first().click();
    await page.getByRole('button', { name: 'Aguinaldo' }).click();
    await page.getByLabel('Salario diario', { exact: true }).fill('500');
    await page.getByLabel('Días de aguinaldo', { exact: true }).fill('30');
    const ag = await page.locator('text=Aguinaldo calculado').locator('..').innerText();
    if (!ag.includes('$15,000.00')) problems.push(`${tag} aguinaldo: ${ag}`);
    await page.getByRole('button', { name: 'Guardar ingreso' }).click();
    await page.waitForSelector('text=Ingreso registrado');

    // Balance del mes = suma de lo guardado
    await page.goto(BASE + '#/');
    await page.waitForSelector('#bal');
    const { inc, exp } = await page.evaluate(() => {
      const d = new Date();
      const per = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const sum = (k) => JSON.parse(localStorage.getItem(k) ?? '[]').filter((x) => x.date.startsWith(per)).reduce((a, x) => a + x.amount, 0);
      return { inc: sum('finanzas-demo:incomes'), exp: sum('finanzas-demo:expenses') };
    });
    const fmt = (c) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(c / 100);
    const hero = await page.locator('#bal').locator('..').innerText();
    for (const v of [fmt(inc - exp), fmt(inc), fmt(exp)]) if (!hero.includes(v)) problems.push(`${tag} balance ${v} no aparece`);
    console.log(`✓ ${tag}: ${ROUTES.length} secciones, balance ${fmt(inc - exp)}`);
    await ctx.close();
  }
}
await browser.close();
if (problems.length) {
  console.log('PROBLEMAS:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('SIN PROBLEMAS');
