# Verificación de flujos de pago — Mail Club

Plan de validación previo a producción. Los checks comienzan pendientes; no representan pruebas ya ejecutadas.

## 1. Validar los recorridos de cobro

### Stripe — EUR y USD

- [ ] Crear/verificar precios recurrentes de Mail Club separados de los precios digitales actuales.
- [ ] Alta nueva EUR: dirección de envío europea, moneda EUR, checkout Stripe, primer cobro confirmado y suscripción Mail Club activa.
- [ ] Alta nueva USD: dirección de envío fuera de Europa y Argentina, moneda USD, checkout Stripe y activación confirmada.
- [ ] Upgrade digital→Mail Club: cobrar una sola vez la diferencia exacta con el medio guardado; tras confirmación, cambiar el precio recurrente sin prorrateo y conservar la fecha de renovación.
- [ ] Verificar rechazo, timeout y autenticación adicional de tarjeta. Si el cobro único requiere acción de la clienta, el plan y el número de fundadora no deben actualizarse antes de completar el pago.
- [ ] Verificar la moneda de cargo y la liquidación EUR/USD en la cuenta Stripe de Triba.

### Mercado Pago — ARS

- [ ] Alta nueva ARS: dirección de envío en Argentina, checkout de suscripción, primer pago aprobado y activación confirmada.
- [ ] Upgrade digital→Mail Club: crear pago único por ARS 9.000 con referencia propia e idempotente.
- [ ] Confirmar que solo el webhook de pago aprobado actualiza la suscripción recurrente a ARS 16.000.
- [ ] Verificar el importe efectivo y la fecha del siguiente cobro tras modificar `auto_recurring.transaction_amount`.
- [ ] Probar pago pendiente, rechazado, abandonado, webhook repetido y webhook recibido fuera de orden.
- [ ] Comprobar qué notificación envía Mercado Pago al cambiar el importe; enviar el aviso propio independientemente de esa respuesta.

## 2. Fijar y verificar el modelo de datos y estados

- [ ] La migración marca las suscripciones existentes como digitales y no altera proveedor, moneda, período ni acceso.
- [ ] La dirección postal vive en una tabla protegida; la usuaria solo puede leer/editar la propia y administración accede mediante permisos autorizados.
- [ ] El consentimiento de condiciones guarda fecha y versión tanto en alta nueva como en upgrade.
- [ ] Un checkout pendiente, cancelado o rechazado no activa Mail Club ni asigna número de fundadora.
- [ ] El primer pago Mail Club confirmado —incluido un upgrade— asigna un número único y estable; repetir webhooks no crea otro.
- [ ] Los estados de upgrade dejan trazabilidad de pago pendiente, pago aprobado, cambio recurrente aplicado y error recuperable.
- [ ] La dirección y sus snapshots no aparecen en consultas generales de perfil ni en APIs públicas.

## 3. Verificar corte, período pagado y operación postal

- [ ] Aplicar `Europe/Madrid` para el corte del día 15 inclusive (hasta 23:59:59) y el despacho del día 20.
- [ ] Alta/upgrade confirmada hasta el día 15 inclusive: incluir en el envío del mes en curso.
- [ ] Alta/upgrade confirmada después del día 15: primer envío el mes siguiente.
- [ ] Suscripción activa con período efectivamente pagado y vigente al corte: incluir; suscripción vencida o pago fallido: excluir.
- [ ] Cambio de dirección antes del corte: snapshot del mes usa dirección nueva; después del corte: no modifica las etiquetas ya preparadas y rige para el siguiente mes.
- [ ] Crear el lote mensual una sola vez; volver a abrirlo o repetir la solicitud no duplica destinatarias.
- [ ] El CSV incluye destinataria, país, provincia/estado, ciudad, código postal, dirección/complemento, email, moneda/zona, fecha de alta Mail Club, estado y número de fundadora.
- [ ] Verificar acentos, comas, comillas, saltos de línea y valores que comiencen con `=`, `+`, `-` o `@` para que Excel no los ejecute como fórmulas.
- [ ] Enviar el email de bienvenida con la dirección y el mes del primer sobre; enviar aviso de salida solo cuando administración registre el despacho.
- [ ] Retener la dirección postal hasta dos meses después del último despacho aplicable y comprobar su eliminación posterior según la política aprobada.

## 4. Implementar y validar por capas

