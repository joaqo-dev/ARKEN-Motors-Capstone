// Modo demo: el panel se sirve como archivos estáticos (sin reescrituras del
// servidor), así que el router usa el hash de la URL (/demos/vitriauto/#/vehiculos).
export * from 'react-router-dom';
export { createHashRouter as createBrowserRouter } from 'react-router-dom';
