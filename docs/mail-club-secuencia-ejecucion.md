# Triba Mail Club — secuencia de ejecución

**Rama de trabajo:** `mail-club` (`Proyectos web\triba-mail-club`).
**Fuente de verdad funcional:** `mailClub.md`.
**Regla de publicación:** trabajar solo en `mail-club`; sin push, merge ni deploy hasta el día de salida. `main` y la web publicada permanecen sin cambios.
**Regla de suscriptoras:** no migrar ni convertir automáticamente cuentas actuales. Cada suscriptora decide si inicia el upgrade desde su perfil.
**Origen de envíos:** Madrid, España. Dato 100% definido; la cotización postal queda como condición de lanzamiento, sin frenar el desarrollo.

## Fase 0 — Proteger el sitio actual y ordenar la base

- Trabajar solo en `Proyectos web\triba-mail-club`, rama local `mail-club`.
- Mantener `main` y producción intactos hasta el lanzamiento.
- Usar `mailClub.md` como especificación vigente.
- Corregir las notas preliminares que contradigan la decisión sobre el newsletter gratuito antes de usarlas como checklist.

**Salida:** documentos y rama con una sola especificación; suscripciones actuales sin cambios.

## Fase 1 — Confirmar costos y condiciones reales del envío

Antes de fijar precios en el checkout:

- Armar un sobre prototipo con el contenido real y registrar peso, tamaño y grosor.
- Pedir a Correos tarifas para Europa, EE. UU., Argentina y resto del mundo; confirmar cobertura y requisitos del contenido comercial.
- Calcular el costo total por envío: franqueo, impresión, materiales, embalaje, comisiones de cobro, reposición y preparación.
- Definir declaración de contenido para aduanas y los destinos no admitidos, si los hubiera.

