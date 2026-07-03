const { diasDesde } = require('./server');

describe('diasDesde', () => {
  test('returns 0 for delivered vehicles', () => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 3);
    expect(diasDesde(fecha.toISOString(), 'entregado')).toBe(0);
  });

  test('counts days for active vehicles', () => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 5);
    expect(diasDesde(fecha.toISOString(), 'en_proceso')).toBe(5);
  });
});
