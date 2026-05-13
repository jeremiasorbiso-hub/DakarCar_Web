require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de validación
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// ─── BASE DE DATOS ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'taller.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    dni TEXT,
    telefono TEXT NOT NULL,
    email TEXT,
    direccion TEXT,
    observaciones TEXT,
    creado_en TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS vehiculos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patente TEXT NOT NULL UNIQUE,
    modelo TEXT NOT NULL,
    nro_motor TEXT,
    nro_chasis TEXT,
    anio TEXT,
    color TEXT,
    km_ingreso INTEGER,
    cliente_id INTEGER REFERENCES clientes(id),
    aseguradora TEXT,
    nro_siniestro TEXT,
    estado TEXT DEFAULT 'ingresado',
    en_taller TEXT DEFAULT 'si',
    trabajo TEXT,
    observaciones TEXT,
    fecha_ingreso TEXT DEFAULT (date('now','localtime')),
    creado_en TEXT DEFAULT (datetime('now','localtime')),
    actualizado_en TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS novedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehiculo_id INTEGER REFERENCES vehiculos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    leida INTEGER DEFAULT 0,
    recordatorio_fecha TEXT,
    creado_en TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function diasDesde(fecha) {
  if (!fecha) return 0;
  const hoy = new Date();
  const f = new Date(fecha);
  return Math.floor((hoy - f) / (1000 * 60 * 60 * 24));
}