1. [ ] País ISO → zona/precio/proveedor en servidor; probar que el frontend no puede forzar otra moneda.
2. [ ] Alta Mail Club y webhooks de activación para Stripe EUR/USD y Mercado Pago ARS.
3. [ ] Upgrade, cambio de dirección, vuelta a digital y cancelación al fin del período pagado.
4. [ ] Lote postal, snapshot de direcciones, exportación y aviso de despacho.
5. [ ] Página Mail Club, tarjeta de Suscribirme, FAQ, versión ES/EN desde el lanzamiento y términos/privacidad. No incluir newsletter como producto ni beneficio.
6. [ ] Exportar y verificar la lista del newsletter antes de la presentación; retirar formularios y nuevas altas, y borrar únicamente los contactos/registros del newsletter gratuito después de confirmar el export.

## Checklist punta a punta

### Altas, monedas y zonas

- [ ] Alta EUR con país europeo; precio, proveedor y cargo EUR correctos.
- [ ] Alta USD con país fuera de Europa y distinto de Argentina; precio, proveedor y cargo USD correctos.
- [ ] Alta ARS con dirección argentina; precio y checkout Mercado Pago correctos.
- [ ] En cada plan, intentar enviar desde navegador una moneda/proveedor incompatibles con el destino; el servidor rechaza el intento.
- [ ] Persona residente/IP/tarjeta de otra zona con dirección de envío válida: no cambiar la regla según IP ni país emisor de tarjeta.
- [ ] Suscriptora digital existente con moneda distinta de su dirección: conservar proveedor y moneda al hacer upgrade y cobrar la diferencia de esa moneda.
- [ ] Aplicar la excepción anterior solo a suscriptoras digitales existentes; nuevas altas Mail Club siguen la zona de destino postal.

### Upgrades, cambios y pagos fallidos

- [ ] Upgrade en cada proveedor cobra la diferencia una vez y aplica la tarifa recurrente solo tras pago aprobado.
- [ ] Repetir/reenviar webhooks no duplica cargos, cambios de plan, emails ni número de fundadora.
- [ ] Cancelar o volver al plan digital conserva acceso digital hasta el fin del período ya pagado y evita el siguiente cobro Mail Club.
- [ ] Rechazo, pago pendiente, checkout abandonado, pérdida de red o error de proveedor dejan estado recuperable y mensaje claro; no marcan el upgrade como completado.
- [ ] Suscripción con pago fallido no se incluye en el lote si no está pagada y vigente al corte.

### Corte y entrega

- [ ] Alta/upgrade antes y durante el día 15 inclusive: sobre del mes en curso, despacho el día 20.
- [ ] Alta/upgrade después del día 15: primer sobre del mes siguiente.
- [ ] Dirección modificada antes y después del corte produce los snapshots esperados.
- [ ] Ejecutar dos veces el export/lote del mismo mes no duplica etiquetas.
- [ ] El primer pago confirmado asigna el siguiente número; cubrir orden simultáneo de altas y upgrades para evitar números duplicados.
- [ ] Cambio trimestral ARS en modo de prueba identifica solo suscripciones Mail Club, no recrea preaprobaciones y registra errores parciales.

### Cuenta, emails, privacidad y retirada del newsletter

- [ ] La usuaria puede guardar y corregir todos los campos postales desde su perfil.
- [ ] La aceptación de condiciones se requiere y queda registrada en alta y upgrade.
- [ ] Email de bienvenida presenta el mes de salida y dirección correcta; email de despacho solo sale tras registrar el envío.
- [ ] CSV abre correctamente en Excel y no interpreta texto postal como fórmula.
- [ ] La exportación histórica del newsletter se completa antes del día de presentación y su número de registros se contrasta con la tabla.
- [ ] Los formularios/API públicos dejan de aceptar nuevas altas de newsletter en la fecha acordada; una vez exportados y verificados, se borran los contactos gratuitos de Supabase/Sender, sin afectar los datos/avisos de suscriptoras pagas.
- [ ] La página pública comunica el corte, despacho del día 20, envío gratuito, correo ordinario sin seguimiento y los plazos: España 3–7 días; resto de Europa 1–2 semanas; Argentina y resto del mundo 3–6 semanas.
- [ ] Términos y privacidad ES/EN reflejan moneda por destino, corte, dirección, retención de dos meses, reposiciones, aduanas y derecho de desistimiento; revisión legal aprobada.
- [ ] El acceso a revista, archivo histórico y descarga PDF se mantiene para Mail Club y para el plan digital.

## Prueba de lanzamiento

- [ ] Pasar primero los recorridos en modo de prueba y los webhooks con eventos repetidos.
- [ ] Hacer una transacción real de prueba en EUR, USD y ARS, confirmar activación y renovación/precio esperado, y dejar cada operación conciliada o reembolsada según el protocolo acordado.
- [ ] Guardar fecha, resultado, referencia del proveedor y persona que valida cada moneda; no copiar datos de tarjeta en este documento.
- [ ] No abrir el checkout público hasta completar todos los checks bloqueantes de pagos, zonas, consentimiento, snapshot postal y exportación del newsletter.
