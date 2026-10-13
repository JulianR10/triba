# TRIBA

Revista digital mensual por y para mujeres. Sitio Astro SSR con suscripciones digitales y Mail Club postal.

## Desarrollo local

```bash
npm ci
cp .env.example .env   # completar localmente; no compartir secretos
npm run dev
```

## Validación

```bash
npm run check
npm test
npm run build
```

## Documentación

- [`AGENTS.md`](./AGENTS.md): convenciones e invariantes para cambios de código.
- [`mailClub.md`](./mailClub.md): operación y pendientes vigentes de pagos y Mail Club.
- [`docs/flujo-funcional.md`](./docs/flujo-funcional.md): mapa funcional temporal, se retirará al cerrar el backlog de mejoras.

## Producción

Push a `main` despliega en Vercel. Aplicar primero las migraciones SQL requeridas y seguir el checklist de `mailClub.md`. Después del deploy, ejecutar `node scripts/smoke-prod.mjs`.