// ─── CLIENTES ────────────────────────────────────────────────────────────────
app.get('/api/clientes', (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT c.*, COUNT(v.id) as total_vehiculos
    FROM clientes c
    LEFT JOIN vehiculos v ON v.cliente_id = c.id
    GROUP BY c.id
    ORDER BY c.nombre
  `
    )
    .all();
  res.json(rows);
});

app.get('/api/clientes/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const vehiculos = db
    .prepare('SELECT * FROM vehiculos WHERE cliente_id = ? ORDER BY creado_en DESC')
    .all(req.params.id);
  res.json({ ...cliente, vehiculos });
});

app.post(
  '/api/clientes',
  [
    body('nombre').trim().isLength({ min: 1 }).withMessage('Nombre es obligatorio'),
    body('telefono').trim().isLength({ min: 1 }).withMessage('Teléfono es obligatorio'),
    body('email').optional().isEmail().withMessage('Email inválido'),
  ],
  handleValidationErrors,
  (req, res) => {
    const { nombre, dni, telefono, email, direccion, observaciones } = req.body;
    const result = db
      .prepare(
        `
    INSERT INTO clientes (nombre, dni, telefono, email, direccion, observaciones)
    VALUES (?, ?, ?, ?, ?, ?)
  `
      )
      .run(nombre, dni || null, telefono, email || null, direccion || null, observaciones || null);
    const nuevo = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(nuevo);
  }
);

app.put('/api/clientes/:id', (req, res) => {
  const { nombre, dni, telefono, email, direccion, observaciones } = req.body;
  db.prepare(
    `
    UPDATE clientes SET nombre=?, dni=?, telefono=?, email=?, direccion=?, observaciones=?
    WHERE id=?
  `
  ).run(
    nombre,
    dni || null,
    telefono,
    email || null,
    direccion || null,
    observaciones || null,
    req.params.id
  );
  const actualizado = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json(actualizado);
});

app.delete('/api/clientes/:id', (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── VEHÍCULOS ───────────────────────────────────────────────────────────────
app.get('/api/vehiculos', (req, res) => {
  const { estado, q } = req.query;
  let sql = `
    SELECT v.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono
    FROM vehiculos v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE 1=1
  `;
  const params = [];
  if (estado) {
    sql += ' AND v.estado = ?';
    params.push(estado);
  }
  if (q) {
    sql += ' AND (v.patente LIKE ? OR v.modelo LIKE ? OR c.nombre LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY v.creado_en DESC';
  const rows = db.prepare(sql).all(...params);
  const result = rows.map((v) => ({ ...v, dias: diasDesde(v.fecha_ingreso) }));
  res.json(result);
});

app.get('/api/vehiculos/:id', (req, res) => {
  const vehiculo = db
    .prepare(
      `
    SELECT v.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.email as cliente_email
    FROM vehiculos v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE v.id = ?
  `
    )
    .get(req.params.id);
  if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });
  const novedades = db
    .prepare('SELECT * FROM novedades WHERE vehiculo_id = ? ORDER BY creado_en DESC')
    .all(req.params.id);
  res.json({ ...vehiculo, dias: diasDesde(vehiculo.fecha_ingreso), novedades });
});

app.post('/api/vehiculos', (req, res) => {
  const {
    patente,
    modelo,
    nro_motor,
    nro_chasis,
    anio,
    color,
    km_ingreso,
    cliente_id,
    aseguradora,
    nro_siniestro,
    estado,
    en_taller,
    trabajo,
    observaciones,
  } = req.body;
  if (!patente || !modelo)
    return res.status(400).json({ error: 'Patente y modelo son obligatorios' });
  try {
    const result = db
      .prepare(
        `
      INSERT INTO vehiculos
        (patente, modelo, nro_motor, nro_chasis, anio, color, km_ingreso,
         cliente_id, aseguradora, nro_siniestro, estado, en_taller, trabajo, observaciones)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `
      )
      .run(
        patente.toUpperCase(),
        modelo,
        nro_motor || null,
        nro_chasis || null,
        anio || null,
        color || null,
        km_ingreso || null,
        cliente_id || null,
        aseguradora || null,
        nro_siniestro || null,
        estado || 'ingresado',
        en_taller || 'si',
        trabajo || null,
        observaciones || null
      );
    const nuevo = db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...nuevo, dias: 0 });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Ya existe un vehículo con esa patente' });
    throw e;
  }
});

app.put('/api/vehiculos/:id', (req, res) => {
  const {
    patente,
    modelo,
    nro_motor,
    nro_chasis,
    anio,
    color,
    km_ingreso,
    cliente_id,
    aseguradora,
    nro_siniestro,
    estado,
    en_taller,
    trabajo,
    observaciones,
  } = req.body;
  db.prepare(
    `
    UPDATE vehiculos SET
      patente=?, modelo=?, nro_motor=?, nro_chasis=?, anio=?, color=?, km_ingreso=?,
      cliente_id=?, aseguradora=?, nro_siniestro=?, estado=?, en_taller=?,
      trabajo=?, observaciones=?, actualizado_en=datetime('now','localtime')
    WHERE id=?
  `
  ).run(
    patente?.toUpperCase(),
    modelo,
    nro_motor || null,
    nro_chasis || null,
    anio || null,
    color || null,
    km_ingreso || null,
    cliente_id || null,
    aseguradora || null,
    nro_siniestro || null,
    estado,
    en_taller || 'si',
    trabajo || null,
    observaciones || null,
    req.params.id
  );
  const actualizado = db
    .prepare(
      `
    SELECT v.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono
    FROM vehiculos v LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE v.id = ?
  `
    )
    .get(req.params.id);
  res.json({ ...actualizado, dias: diasDesde(actualizado.fecha_ingreso) });
});

app.delete('/api/vehiculos/:id', (req, res) => {
  db.prepare('DELETE FROM vehiculos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── NOVEDADES ───────────────────────────────────────────────────────────────
app.get('/api/novedades', (req, res) => {
  const { tipo, leida } = req.query;
  let sql = `
    SELECT n.*, v.patente, v.modelo
    FROM novedades n
    LEFT JOIN vehiculos v ON v.id = n.vehiculo_id
    WHERE 1=1
  `;
  const params = [];
  if (tipo && tipo !== 'todos') {
    sql += ' AND n.tipo = ?';
    params.push(tipo);
  }
  if (leida !== undefined) {
    sql += ' AND n.leida = ?';
    params.push(leida === 'true' ? 1 : 0);
  }
  sql += ' ORDER BY n.creado_en DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post('/api/novedades', (req, res) => {
  const { vehiculo_id, tipo, titulo, descripcion, recordatorio_fecha } = req.body;
  if (!vehiculo_id || !descripcion)
    return res.status(400).json({ error: 'vehiculo_id y descripcion son obligatorios' });

  const result = db
    .prepare(
      `
    INSERT INTO novedades (vehiculo_id, tipo, titulo, descripcion, recordatorio_fecha)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(
      vehiculo_id,
      tipo || 'info',
      titulo || 'Nueva novedad',
      descripcion,
      recordatorio_fecha || null
    );

  // Si es seguimiento sin denuncia, crear recordatorio automático en 2 días hábiles
  if (tipo === 'seguimiento') {
    const hoy = new Date();
    let diasHabiles = 0;
    let fecha = new Date(hoy);
    while (diasHabiles < 2) {
      fecha.setDate(fecha.getDate() + 1);
      const dow = fecha.getDay();
      if (dow !== 0 && dow !== 6) diasHabiles++;
    }
    const fechaISO = fecha.toISOString().split('T')[0];
    const veh = db
      .prepare('SELECT patente, aseguradora FROM vehiculos WHERE id = ?')
      .get(vehiculo_id);
    db.prepare(
      `
      INSERT INTO novedades (vehiculo_id, tipo, titulo, descripcion, recordatorio_fecha)
      VALUES (?, 'alerta', ?, ?, ?)
    `
    ).run(
      vehiculo_id,
      `${veh?.patente || 'Vehículo'} — Reintentar con aseguradora`,
      `Recordatorio: reintentar contacto con ${veh?.aseguradora || 'la aseguradora'}. Sin denuncia registrada.`,
      fechaISO
    );
  }

  const nueva = db.prepare('SELECT * FROM novedades WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(nueva);
});

app.put('/api/novedades/:id/leer', (req, res) => {
  db.prepare('UPDATE novedades SET leida = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.put('/api/novedades/leer-todas', (req, res) => {
  db.prepare('UPDATE novedades SET leida = 1').run();
  res.json({ ok: true });
});

app.delete('/api/novedades/:id', (req, res) => {
  db.prepare('DELETE FROM novedades WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];
  const stats = {
    en_taller: db
      .prepare(
        "SELECT COUNT(*) as n FROM vehiculos WHERE en_taller='si' AND estado NOT IN ('entregado')"
      )
      .get().n,
    esperando_seguro: db
      .prepare("SELECT COUNT(*) as n FROM vehiculos WHERE estado='esperando_seguro'")
      .get().n,
    listos: db.prepare("SELECT COUNT(*) as n FROM vehiculos WHERE estado='listo'").get().n,
    alertas: db.prepare("SELECT COUNT(*) as n FROM novedades WHERE leida=0 AND tipo='alerta'").get()
      .n,
    no_leidas: db.prepare('SELECT COUNT(*) as n FROM novedades WHERE leida=0').get().n,
  };

  // Recordatorios que vencen hoy o vencidos
  const recordatorios = db
    .prepare(
      `
    SELECT n.*, v.patente, v.modelo, v.aseguradora
    FROM novedades n
    LEFT JOIN vehiculos v ON v.id = n.vehiculo_id
    WHERE n.recordatorio_fecha <= ? AND n.leida = 0
    ORDER BY n.recordatorio_fecha ASC
  `
    )
    .all(hoy);

  const alertas = db
    .prepare(
      `
    SELECT n.*, v.patente, v.modelo
    FROM novedades n
    LEFT JOIN vehiculos v ON v.id = n.vehiculo_id
    WHERE n.leida = 0 AND n.tipo IN ('alerta', 'seguimiento')
    ORDER BY n.creado_en DESC
    LIMIT 10
  `
    )
    .all();

  const recientes = db
    .prepare(
      `
    SELECT v.*, c.nombre as cliente_nombre
    FROM vehiculos v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    ORDER BY v.creado_en DESC LIMIT 8
  `
    )
    .all()
    .map((v) => ({ ...v, dias: diasDesde(v.fecha_ingreso) }));

  res.json({ stats, alertas: [...recordatorios, ...alertas].slice(0, 10), recientes });
});

// ─── INICIO ──────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n✅  Taller gestión corriendo en http://localhost:${PORT}\n`);
  });
}

module.exports = app;
