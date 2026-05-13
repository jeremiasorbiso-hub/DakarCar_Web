require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper para calcular días transcurridos
function diasDesde(fecha) {
  if (!fecha) return 0;
  const hoy = new Date();
  const f = new Date(fecha);
  return Math.floor((hoy - f) / (1000 * 60 * 60 * 24));
}

// --- API CLIENTES ---
app.get('/api/clientes', async (req, res) => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*, vehiculos(id)')
    .order('nombre');
  
  if (error) return res.status(500).json({ error: error.message });
  
  const result = data.map(c => ({
    ...c,
    total_vehiculos: c.vehiculos ? c.vehiculos.length : 0
  }));
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
    dias: diasDesde(v.fecha_ingreso)
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
    dias: diasDesde(vehiculo.fecha_ingreso),
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
  const { vehiculo_id, tipo, titulo, descripcion, recordatorio_fecha } = req.body;
  
  const { data: nov, error } = await supabase.from('novedades').insert([req.body]).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Lógica de seguimiento automático: crear alerta en 2 días hábiles
  if (tipo === 'seguimiento') {
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
      descripcion: `Recordatorio: reintentar contacto con ${veh?.aseguradora || 'la aseguradora'}. Sin denuncia registrada.`,
      recordatorio_fecha: fecha.toISOString().split('T')[0]
    }]);
  }

  res.status(201).json(nov);
});

app.put('/api/novedades/:id/leer', async (req, res) => {
  await supabase.from('novedades').update({ leida: true }).eq('id', req.params.id);
  res.json({ ok: true });
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

  const { data: recordatorios } = await supabase
    .from('novedades')
    .select('*, vehiculos(patente, modelo, aseguradora)')
    .lte('recordatorio_fecha', hoy)
    .eq('leida', false)
    .order('recordatorio_fecha', { ascending: true });

  res.json({
    stats: {
      en_taller: enTaller.count || 0,
      esperando_seguro: esperando.count || 0,
      listos: listos.count || 0,
      alertas: alertas.count || 0,
      no_leidas: noLeidas.count || 0
    },
    alertas: recordatorios || [],
    recientes: (recientes.data || []).map(v => ({
      ...v,
      cliente_nombre: v.clientes?.nombre,
      dias: diasDesde(v.fecha_ingreso)
    }))
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor DAKAR CAR corriendo en puerto ${PORT}\n`);
});