Referencias: Correos admite carta ordinaria de hasta 2 kg, pero su modalidad normalizada económica tiene límites menores de peso y grosor; además, sus zonas postales no coinciden exactamente con las zonas comerciales EUR/USD de Triba.
[Correo ordinario](https://www.correos.es/es/es/empresas/enviar/comunicaciones-postales-para-empresas/cartas/carta-ordinaria) ·
[Zonas internacionales](https://www.correos.es/es/es/empresas/enviar/envios-internacionales/zonas-internacionales)

- Si la tarifa real no cierra con el precio previsto, ajustar costos, precio o contenido antes de publicar.

**Salida:** precio y promesa de envío respaldados por un envío físico medido y cotizado.

## Fase 2 — Cimientos de datos sin migrar suscriptoras

- Añadir tipo de plan `digital` / `mail_club`; las suscripciones actuales quedan como `digital`, sin cambiar precio, proveedor, fechas, cuenta ni acceso.
- Crear almacenamiento postal separado y protegido para direcciones.
- Registrar aceptación de condiciones, upgrades, pagos pendientes/aprobados/fallidos, número de fundadora y lotes de despacho.
- Guardar snapshots de direcciones para que una edición posterior no cambie las etiquetas del mes ya cerrado.
- Definir permisos y retención: dirección mientras la suscripción está activa y datos de cada envío durante los 60 días acordados.
- Actualizar `src/lib/database.types.ts` junto con cada migración secuencial e idempotente.

**Salida:** migración aditiva e idempotente; el acceso digital vigente se conserva.

## Fase 3 — Altas nuevas del Mail Club

- Crear formulario bilingüe ES/EN con país, dirección postal y aceptación de condiciones.
- Resolver siempre en servidor: Argentina → ARS/Mercado Pago; países europeos acordados → EUR/Stripe; resto → USD/Stripe.
- Crear checkout y activar Mail Club solo tras confirmar el primer pago.
- Dirección inválida: conservar lo ingresado y explicar qué corregir; no crear suscripciones con moneda incorrecta.
- Pago pendiente, rechazado, abandonado, SCA, timeout o webhook repetido/tardío: mostrar estado recuperable y permitir retomarlo sin duplicar cobros.
- Enviar bienvenida con dirección y mes del primer sobre; si falla el email, conservar la suscripción y dejar el reintento en administración.
- Conservar acceso digital: revista, archivo histórico y descarga PDF.

**Salida:** alta correcta más recorridos de error probados y recuperables.

## Fase 4 — Gestión desde Mi Cuenta

- Mantener a todas las suscriptoras actuales en digital hasta que ellas mismas elijan “Pasarme al Mail Club”.
- Upgrade voluntario: completar/confirmar dirección, aceptar condiciones y pagar la diferencia del mes.
- Conservar proveedor, moneda y fecha de renovación existentes; no rehacer la suscripción.
- Actualizar la renovación al precio Mail Club solo después de confirmar el pago diferencial.
- Si se aprueba el diferencial pero falla la actualización futura, mostrar pago recibido y actualización pendiente; reintentar sin volver a cobrar.
- Permitir cambiar dirección hasta el corte del 15 inclusive, hora `Europe/Madrid`.
- Aplicar vuelta a digital o cancelación al final del período pagado, preservando el acceso hasta entonces.
- Pago fallido o pendiente: no completa upgrade, no asigna fundadora y no entra al lote.

**Salida:** sin upgrades automáticos, dobles cobros ni pérdida de acceso pagado.

## Fase 5 — Operación mensual en administración

- Al corte del 15 inclusive, hora `Europe/Madrid`, crear una lista única de suscripciones activas y pagas, con direcciones congeladas.
- Exportar CSV/Excel con destinataria, dirección completa, email, zona/moneda, fecha de alta Mail Club, estado y número de fundadora.
- Proteger el archivo contra fórmulas de Excel introducidas en datos postales; validar acentos, comas, comillas y saltos de línea.
- Exportación fallida o dato incompleto: mostrar qué corregir y reintentar sin duplicar destinatarias.
- Registrar manualmente el despacho del día 20; enviar aviso solo al marcarlo como enviado. Reintentar emails fallidos sin duplicar avisos.
- Cambios posteriores al corte quedan para el mes siguiente.

**Salida:** repetir lote, export o aviso no duplica etiquetas ni notificaciones.

## Fase 6 — Contenido, legal y retiro del newsletter

- Publicar página Mail Club, tarjeta, FAQ, condiciones, privacidad y emails en ES/EN.
- Eliminar newsletter como producto y como beneficio: formularios, altas, automatizaciones y menciones públicas, sin afectar emails transaccionales.
- Antes del retiro, exportar la lista actual completa de Supabase y contrastarla con Sender; validar archivo y conteo.
- Tras validar la exportación, borrar solo registros/contactos del newsletter gratuito. Si una persona también pertenece al grupo pago, conservar contacto y pertenencia paga.
- Recibir fotos y obtener aprobación legal de condiciones y privacidad antes de publicar.

**Salida:** lista gratuita respaldada y retirada sin afectar a suscriptoras pagas.

## Fase 7 — Pruebas y decisión de lanzamiento

- Cubrir EUR, USD y ARS: alta, upgrade, rechazo, pendiente, SCA, abandono, timeout, webhook repetido/tardío, renovación fallida, cambio de dirección, corte, export, despacho y reenvío.
- Probar zonas/precios, corte horario, asignación única de fundadoras e integridad del CSV; ejecutar `astro check` y build.
- Validar pagos en modo prueba y, antes de abrir al público, verificar cobros reales EUR/USD/ARS y liquidación esperada.
- El día de lanzamiento: exportar y verificar primero el newsletter; luego publicar y retirar sus altas. Mantener el checkout Mail Club cerrado hasta superar controles de pago y envío.

**Go/no-go:** si falla un cobro, la cobertura postal, la exportación o un flujo crítico, no anunciar ni abrir el checkout. La web existente sigue funcionando mientras se corrige.
