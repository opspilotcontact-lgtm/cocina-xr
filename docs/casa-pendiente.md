# Vivienda: pendiente y riesgos

## Pendiente
- Motor de baño: el enganche está en `js/casa/contenido.js` (`registrarContenido`). Al fusionar `js/bano.js`, hay que añadir en `app.js` el import y la línea `registrarContenido('bano', …)` que viene documentada en ese archivo. No se carga solo para no dar 404 en consola mientras el archivo no exista.
- Paseo (WASD) sin colisiones: solo se limita a la caja de la vivienda y atraviesa tabiques.
- Plano en móvil: se puede ver, seleccionar y arrastrar con el dedo, pero no hay zoom ni desplazamiento (siempre encuadra la vivienda entera).
- El plano no permite añadir ni quitar vértices (las estancias en L se crean desde plantilla o desde JSON).
- Los encuentros oblicuos entre tabiques (no a 90°) cierran de forma aproximada.
- Las puertas no avisan si quedan tapadas por muebles de cocina.
- Solo hay un sol y una luz de cielo (la de la ventana de la cocina activa); el resto de ventanas reciben el mismo sol a través de sus huecos.
- Con varias cocinas, solo la activa tiene picks, LED y selección de módulos; las otras se ven pero no se editan hasta activarlas.

## Riesgos
- El marco del mundo es el de la cocina activa (pared A en z = 0). XR y `app.dims` dependen de ello; si se cambia, hay que revisar `js/xr.js`.
- Los huecos se anclan a (estancia, borde, posición). Si se borra la estancia que guarda una puerta compartida, la puerta se va con ella.
- Al mover vértices los huecos conservan su posición absoluta y se recortan dentro del borde; si un tabique se acorta mucho, la revisión lo marca como error.
