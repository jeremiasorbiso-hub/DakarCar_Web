# Sistema de Gestión para Taller de Chapería y Pintura

Un sistema completo para gestionar vehículos, clientes y seguimientos de seguros en un taller de reparaciones.

## 🚀 Características

- **Dashboard** con estadísticas en tiempo real
- Gestión completa de **clientes** y **vehículos**
- Sistema de **novedades** y alertas
- Seguimiento de **seguros** con recordatorios automáticos
- Gestión de **entregas** de vehículos terminados
- Interfaz moderna y responsiva

## 🛠️ Tecnologías

- **Backend**: Node.js + Express
- **Base de datos**: SQLite con better-sqlite3
- **Frontend**: Vanilla JavaScript + CSS
- **UI**: Diseño oscuro, íconos de Tabler

## 📦 Instalación

1. Clona el repositorio
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor:
   ```bash
   npm start
   ```
4. Abre http://localhost:3000

## 🧪 Desarrollo

```bash
# Modo desarrollo con recarga automática
npm run dev

# Ejecutar tests
npm test

# Linting
npm run lint

# Formateo de código
npm run format
```

## 🔧 Mejoras Implementadas

### Seguridad

- ✅ Variables de entorno (.env)
- ✅ Validación de entrada con express-validator
- ⚠️ Pendiente: Autenticación de usuarios

### Calidad de Código

- ✅ ESLint para linting
- ✅ Prettier para formateo
- ✅ Tests básicos con Jest
- ✅ Separación de app para testing

### Rendimiento

- ⚠️ Pendiente: Paginación para listas grandes
- ⚠️ Pendiente: Caché de consultas

## 🚀 Mejoras Futuras Recomendadas

### Funcionalidades

- [ ] Sistema de autenticación y usuarios
- [ ] Subida de fotos de vehículos
- [ ] Notificaciones por email
- [ ] Exportación a PDF/Excel
- [ ] API para integración con otros sistemas
- [ ] Backup automático de base de datos

### Técnico

- [ ] Migrar a PostgreSQL para multi-usuario
- [ ] Docker para despliegue
- [ ] Logs estructurados
- [ ] Monitoreo y métricas
- [ ] API versioning
- [ ] Rate limiting

### UI/UX

- [ ] Tema claro/oscuro configurable
- [ ] Notificaciones push en navegador
- [ ] Búsqueda avanzada con filtros
- [ ] Dashboard personalizable

## 📊 Base de Datos

### Tablas

- `clientes`: Información de clientes
- `vehiculos`: Datos de vehículos y estado
- `novedades`: Historial de actualizaciones y alertas

### Estados de Vehículos

- `ingresado`: Recién recibido
- `en_proceso`: En reparación
- `esperando_seguro`: Pendiente aprobación
- `aprobado`: Aprobado por seguro
- `listo`: Listo para entregar
- `entregado`: Entregado al cliente

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
