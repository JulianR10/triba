# Inventario de scripts

Los comandos mantienen sus rutas actuales para no romper runbooks ni automatizaciones. Esta clasificación es documental: no se movió ni borró ningún script.

## Operación mantenida

Usar con las credenciales y las guardas indicadas en el encabezado de cada archivo.

| Script | Uso y precauciones |
|---|---|
| `prelaunch-check.mjs` | Validación local de configuración; solo lectura. |
| `smoke-prod.mjs` | Smoke test público después de cada deploy. |
| `cleanup-orphan-storage.mjs` | Barrido de Storage; dry-run por defecto, borrar solo tras revisar con `--real`. |
| `cleanup-mp-pending.mjs` | Revisión/cancelación de preaprobaciones abandonadas; dry-run por defecto, cancelar con `--real`. |
| `purge-mail-club-retention.mjs` | Retención postal; conserva dirección activa vigente y `past_due` recuperable; dry-run por defecto, purgar con `--real`. |
| `update-mp-mailclub-price.mjs` | Ajuste trimestral de precios MP; dry-run por defecto. `--real` requiere aviso previo de 30 días. |
| `send-mailclub-preview.mjs` | Previsualización de plantilla con `--dry`; sin esa opción envía un correo real. |
| `resync-newsletters.mjs` | Reintento de sincronización de contactos históricos pendientes; usar solo mientras se conserva la lista de retiro. |

## Operaciones manuales sensibles

No son tareas periódicas. Confirmar entorno, cuenta y destinatario antes de ejecutarlas.

| Script | Precaución |
|---|---|
| `create-test-subscriber.mjs` | Crea o modifica cuentas/suscripciones fixture en Supabase; puede resetear contraseña. |
| `fix-admin.mjs` | Cambia contraseña y/o permisos de una cuenta. |
| `resend-welcome.mjs` | Modifica un contacto en Sender para re-disparar una automatización; verificar el email y usar `--dry` primero. |
| `export-newsletters.mjs` | Exportación de solo lectura prevista para el cierre de la lista histórica; el CSV contiene emails. Proteger y borrar el archivo según el proceso de lanzamiento. |

## Migraciones y tareas históricas

No forman parte de la operación regular. Antes de cualquier uso, confirmar que la tarea siga pendiente, leer el script completo y ejecutar primero su modo de prueba cuando exista.

| Script | Estado |
|---|---|
| `import-wp-subscribers.mjs` | Importación WooCommerce puntual. |
| `import-migrated-mp.mjs` | Importación puntual de preaprobaciones MP antiguas. |
| `reconcile-mp-subscribers.mjs` | Reparación histórica; el cron diario y la reconciliación admin cubren hoy el flujo vigente. |
| `recreate-migrated-billing.mjs` | Recreación de billing para suscriptoras migradas; operación financiera de una sola vez, no re-ejecutar sin auditoría. |
| `load-en-editions.mjs` | Carga puntual de traducciones EN. |
| `import-pdfs.mjs` | **Deprecado: no usar.** Escribe contra el esquema antiguo de ediciones. |

## Empaquetado y retirados

| Script | Estado |
|---|---|
| `zip-app.mjs`, `zip-project.ps1`, `add-to-zip.mjs` | Utilidades locales de empaquetado. |
| `deploy-ftp.mjs` | **Retirado: no usar.** El despliegue vigente es Vercel; conserva configuración FTP legacy. |
