require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function diasDesde(fecha, estado = null) {
  if (!fecha) return 0;
  if (estado === 'entregado') return 0;
  const hoy = new Date();
  const f = new Date(fecha);
  return Math.floor((hoy - f) / (1000 * 60 * 60 * 24));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API CLIENTES ---
app.get('/api/clientes', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, vehiculos(id)')
    .order('nombre');
  if (error) return res.status(500).json({ error: error.message });
  const result = data.map(c => ({ ...c, total_vehiculos: c.vehiculos ? c.vehiculos.length : 0 }));
  res.json(result);
});

app.get('/api/clientes/:id', async (req, res) => {
  const { data: cliente, error: errCli } = await supabase.from('clientes').select('*').eq('id', req.params.id).single();
  if (errCli) return res.status(404).json({ error: 'Cliente no encontrado' });
  const { data: vehiculos } = await supabase.from('vehiculos').select('*').eq('cliente_id', req.params.id).order('creado_en', { ascending: false });
  res.json({ ...cliente, vehiculos: vehiculos || [] });
});

app.post('/api/clientes', async (req, res) => {
  const { data, error } = await supabase.from('clientes').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/clientes/:id', async (req, res) => {
  const { data, error } = await supabase.from('clientes').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --- API VEHÍCULOS ---
app.get('/api/vehiculos', async (req, res) => {
  const { estado, q } = req.query;
  let query = supabase
    .from('vehiculos')
    .select('*, clientes(nombre, telefono)')
    .order('creado_en', { ascending: false });
  if (estado) query = query.eq('estado', estado);
  if (q) query = query.or(`patente.ilike.%${q}%,modelo.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const result = data.map(v => ({
    ...v,
    cliente_nombre: v.clientes?.nombre,
    cliente_telefono: v.clientes?.telefono,
    dias: diasDesde(v.fecha_ingreso, v.estado)
  }));
  res.json(result);
});

app.get('/api/vehiculos/:id', async (req, res) => {
  const { data: vehiculo, error } = await supabase
    .from('vehiculos')
    .select('*, clientes(nombre, telefono, email)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Vehículo no encontrado' });
  const { data: novedades } = await supabase
    .from('novedades')
    .select('*')
    .eq('vehiculo_id', req.params.id)
    .order('creado_en', { ascending: false });
  res.json({
    ...vehiculo,
    cliente_nombre: vehiculo.clientes?.nombre,
    cliente_telefono: vehiculo.clientes?.telefono,
    cliente_email: vehiculo.clientes?.email,
    dias: diasDesde(vehiculo.fecha_ingreso, vehiculo.estado),
    novedades: novedades || []
  });
});

app.post('/api/vehiculos', async (req, res) => {
  const body = { ...req.body, patente: req.body.patente.toUpperCase() };
  const { data, error } = await supabase.from('vehiculos').insert([body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ ...data, dias: 0 });
});

app.put('/api/vehiculos/:id', async (req, res) => {
  const body = { ...req.body, patente: req.body.patente?.toUpperCase(), actualizado_en: new Date() };
  const { data, error } = await supabase.from('vehiculos').update(body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --- API NOVEDADES ---
app.post('/api/novedades', async (req, res) => {
  const { vehiculo_id, tipo } = req.body;

  const { data: nov, error } = await supabase.from('novedades').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Seguimiento: crear recordatorio automático en 2 días hábiles si no pusieron fecha
  if (tipo === 'seguimiento' && !req.body.recordatorio_fecha) {
    const hoy = new Date();
    let diasHabiles = 0;
    let fecha = new Date(hoy);
    while (diasHabiles < 2) {
      fecha.setDate(fecha.getDate() + 1);
      if (fecha.getDay() !== 0 && fecha.getDay() !== 6) diasHabiles++;
    }
    const { data: veh } = await supabase.from('vehiculos').select('patente, aseguradora').eq('id', vehiculo_id).single();
    await supabase.from('novedades').insert([{
      vehiculo_id,
      tipo: 'alerta',
      titulo: `${veh?.patente || 'Vehículo'} — Reintentar con aseguradora`,
      descripcion: `Recordatorio: reintentar contacto con ${veh?.aseguradora || 'la aseguradora'}.`,
      recordatorio_fecha: fecha.toISOString().split('T')[0]
    }]);
  }

  res.status(201).json(nov);
});

app.get('/api/novedades', async (req, res) => {
  const { tipo, leida } = req.query;
  let query = supabase
    .from('novedades')
    .select('*, vehiculos(patente, modelo, aseguradora)')
    .order('creado_en', { ascending: false });
  if (tipo) query = query.eq('tipo', tipo);
  if (leida === 'true' || leida === 'false') query = query.eq('leida', leida === 'true');
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.put('/api/novedades/:id/leer', async (req, res) => {
  await supabase.from('novedades').update({ leida: true }).eq('id', req.params.id);
  res.json({ ok: true });
});

app.put('/api/novedades/leer-todas', async (req, res) => {
  const { error } = await supabase.from('novedades').update({ leida: true }).neq('leida', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ✅ DELETE novedad — endpoint que faltaba
app.delete('/api/novedades/:id', async (req, res) => {
  const { error } = await supabase.from('novedades').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// --- API STOCK ---
app.get('/api/stock', async (req, res) => {
  const { data, error } = await supabase
    .from('taller_state')
    .select('*')
    .eq('id', 1)
    .single();
    
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || { stock_json: [], log_json: [] });
});

app.put('/api/stock', async (req, res) => {
  const { stock_json, log_json } = req.body;
  const { data, error } = await supabase
    .from('taller_state')
    .upsert({ id: 1, stock_json, log_json })
    .select()
    .single();
    
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// --- DASHBOARD ---
app.get('/api/dashboard', async (req, res) => {
  const hoy = new Date().toISOString().split('T')[0];

  const [enTaller, esperando, listos, alertas, noLeidas, recientes] = await Promise.all([
    supabase.from('vehiculos').select('*', { count: 'exact', head: true }).neq('estado', 'entregado').eq('en_taller', 'si'),
    supabase.from('vehiculos').select('*', { count: 'exact', head: true }).eq('estado', 'esperando_seguro'),
    supabase.from('vehiculos').select('*', { count: 'exact', head: true }).eq('estado', 'listo'),
    supabase.from('novedades').select('*', { count: 'exact', head: true }).eq('leida', false).eq('tipo', 'alerta'),
    supabase.from('novedades').select('*', { count: 'exact', head: true }).eq('leida', false),
    supabase.from('vehiculos').select('*, clientes(nombre)').order('creado_en', { ascending: false }).limit(8)
  ]);

  // Novedades que deben aparecer en el dashboard:
  // 1. Alertas no leídas (siempre, sin importar fecha)
  // 2. Cualquier novedad con recordatorio_fecha <= hoy (vencida o de hoy) y no leída
  // 3. Cualquier novedad con recordatorio_fecha en el futuro que no esté leída (aparece hasta esa fecha)
  const { data: alertasDirectas } = await supabase
    .from('novedades')
    .select('*, vehiculos(patente, modelo)')
    .eq('tipo', 'alerta')
    .eq('leida', false)
    .order('creado_en', { ascending: false });

  const { data: conRecordatorio } = await supabase
    .from('novedades')
    .select('*, vehiculos(patente, modelo)')
    .neq('tipo', 'alerta')          // alertas ya las tenemos arriba
    .not('recordatorio_fecha', 'is', null)
    .lte('recordatorio_fecha', hoy) // recordatorio que ya llegó (hoy o antes)
    .eq('leida', false)
    .order('recordatorio_fecha', { ascending: true });

  const { data: conRecordatorioFuturo } = await supabase
    .from('novedades')
    .select('*, vehiculos(patente, modelo)')
    .not('recordatorio_fecha', 'is', null)
    .gt('recordatorio_fecha', hoy)  // recordatorio futuro — mostrar hasta esa fecha
    .eq('leida', false)
    .order('recordatorio_fecha', { ascending: true });

  // Combinar y deduplicar por id
  const todos = [...(alertasDirectas || []), ...(conRecordatorio || []), ...(conRecordatorioFuturo || [])];
  const seen = new Set();
  const dashAlertas = todos.filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; });

  res.json({
    stats: {
      en_taller: enTaller.count || 0,
      esperando_seguro: esperando.count || 0,
      listos: listos.count || 0,
      alertas: alertas.count || 0,
      no_leidas: noLeidas.count || 0
    },
    alertas: dashAlertas,
    recientes: (recientes.data || []).map(v => ({
      ...v,
      cliente_nombre: v.clientes?.nombre,
      dias: diasDesde(v.fecha_ingreso, v.estado)
    }))
  });
});

module.exports = { app, diasDesde };

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor DAKAR CAR corriendo en puerto ${PORT}\n`);
});